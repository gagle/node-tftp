"use strict";

var util = require ("util");
var events = require ("events");
var dgram = require ("dgram");
var fs = require ("fs");
var createOptions = require ("./create-options");
var Controller = require ("./controller");

var Server = module.exports = function (options, listener){
  events.EventEmitter.call (this);
  
  if (arguments.length === 0){
    options = {};
  }else if (typeof options === "function"){
    listener = options;
    options = {};
  }
  
  options = createOptions (options, true);
  
  this.hostname = null;
  this.port = options.port;
  this.root = options.root;
  this._closed = false;
  this._controller = new Controller (this, options, listener);
  this._controller.onAbort = function (){
    me.emit ("close");
  };
  this._controller.onError = function (error){
    me.emit ("error", error);
  };
  
  var me = this;
  this._socket = dgram.createSocket ("udp4")
      .on ("error", function (error){
        //Current transfers are not closed, just wait till all of them finish
        //(unlocking the event loop and finishing the process)
        me.emit ("error", error);
      })
      .on ("listening", function (){
        me.hostname = this.address ().address;
      })
      .on ("message", function (message, rinfo){
        me._controller.request (message, rinfo.address, rinfo.port);
      });
};

util.inherits (Server, events.EventEmitter);

Server.prototype.close = function (){
  if (this._closed) return;
  this._closed = true;
  this._controller.abort ();
};

Server.prototype.listen = function (){
  this._socket.bind (this.port);
};

Server.prototype.requestListener = function (req, res){
  var me = this;
  if (req.method === "GET"){
    fs.createReadStream (this.root + "/" + req.file)
        .on ("error", function (error){
          //Don't need to wait to the abort event
          me.emit ("error", error);
          req.abort ();
        })
        .pipe (res);
  }else{
    req.pipe (fs.createWriteStream (this._root + "/" + req.file)
        .on ("error", function (error){
          //Don't need to wait to the abort event
          me.emit ("error", error);
          req.abort ();
        }));
  }
};