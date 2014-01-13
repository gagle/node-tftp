"use strict";

var Writer = require ("../writer");
var Request = require ("./request");
var inherit = require ("../inherit");

module.exports = inherit (Writer, Request);