"use strict";

var Writer = require ("../writer");
var ClientRequest = require ("./client-request");
var inherit = require ("../inherit");

module.exports = inherit (Writer, ClientRequest);