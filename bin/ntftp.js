#!/usr/bin/env node

"use strict";

var fs = require ("fs");
var readLine = require ("readline");
var argp = require ("argp");
var statusBar = require ("status-bar");
var ntftp = require ("../lib");

var client;
var rl;
var timer;
var read;
var write;

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
            "extension. Valid range: [1, 65535]. Default is 64"})
        
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
      
    }else{
      again ();
    }
  });
  rl.prompt ();
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

function get (argv){
  clearTimeout (timer);
  timer = null;

  try{
    client._checkRemote (argv.get[0]);
  }catch (e){
    return notifyError (e.message);
  }
  
  var local = argv.get[1] || argv.get[0];
  
  //Check if local is a dir and prevent from starting a request
  fs.stat (local, function (error, stats){
    if (error){
      if (error.code !== "ENOENT") return notifyError (error.message);
    }else if (stats.isDirectory ()){
      return notifyError ("The local file is a directory");
    }
    
    read = {};
    read.local = local;
    
    read.ws = fs.createWriteStream (read.local)
        .on ("error", function (error){
          if (bar) bar.clearInterval ();
          clearInterval (noExtensionsTimer);
          
          console.log ();
          
          read.gs.on ("abort", function (){
            read = null;
            fs.unlink (local, function (){
              notifyError (error.message);
            });
          });
          read.gs.abort ();
        })
        .on ("finish", function (){
          read = null;
          clearInterval (noExtensionsTimer);
          console.log ();
          rl.prompt ();
        });
        
    var bar;
    var filename = formatFilename (argv.get[0]);
    var noExtensionsTimer = null;
    
    read.gs = client.createGetStream (argv.get[0]);
    read.gs
        .on ("error", function (error){
          if (bar) bar.clearInterval ();
          clearInterval (noExtensionsTimer);
          
          console.log ();
          
          read.ws.on ("close", function (){
            fs.unlink (read.local, function (){
              read = null;
              notifyError (error.message);
            });
          });
          read.ws.destroy ();
        })
        .on ("abort", function (){
          if (bar) bar.clearInterval ();
          clearInterval (noExtensionsTimer);
          
          read.ws.on ("close", function (){
            var local = read.local;
            read = null;
            fs.unlink (local, again);
          });
          read.ws.destroy ();
        })
        .on ("no-extensions", function (){
          var dots = "...";
          var i = 1;
          noExtensionsTimer = setInterval (function (){
            i = i%4;
            process.stdout.clearLine ();
            process.stdout.cursorTo (0);
            process.stdout.write (dots.slice (0, i++));
          }, 200);
        })
        .on ("size", function (size){
          bar = statusBar.create ({
            total: size,
            frequency: 200,
            write: function (){
              process.stdout.write (filename + " " + this.stats.size + " " +
                  this.stats.speed + " " + this.stats.eta + " [" +
                  this.stats.progress + "] " + this.stats.percentage);
              process.stdout.cursorTo (0);
            }
          });
          this.pipe (bar);
        })
        .pipe (read.ws);
  });
};

function put (argv){
  clearTimeout (timer);
  timer = null;
  
  write = {};
  
  
};