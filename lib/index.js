"use strict";

var Client = require ("./client");

module.exports.createClient = function (options){
  return new Client (options);
};