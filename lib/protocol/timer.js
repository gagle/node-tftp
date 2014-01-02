"use strict";

var Timer = module.exports = function (timeout, retries, request){
  this._timeout = timeout;
  this._retries = retries;
  this._pending = retries;
  this._request = request;
  this._buffers = [];
  this._timer = null;
  this._send = function (buffer){
    request._sendMessage (buffer);
  };
};

Timer.prototype.add = function (buffer){
  this._buffers.push (buffer);
};

Timer.prototype.reset = function (){
  clearTimeout (this._timer);
  this._buffers = [];
};

Timer.prototype.start = function (){
  this._timer = setTimeout (function (){
    if (!me._pending){console.log("meirda")
      //No more retries
      me._request.close (new Error ("Timed out"));
    }else{console.log("otra " + buffer.readUInt16BE (2))
      me._pending--;
      //Try again
      me.start ();
    }
  }, this._timeout);
  
  //Send the buffers
  me._buffers.forEach (me._send);
};