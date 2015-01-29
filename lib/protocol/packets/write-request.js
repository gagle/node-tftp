"use strict";

var knownExtensions = require ("../known-extensions");
var errors = require ("../errors");

module.exports = function (op, filename, bytes, globalOptions, opOptions){
	var userExtensions;
	var str;
	var length = filename.length;
	var start = length + 9;
	bytes += start;
	
	if (opOptions && opOptions.userExtensions){
		//Custom extensions (the server should handle them)
		userExtensions = {};
		for (var p in opOptions.userExtensions){
			if (knownExtensions[p]) continue;
			str =  opOptions.userExtensions[p] + "";
			userExtensions[p] = str;
			bytes += p.length + str.length + 2;
		}
	}
	
	if (bytes > 512) throw errors.ERBIG;
	
	var buffer = new Buffer (bytes);
	buffer.writeUInt16BE (op, 0);
	buffer.write (filename, 2, "ascii");
	buffer.write ("octet", length + 3, "ascii");
	buffer[length + 2] = buffer[length + 8] = 0;
	
	if (!globalOptions) return buffer;
	
	var copy = function (key, value){
		buffer.write (key, offset, "ascii");
		offset += key.length;
		buffer[offset++] = 0;
		buffer.write (value, offset, "ascii");
		offset += value.length;
		buffer[offset++] = 0;
	};
	
	var offset = start;
	for (var p in globalOptions.extensionsString){
		copy (p, globalOptions.extensionsString[p]);
	};
	
	for (var p in userExtensions){
		copy (p, userExtensions[p]);
	}
	
	return buffer;
};