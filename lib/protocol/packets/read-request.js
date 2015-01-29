"use strict";

var readString = require ("./read-string");
var errors = require ("../errors");
var normalizeFilename = require ("../../normalize-filename");

module.exports = function (buffer, rrq){
	var o = { offset: 2 };
	
	var file = readString (buffer, o);
	try{
		file = normalizeFilename (file);
	}catch (error){
		throw errors.EBADNAME;
	}
	
	var mode = readString (buffer, o).toLowerCase ();
	if (mode !== "octet" && mode !== "mail" && mode !== "netascii"){
		throw errors.EBADMODE;
	}
	
	var extensions = null;
	var userExtensions = {};
	var length = buffer.length;
	var key;
	var value;
	var blksize;
	var tsize;
	var windowsize;
	var rollover;
	
	while (o.offset < length){
		key = readString (buffer, o);
		value = readString (buffer, o);
		
		blksize = key === "blksize";
		tsize = key === "tsize";
		windowsize = key === "windowsize";
		rollover = key === "rollover";
		
		if (blksize || tsize || windowsize || rollover){
			//Validate the known extension values
			if (value.indexOf (".") !== -1 || isNaN ((value = Number (value))) ||
					(blksize && (value < 8 || value > 65464)) ||
					(tsize && ((rrq && value !== 0) || value < 0)) ||
					(windowsize && (value < 1 || value > 65535)) ||
					(rollover && (value !== 0 && value !== 1))){
				throw errors.EDENY;
			}
			
			if (!extensions) extensions = {};
			extensions[key] = value;
		}else if (key === "timeout"){
			//Ignore
			continue;
		}else{
			userExtensions[key] = value;
		}
	}
	
	return {
		file: file,
		extensions: extensions,
		userExtensions: userExtensions
	};
};