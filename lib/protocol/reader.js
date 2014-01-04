"use strict";

var events = require ("events");
var util = require ("util");
var Request = require ("./request");
var opcode = require ("./opcode");

var Reader = module.exports = function (remote, globalOptions){
  events.EventEmitter.call (this);
  
  this._windowStart = 1;
  this._windowEnd = null;
  this._windowSize = null;
  this._windowBlocksIndex = {};
  this._windowBlocks = [];
  this._preFilterFn = function (e){
    return e.block >= me._windowStart;
  };
  this._postFilterFn = function (e){
    return e.block < me._windowStart;
  };
  this._sortFn = function (a, b){
    return a.block - b.block;
  };
  this._lastReceived = false;
  this._pending = null;
  this._expected = null;
  this._oack = null;
  this._firstWindow = true;
  this._restransmitterStartFn = function (){
    var block = me._blockToRetransmit ();
    if (block > 0){
      //Update the window and emit back to the client the data
      //By default rollovers to 1
      me._windowStart = block === 65535 ? 1 : block + 1;
      //The last block could have been received
      me._lastReceived = false;
      me._notifyWindow (block);
    }
    me._request.sendAck (block);
  };
  this._mayRollover = false;
  this._rolloverFix = 0;
  this._windowStartRollovered = false;
  
  var me = this;
  this._request = new Request (opcode.RRQ, remote, globalOptions)
      .on ("error", function (error){
        me._retransmitter.reset ();
        me.emit ("error", error);
      })
      .on ("abort", function (){
        me._retransmitter.reset ();
        me.emit ("abort");
      })
      .on ("close", function (){
        me._retransmitter.reset ();
        me.emit ("close");
      })
      .on ("ready", function (stats, oack){
        //The reader doesn't make use of the rollover option, it's not safe
        //because there isn't an specification for default values
        me._windowEnd = me._pending = me._windowSize = stats.windowSize;
        me._blockSize = stats.blockSize;
        
        //Start the timer for the first time
        me._retransmitter.start (me._restransmitterStartFn);
        me._oack = oack;
        
        delete stats.rollover;
        me.emit ("stats", stats);
      })
      .on ("timeout", function (){
        me._retransmitter.reset ();
      })
      .on ("data", function (data){
        me._onData (data);
      });
  
  this._retransmitter = this._request.createRetransmitter ();
};

util.inherits (Reader, events.EventEmitter);

Reader.prototype.abort = function (){
  this._request.abort ();
};

Reader.prototype._blockToRetransmit = function (){
  if (!this._windowBlocks.length){
    //Resend ACK for the oack
    if (this._oack) return 0;
    //Rollover
    if (this._windowStart === 0 ||
        (this._windowStart === 1 && !this._firstWindow)) return 65535;
    //First empty window will never happen (oack case treated before)
    //This is mostly executed by classic tftp server implementations
    return this._windowStart - 1;
  }
  
  //Sort the blocks and find the last well-received one
  this._sortWindow ();
  //-1 if rollovered to 0
  var last = this._windowStart - 1;
  
  for (var i=0; i<this._windowBlocks.length; i++){
    if (last + 1 !== this._windowBlocks[i].block){
      return last === -1 || (this._mayRollover && last === 0) ? 65535 : last;
    }
    if (++last === 65535){
      //Is not possible to determine the next expected block: 0 or 1, so assume
      //that the last valid block is 65535 even if there are more valid blocks
      //already received
      return 65535;
    }
  }
  
  //The last block of the window is missing
  return last;
};

Reader.prototype._retransmit = function (){
  this._retransmitter.start (this._restransmitterStartFn);
};

Reader.prototype._sortWindow = function (){
  if (this._mayRollover){
    //Example: [1, 65535, 65534, 0] -> [65534, 65535, 0, 1]
    var preRoll = this._windowBlocks.filter (this._preFilterFn);
    var postRoll = this._windowBlocks.filter (this._postFilterFn);
    preRoll.sort (this._sortFn);
    postRoll.sort (this._sortFn);
    this._windowBlocks = preRoll.concat (postRoll);
  }else{
    this._windowBlocks.sort (this._sortFn);
  }
};

Reader.prototype._notifyWindow = function (block){
  var arr;
  
  //Emit data
  if (block){
    //Error recovery, slow case
    //Two loops must be executed because a rollovered window, eg: [65535, 0, 1]
    var index = null;
    arr = [];
    for (var i=0; i<this._windowBlocks.length; i++){
      //Search the index of the last valid block
      if (this._windowBlocks[i].block === block){
        index = i;
        break;
      }
    }
    if (index !== null){
      //Copy the valid blocks
      for (var i=0; i<=index; i++){
        arr.push (this._windowBlocks[i]);
      }
    }
  }else{
    //Fast case
    arr = this._windowBlocks;
  }
  
  var me = this;
  arr.forEach (function (message){
    //Ignore DATA packets with 0 length, they are received when the file can be
    //split up in blocks that perfectly fits a window
    if (message.data.length){
      me.emit ("data", message.data);
    }
  });
  
  if (this._lastReceived) return this._request.close ();
  
  this._pending = this._windowSize;
  this._windowBlocks = [];
  this._windowBlocksIndex = {};
  this._oack = false;
  this._firstWindow = false;
};

Reader.prototype._onData = function (message){//console.log("<< " + message.block)
  if (message.block === 0 && this._rolloverFix === 0){
    //The server has rollovered to 0
    this._rolloverFix = 1;
    if (this._windowStartRollovered) this._windowStart--;
    this._windowEnd--;
  }
  
  //Check the validity of the block only when the current window doesn't
  //rollover and the block is outside the valid range, it could be a duplicate
  //(sorcerer's apprendice syndrome)
  if (!this._mayRollover &&
      (message.block < this._windowStart || message.block > this._windowEnd)){
    return;
  }
  
  //Ignore duplicates
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
    //Cancel the current timer and set it again
    this._retransmitter.reset ();
    this._retransmitter.start (this._restransmitterStartFn);
  
    //Sort the blocks
    this._sortWindow ();
    
    //Update the window
    this._windowStart += this._windowSize;
    if (this._windowStart > 65535){
      this._windowStartRollovered = true;
      this._windowStart -= 65535 + this._rolloverFix;
    }
    this._windowEnd = this._windowStart + this._windowSize - 1;
    this._mayRollover = this._windowEnd > 65535;
    if (this._mayRollover){
      this._windowEnd -= 65535 + this._rolloverFix;
    }
    
    //ACK the current window
    this._request.sendAck (
        this._windowBlocks[this._windowBlocks.length - 1].block);
    this._notifyWindow ();
  }
};