"use strict";

var opcodes = require ("../opcodes");
var errors = require ("../errors");
var readString = require ("./read-string");

module.exports = {
  serialize: function (code){
    var message;
    if (typeof code === "string"){
      message = code;
      code = 0;
    }else{
      message = errors.rfc[code];
    }
    var length = message.length;
    var buffer = new Buffer (length + 5);
    buffer.writeUInt16BE (opcodes.ERROR, 0);
    buffer.writeUInt16BE (code, 2);
    buffer.write (message, 4, "ascii");
    buffer[buffer.length - 1] = 0;
    return buffer;
  },
  deserialize: function (buffer){
    return {
      code: buffer.readUInt16BE (2),
      message: readString (buffer, { offset: 4 })
    }
  }
};