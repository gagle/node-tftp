"use strict";

var fs = require ("fs");
var tftp = require ("../../lib");

/*
Note: Wrapping a GetStream or a PutStream in a function and use a fs.WriteStream
as a destination or a fs.ReadStream as a source is not necessary. Use the
functions client.get() and client.put(). This example only shows how to handle
the errors and how to abort a transfer when you need to use the streams with
other sources or destinations.
*/

var client = tftp.createClient ();

var get = function (remote, local, cb){	
  var gs = client.createGetStream (remote)
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
      .on ("abort", function (error){
        //Remove the local file if the GET stream is aborted
        fs.unlink (local, function (){
          //The error comes from the ws
          cb (error);
        });
      });
      
  var ws = fs.createWriteStream (local)
      .on ("error", function (error){
        //Abort the GET stream
        gs.abort (error);
      })
      .on ("finish", function (){
        //Transfer finished
        cb ();
      });
  
  gs.pipe (ws);
};

var put = function (local, remote, cb){
  fs.stat (local, function (error, stats){
    if (error) return cb (error);
    
    var closed = false;
    
    var rs = fs.createReadStream (local)
        .on ("error", function (error){
          //Abort the PUT stream
          ps.abort (error);
        })
        .on ("close", function (){
          closed = true;
        });
    
    var ps = new PutStream (remote, me._options, { size: stats.size })
        .on ("error", function (error){
          if (closed){
            //Empty origin file
            cb (error);
          }else{
            //Close the readable stream
            rs.on ("close", function (){
              cb (error);
            });
            rs.destroy ();
          }
        })
        .on ("abort", function (error){
          //The error comes from the rs
          cb (error);
        })
        .on ("finish", function (){
          //Transfer finished
          cb ();
        });
    
    rs.pipe (ps);
  });
};

get ("remote-file", "local-file", function (error){
  if (error) return console.error (error);
});

put ("local-file", "remote-file", function (error){
  if (error) return console.error (error);
});