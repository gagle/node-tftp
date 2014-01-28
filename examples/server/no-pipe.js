"use strict";

var fs = require ("fs");
var tftp = require ("../../lib");

/*
You don't need to pipe from the a file, the response it's just a writable
stream.
*/

var server = tftp.createServer ({
  port: 1234,
  denyPUT: true
}, function (req, res){
  req.on ("error", function (error){
    //Error from the request
    console.error (error);
  });

  if (req.file === "hello"){
    var message = "Hello World!";
    res.setSize (message.length);
    res.end (message);
  }else{
    req.abort ("Can only GET the file 'hello'");
  }
});

server.on ("error", function (error){
  //Errors from the main socket
  console.error (error);
});

server.listen ();

tftp.createClient ({ port: 1234 }).createGetStream ("hello")
    .on ("error", function (error){
      server.close ();
      console.error (error);
    })
    .on ("end", function (){
      server.close ();
    })
    //Hello World!
    .pipe (process.stdout);