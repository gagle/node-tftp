"use strict";

var http = require ("http");
var tftp = require ("../../lib");

/*
This example demonstrates the usefulness of the streams. When the client
requests a file named "node.exe", it obtains the data from a remote location, in
this case via http.
*/

var server = tftp.createServer ({
  port: 1234
}, function (req, tftpRes){
  if (req.path === "node.exe"){
    //Prevent uploading a file named "node.exe"
    if (req.method === "PUT") return req.abort ();
    
    //GET
    //Get the data from internet
    var me = this;
    http.get ("http://nodejs.org/dist/latest/node.exe", function (httpRes){
      //As soon as the data chuncks are downloaded from a remote location via
      //http, they are sent back to client via tftp
      httpRes.pipe (tftpRes);
    }).on ("error", function (error){
      me.emit ("error", error);
      req.abort ();
    });
  }else{
    //Call the default request listener
    this.requestListener (req, res);
  }
});

server.on ("error", function (error){
  //Errors from the main socket and from each request
  //These errors are not related with the protocol errors, they are I/O errors
  console.error (error);
});

server.listen ();