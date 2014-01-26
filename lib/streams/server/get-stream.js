"use strict";

var util = require ("util");
var stream = require ("stream");
var fs = require ("fs");
var errors = require ("../../protocol/errors");
var packets = require ("../../protocol/packets");
var Reader = require ("../../protocol/server/reader");

var GetStream = module.exports = function (putFiles, helper, message,
    globalOptions){
  stream.Readable.call (this);
  
  //RRQ
  if (!putFiles) return;
  
  this._ps = null;
  this._aborted = false;
  this._reader = null;
  this._putFiles = putFiles;
  this._ready = false;
  this._needAbort = null;
  
  //Validate the request
  try{
    message = packets.wrq.deserialize (message);
  }catch (error){
    return helper.sendErrorAndClose (error);
  }
  
  this.file = message.file;
  
  //Check availability, another transfer could be putting data into de same file
  if (this._putFiles[this.file]){
    return helper.sendErrorAndClose (errors.ECONPUT);
  }else{
    this._putFiles[this.file] = true;
  }
  
  this._createReader (helper, message, globalOptions);
};

util.inherits (GetStream, stream.Readable);

GetStream.prototype._read = function (){
  //No-op
};

GetStream.prototype.abort = function (error){
  if (this._aborted) return;
  this._aborted = true;
  if (this._ps){
    this._ps._abort (error);
  }else if (this._ready){
    this._reader.abort (error);
  }else{
    this._needAbort = error;
  }
};

GetStream.prototype._createReader = function (helper, message, globalOptions){
  var me = this;
  this._reader = new Reader ({
    helper: helper,
    message: message,
    globalOptions: globalOptions
  });
  this._reader.onError = function (error){
    delete me._putFiles[me.file];
    me.emit ("close");
    me.emit ("error", error);
  };
  this._reader.onAbort = function (error){
    delete me._putFiles[me.file];
    me.emit ("close");
    me.emit ("abort", error);
  };
  this._reader.onClose = function (){
    delete me._putFiles[me.file];
    me.emit ("close");
    me.push (null);
  };
  this._reader.onStats = function (stats){
    if (me._needAbort) return me._reader.abort (me._needAbort);
    me._ready = true;
    me.emit ("stats", stats);
  };
  this._reader.onData = function (data){
    //The reader emits data chunks with the appropiate order. It guarantees
    //that the chunks are ready to be processed by the user
    //It decouples the pure implementation of the protocol and the Node.js
    //streaming part
    me.push (data);
  };
};