"use strict";

var readString = require ("./read-string");

module.exports = {
	deserialize: function (buffer){
		var options = {};
		var o = { offset: 2 };
		var length = buffer.length;
		
		while (o.offset < length){
			options[readString (buffer, o)] = readString (buffer, o);
		}
		
		return options;
	}
};