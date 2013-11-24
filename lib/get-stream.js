"use strict";

var util = require ("util");
var stream = require ("stream");
var crypto = require ("crypto");
var Reader = require ("./protocol/reader");
var TFTPClientError = require ("./error");

var GetStream = module.exports = function (remote, options){
	stream.Readable.call (this);
	
	if (options.shasum){
		var shasum = crypto.createHash ("sha1");
	}
	
	var downloaded = 0;
	
	var me = this;
	this._reader = new Reader (remote, options)
			.on ("error", function (error){
				me.emit ("error", error);
			})
			.on ("data", function (data){
				//The Reader class emits the data chunks with the appropiate order. It
				//guarantees that the chunks are ready to be processed by the user.
				//It decouples the pure implementation of the protocol and the Node.js
				//streaming part
				me.push (data);
				
				if (options.shasum){
					shasum.update (data);
				}
				
				//Emit progress if tzise is available
				var tsize = this.transferSize ();
				if (tsize === null) return;
				downloaded += data.length;
				me.emit ("progress", downloaded/tsize);
			})
			.on ("end", function (){
				if (options.shasum && options.shasum !== shasum.digest ("hex")){
					return me.emit ("error", new TFTPClientError ("Invalid shasum, the " +
							"file is corrupted"));
				}
				
				me.push (null);
			});
};

util.inherits (GetStream, stream.Readable);

GetStream.prototype._read = function (){
	//no-op
};

GetStream.prototype.abort = function (){
	console.log ("ABORT");
	this._reader.abort ();
};