"use strict";

var util = require ("util");
var stream = require ("stream");
var fs = require ("fs");
var path = require ("path");
var errors = require ("../../protocol/errors");
var packets = require ("../../protocol/packets");
var Writer = require ("../../protocol/server/writer");

var PutStream = module.exports = function (server, helper, message,
    globalOptions, onReady){
  stream.Writable.call (this);
  
  //WRQ
  if (!helper) return;
  
  this._finished = false;
  this._writer = null;
  this._size = null;
  this._gs = null;
  this._userExtensions = null;
  this._helper = helper;
  
  //Validate the request
  try{
    this._message = packets.rrq.deserialize (message);
  }catch (error){
    return helper.sendErrorAndClose (error);
  }
  
  var me = this;
  fs.stat (globalOptions.root + "/" + this._message.file,
      function (error, stats){
    //Ignore the request, fast shutdown
    if (server._closed) return;
    if (error){
      var code;
      if (error.code === "ENOENT"){
        code = errors.ENOENT;
      }else if (error.code === "EACCESS"){
        code = errors.EACCESS;
      }else{
        code = errors.EIO;
      }
      return helper.sendErrorAndClose (code);
    }
    
    if (stats.isDirectory ()){
      return helper.sendErrorAndClose (errors.EISDIR);
    }
    
    me._size = stats.size;
    
    if (me._size === 0){
      //Empty file
      //The _write() function is never called so the get request is never
      //answered
      var end = me.end;
      me.end = function (){
        me._createWriter (function (){
          //Send an empty buffer
          me._writer.send (new Buffer (0), function (){
            end.apply (me, arguments);
          });
        });
      };
    }
    
    me.on ("unpipe", function (){
      //After a finish event the readable stream unpipes the writable stream
      if (me._finished) return;
      
      //The user has called manually to unpipe()
      //Abort file transfer
      if (me._writer) me._writer.abort ();
    });
    
    me.on ("finish", function (){
      //The finish event is emitted before unpipe
      //This handler is the first that is called when the finish event is
      //emitted
      me._finished = true;
    });
    
    me._helper = helper;
    me._globalOptions = globalOptions;
    
    //Call the request listener and wait to the data before creating the writer
    onReady (me._message.file);
  });
};

util.inherits (PutStream, stream.Writable);

PutStream.prototype._abort = function (error){
  if (this._writer){
    this._writer.abort (error);
  }else{
    //Request aborted before calling the requestListener
    this._helper.abort (error);
  }
};

PutStream.prototype._createWriter = function (cb){
  var me = this;
  this._writer = new Writer ({
    helper: this._helper,
    message: this._message,
    globalOptions: this._globalOptions,
    size: this._size,
    userExtensions: this._userExtensions
  });
  
  //Free the request message
  this._message = null;
  
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
    me._gs.emit ("close");
  };
  this._writer.onStats = function (stats){
    me._gs.emit ("stats", stats);
  };
  this._writer.onContinue = cb;
};

PutStream.prototype._write = function (chunk, encoding, cb){
  if (this._writer){
    this._writer.send (chunk, cb);
  }else{
    var me = this;
    this._createWriter (function (){
      me._writer.send (chunk, cb);
    });
  }
};

PutStream.prototype.setUserExtensions = function (userExtensions){
  if (this._writer){
    //The extensions are set from inside the stats event listener
    this._writer._responseUserExtensions = userExtensions;
  }else{
    //The extensions are set before the stats event emission
    this._userExtensions = userExtensions;
  }
};