"use strict";

var util = require ("util");
var stream = require ("stream");
var fs = require ("fs");
var path = require ("path");
var errors = require ("../../protocol/errors");
var packets = require ("../../protocol/packets");
//var Writer = require ("./protocol/writer");

var PutStream = module.exports = function (socket, request, globalOptions, cb){
	stream.Writable.call (this);
	
	//WRQ
	this._noop = !socket;
	if (this._noop) return;
	
	//Validate the request
	try{
		var rrq = packets.rrq.deserialize (request);
	}catch (error){
		return this._sendErrorAndClose (socket, error);
	}
	
	var me = this;
	fs.stat (globalOptions.root + "/" + rrq.filename, function (error, stats){
		if (error){
			var code;
			if (error.code === "ENOENT"){
				code = errors.ENOENT;
			}else if (error.code === "EACCESS"){
				code = errors.EACCESS;
			}else{
				code = errors.EIO;
			}
			return me._sendErrorAndClose (socket, code);
		}
		
		if (stats.isDirectory ()){
			return me._sendErrorAndClose (socket, errors.EISDIR);
		}
		
		console.log(rrq)
		
		//cb ("/" + path.normalize (rrq.filename));
	});
	
	
	/*this._remote = remote;
	this._globalOptions = globalOptions;
	this._size = putOptions.size;
	this._aborted = false;
	this._writer = null;
	
	var me = this;
	
	if (putOptions.size === 0){
		//Empty file
		
		//The _write function is never called so the put request is never done
		//Also, the finish event that the user attachs is automatically called but
		//before doing so, the put request must be sent
		//Note that the request is initiated when the first chunk is received
		//because we need to ensure that the connection with the server is
		//established successfully and the server is ready to receive data, in other
		//words, we cannot send data when the request is still not ready
		
		var end = this.end;
		this.end = function (){
			this._createWriter (function (){
				//Send an empty buffer
				me._writer.send (new Buffer ([]), function (){
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
	});*/
};

util.inherits (PutStream, stream.Writable);

PutStream.prototype._createWriter = function (cb){
	var me = this;
	this._writer = new Writer (this._remote, this._globalOptions, this._size);
	this._writer.onError = function (error){
		me.emit ("error", error);
	};
	this._writer.onAbort = function (){
		me.emit ("abort");
	};
	this._writer.onStats = function (stats){
		cb ();
		me.emit ("stats", stats);
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

PutStream.prototype.abort = function (){
	if (this._noop) return;
	//if (this._writer) this._writer.abort ();
};

PutStream.prototype._sendErrorAndClose = function (socket, code){
	var buffer = packets.error.serialize (code);
	socket.socket.send (buffer, 0, buffer.length, socket.port, socket.address,
			function (){
		socket.socket.close ();
	});
};