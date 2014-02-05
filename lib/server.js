"use strict";

var util = require ("util");
var events = require ("events");
var dgram = require ("dgram");
var fs = require ("fs");
var net = require ("net");
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
  this.on ("request", listener || this.requestListener);
  
  this.root = options.root;
  this._port = options.port;
  this._closed = false;
  this._putFiles = {};
  
  var address = options.address;
  if (options.address === "localhost"){
    //IPv4 if localhost
    address = "127.0.0.1";
  }
  var family = net.isIP (address);
  if (!family) throw new Error ("Invalid IP address (domain names are not " +
      "allowed)");
  this._host = address;
  
  var me = this;
  this._socket = dgram.createSocket ("udp" + family)
      .on ("error", function (error){
        //The current transfers are not aborted, just wait till all of them
        //finish (unlocking the event loop and finishing the process)
        //The user also can cache the requests an abort them manually
        me.emit ("error", error);
      })
      .on ("close", function (){
        me.emit ("close");
      })
      .on ("message", function (message, rinfo){
        //Create a new socket for communicating with the client, the main socket
        //only listens to new requests
        var helper = new Helper (rinfo, family);
        
        if (message.length < 9 || message.length > 512){
          //2 op, at least 1 filename, 4 mode mail, 2 NUL
          //Max 512
          return helper.sendErrorAndClose (errors.EBADMSG);
        }
        
        //Check if it's RRQ or WRQ
        var op = message.readUInt16BE (0);
        
        if (op === opcodes.RRQ){
          if (options.denyGET){
            return helper.sendErrorAndClose (errors.ENOGET);
          }
          
          var gs = new GetStream ();
          var ps = new PutStream (helper, message, options, gs);
          ps.onReady = function (){
            me.emit ("request", gs, ps);
          };
        }else if (op === opcodes.WRQ){
          if (options.denyPUT){
            return helper.sendErrorAndClose (errors.ENOPUT);
          }
          
          var ps = new PutStream ();
          var gs = new GetStream (me._putFiles, helper, message, options, ps);
          gs.onReady = function (){
            me.emit ("request", gs, ps);
          };
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
  var me = this;
  this._socket.bind (this._port, this._host, function (){
    me._host = me._socket.address ().address;
    me.emit ("listening");
  });
};

Server.prototype.requestListener = function (req, res){
  if (this._closed) return;
  if (req._listenerCalled || req._aborted) return;
  req._listenerCalled = true;
  
  var name = this.root + "/" + req.file;
  if (req.method === "GET"){
    fs.stat (name, function (error, stats){
      if (error){
        req.on ("abort", function (){
          req.emit ("error", error);
        });
        var msg;
        if (error.code === "EACCESS" || error.code === "EPERM"){
          msg = errors.EACCESS.message;
        }else if (error.code === "ENOENT"){
          msg = errors.ENOENT.message;
        }else{
          msg = errors.EIO.message;
        }
        req.abort (msg);
        return;
      }
      
      res.setSize (stats.size);
      fs.createReadStream (name)
          .on ("error", function (error){
            req.on ("abort", function (){
              req.emit ("error", error);
            });
            req.abort (errors.ENOENT.message);
          })
          .pipe (res);
    });
  }else{
    req.pipe (fs.createWriteStream (name)
        .on ("error", function (error){
          req.on ("abort", function (){
            req.emit ("error", error);
          });
          var msg;
          if (error.code === "EACCESS" || error.code === "EPERM"){
            msg = errors.EACCESS.message;
          }else{
            msg = errors.EIO.message;
          }
          req.abort (msg);
        }));
  }
};