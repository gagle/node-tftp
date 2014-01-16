"use strict";

var util = require ("util");
var stream = require ("stream");
//var Reader = require ("./protocol/reader");

var GetStream = module.exports = function (socket, wrq, globalOptions, cb){
  stream.Readable.call (this);
  
  this._ps = null;
  
  if (arguments.length === 1){
    //RRQ
    this._ps = socket;
    return;
  }
  
  //Validate the request
  try{
    message = packets.wrq.deserialize (message);
  }catch (error){
    return this._sendErrorAndClose (socket, error);
  }

  /*var me = this;
  this._reader = new Reader (remote, globalOptions);
  this._reader.onError = function (error){
    me.emit ("error", error);
  };
  this._reader.onAbort = function (){
    me.emit ("abort");
  };
  this._reader.onClose = function (){
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
  };*/
};

util.inherits (GetStream, stream.Readable);

GetStream.prototype._read = function (){
  //no-op
};

GetStream.prototype.abort = function (){
  //this._reader.abort ();
};