"use strict";

var dgram = require ("dgram");
var events = require ("events");
var util = require ("util");
var packets = require ("./packets");
var opcode = require ("./opcode");
var errors = require ("./errors");

//States
var REQ_SENT = 0;
var ACK_SENT = 1;
var BLK_SENT = 2;

var Request = module.exports = function (type, remote, globalOptions, size){
  events.EventEmitter.call (this);
  
  this._isRRQ = type === opcode.RRQ;
  this._globalOptions = globalOptions;
  //Undefined if RRQ
  this._size = size;
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
  this._retransmitter = this.createRetransmitter ();
  this._maxDataLength = 4;
  
  this._sendAckFn = function (){
    me._state = ACK_SENT;
  };
  
  this._sendBlockFn = function (){
    me._state = BLK_SENT;
  };
  
  //Delay the openning to the next tick
  var me = this;
  process.nextTick (function (){
    me._open ();
  });
};

util.inherits (Request, events.EventEmitter);

Request.prototype.abort = function (){
  if (this._closed || this._closing) return;
  this._aborted = true;
  this.sendErrorAndClose ("Aborted");
};

Request.prototype.close = function (error){
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
  process.nextTick (function (){
    me._socket.close ();
  });
};

Request.prototype._open = function (){
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
      return me._sendError (0, "Invalid remote socket");
    }
    
    //OACK requires minimum 2 bytes
    if (message.length < 2) return me._sendMalformedPacketError ();
    
    me._onMessage (message);
  })
  .on ("error", function (error){
    me._closed = true;
    me._retransmitter.reset ();
    me.emit ("error", error);
  })
  .on ("close", function (){
    me._closed = true;
    me._retransmitter.reset ();
    if (me._aborted) return me.emit ("abort");
    if (me._error){
      me.emit ("error", me._error);
    }else{
      //Transfer ended successfully
      me.emit ("close");
    }
  });
  
  //Create and send the RRQ/WRQ message
  //There are 2 possible responses from the server:
  //- If the server doesn't support extensions the file transfer starts
  //- If the server supports extensions, it sends a OACK
  var buffer;
  if (this._isRRQ){
    buffer = packets.rrq.serialize (this._remote, this._globalOptions, true);
  }else{
    //WRQ
    buffer = packets.wrq.serialize (this._remote, this._globalOptions,
        this._size, true);
  }
  
  this._sendAndRetransmit (buffer, function (){
    me._state = REQ_SENT;
  });
};

Request.prototype._checkSize = function (){
  //Cannot send files bigger than 32MB if the server doesn't support the block
  //size option
  //32MB
  var max = 33554432;
  if (this._size > max){
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
    size: this._size || null,
    rollover: this._globalOptions.extensions.rollover,
    userExtensions: null
  };
  this._setStats (stats);
  this.emit ("ready", stats);
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
  
  if (op === opcode.RRQ || op === opcode.WRQ){
    this.sendErrorAndClose (4);
  }else if (op === opcode.DATA){
    if (this._isRRQ){
      if (!this._extensionsEmitted) this._emitDefaultExtensions ();
      if (buffer.length < 4 || buffer.length > this._maxDataLength){
        return this._sendMalformedPacketError ();
      }
      this.emit ("data", packets.data.deserialize (buffer));
    }else{
      this.sendErrorAndClose (4);
    }
  }else if (op === opcode.ACK){
    if (!this._isRRQ){
      if (!this._extensionsEmitted){
        if (this._checkSize ()) return;
        this._emitDefaultExtensions ();
        //The first ACK with block 0 is ignored
        if (buffer.length !== 4 || buffer.readUInt16BE (2) !== 0){
          this._sendMalformedPacketError ();
        }
      }else{
        if (buffer.length !== 4) return this._sendMalformedPacketError ();
        this.emit ("ack", packets.ack.deserialize (buffer));
      }
    }else{
      this.sendErrorAndClose (4);
    }
  }else if (op === opcode.OACK){
    try{
      buffer = packets.oack.deserialize (buffer);
    }catch (error){
      return this._sendMalformedPacketError ();
    }
    this._onOack (buffer);
  }else if (op === opcode.ERROR){
    if (buffer.length <= 4) return this._sendMalformedPacketError ();
    try{
      buffer = packets.error.deserialize (buffer);
    }catch (error){
      return this._sendMalformedPacketError ();
    }
    this._onError (buffer);
  }else{
    //Unknown opcode
    this.sendErrorAndClose (4);
  }
};

Request.prototype._onOack = function (message){
  //OACK can be only received when RRQ/WRQ is sent
  if (this._state !== REQ_SENT) return this.sendErrorAndClose (4);
  
  var userExtensions = this._globalOptions.userExtensions ? {} : null;
  
  //Fail if the OACK message contains unknown extensions and the user has not
  //configured any custom extension
  for (var key in message){
    if (this._globalOptions.extensionsString[key] === undefined){
      if (userExtensions){
        userExtensions[key] = message[key];
      }else{
        return this.sendErrorAndClose (8);
      }
    }
  }
  
  var blockSize;
  var transferSize;
  var windowSize;
  var rollover;
  var infinite = false;
  
  if (message.blksize){
    blockSize = ~~message.blksize;
    if (blockSize >= 8 && blockSize <= this._globalOptions.extensions.blksize){
      infinite = true;
    }else{
      return this.sendErrorAndClose (8);
    }
  }else if (this._checkSize ()){
    return;
  }
  
  if (message.timeout){
    var timeout = ~~message.timeout;
    if (timeout > 0 && timeout <= this._timeout){
      this._timeout = timeout;
    }else{
      return this.sendErrorAndClose (8);
    }
  }
  
  if (message.tsize){
    transferSize = ~~message.tsize;
    if (transferSize < 0 ||
        (this._size !== undefined && transferSize !== this._size)){
      return this.sendErrorAndClose (8);
    }
  }
  
  if (message.windowsize){
    windowSize = ~~message.windowsize;
    if (windowSize <= 0 ||
        windowSize > this._globalOptions.extensions.windowsize){
      return this.sendErrorAndClose (8);
    }
  }
  
  if (message.rollover){
    rollover = ~~message.rollover;
    if (rollover < 0 || rollover > 1){
      return this.sendErrorAndClose (8);
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
    this.sendAck (0);
    this.emit ("ready", stats, true);
  }else{
    this.emit ("ready", stats);
  }
};

Request.prototype._onError = function (message){
  if (this._state === REQ_SENT && message.code === 8){
    if (this._extensionsRetransmitted){
      //The server has returned an ERROR with code 8 after a RRQ/WRQ without
      //extensions. Code 8 is only used when RRQ and WRQ messages contain
      //extensions
      return this.sendErrorAndClose (4);
    }
    
    //If the error code is 8, the server doesn't like one or more extensions
    //Retransmit without extensions
    var me = this;
    var buffer;
    if (this._isRRQ){
      buffer = packets.rrq.serialize (this._remote, this._globalOptions);
    }else{
      //WRQ
      buffer = packets.wrq.serialize (this._remote, this._globalOptions,
          this._size);
    }
    this._sendAndRetransmit (buffer, function (){
      me._extensionsRetransmitted = true;
    });
  }else{
    this.close (new Error ("(Server) " + message.message));
  }
};

Request.prototype.sendAck = function (block){//console.log(">> " + block)
  this._send (packets.ack.serialize (block), this._sendAckFn);
};

Request.prototype.sendBlock = function (block, buffer){//console.log(">> " + block)
  this._send (packets.data.serialize (block, buffer), this._sendBlockFn);
};

Request.prototype._sendError = function (code, message){
  this._send (packets.error.serialize (code, message));
};

Request.prototype._sendMaxSizeErrorAndClose = function (){
  var me = this;
  this._send (packets.error.serialize (8), function (){
    me.close (new Error ("The file cannot be bigger than 33554432 bytes"));
  });
};

Request.prototype.sendErrorAndClose = function (code){
  var me = this;
  var message;
  if (typeof code === "string"){
    message = code;
    code = 0;
  }
  this._send (packets.error.serialize (code, message), function (){
    me.close (new Error (errors[code] || message));
  });
};

Request.prototype._sendMalformedPacketError = function (){
  this.sendErrorAndClose ("Malformed TFTP message");
};

Request.prototype._send = function (buffer, cb){
  if (this._closed) return;
  this._socket.send (buffer, 0, buffer.length,
      (this._remoteHost && this._remoteHost.port) || this._globalOptions.port,
      this._globalOptions.hostname, function (error){
    //The error is automatically emitted, it can be ignored
    if (error) return;
    if (cb) cb ();
  });
};

Request.prototype._sendAndRetransmit = function (buffer, cb){
  this._send (buffer, cb);
  var me = this;
  this._retransmitter.start (function (){
    me._send (buffer);
  });
};

Request.prototype.createRetransmitter = function (){
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
      me._request.close (new Error ("Timed out"));
    }else{
      me._pending--;
      fn ();
      //Try again
      me.start (fn);
    }
  }, this._request._timeout);
};