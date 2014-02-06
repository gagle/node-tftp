"use strict";

/*
The TFTP doesn't have any built-in mechanism for resuming a transfer, however,
with the user extensions it is possible. This example uses the extension
"offset". Only GET requests are allowed.
*/

var fs = require ("fs");
var tftp = require ("../lib");

var server = tftp.createServer ({ denyPUT: true }, function (req, res){
  req.on ("error", function (error){
    console.error (error);
  });
  
  var offset = 0;
  if (req.stats.userExtensions.offset !== undefined){
    offset = ~~req.stats.userExtensions.offset;
    if (offset < 0){
      return req.abort ("The offset must be a positive integer");
    }
  }
  
  var file = this.root + "/" + req.file;
  fs.stat (file, function (error, stats){
    if (error) return req.abort (tftp.EIO);
    
    var size = stats.size  - offset;
    res.setSize (size < 0 ? 0 : size);
    
    fs.createReadStream (file, { start: offset })
        .on ("error", function (error){
          req.on ("abort", function (){
            req.emit ("error", error);
          });
          req.abort (tftp.EIO);
        })
        .pipe (res);
  });
});

server.on ("error", function (error){
  console.error (error);
});

server.listen ();

var clean = function (){
  server.close ();
  try{ fs.unlinkSync ("tmp1"); }catch (error){}
  try{ fs.unlinkSync ("tmp2"); }catch (error){}
};

fs.writeFileSync ("tmp1", "0123456789");
fs.writeFileSync ("tmp2", "01234");

var client = tftp.createClient ();

//Get the content "56789" from tmp1 and append it to tmp2 which contains "01234"
var gs = client.createGetStream ("tmp1", { userExtensions: { offset: 5 } })
    .on ("error", function (error){
      console.error (error);
      clean ();
    });
      
var ws = fs.createWriteStream ("tmp2", { flags: "a" })
    .on ("error", function (error){
      console.error (error);
      gs.abort (tftp.EIO);
      clean ();
    })
    .on ("finish", function (){
      console.log (fs.readFileSync ("tmp2", { encoding: "utf8" })); //0123456789
      clean ();
    });

gs.pipe (ws);