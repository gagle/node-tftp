"use strict";

var Client = require ("./client");

//REMOVE
var debug = true;
var log = console.log;
console.log = function (){
	if (debug) log.apply (null, arguments);
};

module.exports.createClient = function (options){
	return new Client (options);
};