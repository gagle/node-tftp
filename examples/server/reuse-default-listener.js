"use strict";

var path = require ("path");
var tftp = require ("../../lib");

/*
Allow only operations in the root directory.

Note: For security reasons a request is automatically denied if it tries to
access a directory upper than the root, eg.: "../file". Also, a PUT operation
does NOT create the directories recursively if they don't exist,
eg.: PUT "a/b/c/file" is valid but if "b" doesn't exist, the request fails, that
is, "c" is not automatically created, the user is responsible to create the
directory tree.
*/

var server = tftp.createServer ({
  port: 1234
}, function (req, res){
  //root is "."
  if (path.dirname (req.file) !== this.root) return req.abort ();
  
  //Call the default request listener
  this.requestListener (req, res);
});

server.on ("error", function (error){
  //Errors from the main socket
  console.error (error);
});

server.on ("connection", function (con){
  con.on ("error", function (error){
    //Errors from each conenction
    console.error (error);
  });
});

server.listen ();