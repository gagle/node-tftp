"use strict";

var Reader = require ("../reader");
var ClientRequest = require ("./client-request");
var inherit = require ("../inherit");

module.exports = inherit (Reader, ClientRequest);