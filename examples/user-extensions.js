"use strict";

/*
This example demonstrates how to send and receive custom user extensions to
extend the protocol in some way and adapt it to your needs.

The client sends a number and the server substracts one and returns it back to
the client.
*/

var fs = require ("fs");
var tftp = require ("../lib");

var server = tftp.createServer (function (req, res){
  req.on ("stats", function (stats){
    res.setUserExtensions ({ num: parseFloat (stats.userExtensions.num) - 1 });
  });
  this.requestListener (req, res);
});
server.listen ();

fs.openSync ("tmp1", "w");
console.log (">> 3");

tftp.createClient ()
    .createGetStream ("tmp1", { userExtensions: { num: 3 } })
    .on ("stats", function (stats){
      console.log ("<< " + stats.userExtensions.num);
    })
    .pipe (fs.createWriteStream ("tmp2"))
    .on ("finish", function (){
      server.close ();
      fs.unlinkSync ("tmp1");
      fs.unlinkSync ("tmp2");
    });