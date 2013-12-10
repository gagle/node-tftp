"use strict";

var opcode = require ("../opcode");

module.exports = {
  serialize: function (filename, size, options){
    var length = filename.length;
    var bytes = 9 + length;
  
    if (options){
      //tsize is size
      options.extensions.tsize = size + "";
      bytes += options.extensionsLength + options.extensions.tsize.length;
    }
    
    var buffer = new Buffer (bytes);
    buffer.writeUInt16BE (opcode.WRQ, 0);
    buffer.write (filename, 2, "ascii");
    buffer.write ("octet", length + 3, "ascii");
    buffer[length + 2] = buffer[length + 8] = 0;
    
    if (!options) return buffer;
    
    var offset = length + 9;
    for (var key in options.extensions){
      buffer.write (key, offset, "ascii");
      offset += key.length;
      buffer[offset++] = 0;
      buffer.write (options.extensions[key], offset, "ascii");
      offset += options.extensions[key].length;
      buffer[offset++] = 0;
    };
    
    return buffer;
  }
};