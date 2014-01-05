"use strict";

var util = require ("util");
var stream = require ("stream");
var crypto = require ("crypto");
var Reader = require ("./protocol/reader");

var GetStream = module.exports = function (remote, globalOptions, getOptions){
  stream.Readable.call (this);

  getOptions = getOptions || {};
  var sum;
  
  //Prefer sha1 over md5 if both sums are given
  if (getOptions.sha1sum){
    sum = crypto.createHash ("sha1");
  }else if (getOptions.md5sum){
    sum = crypto.createHash ("md5");
  }
  
  var me = this;
  this._reader = new Reader (remote, globalOptions)
      .on ("error", function (error){
        me.emit ("error", error);
      })
      .on ("abort", function (){
        me.emit ("abort");
      })
      .on ("close", function (){
        if (sum){
          var digest = sum.digest ("hex");
          if (getOptions.sha1sum){
            if (getOptions.sha1sum !== digest){
              return me.emit ("error", new Error ("Invalid sha1sum, the file " +
                  "is corrupted"));
            }
          }else if (getOptions.md5sum){
            if (getOptions.md5sum !== digest){
              return me.emit ("error", new Error ("Invalid md5sum, the file " +
                  "is corrupted"));
            }
          }
        }
        
        me.push (null);
      })
      .on ("stats", function (stats){
        me.emit ("stats", stats);
      })
      .on ("data", function (data){
        //The reader emits data chunks with the appropiate order. It guarantees
        //that the chunks are ready to be processed by the user
        //It decouples the pure implementation of the protocol and the Node.js
        //streaming part
        if (sum) sum.update (data);
        me.push (data);
      });
};

util.inherits (GetStream, stream.Readable);

GetStream.prototype._read = function (){
  //no-op
};

GetStream.prototype.abort = function (){
  this._reader.abort ();
};