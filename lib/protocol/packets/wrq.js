"use strict";

var opcode = require ("../opcode");

module.exports = {
  serialize: function (filename, globalOptions, size, extensions){
    var length = filename.length;
    var start = length + 9;
    var bytes = start;
  
    if (extensions){
      //tsize is size
      globalOptions.extensions.tsize = size + "";
      bytes += globalOptions.extensionsLength +
          globalOptions.extensions.tsize.length;
    }
    
    var buffer = new Buffer (bytes);
    buffer.writeUInt16BE (opcode.WRQ, 0);
    buffer.write (filename, 2, "ascii");
    buffer.write ("octet", length + 3, "ascii");
    buffer[length + 2] = buffer[start] = 0;
    
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