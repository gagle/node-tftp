"use strict";

var dgram = require ("dgram");
var packets = require ("../packets");
var opcodes = require ("../opcodes");
var errors = require ("../errors");
var knownExtensions = require ("../known-extensions");

//States
var REQ_SENT = 0;
var ACK_SENT = 1;
var BLK_SENT = 2;

var Request = module.exports = function (type, remote, globalOptions,
    opOptions){
  this._isRRQ = type === opcodes.RRQ;
  this._globalOptions = globalOptions;
  this._opOptions =  opOptions || {};
  this._remote = remote;
  this._timeout = globalOptions.extensions.timeout;
  this._retries = globalOptions.retries;
  this._closed = false;
  this._closing = false;
  this._aborted = false;
  this._error = null;
  this._socket = null;
  this._remoteHost = null;
  this._extensionsRetransmitted = false;
  this._extensionsEmitted = false;
  this._retransmitter = this._createRetransmitter ();
  this._maxDataLength = 4;
  this._state = null;
  
  this._onCloseFn = function (){
    me._closed = true;
    me._retransmitter.reset ();
    if (me._aborted) return me._onAbort ();
    if (me._error){
      me._onError (me._error);
    }else{
      //Transfer ended successfully
      me._onClose ();
    }
  };
  
  //Delay the openning to the next tick
  var me = this;
  process.nextTick (function (){
    me._open (true);
  });
};

Request.prototype.abort = function (){
  if (this._closed || this._closing || this._aborted) return;
  this._aborted = true;
  this._sendErrorAndClose (errors.EABORT);
};

Request.prototype._open = function (extensions){
  //Create the socket
  var me = this;
  
  this._socket = dgram.createSocket ("udp4", function (message, rinfo){
    me._retransmitter.reset ();
    
    if (!me._remoteHost){
      //Save the remote host
      me._remoteHost = {
        address: rinfo.address,
        port: rinfo.port
      };
    }else if (me._remoteHost.address !== rinfo.address ||
        me._remoteHost.port !== rinfo.port){
      //A message is received from a different remote socket
      //This could happen when the client sends a request, the server sends a
      //respond but the client never receives it, so it timeouts and sends the
      //same request again. The server responds again but the client receives
      //the two server responses: the first is accepted but the latter sends
      //this error because the same source socket sends two requests but from
      //the point of view of the server it is asked for the same file two times,
      //they are two different requests
      return me._send (packets.error.serialize (errors.ESOCKET));
    }
    
    if (message.length < 2) return me._sendErrorAndClose (errors.EBADMSG);
    
    me._onMessage (message);
  })
  .on ("error", function (error){
    me._closed = true;
    me._retransmitter.reset ();
    me._onError (error);
  })
  .on ("close", this._onCloseFn);
  
  //Create and send the RRQ/WRQ message
  //There are 2 possible responses from the server:
  //- If the server doesn't support extensions the file transfer starts
  //- If the server supports extensions, it sends a OACK
  var buffer;
  if (this._isRRQ){
    buffer = extensions
        ? packets.rrq.serialize (this._remote, this._globalOptions,
            this._opOptions)
        : packets.rrq.serialize (this._remote);
  }else{
    buffer = extensions
        ? packets.wrq.serialize (this._remote, this._globalOptions,
            this._opOptions)
        : packets.wrq.serialize (this._remote);
  }
  
  this._state = REQ_SENT;
  this._sendAndRetransmit (buffer);
};

Request.prototype._close = function (error){
  if (this._closed || this._closing || !this._socket) return;
  //If multiples closes occur inside the same tick (because abort() is called),
  //the socket throws the error "Not running" because the socket is already
  //closed, this is why there's a closing flag. There are 2 possible cases:
  //- (1) abort close, (2) socket close
  //- (1) socket close, (2) abort close
  //If it's the first case, the second close() is ignored because the request
  //is aborted just before
  //If it's the second case, the second abort() it's useless because the request
  //is already closed
  this._closing = true;
  
  //Store the error after the flag is set to true, otherwise the error could be
  //used by another close()
  if (error) this._error = error;
  
  var me = this;
  //Close in the next tick to allow sending files in the same tick
  process.nextTick (function (){
    me._socket.close ();
  });
};

Request.prototype._checkSize = function (size){
  //Cannot send files bigger than 32MB if the server doesn't support the block
  //size option
  //32MB
  var max = 33554432;
  if ((size || this._opOptions.size) > max){
    this._sendMaxSizeErrorAndClose ();
    return true;
  }
  return false;
};

Request.prototype._emitDefaultExtensions = function (){
  this._extensionsEmitted = true;
  var stats = {
    blockSize: 512,
    windowSize: 1,
    size: this._opOptions.size || null,
    rollover: this._globalOptions.extensions.rollover,
    userExtensions: null
  };
  this._setStats (stats);
  this._onReady (stats);
};

Request.prototype._setStats = function (stats){
  //Save max data length
  this._maxDataLength += stats.blockSize;

  stats.timeout = this._timeout;
  var address = this._socket.address ();
  stats.localSocket = {
    address: address.address,
    port: address.port
  };
  stats.remoteSocket = this._remoteHost;
  stats.file = this._remote;
  stats.retries = this._retries;
};

Request.prototype._onMessage = function (buffer){
  var op = buffer.readUInt16BE (0);
  
  if (op === opcodes.RRQ || op === opcodes.WRQ){
    this._sendErrorAndClose (errors.EBADOP);
  }else if (op === opcodes.DATA){
    if (this._isRRQ){
      if (!this._extensionsEmitted) this._emitDefaultExtensions ();
      if (buffer.length < 4 || buffer.length > this._maxDataLength){
        return this._sendErrorAndClose (errors.EBADMSG);
      }
      this._onData (packets.data.deserialize (buffer));
    }else{
      this._sendErrorAndClose (errors.EBADOP);
    }
  }else if (op === opcodes.ACK){
    if (!this._isRRQ){
      if (!this._extensionsEmitted){
        if (this._checkSize ()) return;
        this._emitDefaultExtensions ();
        //The first ACK with block 0 is ignored
        if (buffer.length !== 4 || buffer.readUInt16BE (2) !== 0){
          this._sendErrorAndClose (errors.EBADMSG);
        }
      }else{
        if (buffer.length !== 4){
          return this._sendErrorAndClose (errors.EBADMSG);
        }
        this._onAck (packets.ack.deserialize (buffer));
      }
    }else{
      this._sendErrorAndClose (errors.EBADOP);
    }
  }else if (op === opcodes.OACK){
    try{
      buffer = packets.oack.deserialize (buffer);
    }catch (error){
      return this._sendErrorAndClose (error);
    }
    this._onOackMessage (buffer);
  }else if (op === opcodes.ERROR){
    if (buffer.length <= 4) return this._sendErrorAndClose (errors.EBADMSG);
    try{
      buffer = packets.error.deserialize (buffer);
    }catch (error){
      return this._sendErrorAndClose (error);
    }
    this._onErrorMessage (buffer);
  }else{
    //Unknown opcodes
    this._sendErrorAndClose (errors.EBADOP);
  }
};

Request.prototype._onOackMessage = function (message){
  //OACK can be only received when RRQ/WRQ is sent
  if (this._state !== REQ_SENT) return this._sendErrorAndClose (errors.EBADOP);
  
  var userExtensions = this._globalOptions.userExtensions ? {} : null;
  
  for (var key in message){
    //Fail if the OACK message contains unknown extensions
    if (this._globalOptions.extensionsString[key] === undefined){
      return this._sendErrorAndClose (errors.EDENY);
    }else if (userExtensions && !knownExtensions[key]){
      userExtensions[key] = message[key];
    }
  }
  
  var blockSize;
  var transferSize;
  var windowSize;
  var rollover;
  
  if (message.timeout){
    var timeout = ~~message.timeout;
    if (timeout > 0 && timeout <= this._timeout){
      this._timeout = timeout;
    }else{
      return this._sendErrorAndClose (errors.EDENY);
    }
  }
  
  if (message.tsize){
    transferSize = ~~message.tsize;
    if (transferSize < 0 ||
        (this._opOptions.size !== undefined &&
            transferSize !== this._opOptions.size)){
      return this._sendErrorAndClose (errors.EDENY);
    }
  }
  
  if (message.blksize){
    blockSize = ~~message.blksize;
    if (blockSize < 8 || blockSize > this._globalOptions.extensions.blksize){
      return this._sendErrorAndClose (errors.EDENY);
    }
  }else if (this._checkSize (transferSize)){
    return;
  }
  
  if (message.windowsize){
    windowSize = ~~message.windowsize;
    if (windowSize <= 0 ||
        windowSize > this._globalOptions.extensions.windowsize){
      return this._sendErrorAndClose (errors.EDENY);
    }
  }
  
  if (message.rollover){
    rollover = ~~message.rollover;
    if (rollover < 0 || rollover > 1){
      return this._sendErrorAndClose (errors.EDENY);
    }
  }
  
  this._extensionsEmitted = true;
  var stats = {
    blockSize: blockSize || 512,
    size: transferSize !== undefined ? transferSize : null,
    windowSize: windowSize || 1,
    rollover: rollover || this._globalOptions.extensions.rollover,
    userExtensions: userExtensions
  };
  this._setStats (stats);
  
  if (this._isRRQ){
    //Acknowledge OACK
    //The ack of the block 0 is retransmitted from the reader
    this._sendAck (0);
    this._onReady (stats, true);
  }else{
    this._onReady (stats);
  }
};

Request.prototype._onErrorMessage = function (message){
  if (this._state === REQ_SENT && message.code === 8){
    if (this._extensionsRetransmitted){
      //The server has returned an ERROR with code 8 after a RRQ/WRQ without
      //extensions. The code 8 is only used when RRQ and WRQ messages contain
      //extensions
      return this._sendErrorAndClose (errors.EBADOP);
    }
    
    //If the error code is 8, the server doesn't like one or more extensions
    //Retransmit without extensions
    this._extensionsRetransmitted = true;
    this._remoteHost = null;
    
    //In order to retransmit, the socket must be closed and open a new one, that
    //is, cannot reuse the same socket because the server closes its socket
    this._socket.removeListener ("close", this._onCloseFn);
    var me = this;
    this._socket.on ("close", function (){
      me._open ();
    });
    this._socket.close ();
  }else{
    this._close (new Error ("(Server) " + message.message));
  }
};

Request.prototype._sendAck = function (block){//console.log(">> " + block)
  this._state = ACK_SENT;
  this._send (packets.ack.serialize (block));
};

Request.prototype._sendBlock = function (block, buffer){//console.log(">> " + block)
  this._state = BLK_SENT;
  this._send (packets.data.serialize (block, buffer));
};

Request.prototype._sendMaxSizeErrorAndClose = function (){
  this._send (packets.error.serialize (errors.EDENY));
  this._close (new Error (errors.EFBIG));
};

Request.prototype._sendErrorAndClose = function (code){
  var message;
  if (typeof code === "number"){
    message = errors.rfc[code];
  }else{
    message = code;
  }
  this._send (packets.error.serialize (code));
  this._close (new Error ("(Server) " + message));
};

Request.prototype._sendAndRetransmit = function (buffer){
  this._send (buffer);
  var me = this;
  this._retransmitter.start (function (){
    me._send (buffer);
  });
};

Request.prototype._send = function (buffer){
  if (this._closed) return;
  this._socket.send (buffer, 0, buffer.length,
      (this._remoteHost && this._remoteHost.port) || this._globalOptions.port,
      this._globalOptions.address);
};

Request.prototype._createRetransmitter = function (){
  return new Retransmitter (this);
};

var Retransmitter = function (request){
  this._request = request;
  this._timer = null;
  this._pending = this._request._retries;
};

Retransmitter.prototype.reset = function (){
  if (!this._timer) return;
  clearTimeout (this._timer);
  this._pending = this._request._retries;
  this._timer = null;
};

Retransmitter.prototype.start = function (fn){
  var me = this;
  this._timer = setTimeout (function (){
    if (!me._pending){
      //No more retries
      me._request._close (new Error (errors.ETIME));
    }else{
      me._pending--;
      fn ();
      //Try again
      me.start (fn);
    }
  }, this._request._timeout);
};