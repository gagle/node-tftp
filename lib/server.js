"use strict";

var util = require ("util");
var events = require ("events");
var dgram = require ("dgram");
var fs = require ("fs");
var createOptions = require ("./create-options");
var GetStream = require ("./streams/server/get-stream");
var PutStream = require ("./streams/server/put-stream");
var Helper = require ("./protocol/request").Helper;
var errors = require ("./protocol/errors");
var opcodes = require ("./protocol/opcodes");

var Server = module.exports = function (options, listener){
  events.EventEmitter.call (this);
  
  if (arguments.length === 0){
    options = {};
  }else if (typeof options === "function"){
    listener = options;
    options = {};
  }
  
  options = createOptions (options, true);
  listener = listener || this.requestListener;
  
  this.hostname = null;
  this.port = options.port;
  this.root = options.root;
  this._closed = false;
  
  
  //this._d = true
  
  
  
  var me = this;
  this._socket = dgram.createSocket ("udp4")
      .on ("error", function (error){
        //The current transfers are not aborted, just wait till all of them
        //finish (unlocking the event loop and finishing the process)
        //The user also can cache the requests an abort them manually
        me.emit ("error", error);
      })
      .on ("listening", function (){
        me.hostname = this.address ().address;
      })
      .on ("close", function (){
        me.emit ("close");
      })
      .on ("message", function (message, rinfo){
        //Create a new socket for communicating with the client, the main socket
        //only listens to new requests
        var helper = new Helper (rinfo);

        if (me._d){
          me._d = false
          return helper.sendErrorAndClose (errors.EDENY);
        }
        
        if (message.length < 9){
          //2 op, at least 1 filename, 4 mode mail, 2 NUL
          return helper.sendErrorAndClose (errors.EBADMSG);
        }
        
        //Check if it's RRQ or WRQ
        var op = message.readUInt16BE (0);
        
        if (op === opcodes.RRQ){
          if (options.denyGET){
            return helper.sendErrorAndClose (errors.ENOGET);
          }
          var gs = new GetStream ();
          var ps = new PutStream (me, helper, message, options, function (file){
            //Prepare the streams
            gs.method = "GET";
            gs.file = file;
            
            //Link the streams each other, the put stream is only used to send
            //data to the client but the "connection" and all its related events
            //occur in the get stream
            ps._gs = gs;
            gs._ps = ps;
            me.emit ("connection", gs);
            
            //Call the request listener
            listener.call (me, gs, ps);
          });
        }else if (op === opcodes.WRQ){
          if (options.denyPUT){
            return helper.sendErrorAndClose (errors.ENOPUT);
          }
          /*var gs = new GetStream (me, helper, message, options, function (file){
            //Prepare the streams
            gs.method = "PUT";
            gs.file = file;
            me.emit ("connection", gs);
            
            //Call the request listener
            listener.call (me. gs, new PutStream ());
          });*/
        }else{
          return helper.sendErrorAndClose (errors.EBADOP);
        }
      });
};

util.inherits (Server, events.EventEmitter);

Server.prototype.close = function (){
  if (this._closed) return;
  this._closed = true;
  //Stop the main socket from accepting new connections
  this._socket.close ();
};

Server.prototype.listen = function (){
  this._socket.bind (this.port);
};

Server.prototype.requestListener = function (req, res){
  var me = this;
  if (req.method === "GET"){
    fs.createReadStream (this.root + "/" + req.file)
        .on ("error", function (error){
          req.on ("abort", function (){
            req.emit ("error", error);
          });
          req.abort ();
        })
        .pipe (res);
    req.on ("stats", console.log)
  }else{
    req.pipe (fs.createWriteStream (this.root + "/" + req.file)
        .on ("error", function (error){
          req.on ("abort", function (){
            req.emit ("error", error);
          });
          req.abort ();
        }));
    req.on ("stats", console.log)
  }
};