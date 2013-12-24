"use strict";

var opcode = require ("../opcode");

module.exports = {
  serialize: function (filename, globalOptions, extensions){
    var length = filename.length;
    var start = length + 9;
    var bytes = start;
  
    if (extensions){
      //tsize is 0
      globalOptions.extensions.tsize = "0";
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
    for (var key in globalOptions.extensions){
      buffer.write (key, offset, "ascii");
      offset += key.length;
      buffer[offset++] = 0;
      buffer.write (globalOptions.extensions[key], offset, "ascii");
      offset += globalOptions.extensions[key].length;
      buffer[offset++] = 0;
    };
    
    return buffer;
  }
};