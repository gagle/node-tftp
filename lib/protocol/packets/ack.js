"use strict";

var opcode = require ("../opcode");

module.exports = {
  serialize: function (block){
    var buffer = new Buffer (4);
    buffer.writeUInt16BE (4, 0);
    buffer.writeUInt16BE (block, 2);
    return buffer;
  },
  deserialize: function (buffer){
    return {
      block: buffer.readUInt16BE (2)
    };
  }
};