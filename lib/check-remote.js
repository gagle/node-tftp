"use strict";

var reSlash = /\/|\\/;

module.exports = function (remote){
  //Check for slashes or backslashes
  if (reSlash.test (remote)){
    throw new Error ("The remote file name cannot contain slashes or " +
        "backslashes");
  }
  
  //Multibytes characters are not allowed
  if (Buffer.byteLength (remote) > remote.length){
    throw new Error ("The remote file name cannot contain multibyte " +
        "characters");
  }
};