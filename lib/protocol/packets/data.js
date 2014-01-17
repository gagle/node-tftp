"use strict";

var opcodes = require ("../opcodes");

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
  deserialize: function (buffer){
    return {
      block: buffer.readUInt16BE (2),
      data: buffer.slice (4)
    }
  }
};