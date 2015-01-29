"use strict";

var util = require ("util");
var stream = require ("stream");
var fs = require ("fs");
var path = require ("path");
var errors = require ("../../protocol/errors");
var packets = require ("../../protocol/packets");
var Writer = require ("../../protocol/server/writer");

var PutStream = module.exports = function (currFiles, helper, message,
		globalOptions, getStream){
	//WRQ
	if (!helper) return;
	
	stream.Writable.call (this);
	
	this._isWRQ = false;
	this._finished = false;
	this._writer = null;
	this._size = null;
	this._continue = false;
	this._closed = false;
	this._sizeSet = false;
	this._currFiles = currFiles;
	
	//Validate the request
	try{
		message = packets.rrq.deserialize (message);
	}catch (error){
		return helper.sendErrorAndClose (error);
	}
	
	//Check whether the file can be read
	if (this._currFiles.put[message.file]){
		return helper.sendErrorAndClose (errors.ECURPUT);
	}
	
	this._currFiles.get[message.file] = true;
	
	getStream.method = "GET";
	getStream.file = message.file;
	
	var me = this;
	this.on ("unpipe", function (){
		//After a finish event the readable stream unpipes the writable stream
		if (me._finished) return;
		
		//The user has called manually to unpipe()
		//Abort file transfer
		if (me._writer) me._writer.abort ();
	});
	
	this.on ("finish", function (){
		//The finish event is emitted before unpipe
		//This handler is the first that is called when the finish event is
		//emitted
		me._finished = true;
	});
	
	//Link the streams each other. The put stream is only used to send data to the
	//client but the "connection" and all its related events occur in the get
	//stream
	this._gs = getStream;
	getStream._ps = this;
	
	this._createWriter (helper, message, globalOptions);
};

util.inherits (PutStream, stream.Writable);

PutStream.prototype._abort = function (error){
	this._writer.abort (error);
};

PutStream.prototype._close = function (){
	this._writer.close ();
};

PutStream.prototype._createWriter = function (helper, message, globalOptions){
	var me = this;
	this._writer = new Writer ({
		helper: helper,
		message: message,
		globalOptions: globalOptions
	});
	//The events are emitted using the get stream
	this._writer.onError = function (error){
		delete me._currFiles.get[me._gs.file];
		me._gs.emit ("close");
		me._gs.emit ("error", error);
	};
	this._writer.onAbort = function (){
		delete me._currFiles.get[me._gs.file];
		me._gs.emit ("close");
		me._gs.emit ("abort");
	};
	this._writer.onClose = function (){
		delete me._currFiles.get[me._gs.file];
		me._closed = true;
		me._gs.emit ("close");
	};
	this._writer.onStats = function (stats){
		me._gs.stats = stats;
		me.onReady ();
	};
	this._writer.onContinue = function (){
		me._continue = true;
	};
};

PutStream.prototype._write = function (chunk, encoding, cb){
	if (this._continue){
		this._writer.send (chunk, cb);
	}else{
		//Wait until the writer is ready to send data
		var me = this;
		this._writer.onContinue = function (){
			me._continue = true;
			me._writer.send (chunk, cb);
		};
	}
};

PutStream.prototype.setSize = function (size){
	if (this._isWRQ) throw new Error ("Only GET requests can set the size");
	//Sanity check
	if (this._gs._aborted) return;
	if (this._sizeSet) throw new Error ("The size was previously set");
	
	this._sizeSet = true;
	
	if (size === 0){
		//Empty file
		//The _write() function is never called so the get request is never
		//answered
		var end = this.end;
		var me = this;
		this.end = function (){
			if (me._continue){
				//Send an empty buffer
				me._writer.send (new Buffer (0), function (){
					end.call (me);
				});
			}else{
				//Wait until the writer is ready to end
				this._writer.onContinue = function (){
					//Send an empty buffer
					me._writer.send (new Buffer (0), function (){
						end.call (me);
					});
				};
			}
		};
	}
	
	//The request was "paused" when the request listener was emitted. The call to
	//setSize() resumes it in the case of GET requests
	this._writer.continueRequest (size);
};

PutStream.prototype.setUserExtensions = function (userExtensions){
	if (this._isWRQ){
		this._gs._reader._responseUserExtensions = userExtensions;
	}else{
		this._writer._responseUserExtensions = userExtensions;
	}
};