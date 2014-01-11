"use strict";

var opcodes = require ("../opcodes");

module.exports = {
  serialize: function (block, data){
    var length = data.length;
    var buffer = new Buffer (4);
    buffer.writeUInt16BE (opcodes.DATA, 0);
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