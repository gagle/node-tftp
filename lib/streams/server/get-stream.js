"use strict";

var util = require ("util");
var stream = require ("stream");
var fs = require ("fs");
var errors = require ("../../protocol/errors");
var packets = require ("../../protocol/packets");
var Reader = require ("../../protocol/server/reader");

var GetStream = module.exports = function (server, helper, message,
    globalOptions, onReady){
  stream.Readable.call (this);
  
  //RRQ
  if (!helper) return;
  
  this._ps = null;
  this._aborted = false;
  this._userExtensions = null;
  
  //Validate the request
  try{
    this._message = packets.wrq.deserialize (message);
  }catch (error){
    return helper.sendErrorAndClose (error);
  }
  
  var me = this;
  fs.stat (globalOptions.root + "/" + this._message.file,
      function (error, stats){
    //Ignore the request, fast shutdown
    if (server._closed) return;
    var enoent = false;
    if (error){
      if (error.code === "EACCESS"){
        return helper.sendErrorAndClose (errors.EACCESS);
      }else if (error.code === "ENOENT"){
        enoent = true;
      }else{
        return helper.sendErrorAndClose (errors.EIO);
      }
    }
    
    if (!enoent && stats.isDirectory ()){
      return helper.sendErrorAndClose (errors.EISDIR);
    }
    
    me._helper = helper;
    me._globalOptions = globalOptions;
    
    //Call the request listener and wait to the data before creating the reader
    onReady (me._message.file);
  });
};

util.inherits (GetStream, stream.Readable);

GetStream.prototype._read = function (){
  if (!this._reader){
    this._createReader ();
  }
};

GetStream.prototype.abort = function (error){
  this._aborted = true;
  if (this._ps){
    this._ps._abort (error);
  }else{
    if (this._reader){
      this._reader.abort (error);
    }else{
      //Request aborted before calling the requestListener
      this._helper.abort (error);
    }
  }
};

GetStream.prototype._createReader = function (){
  var me = this;
  this._reader = new Reader ({
    family: this._family,
    helper: this._helper,
    message: this._message,
    globalOptions: this._globalOptions,
    userExtensions: this._userExtensions
  });
  
  //Free the request message
  this._message = null;
  
  this._reader.onError = function (error){
    me.emit ("close");
    me.emit ("error", error);
  };
  this._reader.onAbort = function (error){
    me.emit ("close");
    me.emit ("abort", error);
  };
  this._reader.onClose = function (){
    me.emit ("close");
    me.push (null);
  };
  this._reader.onStats = function (stats){
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