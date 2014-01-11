"use strict";

var dgram = require ("dgram");
var events = require ("events");
var errors = require ("./protocol/errors");
var opcodes = require ("./protocol/opcodes");
var packets = require ("./protocol/packets");
var GetStream = require ("./streams/server/get-stream");
var PutStream = require ("./streams/server/put-stream");

var Controller = module.exports = function (options, requestListener){
  this._options = options;
  this._requestListener = requestListener;
  this._activeTransfers = 0;
};

Controller.prototype.request = function (message, address, port){
  this._activeTransfers++;
  
  //Create a new socket for communicating with the client, the main socket
  //only listens to new requests
  var me = this;
  var socket = dgram.createSocket ("udp4")
      .on ("error", function (error){
        me.onError (error);
      })
      .on ("close", function (){
        if (!--me._activeTransfers && me._abort){
          me.onAbort ();
        }
      });
  
  socket = {
    socket: socket,
    address: address,
    port: port
  };

  if (message.length < 9){
    //2 op, at least 1 filename, 4 mode mail, 2 NUL
    return this._sendErrorAndClose (socket, errors.EBADMSG);
  }
  
  //Check if it's RRQ or WRQ
  var op = message.readUInt16BE (0);
  
  if (op === opcodes.RRQ){
    if (this._options.denyGET){
      return this._sendErrorAndClose (socket, errors.ENOGET);
    }
    var ps = new PutStream (socket, message, this._options, function (filename){
      //Call the request listener
      var gs = new GetStream ();
      gs.method = "GET";
      gs.file = filename;
      me._requestListener (gs, ps);
    });
  }else if (op === opcodes.WRQ){
    if (this._options.denyPUT){
      return this._sendErrorAndClose (socket, errors.ENOPUT);
    }
    /*var gs = new GetStream (socket, message, this._options, function (filename){
      //Call the request listener
      gs.method = "PUT";
      gs.file = filename;
      me._requestListener (gs, new PutStream ());
    });*/
  }else{
    return this._sendErrorAndClose (socket, errors.EBADOP);
  }
};

Controller.prototype.abort = function (){
  //Abort all the current transfers
  this._abort = true;
  
};

Controller.prototype._sendErrorAndClose = function (socket, code){
  var buffer = packets.error.serialize (code);
  socket.socket.send (buffer, 0, buffer.length, socket.port, socket.address,
      function (){
    socket.socket.close ();
  });
};