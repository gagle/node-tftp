"use strict";

var util = require ("util");
var stream = require ("stream");
var crypto = require ("crypto");
var Reader = require ("./protocol/reader");

var GetStream = module.exports = function (remote, globalOptions, getOptions){
  stream.Readable.call (this);
  
  var sum;
  
  getOptions = getOptions || {};
  
  if (getOptions.sha1sum){
    sum = crypto.createHash ("sha1");
  }else if (getOptions.md5sum){
    sum = crypto.createHash ("md5");
  }
  
  this._aborted = false;
  this._size = null;
  
  var me = this;
  this._reader = new Reader (remote, globalOptions)
      .on ("error", function (error){
        me.emit ("error", error);
      })
      .on ("abort", function (){
        me.emit ("abort");
      })
      .on ("size", function (size){
        me._size = size;
        me.emit ("size", size);
      })
      .on ("data", function (data){
        //The Reader class emits the data chunks with the appropiate order. It
        //guarantees that the chunks are ready to be processed by the user.
        //It decouples the pure implementation of the protocol and the Node.js
        //streaming part
        me.push (data);
        
        if (sum){
          sum.update (data);
        }
        
        //Emit progress if tzise is available
        if (me._size !== null){
          me.emit ("progress", data.length);
        }
      })
      .on ("end", function (){
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