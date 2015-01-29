"use strict";

var Writer = require ("../writer");
var IncomingRequest = require ("./incoming-request");
var inherit = require ("../inherit");

module.exports = inherit (Writer, IncomingRequest);