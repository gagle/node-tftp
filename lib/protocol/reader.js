"use strict";

var events = require ("events");
var util = require ("util");
var Request = require ("./request");
var opcode = require ("./opcode");

var Reader = module.exports = function (remote, options){
  events.EventEmitter.call (this);
  
  this._windowStart = 1;
  this._windowBlocksIndex = {};
  this._windowBlocks = [];
  this._comparator = function (a, b){
    return a.block - b.block;
  };
  this._lastReceived = false;
  this._windowSize = null;
  this._pending = null;
  
  var me = this;
  this._request = new Request (opcode.RRQ, remote, options)
      .on ("error", function (){
        me.emit ("error", error);
      })
      .on ("close", function (){
        me.emit ("end");
      })
      .on ("abort", function (){
        me.emit ("abort");
      })
      .on ("data", function (data){
        me._onData (data);
      })
      .on ("extensions", function (extensions){
        me._pending = me._windowSize = extensions.windowSize;
        me._blockSize = extensions.blockSize;
        if (extensions.transferSize !== undefined){
          me.emit ("size", extensions.transferSize);
        }
      });
};

util.inherits (Reader, events.EventEmitter);

Reader.prototype._onData = function (message){
  if (message.block === 0){
    //The server has rollovered to 0
    this._windowStart = 0;
  }

  //Validate whether the block number is inside the current window
  var windowEnd = this._windowStart + this._windowSize - 1;
  var mayRollover = windowEnd - 65535 > 0;
  if (!mayRollover &&
      message.block < this._windowStart || message.block > windowEnd){
    //Check the validity of the block if it doesn't rollover
    return this.sendErrorAndClose (0, "Invalid block number, out of range ");
  }
  
  //Ignore duplicates (sorcerer's apprendice syndrome)
  if (this._windowBlocksIndex[message.block]) return;
  
  //Insert new block
  this._windowBlocksIndex[message.block] = true;
  this._windowBlocks.push (message);
  
  //Update the pending packets
  if (message.data.length < this._blockSize){
    //Last packet
    this._pending = message.block - this._windowStart + 1 -
        this._windowBlocks.length;
    this._lastReceived = true;
  }else{
    this._pending--;
  }
  
  if (!this._pending){
    //Send ACK for the latest block
    this._windowStart += this._windowSize;
    if (this._windowStart > 65535){
      //By default rollovers to 1
      this._windowStart -= 65535;
    }
    
    //Sort the blocks
    this._windowBlocks.sort (this._comparator);
    
    //Note: When a DATA packet is lost, the last ACK message is sent when the
    //timeout is reached. This ACK message acknowledges the last DATA packet of
    //the previous window, that is, the whole current window is asked again
    var me = this;
    this._request.sendAck (
        this._windowBlocks[this._windowBlocks.length - 1].block, function (){
      me._pending = me._windowSize;
      
      //Emit data
      me._windowBlocks.forEach (function (message){
        //Ignore DATA packets with 0 length, they are received when the file
        //has the same size of a window
        if (message.data.length){
          me.emit ("data", message.data);
        }
      });
      
      if (me._lastReceived) me._request.close ();
      
      me._windowBlocks = [];
      me._windowBlocksIndex = {};
    });
  }
};

Reader.prototype.abort = function (){
  this._request.abort ();
};