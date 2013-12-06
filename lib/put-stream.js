"use strict";

var util = require ("util");
var stream = require ("stream");
var Writer = require ("./protocol/writer");

var PutStream = module.exports = function (remote, globalOptions, putOptions){
	if (putOptions.size === undefined || putOptions.size === null){
		throw new Error ("Missing file size");
	}

	stream.Writable.call (this);
	
	this._finished = false;
	this._aborted = false;
	this._writer = null;
	
	this.on ("unpipe", function (){
		//After a finish event the readable stream unpipes the writable stream
		if (this._finished) return;
		
		//Abort file transfer
		
	});
};

util.inherits (PutStream, stream.Writable);

PutStream.prototype._write = function (chunk, encoding, cb){
	if (this._writer){
		console.log(chunk+"")
	}else{
		/*this._writer = new Writer (remote, globalOptions, putOptions)
				.on ("error", function (error){
					me.emit ("error", error);
				})
				.on ("ready", function (){
					console.log(chunk+"")
				});*/
	}
	cb()
};

PutStream.prototype.abort = function (){
	if (this._aborted) return;
	this._aborted = true;
	this._writer.abort ();
};