"use strict";

var fs = require ("fs");
var tftp = require ("../../lib");

/*
Note: Wrapping a GetStream or a PutStream in a function and use a fs.WriteStream
as a destination or a fs.ReadStream as a source is not necessary. Use the
functions client.get() and client.put() instead. This example only shows what is
being done under the hood when using fs streams. For a simpler example with
other kind of streams, see server/proxy-http.js
*/

var client = tftp.createClient ();

var get = function (remote, local, cb){
	var open = false;
	var destroy = null;
	var err = null;

	var gs = client.createGetStream (remote)
			.on ("error", function (error){
				if (open){
					//The file is open, destroy the stream and remove the file
					ws.on ("close", function (){
						fs.unlink (local, function (){
							cb (error);
						});
					});
					ws.destroy ();
				}else{
					//Wait until the file is open
					destroy = error;
				}
			})
			.on ("abort", function (){
				//Remove the local file if the GET stream is aborted
				fs.unlink (local, function (){
					//The error comes from the ws
					cb (err);
				});
			});
			
	var ws = fs.createWriteStream (local)
			.on ("error", function (error){
				//Abort the GET stream
				err = error;
				gs.abort (tftp.EIO);
			})
			.on ("open", function (){
				if (destroy){
					//There was an error in the get stream and the file must be removed
					ws.on ("close", function (){
						fs.unlink (local, function (){
							cb (error);
						});
					});
					ws.destroy ();
				}else{
					open = true;
				}
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
					err = error;
					ps.abort (tftp.EIO);
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
				.on ("abort", function (){
					//The error comes from the rs
					cb (err);
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