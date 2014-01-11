"use strict";

var fs = require ("fs");
var path = require ("path");
var GetStream = require ("./streams/client/get-stream");
var PutStream = require ("./streams/client/put-stream");
var normalizeFilename = require ("./normalize-filename");
var createOptions = require ("./create-options");

var Client = module.exports = function (options){
	this._options = createOptions (options);
};

Client.prototype.createGetStream = function (remote, options){
	remote = normalizeFilename (remote);
	return new GetStream (remote, this._options, options);
};

Client.prototype.createPutStream = function (remote, options){
	remote = normalizeFilename (remote);
	return new PutStream (remote, this._options, options);
};

Client.prototype.get = function (remote, local, options, cb){
	remote = normalizeFilename (remote);
	
	var argsLength = arguments.length;
	if (argsLength === 2){
		cb = local;
		local = path.basename (remote);
	}else if (argsLength === 3){
		if (typeof local === "object"){
			cb = options;
			options = local;
			local = path.basename (remote);
		}else if (typeof local === "string"){
			cb = options;
			options = {};
		}
	}
	
	var me = this;
	
	//Check if local is a dir to prevent from starting a new request
	fs.stat (local, function (error, stats){
		if (error){
			if (error.code !== "ENOENT") return cb (error);
		}else if (stats.isDirectory ()){
			return cb (new Error ("The local file is a directory"));
		}
		
		var wsError;
		
		var gs = new GetStream (remote, me._options, options)
				.on ("error", function (error){
					ws.on ("close", function (){
						fs.unlink (local, function (){
							cb (error);
						});
					});
					ws.destroy ();
				})
				.on ("abort", function (){
					fs.unlink (local, function (){
						cb (wsError);
					});
				});
				
		var ws = fs.createWriteStream (local)
				.on ("error", function (error){
					wsError = error;
					gs.abort ();
				})
				.on ("finish", function (){
					cb ();
				});
		
		gs.pipe (ws);
	});
};

Client.prototype.put = function (local, remote, options, cb){
	if (arguments.length === 2){
		cb = remote;
		remote = path.basename (local);
	}
	
	var argsLength = arguments.length;
	if (argsLength === 2){
		cb = remote;
		remote = path.basename (local);
		options = {};
	}else if (argsLength === 3){
		if (typeof remote === "object"){
			cb = options;
			options = remote;
			remote = path.basename (local);
		}else if (typeof remote === "string"){
			cb = options;
			options = {};
		}
	}
	
	remote = normalizeFilename (remote);

	var me = this;
	
	//Check if local is a dir or doesn't exist to prevent from starting a new
	//request
	fs.stat (local, function (error, stats){
		if (error) return cb (error);
		if (stats.isDirectory ()){
			return cb (new Error ("The local file is a directory"));
		}
		
		var rsError;
		
		var rs = fs.createReadStream (local)
				.on ("error", function (error){
					rsError = error;
					ps.abort ();
				});
		
		options = {
			userExtensions: options.userExtensions,
			size: stats.size
		};
		var ps = new PutStream (remote, me._options, options)
				.on ("error", function (error){
					rs.on ("close", function (){
						cb (error);
					});
					rs.destroy ();
				})
				.on ("abort", function (){
					cb (rsError);
				})
				.on ("finish", function (){
					cb ();
				});
		
		rs.pipe (ps);
	});
};