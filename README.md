tftp
====

#### Streaming TFTP client and Server ####

[![NPM version](https://badge.fury.io/js/tftp.png)](http://badge.fury.io/js/tftp "Fury Version Badge")
[![Dependency Status](https://david-dm.org/gagle/node-tftp.png)](https://david-dm.org/gagle/node-tftp "David Dependency Manager Badge")

[![NPM installation](https://nodei.co/npm/tftp.png?mini=true)](https://nodei.co/npm/tftp "NodeICO Badge")

### WARNING ###

The implementation it's already done, you can GET and PUT files correctly. However, some optimizations must still be done, so for your safety don't use it in production or development, just for testing purposes. It will be ready when it reaches the version 0.1.0.

The server is currently not implemented.

---

Full-featured streaming TFTP client and server. It supports most of the RFCs:

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

However, there are two de facto extensions that can boost the TFTP transfer speed and remove the size limit: the rollover and the window.

This module it's perfectly integrated with Node.js, providing an streaming interface for GETting and PUTing files very easily. No configuration is needed. By default the client tries to negotiate with the server the best possible configuration. If that's not possible it simply fallbacks to the original lock-step TFTP implementation.

It can be installed locally and use it programmatically, but it can be also installed globally and used directly from the console as a CLI utility.

#### Quick example ####

```javascript
var tftp = require ("tftp");

var client = tftp.createClient ({
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

#### Special thanks ####

Patrick Masotta (author of the [Serva](http://www.vercot.com/~serva/) application and the internet draft about the `windowsize` option).

#### Documentation ####

- [Warning! UDP packet loss in Windows](#udploss)
- [Streams](#streams)
- [Global installation](#global)

#### Functions ####

- [_module_.createClient(options) : Client](#createclient)

#### Objects ####

- [Client](#client)

---

<a name="udploss"></a>
__Warning! UDP packet loss in Windows__

Currently, in Windows there is a problem concerning the buffering of the received network packets ([#6696](https://github.com/joyent/node/issues/6696)). Basically, when the buffer is full, all the subsequent incoming packets are dropped, so they are never consumed by Node.js. This scenario can be reproduced by configuring a window bigger than 6 blocks with the default block size. So the advice is: do NOT increment the default window size (4) in the Windows platform until this bug is solved.

---

<a name="streams"></a>
__Streams__

For the sake of simplicity the following examples omit the error handlind. See [streams.js](https://github.com/gagle/node-tftp/blob/master/examples/streams.js) or the [source code](https://github.com/gagle/node-tftp/blob/master/lib/client.js) of the [get()](#client-get) and [put()](#client-put) functions for more information.

__GET remote → local__

```javascript
var get = client.createGetStream ("remote-file");
var write = fs.createWriteStream ("local-file");

get.pipe (write);
```

__PUT local → remote__

```javascript
var localFile = fs.createReadStream ("local-file");
var read = client.createPutStream ("remote-file", { size: totalSize });

read.pipe (put);
```

---

<a name="global"></a>
__Global installation__

```
npm install ntftp -g
```

Then you can access to the `ntftp` binary.

There are basically two ways to use it: with or without a shell.

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

---

<a name="createclient"></a>
___module_.createClient(options) : Client__

---

<a name="client"></a>
__Client__

__Methods__

- [Client#createGetStream(remoteFile[, options]) : ReadStream](#client_creategetstream)
- [Client#createPutStream(remoteFile, options) : WriteStream](#client_createputstream)
- [Client#get(remoteFile[, localFile][, options], callback) : undefined](#client_get)
- [Client#put(localFile[, remoteFile], callback) : undefined](#client_put)

<a name="client_creategetstream"></a>
__Client#createGetStream(remoteFile[, options]) : ReadStream__



<a name="client_createputstream"></a>
__Client#createPutStream(remoteFile, options) : WriteStream__



<a name="client_get"></a>
__Client#get(remoteFile[, localFile][, options], callback) : undefined__



<a name="client_put"></a>
__Client#put(localFile[, remoteFile], callback) : undefined__

