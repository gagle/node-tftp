"use strict";

var Reader = require ("../reader");
var Request = require ("./request");
var inherit = require ("../inherit");

module.exports = inherit (Reader, Request);