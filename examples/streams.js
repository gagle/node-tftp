"use strict";

var fs = require ("fs");
var ntftp = require ("../lib");

var client = ntftp.createClient ({
  hostname: "localhost"
});

var get = function (remote, local, cb){
  //Tip: Do fs.stat() to check if the local file is a directory before starting
  //a new request

  var wsError;
      
  var gs = client.createGetStream ("remote-file")
      .on ("error", function (error){
        //Close the writable stream and remove the local file if the GET
        //operation fails
        ws.on ("close", function (){
          fs.unlink (local, function (){
            cb (error);
          });
        });
        ws.destroy ();
      })
      .on ("abort", function (){
        //Remove the local file if the GET stream is aborted
        fs.unlink (local, function (){
          cb (wsError);
        });
      });
      
  var ws = fs.createWriteStream ("local-file")
      .on ("error", function (error){
        //Save the error if the writable stream fails
        wsError = error;
        //Abort the GET stream
        gs.abort ();
      })
      .on ("finish", function (){
        //Transfer finished
        cb ();
      });
  
  gs.pipe (ws);
};

var put = function (local, remote, cb){
  //Tip: Do fs.stat() to check if the local file exists before starting a new
  //request

  var rsError;
  
  var rs = fs.createReadStream (local)
      .on ("error", function (error){
        //Save the error if the readable stream fails
        rsError = error;
        //Abort the PUT stream
        ps.abort ();
      });
  
  var ps = new PutStream (remote, me._options, { size: stats.size })
      .on ("error", function (error){
        //Close the readable stream
        rs.on ("close", function (){
          cb (error);
        });
        rs.destroy ();
      })
      .on ("abort", function (){
        cb (rsError);
      })
      .on ("finish", function (){
        //Transfer finished
        cb ();
      });
  
  rs.pipe (ps);
};

get ("remote-file", "local-file", function (error){
  if (error) return console.error (error);
});

put ("local-file", "remote-file", function (error){
  if (error) return console.error (error);
});