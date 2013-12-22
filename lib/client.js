"use strict";

var fs = require ("fs");
var path = require ("path");
var GetStream = require ("./get-stream");
var PutStream = require ("./put-stream");
var checkRemote = require ("./check-remote");

var sanitizeNumber = function (n){
  n = ~~n;
  return n < 1 ? 1 : n;
};

var Client = module.exports = function (options){
  if (!options.hostname){
    throw new Error ("Missing hostname");
  }
  
  this._reSlash = /\/|\\/;
  this._options = {
    hostname: options.hostname,
    port: sanitizeNumber (options.port || 69),
    retries: sanitizeNumber (options.retries || 3)
  };
  
  //Default window size 4: https://github.com/joyent/node/issues/6696
  var windowSize = sanitizeNumber (options.windowSize || 4);
  if (windowSize > 65535) windowSize = 64;
  windowSize += "";
  
  var blockSize = sanitizeNumber (options.blockSize || 1468) + "";
  if (blockSize < 8 || blockSize > 65464) blockSize = 1468;
  blockSize += "";
  
  var timeout = sanitizeNumber (options.timeout || 3000) + "";
  
  this._options.extensions = {
    //Maximum block size before IP packet fragmentation on Ethernet networks
    blksize: blockSize,
    timeout: timeout,
    windowsize: windowSize,
    //tsize is 0 if the packet is RRQ, and the file size if the packet is WRQ
    tsize: null,
    //This option is not strictly required because it is not necessary when
    //receiving a file. It is used to inform the server when sending a file
    rollover: "0"
  };
  
  this._options.extensionsLength = 48 + blockSize.length + timeout.length +
      windowSize.length;
};

Client.prototype.createGetStream = function (remote, options){
  checkRemote (remote);
  return new GetStream (remote, this._options, options);
};

Client.prototype.createPutStream = function (remote, options){
  checkRemote (remote);
  return new PutStream (remote, this._options, options.size);
};

Client.prototype.get = function (remote, local, options, cb){
  checkRemote (remote);
  
  var argsLength = arguments.length;
  if (argsLength === 2){
    cb = local;
    local = remote;
  }else if (argsLength === 3){
    if (typeof local === "object"){
      cb = options;
      options = local;
      local = remote;
    }else if (typeof local === "string"){
      cb = options;
      options = {};
    }
  }
  
  var me = this;
  
  //Check if local is a dir to prevent from starting a new request
  fs.stat (local, function (error, stats){
    if (error){
      if (error.code !== "ENOENT") return cb (error.message);
    }else if (stats.isDirectory ()){
      return cb ("The local file is a directory");
    }
    
    var ws = fs.createWriteStream (local)
        .on ("error", function (error){
          gs.on ("abort", function (){
            fs.unlink (local, function (){
              cb (error);
            });
          });
          gs.abort ();
        })
        .on ("finish", function (){
          cb ();
        });
    
    var gs = new GetStream (remote, me._options, options);
    gs
        .on ("error", function (error){
          ws.on ("close", function (){
            fs.unlink (local, function (){
              cb (error);
            });
          });
          ws.destroy ();
        });
    
    gs.pipe (ws);
  });
};

Client.prototype.put = function (local, remote, cb){
  if (arguments.length === 2){
    cb = remote;
    remote = path.basename (local);
  }
  
  checkRemote (remote);

  var me = this;
  
  //Check if local is a dir or doesn't exist to prevent from starting a new
  //request
  fs.stat (local, function (error, stats){
    if (error) return cb (error);
    if (stats.isDirectory ()) return cb ("The local file is a directory");
    
    var ps = new PutStream (remote, me._options, { size: stats.size })
        .on ("error", function (error){
          rs.on ("close", function (){
            cb (error);
          });
          rs.destroy ();
        })
        .on ("finish", function (){
          cb ();
        });
    
    var rs = fs.createReadStream (local)
        .on ("error", function (error){
          ps.on ("abort", function (){
            cb (error);
          });
          ps.abort ();
        });
    
    rs.pipe (ps);
  });
};