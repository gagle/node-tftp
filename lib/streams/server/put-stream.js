"use strict";

var util = require ("util");
var stream = require ("stream");
var fs = require ("fs");
var path = require ("path");
var errors = require ("../../protocol/errors");
var packets = require ("../../protocol/packets");
var Writer = require ("../../protocol/server/writer");

var PutStream = module.exports = function (helper, message, globalOptions,
    onReady){
  stream.Writable.call (this);
  
  //WRQ
  if (!helper) return;
  
  this._isWRQ = false;
  this._finished = false;
  this._writer = null;
  this._size = null;
  this._gs = null;
  this._continue = false;
  this._closed = false;
  this._ready = false;
  this._needAbort = null;
  
  //Validate the request
  try{
    message = packets.rrq.deserialize (message);
  }catch (error){
    return helper.sendErrorAndClose (error);
  }
  
  var me = this;
  this.on ("unpipe", function (){
    //After a finish event the readable stream unpipes the writable stream
    if (me._finished) return;
    
    //The user has called manually to unpipe()
    //Abort file transfer
    if (me._writer) me._writer.abort ();
  });
  
  this.on ("finish", function (){
    //The finish event is emitted before unpipe
    //This handler is the first that is called when the finish event is
    //emitted
    me._finished = true;
  });
  
  this._createWriter (helper, message, globalOptions);
  
  onReady (message.file);
};

util.inherits (PutStream, stream.Writable);

PutStream.prototype._abort = function (error){
  if (this._ready){
    this._writer.abort (error);
  }else{
    this._needAbort = error;
  }
};

PutStream.prototype._createWriter = function (helper, message, globalOptions){
  var me = this;
  this._writer = new Writer ({
    helper: helper,
    message: message,
    globalOptions: globalOptions
  });
  //The events are emitted using the get stream
  this._writer.onError = function (error){
    me._gs.emit ("close");
    me._gs.emit ("error", error);
  };
  this._writer.onAbort = function (error){
    me._gs.emit ("close");
    me._gs.emit ("abort", error);
  };
  this._writer.onClose = function (){
    me._closed = true;
    me._gs.emit ("close");
  };
  this._writer.onStats = function (stats){
    if (me._needAbort) return me._writer.abort (me._needAbort);
    me._ready = true;
    if (me._writer._size !== null){
      process.nextTick (function (){
        //The size was set in a previous tick
        me._writer.continueRequest ();
      });
    }
    me._gs.emit ("stats", stats);
  };
  this._writer.onContinue = function (){
    me._continue = true;
  };
};

PutStream.prototype._write = function (chunk, encoding, cb){
  if (this._continue){
    this._writer.send (chunk, cb);
  }else{
    //Wait till the writer is ready to send data
    var me = this;
    this._writer.onContinue = function (){
      me._continue = true;
      //Free the closure
      me._writer.onContinue = null;
      me._writer.send (chunk, cb);
    };
  }
};

PutStream.prototype.setSize = function (size){
  if (this._isWRQ) throw new Error ("Only GET requests can set the size");
  if (size === 0){
    //Empty file
    //The _write() function is never called so the get request is never
    //answered
    var end = this.end;
    var me = this;
    this.end = function (){
      //Send an empty buffer
      me._writer.send (new Buffer (0), function (){
        end.call (me);
      });
    };
  }
  this._writer.setSize (size);
  if (this._ready) this._writer.continueRequest ();
};

PutStream.prototype.setUserExtensions = function (userExtensions){
  if (this._isWRQ){
    this._gs._reader._responseUserExtensions = userExtensions;
  }else{
    this._writer._responseUserExtensions = userExtensions;
  }
};