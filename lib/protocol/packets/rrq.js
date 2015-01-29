"use strict";

var opcodes = require ("../opcodes");
var readRequest = require ("./read-request");
var writeRequest = require ("./write-request");

module.exports = {
	serialize: function (filename, globalOptions, opOptions){
		var bytes = 0;
	
		if (globalOptions){
			//tsize is 0
			globalOptions.extensionsString.tsize = "0";
			//+1 because tsize length is 1
			bytes = globalOptions.extensionsLength + 1;
		}
		
		return writeRequest (opcodes.RRQ, filename, bytes, globalOptions,
				opOptions);
	},
	deserialize: function (buffer){
		return readRequest (buffer, true);
	}
};