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
  req.on ("error", function (error){
    console.error (error);
  });
  
  res.setUserExtensions ({
    num: parseInt (req.stats.userExtensions.num) - 1
  });
  
  this.requestListener (req, res);
});

server.on ("error", function (error){
  console.error (error);
});

server.on ("listening", doRequest);

server.listen ();

function doRequest (){
  fs.writeFileSync ("tmp1", "");
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
}