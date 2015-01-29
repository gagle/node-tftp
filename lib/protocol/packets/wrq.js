"use strict";

var opcodes = require ("../opcodes");
var readRequest = require ("./read-request");
var writeRequest = require ("./write-request");

module.exports = {
	serialize: function (filename, globalOptions, opOptions){
		var bytes = 0;
	
		if (globalOptions){
			//tsize is size
			var str = opOptions.size + "";
			globalOptions.extensionsString.tsize = str;
			bytes = globalOptions.extensionsLength + str.length;
		}
		
		return writeRequest (opcodes.WRQ, filename, bytes, globalOptions,
				opOptions);
	},
	deserialize: readRequest
};