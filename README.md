ntftp
=====

#### Streaming TFTP client ####

[![NPM version](https://badge.fury.io/js/ntftp.png)](http://badge.fury.io/js/ntftp "Fury Version Badge")
[![Dependency Status](https://david-dm.org/gagle/node-ntftp.png)](https://david-dm.org/gagle/node-ntftp "David Dependency Manager Badge")

[![NPM installation](https://nodei.co/npm/ntftp.png?mini=true)](https://nodei.co/npm/ntftp "NodeICO Badge")

### WARNING ###

The implementation is practically done, you can GET and PUT files correctly. However, the timeout retransmissions and some minor fixes need to be done, so don't use it in production or development, just for testing purposes. It will be usable when it reaches the version 0.1.0.

---

Full-featured streaming TFTP client. It supports most of the RFCs:

- [1350 - The TFTP protocol](http://www.ietf.org/rfc/rfc1350.txt) ✓
- [2347 - Option extension](http://www.ietf.org/rfc/rfc2347.txt) ✓
- [2348 - Blocksize option](http://www.ietf.org/rfc/rfc2348.txt) ✓
- [2349 - Timeout Interval and Transfer Size Options](http://www.ietf.org/rfc/rfc2349.txt) ✓
- [2090 - Multicast option](http://www.ietf.org/rfc/rfc2090.txt) ✗
- [3617 - Uniform Resource Identifier (URI)](http://www.ietf.org/rfc/rfc3617.txt) ✓
- [De facto (draft) - Windowsize option](http://www.ietf.org/id/draft-masotta-tftpexts-windowsize-opt-08.txt) ✓
- [De facto - Rollover option](http://www.compuphase.com/tftp.htm) ✓
- `netascii` transfer mode ✗

Per se, the TFTP is a lock-step protocol built on top of UDP for transferring files between two machines. It was useful in the past but nowadays it's practically an obsolete legacy protocol useful in a very few scenarios. Without the  extensions support, the RFC says that a file bigger than 32MB cannot be sent. This limit can be incremented to 91.74MB if both machines agree to use a block size of 1468 bytes, the MTU size before IP fragmentation in Ethernet networks. Also, the transfer speed is pretty slow due to the lock-step mechanism, one ack for each packet.

However, there are two de facto extensions that can boost the TFTP transfer speed achieving good speeds with an unlimited file size: the rollover and the window size.

This module it's perfectly integrated with Node.js, providing an streaming interface for GETting and PUTing files very easily. No configuration is needed. By default the client tries to negotiate with the server the best possible configuration. If that's not possible it simply fallbacks to the original lock-step TFTP implementation.

It can be installed locally to use it programmatically, but it can be also installed globally and used directly from the console.

#### Quick example ####

```javascript
var ntftp = require ("ntftp");

var client = ntftp.createClient ({
  hostname: "localhost"
});

client.get ("remote-file", "local-file", function (error){
  if (error) return console.error (error);
  ...
});

client.put ("local-file", "remote-file", function (error){
  if (error) return console.error (error);
  ...
});
```

#### Streams ####

For the sake of simplicity the following examples handle the errors partially. See [streams.js](https://github.com/gagle/node-ntftp/blob/master/examples/streams.js) or the [source code](https://github.com/gagle/node-ntftp/blob/master/lib/client.js) of the [get()](#client-get) and [put()](#client-put) for more information.

__GET remote -> local__

```javascript
var get = client.createGetStream ("remote-file")
    .on ("error", function (error){
      write.destroy ();
    });

var write = fs.createWriteStream ("local-file")
    .on ("error", function (error){
      get.abort ();
    });

get.pipe (write);
```

__PUT local -> remote__

```javascript
var read = fs.createReadStream ("local-file")
    .on ("error", function (error){
      put.abort ();
    });
		
var put = client.createPutStream ("remote-file", { size: ... })
    .on ("error", function (error){
      read.destroy ();
    });

read.pipe (put);
```

#### Global installation ####

```
npm install ntftp -g
```

Then you can access to the `ntftp` binary.

There basically two ways to use it: with or without a shell.

__Without a shell__

Best for individual transfers.

```
$ ntftp get [options] <rfc3617_uri> [<local>]
$ ntftp put [options] [<local>] <rfc3617_uri>
```

For example:

```
$ ntftp get tftp://localhost/remote-file
remote-file             42.2 MiB   32.6M/s 00:12 [###·····················]  13%
```

```
$ ntftp put my/local-file tftp://localhost/remote-file
my/local-file          148.8 MiB   30.9M/s 00:07 [###########·············]  45%
```

For more information type `ntftp get|put -h`.

__With a shell__

Best for multiple transfers, basically because the same server address and options are reused.

```
$ ntftp [options] <host>[:<port>]
```

For example:

```
$ ntftp localhost
> get remote-file
remote-file             42.2 MiB   32.6M/s 00:12 [###·····················]  13%
> put my/local-file remote-file
my/local-file          148.8 MiB   30.9M/s 00:07 [###########·············]  45%
```

For more information type `ntftp -h` and `get|put -h`.