"use strict";

var readString = require ("./read-string");
var errors = require ("../errors");
var normalizeFilename = require ("../../normalize-filename");

module.exports = function (buffer){
  var o = { offset: 2 };
  
  var filename = readString (buffer, o);
  try{
    filename = normalizeFilename (filename);
  }catch (error){
    throw errors.EBADNAME;
  }
  
  var mode = readString (buffer, o).toLowerCase ();
  if (mode !== "octet" && mode !== "mail" && mode !== "netascii"){
    throw errors.EBADMODE;
  }
  
  var extensions = null;
  var userExtensions = null;
  var length = buffer.length;
  var key;
  var value;
  
  while (o.offset < length){
    key = readString (buffer, o);
    value = readString (buffer, o);
    if (key === "blksize" || key === "tsize" || key === "windowsize"){
      if (!extensions) extensions = {};
      extensions[key] = ~~value;
    }else if (key === "timeout" || key === "rollover"){
      //Ignore
      continue;
    }else{
      if (!userExtensions) userExtensions = {};
      userExtensions[key] = value;
    }
  }
  
  return {
    filename: filename,
    mode: mode,
    extensions: extensions,
    userExtensions: userExtensions
  };
};