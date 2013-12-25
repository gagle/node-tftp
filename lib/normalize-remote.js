"use strict";

var path = require ("path");

module.exports = function (remote){
  remote = path.normalize (remote);
  
  //Check for invalid access
  if (remote.indexOf ("..") === 0){
    throw new Error ("The path of the remote file cannot go outside the " +
        "server's root directory");
  }
  
  //Multibytes characters are not allowed
  if (Buffer.byteLength (remote) > remote.length){
    throw new Error ("The remote file name cannot contain multibyte " +
        "characters");
  }
  
  return remote;
};