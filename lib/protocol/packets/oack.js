"use strict";

var opcodes = require ("../opcodes");
var readString = require ("./read-string");

module.exports = {
	serialize: function (extensions){
		var bytes = 2;
		var o = {};
		var str;
		
		for (var p in extensions){
			str = extensions[p] + "";
			bytes += 2 + p.length + str.length;
			o[p] = str;
		}
	
		var buffer = new Buffer (bytes);
		buffer.writeUInt16BE (opcodes.OACK, 0);
	
		var offset = 2;
		for (var p in o){
			buffer.write (p, offset, "ascii");
			offset += p.length;
			buffer[offset++] = 0;
			buffer.write (o[p], offset, "ascii");
			offset += o[p].length;
			buffer[offset++] = 0;
		};
		
		return buffer;
	},
	deserialize: function (buffer){
		var extensions = {};
		var o = { offset: 2 };
		var length = buffer.length;
		while (o.offset < length){
			extensions[readString (buffer, o)] = readString (buffer, o);
		}
		return extensions;
	}
};