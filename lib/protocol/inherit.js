"use strict";

var util = require ("util");

/*
In order to reuse the Reader and Writer prototypes in the ClientRequest and
IncomingRequest classes, this function creates a new Reader and Writer class
clones:
ReaderClone1 is created from a Reader and inherits from ClientRequest.
ReaderClone2 is created from a Reader and inherits from IncomingRequest.
WriterClone1 is created from a Writer and inherits from ClientRequest.
WriterClone2 is created from a Writer and inherits from IncomingRequest.

The overall class hierarchy is:
- Client
	GetStream uses ReaderClone1 -> Reader -> ClientRequest -> Request
	PutStream uses WriterClone1 -> Writer -> ClientRequest -> Request
- Server
	GetStream uses ReaderClone2 -> Reader -> IncomingRequest -> Request
	PutStream uses WriterClone2 -> Writer -> IncomingRequest -> Request
*/
module.exports = function (ctor, base){
	var fn = function (){
		var args = Array.prototype.slice.call (arguments);
		args.unshift (base);
		ctor.apply (this, args);
	};
	
	var proto = ctor.prototype;
	
	util.inherits (fn, base);
	
	for (var p in proto){
		fn.prototype[p] = proto[p];
	}
	
	return fn;
};