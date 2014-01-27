"use strict";

var tftp = require ("../../lib");

/*
This example demonstrates how to close the server and all the current
connections gracefully.

This is slightly different from the http server where the "connection" event
returns the socket and you must call to socket.destroy() to close it. On the
other hand, this tftp server doesn't have a "connection" event because the
internal socket is not exposed to the public, it just has a "request" event
which is fired each time the server receives a new request. The "req" argument
acts like a "connection" object. When req.abort() is called it sends an error
message to the client and then the socket closes, that is, it's a real graceful
shutdown. Instead of killing the socket by brute force, the server informs the
client that the transfer has been aborted, so the client is able to abort the
transfer immediately instead of begin a timeout and then abort.
*/

var connections = [];

var server = tftp.createServer ();

server.on ("request", function (req){
  req.on ("error", function (error){
    //Errors from the request
    console.error (error);
  });
  
  //Save the connection
  connections.push (req);
  
  //The "close" event is fired when the internal socket closes, regardless
  //whether it is produced by an error or because the socket closes naturally
  //due to the end of the transfer or because the transfer has been aborted
  req.on ("close", function (){
    //Remove the connection
    connections.splice (connections.indexOf (this), 1);
    if (closed && !connections.length){
      //The server and all the connections have been closed
      console.log ("Server closed");
    }
  });
});

server.on ("error", function (error){
  //Errors from the main socket
  console.error (error);
});

server.listen ();

var closed = false;

setTimeout (function (){
  //Close the server after 10s
  server.on ("close", function (){
    closed = true;
    
    if (!connections.length){
      return console.log ("Server closed");
    }
    
    //Abort all the current transfers
    for (var i=0; i<connections.length; i++){
      console.log ("Connection " + i + " aborted");
      connections[i].abort ();
    }
  });
  server.close ();
}, 2000);