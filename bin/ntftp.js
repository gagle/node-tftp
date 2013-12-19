#!/usr/bin/env node

"use strict";

var fs = require ("fs");
var path = require ("path");
var readLine = require ("readline");
var argp = require ("argp");
var statusBar = require ("status-bar");
var ntftp = require ("../lib");

var client;
var rl;
var timer;
var read;
var write;

var filename;

var renderStatusBar = function (stats){
  process.stdout.write (filename + " " + 
      statusBar.format.storage (stats.currentSize) + " " +
      statusBar.format.speed (stats.speed) + " " +
      statusBar.format.time (stats.remainingTime) + " [" +
      stats.progressBar + "] " +
      statusBar.format.percentage (stats.percentage));
  process.stdout.cursorTo (0);
};

function formatFilename (filename){
  //80 - 59
  var filenameMaxLength = 21;
  if (filename.length > filenameMaxLength){
    filename = filename.slice (0, filenameMaxLength - 3) + "...";
  }else{
    var remaining = filenameMaxLength - filename.length;
    while (remaining--){
      filename += " ";
    }
  }
  return filename;
};

//The main parser is not cached
argp.createParser ()
    .readPackage (__dirname + "/../package.json")
    .usages (["ntftp [options] <host>[:<port>]"])
    .allowUndefinedArguments ()
    .on ("argument", function (argv, argument, ignore){
      if (argv.server) this.fail ("Too many arguments");
      argument = argument.split (":");
      argv.server = {
        address: argument[0],
        port: argument[1]
      };
      ignore ();
    })
    .on ("end", function (argv){
      if (!argv.server) this.fail ("Missing server address");
      createClient (argv);
    })
    .footer ("By default this client sends some known option extensions " +
            "trying to achieve the best performance. If the remote server " +
            "doesn't support option extensions, it automatically fallbacks " +
            "to a pure RFC 1350 compliant TFTP client implementation.")
    .body ()
        .text ("Once ntftp is running, it shows a prompt and recognizes the " +
            "following commands:")
        .text ("> get <remote> [<local>]", "  ")
        .text ("Gets a file from the remote server.", "    ")
        .text ("\n> put <local> [<remote>]", "  ")
        .text ("Puts a file to the remote server.", "    ")
        .text ("\nTo quit the program press ctrl-c two times.")
        
        .text ("\nExample:")
        .text ("$ ntftp localhost -w 4 --blksize 256", "  ")
        .text ("> get remote_file", "  ")
        .text ("> get --md5sum 1234 remote_file local_file", "  ")
        .text ("> put path/to/local_file remote_file", "  ")
        
        .text ("\nArguments:")
        .columns ("  <host>[:<port>]", "The address and port of the remote " +
            "server, eg.\n$ ntftp localhost:1234. Default port is 69")
        
        .text ("\nOptions:")
        .option ({ short: "b", long: "blksize", metavar: "SIZE",
            type: Number, description: "Sets the blksize option extension. " +
            "Valid range: [8, 65464]. Default is 1468, the size before IP " +
            "fragmentation in Ethernet environments"})
        .option ({ short: "r", long: "retries", metavar: "NUM",
            type: Number, description: "Number of retries before finishing " +
            "the transfer of the file due to an unresponsive server or a " +
            "massive packet loss"})
        .option ({ short: "t", long: "timeout", metavar: "MILLISECONDS",
            type: Number, description: "Sets the timeout option extension. " +
            "Default is 3000ms"})
        .option ({ short: "w", long: "windowsize", metavar: "SIZE",
            type: Number, description: "Sets the windowsize option " +
            "extension. Valid range: [1, 65535]. Default is 4"})
        
        .help ()
        .argv ();
        
function notifyError (str){
  console.error ("Error: " + str);
  rl.prompt ();
};

var again = function (){
  timer = setTimeout (function (){
    timer = null;
  }, 3000);
  
  console.log ("\n(^C again to quit)");
  rl.line = "";
  rl.prompt ();
};

function createCommandParser (){
  //Don't produce errors when undefined arguments and options are
  //introduced, they are simply omitted
  return argp.createParser ()
      .main ()
          .allowUndefinedArguments ()
          .allowUndefinedOptions ()
          .on ("end", function (){
            notifyError ("Invalid command");
          })
          .on ("error", function (error){
            notifyError (error.message);
          })
      .command ("get", { trailing: { min: 1, max: 2 } })
          .allowUndefinedArguments ()
          .allowUndefinedOptions ()
          .on ("end", get)
          .on ("error", function (error){
            notifyError (error.message);
          })
      .command ("put", { trailing: { min: 1, max: 2 } })
          .allowUndefinedArguments ()
          .allowUndefinedOptions ()
          .on ("end", put)
          .on ("error", function (error){
            notifyError (error.message);
          });
};

function createClient (argv){
  var parser = createCommandParser ();

  //Default values are not checked in the cli layer. If they are not valid they
  //are set to their default values silently
  client = ntftp.createClient ({
    hostname: argv.server.address,
    port: argv.server.port,
    blockSize: argv.blksize,
    retries: argv.retries,
    timeout: argv.timeout,
    windowSize: argv.windowsize
  });
  
  var completions = ["get ", "put "];
  
  //Start prompt
  rl = readLine.createInterface ({
    input: process.stdin,
    output: process.stdout,
    completer: function (line){
      var hits = completions.filter (function (command){
        return command.indexOf (line) === 0;
      });
      return [hits.length ? hits : [], line];
    }
  });
  rl.on ("line", function (line){
    if (!line) return rl.prompt ();
    parser.argv (line.split (" ").filter (function (word){
      return word;
    }));
  });
  rl.on ("SIGINT", function (){
    if (timer) process.exit ();
    
    //Abort the current transfer
    if (read){
      read.gs.abort ();
    }else if (write){
      write.ps.abort ();
    }else{
      again ();
    }
  });
  rl.prompt ();
};

function get (argv){
  clearTimeout (timer);
  timer = null;
  
  var remote = argv.get[0] + "";

  try{
    client._checkRemote (remote);
  }catch (e){
    return notifyError (e.message);
  }
  
  var local = (argv.get[1] || remote) + "";
  
  //Check if local is a dir and prevent from starting a request
  fs.stat (local, function (error, stats){
    if (error){
      if (error.code !== "ENOENT") return notifyError (error.message);
    }else if (stats.isDirectory ()){
      return notifyError ("The local file is a directory");
    }
    
    filename = formatFilename (remote);
    
    var started;
    var bar;
    var noExtensionsTimer = null;
    
    read = {};
    
    read.gs = client.createGetStream (remote)
        .on ("error", function (error){
          if (bar) bar.cancel ();
          clearInterval (noExtensionsTimer);
          
          if (started) console.log ();
          
          read.ws.on ("close", function (){
            fs.unlink (local, function (){
              read = null;
              notifyError (error.message);
            });
          });
          read.ws.destroy ();
        })
        .on ("abort", function (){
          if (bar) bar.cancel ();
          clearInterval (noExtensionsTimer);
          
          if (read.error){
            //The error comes from the ws
            if (started) console.log ();
            
            fs.unlink (local, function (){
              var error = read.error;
              read = null;
              notifyError (error.message);
            });
          }else{
            read.ws.on ("close", function (){
              read = null;
              fs.unlink (local, again);
            });
            read.ws.destroy ();
          }
        })
        .on ("stats", function (stats){
          started = true;
          
          if (stats){
            bar = statusBar.create ({
              total: stats.size,
              render: renderStatusBar
            });
            this.pipe (bar);
          }else{
            //No extensions
            var dots = "...";
            var i = 1;
            noExtensionsTimer = setInterval (function (){
              i = i%4;
              process.stdout.clearLine ();
              process.stdout.cursorTo (0);
              process.stdout.write (dots.slice (0, i++));
            }, 200);
          }
        });
    
    read.ws = fs.createWriteStream (local)
        .on ("error", function (error){
          read.error = error;
          read.gs.abort ();
        })
        .on ("finish", function (){
          read = null;
          clearInterval (noExtensionsTimer);
          console.log ();
          rl.prompt ();
        });
    
    read.gs.pipe (read.ws);
  });
};

function put (argv){
  clearTimeout (timer);
  timer = null;
  
  var local = argv.put[0] + "";
  var remote = (argv.put[1] || path.basename (local)) + "";
  
  try{
    client._checkRemote (remote);
  }catch (e){
    return notifyError (e.message);
  }
  
  //Check if local is a dir or doesn't exist to prevent from starting a new
  //request
  fs.stat (local, function (error, stats){
    if (error) return notifyError (error.message);
    if (stats.isDirectory ()){
      return notifyError ("The local file is a directory");
    }
    
    filename = formatFilename (local);
    
    var bar = statusBar.create ({
      total: stats.size,
      render: renderStatusBar
    });
    
    write = {};
    
    write.rs = fs.createReadStream (local)
        .on ("error", function (error){
          write.error = error;
          write.ps.abort ();
        });
    
    write.ps = client.createPutStream (remote, { size: stats.size })
        .on ("error", function (error){
          if (bar) bar.cancel ();
          
          write.rs.on ("close", function (){
            write = null;
            notifyError (error.message);
          });
          write.rs.destroy ();
        })
        .on ("abort", function (){
          if (bar) bar.cancel ();
          
          if (write.error){
            //The error comes from the rs
            console.log ();
            var error = write.error;
            write = null;
            notifyError (error.message);
          }else{
            var rs = write.rs;
            rs.on ("close", again);
            rs.destroy ();
          }
        })
        .on ("finish", function (){
          write = null;
          console.log ();
          rl.prompt ();
        });
    
    write.rs.pipe (write.ps);
    write.rs.pipe (bar);
  });
};