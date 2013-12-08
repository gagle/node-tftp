"use strict";

var events = require ("events");
var util = require ("util");
var Request = require ("./request");
var opcode = require ("./opcode");

var hex = require ("hex");

var Writer = module.exports = function (remote, globalOptions, putOptions){
  events.EventEmitter.call (this);
  
  this._closed = false;
  this._closing = false;
  this._aborted = false;
  this._windowSize = null;
  this._blockSize = null;
  this._sent = false;
  
  var me = this;
  this._request = new Request (opcode.WRQ, remote, globalOptions,
      putOptions.size)
      .on ("error", function (error){
        me.emit ("error", error);
      })
      .on ("close", function (){
        me.emit ("finish");
      })
      .on ("abort", function (){
        me.emit ("abort");
      })
      .on ("ack", function (ack){
        me._onAck (ack);
      })
      .on ("ready", function (){
        me.emit ("ready");
      })
      .on ("extensions", function (extensions){
        me._windowSize = extensions.windowSize;
        me._blockSize = extensions.blockSize;
      });
};

util.inherits (Writer, events.EventEmitter);

Writer.prototype.abort = function (){
  this._request.abort ();
};

Writer.prototype.send = function (buffer, cb){
  this._sent = true;
  console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>")
  hex (buffer);
  
  //The buffer needs to be sliced in blocks
  
  cb ();
};

Writer.prototype._onAck = function (ack){
  console.log(ack)
  
  if (!this._sent && ack.block === 0){
    //The server doesn't support extensions
    return this.emit ("ready");
  }
  
  
};