#!/usr/bin/env node

"use strict";

var fs = require ("fs");
var path = require ("path");
var readLine = require ("readline");
var url = require ("url");
var argp = require ("argp");
var statusBar = require ("status-bar");
var ntftp = require ("../lib");
var normalizeFilename = require ("../lib/normalize-filename");
var errors = require ("../lib/protocol/errors");

var client;
var rl;
var timer;
var read;
var write;
var filename;

var renderStatusBar = function (stats){
  process.stdout.write (filename + " " + 
      this.format.storage (stats.currentSize) + " " +
      this.format.speed (stats.speed) + " " +
      this.format.time (stats.remainingTime) + " [" +
      this.format.progressBar (stats.percentage) + "] " +
      this.format.percentage (stats.percentage));
  process.stdout.cursorTo (0);
};

var formatFilename = function (filename){
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

var parseUri = function (uri){
  var o = url.parse (uri);
  if (o.protocol !== "tftp:"){
    return { error: new Error ("The protocol must be 'tftp'") };
  }
  if (!o.path){
    return { error: new Error ("Bad uri") };
  }
  var arr = o.path.slice (1).split (";mode=");
  if (arr[1] && arr[1] !== "octet"){
    return this.fail (new Error ("The transfer mode must be 'octet'"));
  }
  return {
    hostname: o.hostname,
    port: o.port,
    file: arr[0]
  };
};

var notifyError = function (error, prompt){
  console.error ("Error: " + error.message);
  if (prompt) rl.prompt ();
};

var again = function (){
  timer = setTimeout (function (){
    timer = null;
  }, 3000);
  
  console.log ("\n(^C again to quit)");
  rl.line = "";
  rl.prompt ();
};

var normalizeGetFiles = function (remote, local){
  remote += "";
  local = (local || remote) + "";
  
  try{
    remote = normalizeFilename (remote);
  }catch (error){
    throw error;
  }
  
  return {
    remote: remote,
    local: local
  };
};

var normalizePutFiles = function (local, remote){
  local += "";
  remote = (remote || path.basename (local)) + "";
  
  try{
    remote = normalizeFilename (remote);
  }catch (error){
    throw error;
  }
  
  return {
    remote: remote,
    local: local
  };
};

var setMainParserOptions = function (body){
  //The default values are set inside the lib
  body
      .option ({ short: "b", long: "blksize", metavar: "SIZE",
          type: Number, description: "Sets the blksize option. Valid range: " +
          "[8, 65464]. Default is 1468, the size before IP fragmentation in " +
          "Ethernet environments" })
      .option ({ short: "r", long: "retries", metavar: "NUM",
          type: Number, description: "Number of retries before aborting the " +
          "file transfer due to an unresponsive server or a massive packet " +
          "loss" })
      .option ({ short: "t", long: "timeout", metavar: "MILLISECONDS",
          type: Number, description: "Sets the timeout option. Default is " +
          "3000ms" })
      .option ({ short: "w", long: "windowsize", metavar: "SIZE",
          type: Number, description: "Sets the windowsize option. Valid " +
          "range: [1, 65535]. Default is 4" })
      .help ();
};

var setMainCommandBody = function (body){
  body
      .text ("RFC 3617 uri:")
      .text ("tftp://<hostname>[:<port>]/<remote>[;mode=<transfer_mode>]\n",
          "  ")
      .text ("Transfer mode:")
      .text ("The only supported mode is 'octet', that is, all the files are " +
          "assumed to be binary files, therefore the content is not " +
          "modified. Because the 'mode' parameter is optional it can just be " +
          "ignored.", "  ")
};

//Removing the module from the cache is not necessary because a second instance
//will be used during the whole program lifecycle
var main = argp.createParser ()
    .main ()
        .readPackage (__dirname + "/../package.json")
        .usages ([
          "ntftp [options] <host>[:<port>]",
          "ntftp get [options] <rfc3617_uri> [<local>]",
          "ntftp put [options] [<local>] <rfc3617_uri>",
        ])
        .allowUndefinedArguments ()
        .on ("argument", function (argv, argument, ignore){
          if (argv.server) this.fail ("Too many arguments");
          argument = argument.split (":");
          argv.server = {
            hostname: argument[0],
            port: argument[1]
          };
          ignore ();
        })
        .on ("end", function (argv){
          if (!argv.server) this.printHelp ();
          createClient (argv);
          createPrompt ();
        })
        .body ()
            .text ("By default, the client sends known de facto extensions " +
                "trying to achieve the best performance. If the server " +
                "doesn't support these extensions, it automatically " +
                "fallbacks to a pure RFC 1350 compliant TFTP client " +
                "implementation.\n")
            .text ("This utility can be used from a shell or with a command.")
            .text ("\nShell:")
            .text ("Arguments:", "  ")
            .columns ("    <host>[:<port>]", "The address and port of the " +
                "server, eg.\n$ ntftp localhost:1234.")
            .text ("\nOnce the shell is running, it shows a prompt and " +
                "recognizes the following commands:", "  ")
            .text ("get, put.", "    ")
            .text ("\n'<command> -h' for more information.", "  ")
            .text ("\nTo quit the program press ctrl-c two times.", "  ")
            .text ("\nExample:", "  ")
            .text ("$ ntftp localhost -w 2 --blksize 256", "    ")
            .text ("> get remote_file", "    ")
            .text ("> get remote_file local_file", "    ")
            .text ("> put path/to/local_file remote_file", "    ")
            .text ("\nCommands:")
            .text ("get, put.", "  ")
            .text ("\n'ntftp <command> -h' for more information.", "  ")
            .text ("\nOptions:");
setMainParserOptions (main);

var command = main
    .command ("get", { trailing: { min: 1, max: 2 } })
        .usages (["ntftp get [options] <rfc3617_uri> [<local>]"])
        .description ("GETs a file from the server")
        .on ("end", function (argv){
          var o = parseUri (argv.get[0] + "");
          if (o.error) return this.fail (o.error);
          
          try{
            var files = normalizeGetFiles (o.file, argv.get[1]);
          }catch (error){
            return this.fail (error);
          }
          
          argv.server = {
            hostname: o.hostname,
            port: o.port
          };
          
          createClient (argv);
          createPrompt (true);
          
          get (files.remote, files.local, function (error){
            if (error) notifyError (error);
            process.exit ();
          });
        })
        .body ();
setMainCommandBody (command);
command
    .text ("\nExample:")
    .text ("$ ntftp get -w 2 tftp://localhost/file\n", "  ")
    .text ("GETs a file named 'file' from the server in 'octet' mode with " +
        "a window size of 2.", "    ")
    .text ("\nOptions:")
setMainParserOptions (command);

var command = main
    .command ("put", { trailing: { min: 1, max: 2 } })
        .usages (["ntftp put [options] [<local>] <rfc3617_uri>"])
        .description ("PUTs a file into the server")
        .on ("end", function (argv){
          var o = parseUri (argv.put[argv.put.length - 1] + "");
          if (o.error) return this.fail (o.error);
          
          try{
            var files = normalizePutFiles (
                argv.put.length === 1 ? o.file : argv.put[0], o.file);
          }catch (error){
            return this.fail (error);
          }
          
          argv.server = {
            hostname: o.hostname,
            port: o.port
          };
          
          createClient (argv);
          createPrompt (true);
          
          put (files.local, files.remote, function (error){
            if (error) notifyError (error);
            process.exit ();
          });
        })
        .body ();
setMainCommandBody (command);
command
    .text ("\nExample:")
    .text ("$ ntftp put tftp://localhost/file\n", "  ")
    .text ("PUTs a file named 'file' into the server in 'octet' mode.", "    ")
    .text ("\nOptions:")
setMainParserOptions (command);

//Start parsing
main.argv ();

//Free the parsers
main = command = null;

function createCommandParser (){
  return argp.createParser ()
      .main ()
          //Don't produce errors when undefined arguments and options are
          //introduced, they are simply ignored because anyway if the end event
          //is executed it will fail
          .allowUndefinedArguments ()
          .allowUndefinedOptions ()
          .on ("end", function (){
            notifyError (new Error ("Invalid command ('get' or 'put')"), true);
          })
          .on ("error", function (error){
            notifyError (error, true);
          })
      .command ("get", { trailing: { min: 1, max: 2 } })
          .usages (["get [options] <remote> [<local>]"])
          .description ("GETs a file from the server")
          .on ("option", function (argv, option, value, long, ignore){
            //Capture the help option because the prompt needs to be displayed
            //after the help message
            if (this.options ({
              short: !long,
              long: long
            })[option].id === "help"){
              this.printHelp ();
              ignore ();
              rl.prompt ();
            }
          })
          .on ("end", function (argv){
            try{
              var files = normalizeGetFiles (argv.get[0], argv.get[1]);
            }catch (error){
              return notifyError (error, true);
            }
          
            get (files.remote, files.local, function (error, abort){
              if (error) return notifyError (error, true);
              if (abort){
                again ();
              }else{
                rl.prompt ();
              }
            });
          })
          .on ("error", function (error){
            notifyError (error, true);
          })
          .body ()
              .text ("Options:")
              .help ()
      .command ("put", { trailing: { min: 1, max: 2 } })
          .usages (["put [options] <local> [<remote>]"])
          .description ("PUTs a file into the server")
          .on ("option", function (argv, option, value, long, ignore){
            //Capture the help option because the prompt needs to be displayed
            //after the help message
            if (this.options ({
              short: !long,
              long: long
            })[option].id === "help"){
              this.printHelp ();
              ignore ();
              rl.prompt ();
            }
          })
          .on ("end", function (argv){
            try{
              var files = normalizePutFiles (argv.put[0], argv.put[1]);
            }catch (error){
              return notifyError (error, true);
            }
          
            put (files.local, files.remote, function (error, abort){
              if (error) return notifyError (error, true);
              if (abort){
                again ();
              }else{
                rl.prompt ();
              }
            });
          })
          .on ("error", function (error){
            notifyError (error, true);
          })
          .body ()
              .text ("Options:")
              .help ();
  
  return parser;
};

function createClient (argv){
  client = ntftp.createClient ({
    hostname: argv.server.hostname,
    port: argv.server.port,
    blockSize: argv.blksize,
    retries: argv.retries,
    timeout: argv.timeout,
    windowSize: argv.windowsize
  });
};

function createPrompt (onlySigint){
  if (onlySigint){
    rl = readLine.createInterface ({
      input: process.stdin,
      output: process.stdout,
    });
    rl.on ("SIGINT", function (){
      //Abort the current transfer
      if (read){
        read.gs.abort ();
      }else if (write){
        write.ps.abort ();
      }else{
        process.exit ();
      }
    });
    return;
  }

  var parser = createCommandParser ();
  
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
    if (timer){
      console.log ();
      process.exit ();
    }
    
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

function get (remote, local, cb){
  clearTimeout (timer);
  timer = null;
  
  //Check if local is a dir and prevent from starting a request
  fs.stat (local, function (error, stats){
    if (error){
      if (error.code !== "ENOENT") return cb (error);
    }else if (stats.isDirectory ()){
      return cb (new Error ("The local file is a directory"));
    }
    
    filename = formatFilename (remote);
    
    var started = false;
    var bar = null;
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
              cb (error);
            });
          });
          read.ws.destroy ();
        })
        .on ("abort", function (){
          if (bar) bar.cancel ();
          clearInterval (noExtensionsTimer);
          
          if (started) console.log ();
          
          if (read.error){
            //The error comes from the ws
            fs.unlink (local, function (){
              var error = read.error;
              read = null;
              cb (error);
            });
          }else{
            read.ws.on ("close", function (){
              read = null;
              fs.unlink (local, function (){
                cb ();
              });
            });
            read.ws.destroy ();
          }
        })
        .on ("stats", function (stats){
          started = true;
          
          if (stats.size !== null){
            bar = statusBar.create ({
              total: stats.size,
              render: renderStatusBar
            });
            this.pipe (bar);
          }else{
            //The server doesn't support extensions
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
          read.gs.abort (errors.EIO);
        })
        .on ("finish", function (){
          read = null;
          clearInterval (noExtensionsTimer);
          console.log ();
          cb ();
        });
    
    read.gs.pipe (read.ws);
  });
};

function put (local, remote, cb){
  clearTimeout (timer);
  timer = null;
  
  //Check if local is a dir or doesn't exist to prevent from starting a new
  //request
  fs.stat (local, function (error, stats){
    if (error) return cb (error);
    if (stats.isDirectory ()){
      return cb (new Error ("The local file is a directory"));
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
          write.ps.abort (errors.EIO);
        });
    
    write.ps = client.createPutStream (remote, { size: stats.size })
        .on ("error", function (error){
          if (bar) bar.cancel ();
          
          console.log ();
          
          write.rs.on ("close", function (){
            write = null;
            cb (error);
          });
          write.rs.destroy ();
        })
        .on ("abort", function (){
          if (bar) bar.cancel ();
          console.log ();
          
          if (write.error){
            //The error comes from the rs
            var error = write.error;
            write = null;
            cb (error);
          }else{
            var rs = write.rs;
            rs.on ("close", cb);
            rs.destroy ();
          }
        })
        .on ("finish", function (){
          write = null;
          console.log ();
          cb ();
        });
    
    write.rs.pipe (write.ps);
    write.rs.pipe (bar);
  });
};