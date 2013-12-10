"use strict";

var opcode = require ("../opcode");

module.exports = {
  serialize: function (block, data){
    var length = data.length;
    var buffer = new Buffer (4);
    buffer.writeUInt16BE (opcode.DATA, 0);
    buffer.writeUInt16BE (block, 2);
    if (!length) return buffer;
    return Buffer.concat ([buffer, data], length + 4);
  },
  deserialize: function (buffer){
    return {
      block: buffer.readUInt16BE (2),
      data: buffer.slice (4)
    }
  }
};