"use strict";

var opcodes = require ("../opcodes");
var errors = require ("../errors");

module.exports = {
	serialize: function (block){
		var buffer = new Buffer (4);
		buffer.writeUInt16BE (opcodes.ACK, 0);
		buffer.writeUInt16BE (block, 2);
		return buffer;
	},
	deserialize: function (buffer){
		var block = buffer.readUInt16BE (2);
		if (block < 0 || block > 65535) throw errors.EBADMSG;
		return {
			block: block
		};
	}
};