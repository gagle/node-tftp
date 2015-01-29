"use strict";

var util = require ("util");
var stream = require ("stream");
var Writer = require ("../../protocol/client/writer");

var PutStream = module.exports = function (remote, globalOptions, putOptions){
	if (putOptions.size === undefined || putOptions.size === null){
		throw new Error ("Missing file size");
	}
	
	stream.Writable.call (this);
	
	this._remote = remote;
	this._globalOptions = globalOptions;
	this._putOptions = putOptions;
	this._finished = false;
	this._writer = null;
	
	var me = this;
	
	if (putOptions.size === 0){
		//Empty file
		
		//The _write() function is never called so the put request is never done
		//Also, the finish listener that the user attachs is automatically called
		//but before doing so, the put request must be sent
		//Note that the request is initiated when the first chunk is received
		//because we need to ensure that the connection with the server has been
		//established successfully and the server is ready to receive data, in other
		//words, we cannot send data when the request is still not ready.
		//Another approach is to establish a connection in the next tick when the
		//constructor is called and retain the first chunk when it is received with
		//the _write() function previosouly. Then, when onStats() is called, send
		//the buffered chunk, but anyway when the file size is 0 it must be handled
		//with the next piece of code, so the implemented approach is the best.
		
		var end = this.end;
		this.end = function (){
			this._createWriter (function (){
				//Send an empty buffer
				me._writer.send (new Buffer (0), function (){
					end.apply (me, arguments);
				});
			});
		};
	}
	
	this.on ("unpipe", function (){
		//After a finish event the readable stream unpipes the writable stream
		if (this._finished) return;
		
		//The user has called manually to unpipe()
		//Abort file transfer
		if (this._writer) this._writer.abort ();
	});
	
	this.on ("finish", function (){
		//The finish event is emitted before unpipe
		//This handler is the first that is called when the finish event is emitted
		this._finished = true;
	});
};

util.inherits (PutStream, stream.Writable);

PutStream.prototype._createWriter = function (cb){
	var me = this;
	this._writer = new Writer ({
		file: this._remote,
		globalOptions: this._globalOptions,
		opOptions: this._putOptions
	});
	this._writer.onError = function (error){
		me.emit ("close");
		me.emit ("error", error);
	};
	this._writer.onAbort = function (){
		me.emit ("close");
		me.emit ("abort");
	};
	this._writer.onClose = function (error){
		me.emit ("close");
	};
	this._writer.onStats = function (stats){
		me.emit ("stats", stats);
		cb ();
	};
};

PutStream.prototype._write = function (chunk, encoding, cb){
	if (this._writer){
		this._writer.send (chunk, cb);
	}else{
		var me = this;
		this._createWriter (function (){
			me._writer.send (chunk, cb);
		});
	}
};

PutStream.prototype.abort = function (error){
	if (this._writer) this._writer.abort (error);
};

PutStream.prototype.close = function (){
	if (this._writer) this._writer.close ();
};