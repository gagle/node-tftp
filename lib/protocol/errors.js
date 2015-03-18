"use strict";

var define = function (name, code){
	var message;
	if (typeof code === "string"){
		message = code;
		code = 0;
	}else{
		message = rfc[code];
	}
	errors[name] = { code: code, name: name, message: message };
};

var rfc = [
	null,
	"File not found",
	"Access violation",
	"Disk full or allocation exceeded",
	"Illegal TFTP operation",
	"Unknown transfer ID",
	"File already exists",
	"No such user",
	"The request has been denied"
];

var errors = {
	wrap: function (message){
		var code = 0;
		for (var name in this)
			if (this[name].message === message)
				code = this[name].code
		return { code: code, name: null, message: message }
	}
};

define ("ENOENT", 1);
define ("EACCESS", 2);
define ("ENOSPC", 3);
define ("EBADOP", 4);
define ("ETID", 5);
define ("EEXIST", 6);
define ("ENOUSER", 7);
define ("EDENY", 8);
define ("ESOCKET", "Invalid remote socket");
define ("EBADMSG", "Malformed TFTP message");
define ("EABORT", "Aborted");
define ("EFBIG", "File too big");
define ("ETIME", "Timed out");
define ("EBADMODE", "Invalid transfer mode");
define ("EBADNAME", "Invalid filename");
define ("EIO", "I/O error");
define ("ENOGET", "Cannot GET files");
define ("ENOPUT", "Cannot PUT files");
define ("ERBIG", "Request bigger than 512 bytes (too much extensions)");
define ("ECONPUT", "Concurrent PUT request over the same file");
define ("ECURPUT", "The requested file is being written by another request");
define ("ECURGET", "The requested file is being read by another request");

module.exports = errors;