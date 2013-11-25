"use strict";

var fs = require ("fs");
var path = require ("path");
var GetStream = require ("./get-stream");
var PutStream = require ("./put-stream");
var TFTPClientError = require ("./error");

var sanitizeNumber = function (n){
	n = ~~n;
	return n < 1 ? 1 : n;
};

var Client = module.exports = function (options){
	if (!options.hostname){
		throw new TFTPClientError ("Missing hostname");
	}
	
	this._reSlash = /\/|\\/;
	this._options = {
		hostname: options.hostname,
		port: sanitizeNumber (options.port || 69),
		retries: sanitizeNumber (options.retries || 3)
	};
	
	//Extensions
	var windowSize = sanitizeNumber (options.windowSize || 64);
	if (windowSize > 65535) windowSize = 64;
	windowSize += "";
	
	var blockSize = sanitizeNumber (options.blockSize || 1468) + "";
	if (blockSize < 8 || blockSize > 65464) blockSize = 1468;
	blockSize += "";
	
	var timeout = sanitizeNumber (options.timeout || 3000) + "";
	
	this._options.extensions = {
		//Maximum block size before IP packet fragmentation on Ethernet networks
		blksize: blockSize,
		timeout: timeout,
		windowsize: windowSize,
		//tsize is 0 if the packet is RRQ, and the file size if the packet is WRQ
		tsize: null,
		rollover: "1"
	};
	
	this._options.extensionsLength = 48 + blockSize.length + timeout.length +
			windowSize.length;
};

Client.prototype._checkRemote = function (remote){
	//Check for slashes or backslashes
	if (this._reSlash.test (remote)){
		throw new TFTPClientError ("The remote file cannot contain slashes or " +
				"backslashes");
	}
	
	//Multibytes characters are not allowed
	if (Buffer.byteLength (remote) > remote.length){
		throw new TFTPClientError ("The string cannot contain multibyte " +
				"characters (code > 255): " + remote);
	}
};

Client.prototype.createGetStream = function (remote, options){
	this._checkRemote (remote);
	return new GetStream (remote, this._options, options);
};

Client.prototype.createPutStream = function (remote){
	this._checkRemote (remote);
	return new PutStream (remote, this._options);
};

Client.prototype.get = function (remote, local, options, cb){
	this._checkRemote (remote);
	
	var argsLength = arguments.length;
	if (argsLength === 2){
		cb = local;
		local = remote;
	}else if (argsLength === 3){
		if (typeof local === "object"){
			cb = options;
			options = local;
			local = remote;
		}else if (typeof local === "string"){
			cb = options;
			options = {};
		}
	}
	
	var unlinkLocal = function (error){
		//Remove the file on error
		//Ignore unlink error. If the file was created, it's most likely to be
		//unlinked without errors. If the file fails at creation it will also fail
		//here (write permission) and the user will be notified with the EPERM error
		//of the open() function.
		fs.unlink (local, function (){
			cb (error);
		});
	};
	
	var get = new GetStream (remote, this._options, options);
	get
			.on ("error", unlinkLocal)
			.pipe (fs.createWriteStream (local))
			.on ("error", function (error){
				//Abort the read
				get.abort ();
				unlinkLocal (error);
			})
			.on ("finish", cb);
};

Client.prototype.put = function (local, remote, cb){
	this._checkRemote (remote);
	
	if (arguments.length === 2){
		cb = remote;
		remote = path.basename (local);
	}

	console.log ("PUT");
	console.log ("local: " + local);
	console.log ("remote: " + remote);

	//When the callback is used the file is still streamed
	
	
};