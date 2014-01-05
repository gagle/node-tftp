"use strict";

var fs = require ("fs");
var path = require ("path");
var GetStream = require ("./get-stream");
var PutStream = require ("./put-stream");
var normalizeRemote = require ("./normalize-remote");

var sanitizeNumber = function (n){
  n = ~~n;
  return n < 1 ? 1 : n;
};

var knownExtensions = {
  timeout: true,
  tsize: true,
  blksize: true,
  windowsize: true,
  rollover: true
};

var Client = module.exports = function (options){
  if (!options.hostname){
    throw new Error ("Missing hostname");
  }
  
  this._options = {
    hostname: options.hostname,
    port: sanitizeNumber (options.port || 69),
    retries: sanitizeNumber (options.retries || 3)
  };
  
  //Default window size 4: https://github.com/joyent/node/issues/6696
  var windowSize = sanitizeNumber (options.windowSize || 4);
  if (windowSize > 65535) windowSize = 4;
  
  //Maximum block size before IP packet fragmentation on Ethernet networks
  var blockSize = sanitizeNumber (options.blockSize || 1468);
  if (blockSize < 8 || blockSize > 65464) blockSize = 1468;
  
  var timeout = sanitizeNumber (options.timeout || 3000);
  
  this._options.extensions = {
    blksize: blockSize,
    timeout: timeout,
    windowsize: windowSize,
    //This option is not strictly required because it is not necessary when
    //receiving a file and it is only used to inform the server when sending a
    //file. Most servers won't care about it and will simply ignore it
    rollover: 0
  };
  
  this._options.extensionsString = {
    blksize: blockSize + "",
    timeout: timeout + "",
    windowsize: windowSize + "",
    rollover: "0"
  };
  
  this._options.extensionsLength = 48 +
      this._options.extensionsString.blksize.length +
      this._options.extensionsString.timeout.length +
      this._options.extensionsString.windowsize.length;
  
  //Custom extensions (the server should handle them)
  var customExtension;
  for (var p in options.userExtensions){
    if (knownExtensions[p]) continue;
    this._options.userExtensions = true;
    customExtension = options.userExtensions[p] + "";
    this._options.extensionsString[p] = customExtension;
    this._options.extensionsLength += p.length + customExtension.length + 2;
  }
};

Client.prototype.createGetStream = function (remote, options){
  remote = normalizeRemote (remote);
  return new GetStream (remote, this._options, options);
};

Client.prototype.createPutStream = function (remote, options){
  remote = normalizeRemote (remote);
  return new PutStream (remote, this._options, options);
};

Client.prototype.get = function (remote, local, options, cb){
  remote = normalizeRemote (remote);
  
  var argsLength = arguments.length;
  if (argsLength === 2){
    cb = local;
    local = path.basename (remote);
  }else if (argsLength === 3){
    if (typeof local === "object"){
      cb = options;
      options = local;
      local = path.basename (remote);
    }else if (typeof local === "string"){
      cb = options;
      options = {};
    }
  }
  
  var me = this;
  
  //Check if local is a dir to prevent from starting a new request
  fs.stat (local, function (error, stats){
    if (error){
      if (error.code !== "ENOENT") return cb (error);
    }else if (stats.isDirectory ()){
      return cb (new Error ("The local file is a directory"));
    }
    
    var wsError;
    
    var gs = new GetStream (remote, me._options, options)
        .on ("error", function (error){
          ws.on ("close", function (){
            fs.unlink (local, function (){
              cb (error);
            });
          });
          ws.destroy ();
        })
        .on ("abort", function (){
          fs.unlink (local, function (){
            cb (wsError);
          });
        });
        
    var ws = fs.createWriteStream (local)
        .on ("error", function (error){
          wsError = error;
          gs.abort ();
        })
        .on ("finish", function (){
          cb ();
        });
    
    gs.pipe (ws);
  });
};

Client.prototype.put = function (local, remote, cb){
  if (arguments.length === 2){
    cb = remote;
    remote = path.basename (local);
  }

  remote = normalizeRemote (remote);

  var me = this;
  
  //Check if local is a dir or doesn't exist to prevent from starting a new
  //request
  fs.stat (local, function (error, stats){
    if (error) return cb (error);
    if (stats.isDirectory ()){
      return cb (new Error ("The local file is a directory"));
    }
    
    var rsError;
    
    var rs = fs.createReadStream (local)
        .on ("error", function (error){
          rsError = error;
          ps.abort ();
        });
    
    var ps = new PutStream (remote, me._options, { size: stats.size })
        .on ("error", function (error){
          rs.on ("close", function (){
            cb (error);
          });
          rs.destroy ();
        })
        .on ("abort", function (){
          cb (rsError);
        })
        .on ("finish", function (){
          cb ();
        });
    
    rs.pipe (ps);
  });
};