"use strict";

var opcodes = require ("../opcodes");
var errors = require ("../errors");

module.exports = {
	serialize: function (block, data){
		var buffer;
		if (data.length){
			buffer = new Buffer (4 + data.length);
			buffer.writeUInt16BE (opcodes.DATA, 0);
			buffer.writeUInt16BE (block, 2);
			data.copy (buffer, 4);
			return buffer;
		}else{
			buffer = new Buffer (4);
			buffer.writeUInt16BE (opcodes.DATA, 0);
			buffer.writeUInt16BE (block, 2);
			return buffer;
		}
	},
	deserialize: function (buffer, blockSize){
		var block = buffer.readUInt16BE (2);
		if (block < 0 || block > 65535) throw errors.EBADMSG;
		var data = buffer.slice (4);
		if (data.length > blockSize) throw errors.EBADMSG;
		return {
			block: block,
			data: data
		}
	}
};