"use strict";

var util = require ("util");
var stream = require ("stream");
var fs = require ("fs");
var errors = require ("../../protocol/errors");
var packets = require ("../../protocol/packets");
var Reader = require ("../../protocol/server/reader");

var GetStream = module.exports = function (currFiles, helper, message,
		globalOptions, putStream){
	stream.Readable.call (this);
	
	//RRQ
	if (!currFiles) return;
	
	this._aborted = false;
	this._reader = null;
	this._currFiles = currFiles;
	
	//Validate the request
	try{
		message = packets.wrq.deserialize (message);
	}catch (error){
		return helper.sendErrorAndClose (error);
	}
	
	//Check whether the file can be written
	if (this._currFiles.put[message.file]){
		return helper.sendErrorAndClose (errors.ECONPUT);
	}
	
	//Check whether the file can be written
	if (this._currFiles.get[message.file]){
		return helper.sendErrorAndClose (errors.ECURGET);
	}
	
	this._currFiles.put[message.file] = true;
	
	this.method = "PUT";
	this.file = message.file;
	
	//The put stream needs to call the get stream to pass the user extensions when
	//it's a WRQ
	putStream._gs = this;
	putStream._isWRQ = true;
	
	this._createReader (helper, message, globalOptions);
};

util.inherits (GetStream, stream.Readable);

GetStream.prototype._read = function (){
	//No-op
};

GetStream.prototype.abort = function (error){
	if (this._aborted) return;
	this._aborted = true;
	if (this._ps){
		this._ps._abort (error);
	}else{
		this._reader.abort (error);
	}
};

GetStream.prototype.close = function (){
	if (this._aborted) return;
	this._aborted = true;
	if (this._ps){
		this._ps._close ();
	}else{
		this._reader.close ();
	}
};

GetStream.prototype._createReader = function (helper, message, globalOptions){
	var me = this;
	this._reader = new Reader ({
		helper: helper,
		message: message,
		globalOptions: globalOptions
	});
	this._reader.onError = function (error){
		delete me._currFiles.put[me.file];
		me.emit ("close");
		me.emit ("error", error);
	};
	this._reader.onAbort = function (){
		delete me._currFiles.put[me.file];
		me.emit ("close");
		me.emit ("abort");
	};
	this._reader.onClose = function (){
		delete me._currFiles.put[me.file];
		me.emit ("close");
		me.push (null);
	};
	this._reader.onStats = function (stats){
		me.stats = stats;
		me.onReady ();
	};
	this._reader.onData = function (data){
		//The reader emits data chunks with the appropiate order. It guarantees
		//that the chunks are ready to be processed by the user
		//It decouples the pure implementation of the protocol and the Node.js
		//streaming part
		me.push (data);
	};
};