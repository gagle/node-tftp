"use strict";

var fs = require ("fs");
var http = require ("http");
var tftp = require ("../../lib");

/*
This example demonstrates the usefulness of the streams. When the client
requests a file named "node.exe", it obtains the data from a remote location, in
this case via http.
*/

var handleError = function (error){
  console.error (error);
};

var server = tftp.createServer ({
  port: 1234
}, function (req, tftpRes){
  req.on ("error", function (error){
    //Error from the request
    gs.abort ();
    handleError (error);
  });
  
  if (req.file === "node.exe"){
    //Prevent from uploading a file named "node.exe"
    if (req.method === "PUT") return req.abort (tftp.ENOPUT);
    
    //Get the file from internet
    var gs = http.get ("http://nodejs.org/dist/latest/node.exe",
        function (httpRes){
      //Set the response size, this is mandatory
      tftpRes.setSize (parseInt (httpRes.headers["content-length"]));
      
      //As soon as the data chunks are received from the remote location via
      //http, send them back to client via tftp
      httpRes.pipe (tftpRes);
    }).on ("error", function (error){
      req.on ("abort", function (){
        handleError (error);
      });
      req.abort (tftp.EIO);
    });
  }else{
    //Call the default request listener for the rest of the files
    this.requestListener (req, res);
  }
});

server.on ("error", function (error){
  //Errors from the main socket
  console.error (error);
});

server.on ("listening", doRequest);

server.listen ();

function doRequest (){
  tftp.createClient ({ port: 1234 }).get ("node.exe", function (error){
    server.close ();
    try{ fs.unlinkSync ("node.exe"); }catch (error){}
    if (error) console.error (error);
  });
}