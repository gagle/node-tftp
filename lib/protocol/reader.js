"use strict";

var dgram = require ("dgram");
var events = require ("events");
var util = require ("util");
var packets = require ("./packets");
var opcode = require ("./opcode");
var errors = require ("./errors");

//States
var RRQ_SENT = 0;
var ACK_SENT = 1;

var Reader = module.exports = function (remote, options){
	events.EventEmitter.call (this);
	
	this._destination = null;
	this._remote = remote;
	this._options = options;
	this._state = null;
	this._blockSize = null;
	this._timeout = +this._options.extensions.timeout;
	this._transferSize = null;
	this._windowSize = +this._options.extensions.windowsize;
	this._extensionsRetransmitted = false;
	this._windowStart = 1;
	this._windowBlocksIndex = {};
	this._windowBlocks = [];
	this._pending = this._windowSize;
	this._comparator = function (a, b){
		return a.block - b.block;
	};
	this._lastReceived = false;
	this._timer = null;
	this._retries = options.retries;
	this._closed = false;
	this._closing = false;
	this._aborted = false;
	var me = this;
	process.nextTick (function (){
		me._open ();
	});
};

util.inherits (Reader, events.EventEmitter);

Reader.prototype.transferSize = function (){
	return this._transferSize;
};

Reader.prototype._open = function (){
	//Create the socket
	var me = this;
	this._socket = dgram.createSocket ("udp4", function (message, rinfo){
		if (!me._destination){
			//Save the destination
			me._destination = {
				address: rinfo.address,
				port: rinfo.port
			};
		}else if (me._destination.address !== rinfo.address ||
				me._destination.port !== rinfo.port){
			//A message is received from a different source
			return me._sendError (0, "Invalid source socket");
		}
	
		me._onMessage (message, rinfo);
	})
	.on ("error", function (error){
		me._closed = true;
		clearTimeout (me._timer);
		me.emit (error);
	})
	.on ("close", function (){
		me._closed = true;
		clearTimeout (me._timer);
		if (me._aborted) return me.emit ("abort");
		if (me._error){
			me.emit ("error", me._error);
		}else{
			me.emit ("end");
		}
	});
	
	//Create and send the RRQ message
	//blksize, timeout and tsize are sent with the RRQ so there are 2 possible
	//responses from the server:
	//- If the server doesn't support extensions it begins the file
	//  transmission so all the subsequent messages are DATA packets
	//- If the server supports extensions, it sends a OACK
	this._sendMessage (packets.rrq.serialize (this._remote, this._options),
			function (){
		me._state = RRQ_SENT;
	});
};

Reader.prototype._resetTimeout = function (){
	clearTimeout (this._timer);
	this._retries = this._options.retries;
};

Reader.prototype._onData = function (message){
	if (this._state === RRQ_SENT){
		//The server doesn't support option extensions
		//Set default options
		this._blockSize = 512;
		this._windowSize = 1;
	}
	
	//Validate whether the block number is inside the current window
	var windowEnd = this._windowStart + this._windowSize - 1;
	var blocksOutside = windowEnd - 65536;
	if (windowEnd > 65536){
		//A rollover may occur inside this window
		windowEnd = this._rollover === 0 ? blocksOutside - 1 : blocksOutside;
	}
	if (message.block < this._windowStart || message.block > windowEnd){
		return this._sendErrorAndClose (0, "Invalid block number, out of range");
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
		this._resetTimeout ();
		
		//Send ACK for the latest block
		this._windowStart += this._windowSize;
		
		//Sort the blocks
		this._windowBlocks.sort (this._comparator);
		
		//Note: When a DATA packet is lost, the last ACK message is sent when the
		//timeout is reached. This ACK message acknowledges the last DATA packet of
		//the previous window, that is, the whole current window is asked again
		var me = this;
		this._sendAck (this._windowBlocks[this._windowBlocks.length - 1].block,
				function (){
			me._pending = me._windowSize;
			
			//Emit data
			me._windowBlocks.forEach (function (message){
				//Ignore DATA packets with 0 length, they are received when the file
				//has the same size of a window
				if (message.data.length){
					me.emit ("data", message.data);
				}
			});
			
			if (me._lastReceived) me._close ();
			
			me._windowBlocks = [];
			me._windowBlocksIndex = {};
		});
	}
};

Reader.prototype._onOack = function (message){
	this._resetTimeout ();
	
	//OACK can be only received when RRQ is sent
	if (this._state !== RRQ_SENT) return this._sendErrorAndClose (4);
	
	//Fail if the OACK message contains unknown extensions
	for (var key in message){
		if (this._options.extensions[key] === undefined){
			return this._sendErrorAndClose (8);
		}
	}
	
	if (message.blksize){
		var blockSize = ~~message.blksize;
		if (blockSize >= 8 && blockSize <= +this._options.extensions.blksize){
			this._blockSize = blockSize;
		}else{
			return this._sendErrorAndClose (8);
		}
	}else{
		this._blockSize = 512;
	}
	
	if (message.timeout){
		var timeout = ~~message.timeout;
		if (timeout > 0 && timeout <= this._timeout){
			this._timeout = timeout;
		}else{
			return this._sendErrorAndClose (8);
		}
	}
	
	if (message.tsize){
		var transferSize = ~~message.tsize;
		if (transferSize >= 0){
			this._transferSize = transferSize;
		}else{
			return this._sendErrorAndClose (8);
		}
	}
	
	if (message.windowsize){
		var windowSize = ~~message.windowsize;
		if (windowSize > 0 && windowSize <= this._windowSize){
			this._windowSize = windowSize;
		}else{
			return this._sendErrorAndClose (8);
		}
	}else{
		//Classic lock-step is the same as using a window size of 1
		this._windowSize = 1;
	}
	
	//If the server denies the rollover option, read requests by default supports
	//a rollover to 1. This value can be assumed because if the server doesn't
	//parse the rollover, we can assume that the server will not send files bigger
	//than 2^16*blockSize. The default value will be used when the server doesn't
	//parse the rollover option but rollovers automatically, a very rare case,
	//mostly due to a bad server implementation. Anyway, the rollover value is
	//only used to validate if a DATA packet's block number is inside the current
	//window. Only bad server implementations send invalid DATA packets.
	if (message.rollover){
		var rollover = ~~message.rollover;
		if (rollover === 0 || rollover === 1){
			this._rollover = rollover;
		}else{
			return this._sendErrorAndClose (8);
		}
	}
	
	//Acknowledge OACK
	this._sendAck (0);
};

Reader.prototype._onError = function (message){
	this._resetTimeout ();
	
	if (this._state === RRQ_SENT && message.code === 8){
		if (this._extensionsRetransmitted){
			//The server has returned an ERROR with code 8 after a RRQ without
			//extensions. Code 8 is only used when RRQ and WRQ messages contain
			//extensions
			return this._sendErrorAndClose (4);
		}
		
		//If the error code is 8, the server doesn't like one or more option
		//extensions. Retransmit without extensions.
		var me = this;
		this._sendMessage (packets.rrq.serialize (remote), function (){
			me._extensionsRetransmitted = true;
		});
	}else{
		this._close (new Error ("(Server) " + message.message));
	}
};

Reader.prototype._onMessage = function (buffer){
	//RRQ or ACK packet sent, valid packets: OACK, DATA, ERROR
	var op = buffer.readUInt16BE (0);
	
	if (op === opcode.RRQ || op === opcode.WRQ || op === opcode.ACK){
		this._sendErrorAndClose (4);
	}else if (op === opcode.DATA){
		this._onData (packets.data.deserialize (buffer));
	}else if (op === opcode.OACK){
		this._onOack (packets.oack.deserialize (buffer));
	}else if (op === opcode.ERROR){
		this._onError (packets.error.deserialize (buffer));
	}else{
		//Unknown opcode
		this._sendErrorAndClose (4);
	}
};

Reader.prototype._sendAck = function (block, cb){
	var me = this;
	this._sendMessage (packets.ack.serialize (block), function (){
		me._state = ACK_SENT;
		if (cb) cb ();
	});
};

Reader.prototype._sendError = function (code, message){
	this._send (packets.error.serialize (code, message));
};

Reader.prototype._sendErrorAndClose = function (code, message){
	this._resetTimeout ();
	var me = this;
	this._send (packets.error.serialize (code, message), function (){
		me._close (new Error (errors[code] || message));
	});
};

Reader.prototype._sendMalformedPacketError = function (){
	this._send (packets.error.serialize (0, "Malformed TFTP message"));
};

Reader.prototype._sendMessage = function (buffer, cb){
	//Apply timeouts and retransmissions
	var me = this;
	this._timer = setTimeout (function (){
		if (!me._retries){
			me._close (new Error ("Timed out"));
		}else{
			me._retries--;
			me._sendMessage (buffer, cb);
		}
	}, this._timeout);
	
	this._send (buffer, function (){
		if (cb) cb ();
	});
};

Reader.prototype._send = function (buffer, cb){
	this._socket.send (buffer, 0, buffer.length,
			(this._destination && this._destination.port) || this._options.port,
			this._options.hostname, function (error){
		//The error is automatically emitted, it can be ignored
		if (error) return;
		if (cb) cb ();
	});
};

Reader.prototype._close = function (error){
	if (this._closed || this._closing) return;
	//If multiples closes occur inside the same tick (because abort() is called),
	//the socket throws the error "Not running" because the socket is already
	//closed, this is why there's a closing flag. There are 2 possible cases:
	//- (1) abort close, (2) socket close
	//- (1) socket close, (2) abort close
	//If it's the first case, the second close() is ignored because the reader was
	//aborted just before
	//If it's the second case, the second abort() it's useless because the reader
	//is already closed
	this._closing = true;
	//Store the error after the flag is set to true, otherwise the error could be
	//used by another close()
	if (error) this._error = error;
	this._socket.close ();
};

Reader.prototype.abort = function (){
	if (this._closed || this._closing) return;
	this._aborted = true;
	this._close ();
};