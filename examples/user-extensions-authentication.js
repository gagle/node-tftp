"use strict";

/*
Basic authentication over TFTP using the user extensions. The user extensions
are transmitted in plain text so an encrypt algorithm would be nice to encrypt
the password (a symmetric cipher would suffice for simple tasks).
*/

var tftp = require ("../lib");

