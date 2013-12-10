"use strict";

var events = require ("events");
var util = require ("util");
var Request = require ("./request");
var opcode = require ("./opcode");

var hex = require ("hex");

var Writer = module.exports = function (remote, globalOptions, putOptions){
  events.EventEmitter.call (this);
  
  this._size = putOptions.size;
  this._closed = false;
  this._closing = false;
  this._aborted = false;
  this._windowSize = null;
  this._blockSize = null;
  this._sent = false;
  
  this._blockMaker = new BlockMaker (this);
  this._window = new Window ();
  
  var p = function (){ console.log ("end") }
  
  //5 -> 5
  this._size = 5;
  this._blockSize = 7;
  this.send (new Buffer ([1, 2, 3, 4, 5]), p);
  
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
  /*this._request = new Request (opcode.WRQ, remote, globalOptions,
      putOptions.size)
      .on ("error", function (error){
        me.emit ("error", error);
      })
      .on ("abort", function (){
        me.emit ("abort");
      })
      .on ("close", function (){
        me._latestCb ();
      })
      .on ("ack", function (ack){
        me._onAck (ack);
      })
      .on ("ready", function (){
        me.emit ("ready");
      })
      .on ("extensions", function (extensions){
        me._windowSize = extensions.windowSize;
        me._blockSize = extensions.blockSize;
      });*/
};

util.inherits (Writer, events.EventEmitter);

var BlockMaker = function (writer){
  this._current = 0;
  this._writer = writer;
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
    this._p = 0;
    this._buffer = null;
    return null;
  }

  var slice;
  var block;
  
  if (this._block){
    //end goes from 1 to blockSize - 1
    var end = this._writer._blockSize - this._block.length;
    slice = end === this._buffer.length
        ? this._buffer
        : this._buffer.slice (0, end);
    block = Buffer.concat ([this._block, slice],
        this._block.length + slice.length);
    this._block = null;
  }else{
    block = this._buffer.slice (this._p, this._p + this._writer._blockSize);
  }
  
  var nextP = slice ? slice.length : block.length;
  this._current += nextP;
  
  //If the block has a smaller size than blockSize, it's the last block
  if (block.length < this._writer._blockSize){
    if (this._current === this._writer._size){
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
  if (this._current === this._writer._size){
    //Last block of the file
    //An empty block must be sent
    this._empty = true;
  }
  
  return block;
};

var Window = function (writer){
  this._writer = writer;
};

Window.prototype.feed = function (block, cb){
  //Save the callback for a later use, it is necessary when the window is full
  //and we must wait for the ack
  this._cb = cb;
  
  console.log (block)
  
  cb ()
};

Window.prototype.resume = function (){
  
};

Writer.prototype.abort = function (){
  this._request.abort ();
};

Writer.prototype.send = function (buffer, cb){
  this._sent = true;
  
  //Create all the possible blocks from the given buffer
  this._blockMaker.feed (buffer);
  var me = this;
  
  (function newBlock (){
    //Feed the window till it is full
    //A null block signals that no more blocks can be obtained from the buffer
    var block = me._blockMaker.next ();
    if (!block) return cb ();
    me._window.feed (block, newBlock);
  })();
};

Writer.prototype._onAck = function (ack){
  console.log(ack)
  
  if (!this._sent && ack.block === 0){
    //The server doesn't support extensions
    return this.emit ("ready");
  }
  
  //Wait for the ack of the last block sent
  if (ack.block === this._block - 1){
    /*if (this._current === this._size){
      //Prevent memory leaks
      this._latestBuffer = null;
      this._request.close ();
    }else{
      //Continue with the buffer slicing
      this._pending = this._windowSize;
      this.send (this._latestBuffer, this._latestCb);
    }*/
    
    
  }else{
    console.log("out")
  }
};