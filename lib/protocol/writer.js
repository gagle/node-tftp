"use strict";

var events = require ("events");
var util = require ("util");
var Request = require ("./request");
var opcode = require ("./opcode");

var hex = require ("hex");

var Writer = module.exports = function (remote, globalOptions, size){
  events.EventEmitter.call (this);
  
  this._sent = false;
  
  /*//5 -> 5
  this._size = 5;
  this._blockSize = 7;
  this.send (new Buffer ([1, 2, 3, 4, 5]));*/
  
  /*//7 -> 7,0
  this._size = 7;
  this._blockSize = 7;
  this.send (new Buffer ([1, 2, 3, 4, 5, 6, 7]));*/
  
  /*//5,5,5,2 -> 7,7,3
  this._size = 17;
  this._blockSize = 7;
  this.send (new Buffer ([1, 2, 3, 4, 5]));
  this.send (new Buffer ([6, 7, 8, 9, 10]));
  this.send (new Buffer ([11, 12, 13, 14, 15]));
  this.send (new Buffer ([16, 17]));*/
  
  /*//5,5,4 -> 7,7,0
  this._size = 14;
  this._blockSize = 7;
  this.send (new Buffer ([1, 2, 3, 4, 5]));
  this.send (new Buffer ([6, 7, 8, 9, 10]));
  this.send (new Buffer ([11, 12, 13, 14]));*/
  
  /*//10,10,10 -> 7,7,7,7,2
  this._size = 30;
  this._blockSize = 7;
  this.send (new Buffer ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  this.send (new Buffer ([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
  this.send (new Buffer ([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]));*/
  
  /*//20,20,10 -> 7,7,7,7,7,7,7,1
  this._size = 50;
  this._blockSize = 7;
  this.send (new Buffer ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
  this.send (new Buffer ([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40]));
  this.send (new Buffer ([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]));*/
  
  var me = this;
  this._request = new Request (opcode.WRQ, remote, globalOptions, size)
      .on ("error", function (error){
        me.emit ("error", error);
      })
      .on ("abort", function (){
        me.emit ("abort");
      })
      .on ("ack", function (ack){
        me._onAck (ack);
      })
      .on ("ready", function (){
        me.emit ("ready");
      })
      .on ("extensions", function (extensions){
        me._blockMaker = new BlockMaker (extensions.blockSize, size);
        me._window = new Window (extensions.blockSize, extensions.windowSize,
            size, extensions.rollover, this);
      });
};

util.inherits (Writer, events.EventEmitter);

var BlockMaker = function (blockSize, size){
  this._current = 0;
  this._blockSize = blockSize;
  this._size = size;
  this._block = null;
  this._buffer = null;
  this._p = 0;
  this._empty = false;
};

BlockMaker.prototype.feed = function (buffer){
  this._buffer = buffer;
};

BlockMaker.prototype.next = function (){
  if (this._end) return null;
  
  if (this._empty){
    this._empty = false;
    this._end = true;
    this._buffer = null;
    return new Buffer (0);
  }

  if (this._p === this._buffer.length){
    if (this._size === 0){
      //Empty file
      var b = this._buffer;
      this._buffer = null;
      return b;
    }
    
    this._p = 0;
    this._buffer = null;
    return null;
  }

  var slice;
  var block;
  
  if (this._block){
    //end goes from 1 to blockSize - 1
    var end = this._blockSize - this._block.length;
    slice = end === this._buffer.length
        ? this._buffer
        : this._buffer.slice (0, end);
    block = Buffer.concat ([this._block, slice],
        this._block.length + slice.length);
    this._block = null;
  }else{
    block = this._buffer.slice (this._p, this._p + this._blockSize);
  }
  
  var nextP = slice ? slice.length : block.length;
  this._current += nextP;
  
  //If the block has a smaller size than blockSize, it's the last block
  if (block.length < this._blockSize){
    if (this._current === this._size){
      //Last block of the file, return it instead of saving it
      this._end = true;
      this._buffer = null;
      return block;
    }
    
    //Last block of the buffer, save it for a later use
    this._block = block;
    this._p = 0;
    this._buffer = null;
    return null;
  }
  
  this._p += nextP;
  
  //The block has a length equal to blockSize
  if (this._current === this._size){
    //Last block of the file
    //An empty block must be sent
    this._empty = true;
  }
  
  return block;
};

var Window = function (blockSize, windowSize, size, rollover, request){
  this._blockSize = blockSize;
  this._windowSize = windowSize;
  this._size = size;
  this._rollover = rollover;
  this._request = request;
  this._block = 1;
  this._end = windowSize;
  this._pending = windowSize;
  this._eof = false;
};

Window.prototype.isEOF = function (){
  return this._eof;
};

Window.prototype.feed = function (block, cb){
  //Rollover
  if (this._block === 65536){
    this._block = this._rollover;
  }

  var me = this;
  this._request.sendBlock (this._block++, block, function (){
    me._eof = block.length < me._blockSize;
    
    if (!--me._pending || me._eof){
      //Wait for the ack
      me._cb = cb;
      me._pending = me._windowSize;
      me._end = me._block - 1;
    }else{
      cb ();
    }
  });
};

Window.prototype.end = function (){
  return this._end;
};

Window.prototype.resume = function (){
  var cb = this._cb;
  this._cb = null;
  cb ();
};

Writer.prototype.abort = function (){
  this._request.abort ();
};

Writer.prototype.send = function (buffer, cb){
  this._sent = true;
  
  //Create all the possible blocks from the given buffer
  this._blockMaker.feed (buffer);
  var me = this;
  
  var onProcessed = function (){
    if (me._window.isEOF ()){
      me._request
          .on ("close", function (){
            cb ();
          })
          .close ();
    }else{
      newBlock ();
    }
  };
  
  var newBlock = function (){
    //Feed the window till it is full
    //A null block signals that no more blocks can be obtained from the buffer
    var block = me._blockMaker.next ();
    if (!block) return cb ();
    me._window.feed (block, onProcessed);
  };
  
  newBlock ();
};

Writer.prototype._onAck = function (ack){//console.log("<< " + ack.block)
  if (!this._sent && ack.block === 0){
    //The server doesn't support extensions
    return this.emit ("ready");
  }
  
  if (ack.block === this._window.end ()){
    this._window.resume ();
  }
  //else
  //- Invalid ack, simply omit it in order to avoid duplicates
  //- Alternative server implementations (ack each block in the same window
  //	instead of ack only the last)
};