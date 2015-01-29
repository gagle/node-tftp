"use strict";

var Reader = require ("../reader");
var IncomingRequest = require ("./incoming-request");
var inherit = require ("../inherit");

module.exports = inherit (Reader, IncomingRequest);