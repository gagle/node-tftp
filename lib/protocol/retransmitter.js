"use strict";

var errors = require ("./errors");

var Retransmitter = module.exports = function (request){
  this._request = request;
  this._timer = null;
  this._pending = this._request._globalOptions.retries;
};

Retransmitter.prototype.reset = function (){
  if (!this._timer) return;
  clearTimeout (this._timer);
  this._pending = this._request._globalOptions.retries;
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