"use strict";

var tftp = require ("../../lib");

/*
Closes the server and all the current connections gracefully.
This is slightly different from the http server where the "connection" event
returns the socket and you must call to socket.destroy() to close it. On the
other hand, this tftp server returns the GetStream, the "req" parameter of the
request listener, or simply a "connection". When connection.abort() is called
it sends to the client an error message and closes the socket, that is, it's a
real graceful shutdown, instead of killing the socket by brute force. In this
tftp server the socket is not exposed to the public access.
*/

var connections = [];

var server = tftp.createServer ({
  port: 1234
});

//Listen for connection events
server.on ("connection", function (con){
  //Save the connection
  connections.push (con);
  //The "close" event is fired when the internal socket closes, regardless
  //whether it is produced by an error or because the socket closes naturally
  con.on ("close", function (){
    //Remove the connection when it closes
    connections.splice (connections.indexOf (con), 1);
    if (closed && !connections.length){
      //The server and all the connections have been closed
      console.log ("Server closed");
    }
  });
});

server.listen ();

var closed = false;
setTimeout (function (){
  //Close the server after 10s
  server.on ("close", function (){
    closed = true;
    //Abort all the current connections
    for (var i=0; i<connections.length; i++){
      console.log ("Connection " + i + " aborted");
      connections[i].abort ();
    }
  });
  server.close ();
}, 10000);