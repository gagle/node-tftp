"use strict";

var util = require ("util");
var stream = require ("stream");
var fs = require ("fs");
var errors = require ("../../protocol/errors");
var packets = require ("../../protocol/packets");
var Reader = require ("../../protocol/server/reader");

var GetStream = module.exports = function (socket, message, globalOptions, cb){
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
  
  var me = this;
  fs.stat (globalOptions.root + "/" + message.file,
      function (error, stats){
    var enoent = false;
    if (error){
      if (error.code === "EACCESS"){
        return me._sendErrorAndClose (socket, errors.EACCESS);
      }else if (error.code === "ENOENT"){
        enoent = true;
      }else{
        return me._sendErrorAndClose (socket, errors.EIO);
      }
    }
    
    if (!enoent && stats.isDirectory ()){
      return me._sendErrorAndClose (socket, errors.EISDIR);
    }
    
    console.log(message)
    
    me._reader = new Reader ({
      socket: socket,
      message: message,
      globalOptions: globalOptions,
    });
    me._reader.onError = function (error){console.log("ERROR: " + error)
      //me.emit ("error", error);
    };
    me._reader.onAbort = function (){console.log("ABORT: " + error)
      //me.emit ("abort");
    };
    me._reader.onClose = function (){
      me.push (null);
    };
    me._reader.onStats = function (stats){
      me.emit ("stats", stats);
    };
    me._reader.onData = function (data){
      //The reader emits data chunks with the appropiate order. It guarantees
      //that the chunks are ready to be processed by the user
      //It decouples the pure implementation of the protocol and the Node.js
      //streaming part
      me.push (data);
    };
    
    //Call the request listener
    cb (message.file);
  });
};

util.inherits (GetStream, stream.Readable);

GetStream.prototype._read = function (){
  //no-op
};

GetStream.prototype.abort = function (message){
  if (this._ps){
    this._ps._abort (message);
  }else{
    this._reader.abort ();
  }
};

GetStream.prototype._sendErrorAndClose = function (socket, code){
  var buffer = packets.error.serialize (code);
  socket.socket.send (buffer, 0, buffer.length, socket.port, socket.address,
      function (){
    socket.socket.close ();
  });
};