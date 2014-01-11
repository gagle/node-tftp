"use strict";

var Client = require ("./client");
var Server = require ("./server");

module.exports.createClient = function (options){
  return new Client (options);
};

module.exports.createServer = function (options, requestListener){
  return new Server (options, requestListener);
};