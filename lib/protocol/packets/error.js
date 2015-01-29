"use strict";

var opcodes = require ("../opcodes");
var readString = require ("./read-string");

module.exports = {
	serialize: function (obj){
		var buffer = new Buffer (obj.message.length + 5);
		buffer.writeUInt16BE (opcodes.ERROR, 0);
		buffer.writeUInt16BE (obj.code, 2);
		buffer.write (obj.message, 4, "ascii");
		buffer[buffer.length - 1] = 0;
		return buffer;
	},
	deserialize: function (buffer){
		var code = buffer.readUInt16BE (2);
		return {
			code: code,
			message: code === 0 && buffer.length === 4
					//Errors with code 0 and no description
					? ""
					: readString (buffer, { offset: 4 })
		}
	}
};