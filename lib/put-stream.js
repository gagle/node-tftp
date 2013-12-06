"use strict";

var util = require ("util");
var stream = require ("stream");
var Writer = require ("./protocol/writer");

var PutStream = module.exports = function (remote, globalOptions){
	stream.Writable.call (this);
	
	this._aborted = false;
	
	var me = this;
	/*this._writer = new Writer (remote, globalOptions)
			.on ("error", function (error){
				me.emit ("error", error);
			});*/
};

util.inherits (PutStream, stream.Writable);

PutStream.prototype._write = function (chunk, encoding, cb){
	console.log(chunk+"")
	cb()
};

PutStream.prototype.abort = function (){
	if (this._aborted) return;
	this._aborted = true;
	this._writer.abort ();
};