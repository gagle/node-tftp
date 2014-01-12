"use strict";

var tftp = require ("../../lib");

/*
socket: localhost:1234, root: ".", only GET
*/

var server = tftp.createServer ({
  //port 69 require admin privileges
  port: 1234,
  denyPUT: true
});

server.on ("error", function (error){
  //Errors from the main socket and from each request
  //These errors are not related with the protocol errors, they are I/O errors
  console.error (error);
});

server.listen ();