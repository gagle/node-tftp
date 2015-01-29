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
	req.on ("error", function (error){
		console.error (error);
	});
	
	if (!req.stats.userExtensions.user || !req.stats.userExtensions.pass ||
			users[req.stats.userExtensions.user] !== req.stats.userExtensions.pass){
		req.abort ("Invalid user");
	}else{
		this.requestListener (req, res);
	}
});

server.on ("error", function (error){
	console.error (error);
});

server.on ("listening", doRequest);

server.listen ();

function doRequest (){
	var clean = function (){
		server.close ();
		try{ fs.unlinkSync ("tmp1"); }catch (error){}
		try{ fs.unlinkSync ("tmp2"); }catch (error){}
	};

	fs.writeFileSync ("tmp1", "");

	var client = tftp.createClient ();
	client.get ("tmp1", "tmp2", function (error){
		//Invalid user
		console.error (error);
		
		client.get ("tmp1", "tmp2", { userExtensions: {
			user: "usr1",
			pass: "usr1-pass"
		}}, function (error){
			clean ();
			if (error) return console.error (error);
			console.log ("OK");
		});
	});
}