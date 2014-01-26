"use strict";

/*
Basic authentication over TFTP using the user extensions. The user extensions
are transmitted in plain text so an encrypt algorithm would be nice to encrypt
the password (a symmetric key-based cipher would suffice for simple tasks).
*/

var fs = require ("fs");
var tftp = require ("../lib");

var users = {
  usr1: "usr1-pass"
};

var server = tftp.createServer (function (req, res){
  var me = this;
  req.on ("error", function (error){
    console.error (error);
  });
  req.on ("stats", function (stats){
    if (!stats.userExtensions || !stats.userExtensions.user ||
        !stats.userExtensions.pass ||
        users[stats.userExtensions.user] !== stats.userExtensions.pass){
      req.abort ("Invalid user");
    }else{
      me.requestListener (req, res);
    }
  });
});
server.on ("error", function (error){
  console.error (error);
});
server.listen ();

fs.openSync ("tmp1", "w");

var client = tftp.createClient ();
client.get ("tmp1", "tmp2", function (error){
  //Invalid user
  console.error (error);
  
  client.get ("tmp1", "tmp2", { userExtensions: {
    user: "usr1",
    pass: "usr1-pass"
  }}, function (error){
    if (error) return console.error (error);
    
    console.log ("OK");
    server.close ();
    fs.unlinkSync ("tmp1");
    fs.unlinkSync ("tmp2");
  });
});