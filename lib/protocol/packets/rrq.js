"use strict";

var opcode = require ("../opcode");

module.exports = {
  serialize: function (filename, globalOptions, extensions){
    var length = filename.length;
    var start = length + 9;
    var bytes = start;
  
    if (extensions){
      //tsize is 0
      globalOptions.extensionsString.tsize = "0";
      //+1 because tsize is 0
      bytes += globalOptions.extensionsLength + 1;
    }
    
    var buffer = new Buffer (bytes);
    buffer.writeUInt16BE (opcode.RRQ, 0);
    buffer.write (filename, 2, "ascii");
    buffer.write ("octet", length + 3, "ascii");
    buffer[length + 2] = buffer[length + 8] = 0;
    
    if (!extensions) return buffer;
    
    var offset = start;
    for (var key in globalOptions.extensionsString){
      buffer.write (key, offset, "ascii");
      offset += key.length;
      buffer[offset++] = 0;
      buffer.write (globalOptions.extensionsString[key], offset, "ascii");
      offset += globalOptions.extensionsString[key].length;
      buffer[offset++] = 0;
    };
    
    return buffer;
  }
};