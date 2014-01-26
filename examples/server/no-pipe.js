"use strict";

var http = require ("http");
var tftp = require ("../../lib");

/*
This example demonstrates the usefulness of the streams. When the client
requests a file named "node.exe", it obtains the data from a remote location, in
this case via http.
*/

var server = tftp.createServer ({
  port: 1234,
  denyPUT: true
}, function (req, res){
  req.on ("error", function (error){
    //Errors from the request
    console.error (error);
  });

  if (req.file === "no-pipe"){
    res.setSize (5);
    res.end (new Buffer ("12345"));
  }else{
    //Call the default request listener
    this.requestListener (req, res);
  }
});

server.on ("error", function (error){
  //Errors from the main socket
  console.error (error);
});

server.listen ();