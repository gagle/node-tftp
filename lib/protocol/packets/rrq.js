"use strict";

var opcode = require ("../opcode");

module.exports = {
	serialize: function (filename, options){
		var length = filename.length;
		var bytes = 9 + length;
	
		if (options){
			//tsize is 0
			options.extensions.tsize = "0";
			//+1 because tsize is 0
			bytes += options.extensionsLength + 1;
		}
		
		var buffer = new Buffer (bytes);
		buffer.writeUInt16BE (opcode.RRQ, 0);
		buffer.write (filename, 2, "ascii");
		buffer.write ("octet", length + 3, "ascii");
		buffer[length + 2] = buffer[length + 8] = 0;
		
		if (!options) return buffer;
		
		var offset = length + 9;
		for (var key in options.extensions){
			buffer.write (key, offset, "ascii");
			offset += key.length;
			buffer[offset++] = 0;
			buffer.write (options.extensions[key], offset, "ascii");
			offset += options.extensions[key].length;
			buffer[offset++] = 0;
		};
		
		return buffer;
	}
};