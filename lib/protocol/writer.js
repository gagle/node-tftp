"use strict";

var Writer = module.exports = function (Super, args){
	Super.call (this, args);
	
	this._blockMaker = null;
	this._window = null;
	this._size = args.opOptions ? args.opOptions.size : null;
};

Writer.prototype._setSize = function (size){
	this._size = size;
	if (this._blockMaker) this._blockMaker._size = size;
};

Writer.prototype.send = function (buffer, cb){
	//Slice the given buffer in blocks of a fixed size
	this._blockMaker.feed (buffer);
	var me = this;
	
	var next = function (){
		if (me._window.isEOF ()){
			me._onClose = function (){
				me.onClose ();
				cb ();
			};
			me._close ();
		}else{
			newBlock ();
		}
	};
	
	var newBlock = function (){
		//Feed the window till it is full
		//A null block signals that no more blocks can be obtained from the buffer
		var block = me._blockMaker.next ();
		if (!block) return cb ();
		me._window.feed (block, next);
	};
	
	newBlock ();
};

Writer.prototype._onClose = function (){
	if (this._window) this._window._writerTimer.reset ();
	this.onClose ();
};

Writer.prototype._onAbort = function (){
	if (this._window) this._window._writerTimer.reset ();
	this.onAbort ();
};

Writer.prototype._onError = function (error){
	if (this._window) this._window._writerTimer.reset ();
	this.onError (error);
};

Writer.prototype._onReady = function (stats, rollover){
	this._blockMaker = new BlockMaker (stats.blockSize, this._size);
	this._window = new Window (stats.blockSize, stats.windowSize, rollover,
			this);
	this.onStats (stats);
};

Writer.prototype._onAck = function (ack){
	this._window.resume (ack.block);
};

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
	
	//If the block has a smaller size than blockSize, it's the last block or the
	//buffer is smaller than a block
	if (block.length < this._blockSize){
		if (this._current === this._size){
			//Last block of the file, return it instead of saving it
			this._end = true;
			this._buffer = null;
			return block;
		}
		
		//Save the block for a later use
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

var Window = function (blockSize, windowSize, rollover, request){
	this._blockSize = blockSize;
	this._windowSize = windowSize;
	this._rollover = rollover;
	this._rolloverFix = rollover === 0 ? 1 : 0;
	this._block = 0;
	this._start = 1;
	this._end = windowSize;
	this._pending = windowSize;
	this._eof = false;
	this._mayRollover = false;
	this._blocks = [];
	
	this._sendFn = function (block){
		request._sendBlock (block.block, block.data);
	};
	var me = this;
	this._writerTimer = request._createRetransmitter ();
	this._restransmitterSendFn = function (){
		me._blocks.forEach (me._sendFn);
	};
};

Window.prototype.isEOF = function (){
	return this._eof;
};

Window.prototype.feed = function (block, cb){
	//Rollover
	if (++this._block === 65536){
		this._block = this._rollover;
	}
	
	this._blocks.push ({
		block: this._block,
		data: block
	});
	
	this._eof = block.length < this._blockSize;
	if (this._eof) this._end = this._block;
	
	if (!--this._pending || this._eof){
		//Wait for the ack
		this._cb = cb;
		
		//Start the timer
		this._writerTimer.start (this._restransmitterSendFn);
		
		//Send the window
		this._blocks.forEach (this._sendFn);
	}else{
		cb ();
	}
};

Window.prototype.resume = function (block){
	//Ignore invalid acks (duplicates included) only when the window doesn't
	//rollover
	if (!this._mayRollover &&
			(block < this._start - 1 || block > this._end)) return;
	
	this._writerTimer.reset ();
	
	if (block !== this._end){
		//Not all the blocks has been received in the server
		if (block === this._start - 1){
			//The whole window must be send again
			this._writerTimer.start (this._restransmitterSendFn);
			this._blocks.forEach (this._sendFn);
		}else{
			//Remove the blocks already received and shift the window
			while (this._blocks[0].block !== block){
				this._blocks.shift ();
			}
			this._blocks.shift ();
		}
	}else{
		this._blocks = [];
	}
	
	//Update the window
	this._start = this._block + 1;
	if (this._start === 65536){
		this._start = this._rollover;
	}else{
		this._mayRollover = true;
	}
	this._end = this._block + this._windowSize;
	if (this._end > 65535){
		this._end -= 65535 + this._rolloverFix;
	}else{
		this._mayRollover = false;
	}
	
	this._pending = this._windowSize;
	var cb = this._cb;
	this._cb = null;
	cb ();
};