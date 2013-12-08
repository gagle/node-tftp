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

var Request = module.exports = function (type, remote, options, size){
  events.EventEmitter.call (this);
  
  this._isRRQ = type === opcode.RRQ;
  //Undefined if GET request
  this._size = size;
  this._options = options;
  this._remote = remote;
  this._timer = null;
  this._retries = options.retries;
  this._timeout = +this._options.extensions.timeout;
  this._closed = false;
  this._closing = false;
  this._aborted = false;
  this._error = null;
  this._socket = null;
  this._remoteHost = null;
  this._extensionsRetransmitted = false;
  this._extensionsEmitted = false;
  
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
  this.close ();
};

Request.prototype._resetTimeout = function (){
  clearTimeout (this._timer);
  this._retries = this._options.retries;
};

Request.prototype._open = function (){
  //Create the socket
  var me = this;
  this._socket = dgram.createSocket ("udp4", function (message, rinfo){
    //Reset the timeout with each received packet even if it's incorrect
    //The purpose of the timeout is to check the availability of the remote host
    me._resetTimeout ();
  
    if (!me._remoteHost){
      //Save the remote host
      me._remoteHost = {
        address: rinfo.address,
        port: rinfo.port
      };
    }else if (me._remoteHost.address !== rinfo.address ||
        me._remoteHost.port !== rinfo.port){
      //A message is received from a different remote socket
      return me._sendError (0, "Invalid remote socket");
    }
    
    me._onMessage (message);
  })
  .on ("error", function (error){
    me._closed = true;
    clearTimeout (me._timer);
    me.emit (error);
  })
  .on ("close", function (){
    me._closed = true;
    clearTimeout (me._timer);
    if (me._aborted) return me.emit ("abort");
    if (me._error){
      me.emit ("error", me._error);
    }else{
      me.emit ("close");
    }
  });
  
  //Create and send the RRQ/WRQ message
  //There are 2 possible responses from the server:
  //- If the server doesn't support extensions the file transfer starts
  //- If the server supports extensions, it sends a OACK
  var buffer;
  if (this._isRRQ){
    buffer = packets.rrq.serialize (this._remote, this._options);
  }else{
    //WRQ
    buffer = packets.wrq.serialize (this._remote, this._size, this._options);
  }
  this.sendMessage (buffer, function (){
    me._state = REQ_SENT;
  });
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
  this._socket.close ();
};

Request.prototype._emitDefaultExtensions = function (){
  this._extensionsEmitted = true;
  this.emit ("extensions", {
    blockSize: 512,
    windowSize: 1
  }, true);
};

Request.prototype._onMessage = function (buffer){

//console.log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<")
//require("hex")(buffer)
  var op = buffer.readUInt16BE (0);
  
  if (op === opcode.RRQ || op === opcode.WRQ){
    this.sendErrorAndClose (4);
  }else if (op === opcode.DATA){
    if (this._isRRQ){
      if (!this._extensionsEmitted) this._emitDefaultExtensions ();
      this.emit ("data", packets.data.deserialize (buffer));
    }else{
      this.sendErrorAndClose (4);
    }
  }else if (op === opcode.ACK){
    if (!this._isRRQ){
      if (!this._extensionsEmitted) this._emitDefaultExtensions ();
      this.emit ("ack", packets.ack.deserialize (buffer));
    }else{
      this.sendErrorAndClose (4);
    }
  }else if (op === opcode.OACK){
    this._onOack (packets.oack.deserialize (buffer));
  }else if (op === opcode.ERROR){
    this._onError (packets.error.deserialize (buffer));
  }else{
    //Unknown opcode
    this.sendErrorAndClose (4);
  }
};

Request.prototype._onOack = function (message){
  //OACK can be only received when RRQ/WRQ is sent
  if (this._state !== REQ_SENT) return this.sendErrorAndClose (4);
  
  //Fail if the OACK message contains unknown extensions
  for (var key in message){
    if (this._options.extensions[key] === undefined){
      return this.sendErrorAndClose (8);
    }
  }
  
  var blockSize;
  var transferSize;
  var windowSize;
  
  if (message.blksize){
    blockSize = ~~message.blksize;
    if (blockSize < 8 || blockSize > +this._options.extensions.blksize){
      return this.sendErrorAndClose (8);
    }
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
    if (transferSize < 0){
      return this.sendErrorAndClose (8);
    }
  }
  
  if (message.windowsize){
    windowSize = ~~message.windowsize;
    if (windowSize <= 0 || windowSize > this._options.extensions.windowsize){
      return this.sendErrorAndClose (8);
    }
  }
  
  this._extensionsEmitted = true;
  this.emit ("extensions", {
    blockSize: blockSize,
    transferSize: transferSize,
    windowSize: windowSize,
  });
  
  if (this._isRRQ){
    //Acknowledge OACK
    this.sendAck (0);
  }else{
    //Start sending data
    this.emit ("ready");
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
      buffer = packets.rrq.serialize (this._remote);
    }else{
      //WRQ
      buffer = packets.wrq.serialize (this._remote, this._size);
    }
    this.sendMessage (buffer, function (){
      me._extensionsRetransmitted = true;
    });
  }else{
    this.close (new Error ("(Server) " + message.message));
  }
};

Request.prototype.sendAck = function (block, cb){
  var me = this;
  this.sendMessage (packets.ack.serialize (block), function (){
    me._state = ACK_SENT;
    if (cb) cb ();
  });
};

Request.prototype.sendMessage = function (buffer, cb){
  //Apply timeouts and retransmissions
  var me = this;
  this._timer = setTimeout (function (){
    if (!me._retries){
      me.close (new Error ("Timed out"));
    }else{
      me._retries--;
      me.sendMessage (buffer, cb);
    }
  }, this._timeout);
  
  this._send (buffer, function (){
    if (cb) cb ();
  });
};

Request.prototype._sendError = function (code, message){
  this._send (packets.error.serialize (code, message));
};

Request.prototype.sendErrorAndClose = function (code, message){
  var me = this;
  this._send (packets.error.serialize (code, message), function (){
    me.close (new Error (errors[code] || message));
  });
};

Request.prototype._sendMalformedPacketError = function (){
  this._send (packets.error.serialize (0, "Malformed TFTP message"));
};

Request.prototype._send = function (buffer, cb){
  this._socket.send (buffer, 0, buffer.length,
      (this._remoteHost && this._remoteHost.port) || this._options.port,
      this._options.hostname, function (error){
    //The error is automatically emitted, it can be ignored
    if (error) return;
    if (cb) cb ();
  });
};