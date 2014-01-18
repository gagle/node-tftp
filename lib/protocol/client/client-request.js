"use strict";

var util = require ("util");
var packets = require ("../packets");
var opcodes = require ("../opcodes");
var errors = require ("../errors");
var knownExtensions = require ("../known-extensions");
var Request = require ("../request");

//States
var REQ_SENT = 0;
var ACK_SENT = 1;
var BLK_SENT = 2;

var ClientRequest = module.exports = function (args){
  Request.call (this, args.globalOptions.address, args.globalOptions.port,
      args.globalOptions.retries, args.globalOptions.extensions.timeout);
  
  this._isRRQ = args.reader;
  this._file = args.file;
  this._globalOptions = args.globalOptions;
  this._opOptions =  args.opOptions || {};
  this._prefixError = "(Server) ";
  this._firstPacket = true;
  this._oackExpected = true;
  this._extensionsRetransmitted = false;
  this._extensionsEmitted = false;
  this._maxDataLength = 4;
  
  //Delay the openning to the next tick
  var me = this;
  process.nextTick (function (){
    me._open (true);
  });
};

util.inherits (ClientRequest, Request);

ClientRequest.prototype._open = function (extensions){
  var me = this;
  
  this._initSocket (null, function (message, rinfo){
    if (me._firstPacket){
      me._firstPacket = false;
      me._requestTimer.reset ();
      
      //Save the remote host with the first packet
      me._address = rinfo.address;
      me._port = rinfo.port;
    }else if (me._address !== rinfo.address || me._port !== rinfo.port){
      //A message is received from a different remote host
      //This could happen when the client sends a request, the server sends a
      //response but the client never receives it, so it timeouts and sends the
      //same request again. The server responds again but the client receives
      //the two server responses: the first is accepted but the latter produces
      //this error because from the point of view of the server it receives two
      //different requests and sends the file from different ports
      return me._send (packets.error.serialize (errors.ESOCKET));
    }
    
    if (message.length < 2) return me._sendErrorAndClose (errors.EBADMSG);
    
    me._onMessage (message);
  });
  
  //Create and send the RRQ/WRQ message
  //There are 2 possible responses from the server:
  //- If the server doesn't support extensions the file transfer starts
  //- If the server supports extensions, it sends a OACK
  var buffer;
  if (this._isRRQ){
    buffer = extensions
        ? packets.rrq.serialize (this._file, this._globalOptions,
            this._opOptions)
        : packets.rrq.serialize (this._file);
  }else{
    buffer = extensions
        ? packets.wrq.serialize (this._file, this._globalOptions,
            this._opOptions)
        : packets.wrq.serialize (this._file);
  }
  
  this._sendAndRetransmit (buffer);
};

ClientRequest.prototype._checkSize = function (size){
  //Cannot send files bigger than 32MB if the server doesn't support the block
  //size option
  //32MB
  var max = 33554432;
  if ((size || this._opOptions.size) > max){
    this._sendErrorAndClose (errors.EFBIG);
    return true;
  }
  return false;
};

ClientRequest.prototype._emitDefaultExtensions = function (){
  this._extensionsEmitted = true;
  var stats = {
    blockSize: 512,
    windowSize: 1,
    size: this._opOptions.size || null,
    rollover: this._globalOptions.extensions.rollover,
    userExtensions: null
  };
  this._setStats (stats);
  this._oackExpected = false;
  this._onReady (stats);
};

ClientRequest.prototype._setStats = function (stats){
  //Save max data length
  this._maxDataLength += stats.blockSize;

  stats.timeout = this._timeout;
  var address = this._socket.address ();
  stats.localSocket = {
    address: address.address,
    port: address.port
  };
  stats.remoteSocket = {
    address: this._address,
    port: this._port
  };
  stats.file = this._file;
  stats.retries = this._retries;
};

ClientRequest.prototype._onMessage = function (buffer){
  var op = buffer.readUInt16BE (0);
  
  if (op === opcodes.DATA){
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
    if (buffer.length <= 4) return this._closeWithError (errors.EBADMSG);
    try{
      buffer = packets.error.deserialize (buffer);
    }catch (error){
      return this._closeWithError (error);
    }
    this._onErrorMessage (buffer);
  }else{
    this._sendErrorAndClose (errors.EBADOP);
  }
};

ClientRequest.prototype._onOackMessage = function (message){
  //OACK can be only received when RRQ/WRQ is sent
  if (!this._oackExpected) return this._sendErrorAndClose (errors.EBADOP);
  
  this._oackExpected = false;
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
    //The ACK of the block 0 is retransmitted from the reader
    this._sendAck (0);
    this._onReady (stats, true);
  }else{
    this._onReady (stats);
  }
};

ClientRequest.prototype._onErrorMessage = function (message){
  if (this._oackExpected && message.code === 8){
    if (this._extensionsRetransmitted){
      //The server has returned an ERROR with code 8 after a RRQ/WRQ without
      //extensions. The code 8 is only used when RRQ and WRQ messages contain
      //extensions
      return this._closeWithError (errors.EBADOP);
    }
    
    //If the error code is 8, the server doesn't like one or more extensions
    //Retransmit without extensions
    this._extensionsRetransmitted = true;
    this._port = this._globalOptions.port;
    this._firstPacket = this._first = true;
    
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