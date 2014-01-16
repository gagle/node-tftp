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
  console.error (error);
});

server.listen ();