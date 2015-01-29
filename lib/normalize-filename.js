"use strict";

var path = require ("path");

module.exports = function (filename){
	filename = path.normalize (filename);
	
	//Check for invalid access
	if (filename.indexOf ("..") === 0){
		throw new Error ("The path of the filename cannot point to upper levels");
	}
	
	//Multibytes characters are not allowed
	if (Buffer.byteLength (filename) > filename.length){
		throw new Error ("The filename cannot contain multibyte characters");
	}
	
	return filename;
};