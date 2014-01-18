"use strict";

var dgram = require ("dgram");
var errors = require ("./errors");
var packets = require ("./packets");

var Request = module.exports = function (address, port, retries,
    timeout){
  this._address = address;
  this._port = port;
  this._retries = retries;
  this._timeout = timeout;
  this._socket = null;
  this._closed = false;
  this._closing = false;
  this._aborted = false;
  this._error = null;
  //The string is modified from the ClientRequest subclass
  this._prefixError = "";
  this._requestTimer = this._createRetransmitter ();
};

Request.prototype.abort = function (error){
  if (this._closed || this._closing || this._aborted) return;
  this._aborted = true;
  if (!error){
    error = errors.EABORT;
  }else if (error instanceof Error){
    error = error.message || errors.EABORT;
  }else{
    error = error + "";
  }
  this._sendErrorAndClose (error);
};

Request.prototype._close = function (error){
  if (this._closed || this._closing || !this._socket) return;
  //If multiples closes occur inside the same tick (because abort() and _close()
  //are called in the same tick) the socket throws the error "Not running"
  //because the socket is already closed when the second close occurs, this is
  //why there's a closing flag
  this._closing = true;
  
  //Store the error after the flag is set to true, otherwise the error could be
  //misused by another close
  if (error) this._error = error;
  
  var me = this;
  //Close in the next tick to allow sending files in the same tick
  process.nextTick (function (){
    me._socket.close ();
  });
};

Request.prototype._initSocket = function (socket, onMessage){
  var me = this;
  this._onCloseFn = function (){
    me._closed = true;
    me._requestTimer.reset ();
    if (me._aborted) return me._onAbort (me._error);
    if (me._error){
      me._onError (me._error);
    }else{
      //Transfer ended successfully
      me._onClose ();
    }
  };
  this._socket = (socket || dgram.createSocket ("udp4"))
      .on ("error", function (error){
        me._closed = true;
        me._requestTimer.reset ();
        me._onError (error);
      })
      .on ("close", this._onCloseFn)
      .on ("message", onMessage);
};

Request.prototype._sendAck = function (block){//console.log(">> " + block)
  this._send (packets.ack.serialize (block));
};

Request.prototype._sendBlock = function (block, buffer){console.log(">> " + block)
  this._send (packets.data.serialize (block, buffer));
};

Request.prototype._sendErrorAndClose = function (code){
  var message;
  if (typeof code === "number"){
    message = errors.rfc[code];
  }else{
    message = code;
  }
  this._send (packets.error.serialize (code));
  this._close (new Error (this._prefixError + message));
};

Request.prototype._closeWithError = function (code){
  var message;
  if (typeof code === "number"){
    message = errors.rfc[code];
  }else{
    message = code;
  }
  this._close (new Error (this._prefixError + message));
};

Request.prototype._sendAndRetransmit = function (buffer){
  this._send (buffer);
  var me = this;
  this._requestTimer.start (function (){
    me._send (buffer);
  });
};

Request.prototype._send = function (buffer){
  if (this._closed || this._closing) return;
  this._socket.send (buffer, 0, buffer.length, this._port, this._address);
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

Request.Helper = function (rinfo){
  this._rinfo = rinfo;
  this._socket = dgram.createSocket ("udp4");
};

Request.Helper.prototype.sendErrorAndClose = function (code){
  var message;
  if (typeof code === "number"){
    message = errors.rfc[code];
  }else{
    message = code;
  }
  var buffer = packets.error.serialize (code);
  var me = this;
  this._socket.send (buffer, 0, buffer.length, this._rinfo.port,
      this._rinfo.address, function (){
    me._socket.close ();
  });
};