"use strict";

var tftp = require ("../../lib");

//Downloads a file and at the same time uploads it again

var client = tftp.createClient ();

var ps;
var gs = client.createGetStream ("remote-file")
		.on ("error", function (error){
			console.error (error);
			if (ps) ps.abort ();
		})
		.on ("stats", function (stats){
			if (stats.size !== null){
				ps = client.createPutStream ("remote-file-copy", { size: stats.size })
						.on ("error", function (error){
							console.error (error);
							gs.abort ();
						});
				gs.pipe (ps);
			}
		});