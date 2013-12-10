"use strict";

var util = require ("util");
var stream = require ("stream");
var Writer = require ("./protocol/writer");

var PutStream = module.exports = function (remote, globalOptions, putOptions){
  if (putOptions.size === undefined || putOptions.size === null){
    throw new Error ("Missing file size");
  }

  stream.Writable.call (this);
  
  this._remote = remote;
  this._globalOptions = globalOptions;
  this._options = putOptions;
  this._finished = false;
  this._aborted = false;
  this._writer = null;
  
  var me = this;
  
  this.on ("unpipe", function (){
    //After a finish event the readable stream unpipes the writable stream
    if (this._finished) return;
    
    //The user has called manually unpipe()
    //Abort file transfer
    if (me._writer) me._writer.abort ();
  });
  
  this.on ("finish", function (){
    //The finish event is emitted before unpipe
    me._finished = true;
  })
};

util.inherits (PutStream, stream.Writable);

PutStream.prototype._createWriter = function (cb){
  var me = this;
  this._writer = new Writer (this._remote, this._globalOptions, this._options)
      .on ("error", function (error){
        me.emit ("error", error);
      })
      .on ("abort", function (){
        me.emit ("abort");
      })
      .on ("ready", cb);
};

PutStream.prototype._write = function (chunk, encoding, cb){
  if (this._writer){
    this._writer.send (chunk, cb);
  }else{
    var me = this;
    this._createWriter (function (){
      //me._writer.send (chunk, cb);
    });
  }
};

PutStream.prototype.abort = function (){
  if (this._aborted) return;
  this._aborted = true;
  if (this._writer) this._writer.abort ();
};