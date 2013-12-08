"use strict";

var util = require ("util");
var stream = require ("stream");
var crypto = require ("crypto");
var Reader = require ("./protocol/reader");

var GetStream = module.exports = function (remote, globalOptions, getOptions){
  stream.Readable.call (this);
  
  getOptions = getOptions || {};
  
  var sum;
  if (getOptions.sha1sum){
    sum = crypto.createHash ("sha1");
  }else if (getOptions.md5sum){
    sum = crypto.createHash ("md5");
  }
  
  this._aborted = false;
  this._statsEmitted = false;
  
  var me = this;
  this._reader = new Reader (remote, globalOptions)
      .on ("error", function (error){
        me.emit ("error", error);
      })
      .on ("abort", function (){
        me.emit ("abort");
      })
      .on ("close", function (){
        //No extensions, empty file
        if (!me._statsEmitted){
          me._statsEmitted = true;
          me.emit ("stats", null);
        }
      
        if (!me._aborted && sum){
          if (getOptions.sha1sum &&
              getOptions.sha1sum !== shasum.digest ("hex")){
            return me.emit ("error", new Error ("Invalid sha1sum, the file " +
                "is corrupted"));
          }
          if (getOptions.md5sum && getOptions.md5sum !== shasum.digest ("hex")){
            return me.emit ("error", new Error ("Invalid md5sum, the file " +
                "is corrupted"));
          }
        }
        
        me.push (null);
      })
      .on ("stats", function (stats){
        me._statsEmitted = true;
        me.emit ("stats", stats);
      })
      .on ("data", function (data){
        //The reader emits data chunks with the appropiate order. It guarantees
        //that the chunks are ready to be processed by the user.
        //It decouples the pure implementation of the protocol and the Node.js
        //streaming part
        
        //No extensions
        if (!me._statsEmitted){
          me._statsEmitted = true;
          me.emit ("stats", null);
        }
        
        if (sum) sum.update (data);
        
        me.push (data);
      });
};

util.inherits (GetStream, stream.Readable);

GetStream.prototype._read = function (){
  //no-op
};

GetStream.prototype.abort = function (){
  if (this._aborted) return;
  this._aborted = true;
  this._reader.abort ();
};