"use strict";

var dgram = require ("dgram");
var events = require ("events");
var util = require ("util");
var packets = require ("./packets");
var opcode = require ("./opcode");
var errors = require ("./errors");

var hex = require ("hex");

var Writer = module.exports = function (remote, globalOptions, putOptions){
  events.EventEmitter.call (this);
  
  this._closed = false;
  this._closing = false;
  this._aborted = false;
  
  var me = this;
  //Delay the request to the next tick
  process.nextTick(function(){
    me._open ();
  })
};

util.inherits (Writer, events.EventEmitter);

Writer.prototype.abort = function (){
  if (this._closed || this._closing) return;
  this._aborted = true;
  this._close ();
};

Writer.prototype.send = function (buffer, cb){
  hex (buffer);
  
  
  
  cb ();
};

Writer.prototype._open = function (){
  me.emit ("ready")
};

Writer.prototype._close = function (error){
  if (this._closed || this._closing) return;
  this._closing = true;
};