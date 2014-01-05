"use strict";

module.exports = function (buffer, obj){
  var str = "";
  var bytes = [];
  var byte;
  
  while ((byte = buffer[obj.offset++]) !== 0){
    if (byte === undefined) throw new Error ("Malformed TFTP message");
    bytes.push (byte);
  }
  
  //This is faster than "str = String.fromCharCode.apply (null, bytes)"
  for (var i=0; i<bytes.length; i++){
    str += String.fromCharCode (bytes[i])
  }
  
  return str;
};