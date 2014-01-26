"use strict";

var tftp = require ("../../lib");

/*
socket: localhost:1234, root: ".", only GET
*/

var server = tftp.createServer ({
  port: 1234,
  denyPUT: true
});

server.on ("error", function (error){
  //Errors from the main socket
  console.error (error);
});

server.on ("request", function (req){
  req.on ("error", function (error){
    //Errors from the request
    console.error (error);
  });
});

server.listen ();