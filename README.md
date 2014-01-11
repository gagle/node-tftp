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
- `mail` and `netascii` transfer modes ✗

Per se, the TFTP is a lock-step protocol built on top of UDP for transferring files between two machines. It was useful in the past but nowadays it's practically an obsolete legacy protocol useful in a very few scenarios. Without the  extensions support, the RFC says that a file bigger than 32MB cannot be sent. This limit can be incremented to 91.74MB if both machines agree to use a block size of 1468 bytes, the MTU size before IP fragmentation in Ethernet networks. Also, the transfer speed is pretty slow due to the lock-step mechanism, one acknowledgement for each packet.

However, there are two de facto extensions that can boost the transfer speed and remove the size limit: the rollover and the window.

This module it's perfectly integrated with Node.js, providing an streaming interface for GETting and PUTing files very easily. No configuration is needed. By default the client tries to negotiate with the server the best possible configuration. If that's not possible it simply fallbacks to the original lock-step TFTP implementation.

It can be installed locally and use it programmatically, but it can be also installed globally and used directly from the console as a CLI utility.

#### Quick example ####

```javascript
var tftp = require ("tftp");

var client = tftp.createClient ();

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

- [_module_.createClient([options]) : Client](#createclient)

#### Objects ####

- [Client](#client)
- [GetStream](#getstream)
- [PutStream](#putstream)

---

<a name="udploss"></a>
__Warning! UDP packet loss in Windows__

Currently, in Windows there is a problem concerning the buffering of the received network packets ([#6696](https://github.com/joyent/node/issues/6696)). Basically, when the buffer is full, all the subsequent incoming packets are dropped, so they are never consumed by Node.js. This scenario can be reproduced by configuring a window bigger than 6 blocks with the default block size. So the advice is: do NOT increment the default window size (4) in the Windows platform until this bug is solved.

---

<a name="streams"></a>
__Streams__

For the sake of simplicity the following examples omit the error handling. See the [streams.js](https://github.com/gagle/node-tftp/blob/master/examples/streams.js) example or the [source code](https://github.com/gagle/node-tftp/blob/master/lib/client.js) of the [get()](#client-get) and [put()](#client-put) functions for more information.

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
npm install tftp -g
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
___module_.createClient([options]) : Client__

Returns a new [Client](#client) instance.

```javascript
var client = tftp.createClient ({
  hostname: "10.10.10.10",
  port: 1234
});
```

Options:

- __hostname__ - _String_  
  The hostname. Default is `localhost`.
- __port__ - _Number_  
  The port number. Default is 69.
- __blockSize__ - _Number_  
  The size of the DATA blocks. Valid range: [8, 65464]. Default is 1468, the MTU size before IP fragmentation in Ethernet networks.
- __windowSize__ - _Number_  
  The size of each window. The window size means the number of blocks that can be sent/received without waiting an acknowledgement. Valid range: [1, 65535]. Default is 4.

  Comparison of transfer times:
  
  <table>
    <tr><th>Window size</th><th>Improvement</th></tr>
    <tr><td>1</td><td>-0%</td></tr>
    <tr><td>2</td><td>-49%</td></tr>
    <tr><td>3</td><td>-64%</td></tr>
    <tr><td>4</td><td>-70%</td></tr>
    <tr><td>5</td><td>-73%</td></tr>
    <tr><td>6</td><td>-76%</td></tr>
  </table>
  
  Take into account that with a bigger window more elements must be sorted (remember that UDP doesn't sort the incoming packets). This doesn't slow down the transfer very much but instead it requires more CPU. A window size of 4 is a good trade between speed and CPU usage.
  
  Right now a window size of 6 is the maximum in Windows due to the [packet loss](#udploss). With a window size of 7 or greater a lot of timeouts and retransmissions begin to occur, so the recommendation is to use a window size of 4, the default value.
- __retries__ - _Number_  
  How many retries must be done before emitting an error. Default is 3.
- __timeout__ - _Number_  
  Milliseconds to wait before a retry. Default is 3000.
  
---

<a name="client"></a>
__Client__

Each of the following methods takes an `options` parameter. One option available is `userExtensions`, an object with properties to send along with a GET or PUT operation. For example:

```javascript
var options = {
  userExtensions: {
    foo: "bar",
    num: 2
  }
}
```
  
The server may ignore or not these extensions, this feature is server-dependent. Please note that the TFTP algorithm cannot be modified, these extensions must be related with something else. For example, you can implement a basic authentication; the client could send the extensions `user` and `password` and the server could validate the user and accept or deny the request. The extensions are transmitted in plain text.
  
The extensions `timeout`, `tsize`, `blksize`, `windowsize` and `rollover` are reserved and cannot be used.

__Methods__

- [Client#createGetStream(remoteFile[, options]) : GetStream](#client_creategetstream)
- [Client#createPutStream(remoteFile, options) : PutStream](#client_createputstream)
- [Client#get(remoteFile[, localFile][, options], callback) : undefined](#client_get)
- [Client#put(localFile[, remoteFile][, options], callback) : undefined](#client_put)

<a name="client_creategetstream"></a>
__Client#createGetStream(remoteFile[, options]) : GetStream__

Returns a new [GetStream](#getstream_putstream) instance.

Options:

- __md5sum__ - _String_  
  MD5 sum for validating the integrity of the file.
- __sha1sum__ - _String_  
  SHA1 sum for validating the integrity of the file.
- __userExtensions__ - _Object_  
  Custom extensions to send with the request. [More information](#client).

```javascript
var get = client.createGetStream ("file");
```

<a name="client_createputstream"></a>
__Client#createPutStream(remoteFile, options) : PutStream__

Returns a new [PutStream](#getstream_putstream) instance.

Options:

- __size__ - _String_  
  Total size of the file to upload. This option is required.
- __userExtensions__ - _Object_  
  Custom extensions to send with the request. [More information](#client).

```javascript
var put = client.createPutStream ("file", { size: 1234 });
```

<a name="client_get"></a>
__Client#get(remoteFile[, localFile][, options], callback) : undefined__

Downloads a file from the server. If the local filename is missing the filename of the remote file is used.

Options:

- __md5sum__ - _String_  
  MD5 sum for validating the integrity of the file.
- __sha1sum__ - _String_  
  SHA1 sum for validating the integrity of the file.
- __userExtensions__ - _Object_  
  Custom extensions to send with the request. [More information](#client).

```javascript
//tftp://<hostname>/file -> file
client.get ("file", function (error){
  if (error) return console.error (error);
  ...
});
```

<a name="client_put"></a>
__Client#put(localFile[, remoteFile][, options], callback) : undefined__

Uploads a file to the server. If the remote filename is missing the filename of the local file is used.

Options:

- __userExtensions__ - _Object_  
  Custom extensions to send with the request. [More information](#client).

```javascript
//file -> tftp://<hostname>/file
client.put ("file", function (error){
  if (error) return console.error (error);
  ...
});
```

---

<a name="getstream_putstream"></a>
__GetStream and PutStream__

The GetStream inherites from a Readable stream and the PutStream from a Writable stream. They have all the events and methods that can be found in the Readable and Writable streams, but they also define two more events and one more method.

__Events__

- [abort](#event_abort)
- [stats](#event_stats)

__Methods__

- [abort() : undefined](#getstream_putstream_abort)

---

<a name="event_abort"></a>
__abort__

Emitted when [abort()](getstream_putstream_abort) is called and the transfer has been aborted.

<a name="event_stats"></a>
__stats__

Emitted after the client negotiates the best possible configuration. When it is emitted the transfer still hasn't begun. It returns an object similar to this:

```
{
  blockSize: 1468,
  size: 105757295,
  windowSize: 4,
  userExtensions: null,
  timeout: 3000,
  localSocket: { address: "0.0.0.0", port: 58406 },
  remoteSocket: { address: "127.0.0.1", port: 58407 },
  file: "file",
  retries: 3
}
```

When the GetStream emits a `stats` event, the `size` property is not guaranteed to be a Number because the server may not implement all the RFCs. The size of the file is obtained during the negotiation but not all the servers are able to negotiate. In these cases the `size` is null.

The `userExtensions` property holds an object with the custom extensions sent by the server in response to the custom extensions sent in the request. Most of the TFTP servers with a GUI don't let you respond with custom extensions when in fact this is a feature explained in the RFCs, so unless the TFTP server allows you to respond with custom extensions, this property will be always null.

---

<a name="getstream_putstream_abort"></a>
__abort() : undefined__

Aborts the current transfer and emits an `abort` event.