tftp
====

#### Streaming TFTP client and server ####

[![NPM version](https://badge.fury.io/js/tftp.png)](http://badge.fury.io/js/tftp "Fury Version Badge")
[![Dependency Status](https://david-dm.org/gagle/node-tftp.png)](https://david-dm.org/gagle/node-tftp "David Dependency Manager Badge")

[![NPM installation](https://nodei.co/npm/tftp.png?mini=true)](https://nodei.co/npm/tftp "NodeICO Badge")

Full-featured streaming TFTP client and server. It supports most of the RFCs:

- [1350 - The TFTP protocol](http://www.ietf.org/rfc/rfc1350.txt) ✓
- [2347 - Option extension](http://www.ietf.org/rfc/rfc2347.txt) ✓
- [2348 - Blocksize option](http://www.ietf.org/rfc/rfc2348.txt) ✓
- [2349 - Timeout Interval and Transfer Size Options](http://www.ietf.org/rfc/rfc2349.txt) ✓
- [2090 - Multicast option](http://www.ietf.org/rfc/rfc2090.txt) ✗
- [3617 - Uniform Resource Identifier (URI)](http://www.ietf.org/rfc/rfc3617.txt) ✓
- [7440 - Windowsize option](https://tools.ietf.org/rfc/rfc7440.txt) ✓
- [De facto - Rollover option](http://www.compuphase.com/tftp.htm) ✓
- `mail` and `netascii` transfer modes ✗

[CLIENT](#client) | [SERVER](#server) | [Error codes](#error_codes)

Per se, the TFTP is a lock-step protocol built on top of UDP for transferring files between two machines. It was useful in the past but nowadays it's practically an obsolete legacy protocol useful in a very few scenarios. Without the extensions support, the RFC says that a file bigger than 32MB cannot be transferred. This limit can be incremented to 91.74MB if both machines agree to use a block size of 1468 bytes, the MTU size before IP fragmentation in Ethernet networks. Also, the transfer speed is pretty slow due to the lock-step mechanism, one acknowledgement for each packet.

However, there are two de facto extensions that can boost the transfer speed and remove the size limit: the rollover and the window.

This module it's perfectly integrated with Node.js, providing an streaming interface for GETting and PUTing files very easily. No configuration is needed. By default the client tries to negotiate with the server the best possible configuration. If that's not possible it simply fallbacks to the original lock-step TFTP implementation. The server also supports both the enhanced features and the classic lock-step RFCs.

It can be installed locally and used programmatically, but it can be also installed globally and used directly from the console as a CLI utility.

#### Special thanks ####

Patrick Masotta (author of the [Serva](http://www.vercot.com/~serva/) application and the internet draft about the `windowsize` option).

#### Local environment vs Internet ####

TFTP runs over UDP, this means that the network packets could be lost before reaching the other side. In local controlled scenarios, the TFTP can be used in a very few cases, but don't pretend to use it over the Internet, use FTP instead. It simply doesn't work because the packets are lost with an amazing ease.

TFTP is a bad protocol for transferring files because it adds some of features that TCP offers (ack's, retransmission, error detection, reordering, etc.) to the UDP but at the applicaction layer (slower!). Think why you need to use TFTP instead of FTP. In most of the cases you can use FTP and obtain better results.

<a name="udploss"></a>
#### Warning! UDP packet loss in Windows ####

Currently, in Windows there is a problem concerning the buffering of the received network packets ([#6696](https://github.com/joyent/node/issues/6696)). Basically, when the buffer is full, all the subsequent incoming packets are dropped, so they are never consumed by Node.js. This scenario can be reproduced by configuring a window bigger than 6 blocks with the default block size. So the advice is: do NOT increment the default window size (4) in the Windows platform until this bug is solved.

---

### CLIENT ###

[_module_.createClient([options]) : Client](#createclient)

#### Documentation ####

- [Streams](#client_streams)
- [Global installation](#client_global)

#### Objects ####

- [Client](#client_object)
- [GetStream and PutStream](#client_getstream_putstream)

---

<a name="client_streams"></a>
__Streams__

For the sake of simplicity the following examples omit the error handling. See the [streams.js](https://github.com/gagle/node-tftp/blob/master/examples/client/streams.js) example or the [source code](https://github.com/gagle/node-tftp/blob/master/lib/client.js) of the [get()](#client-get) and [put()](#client-put) functions for more information.

__GET remote > local__

```javascript
var get = client.createGetStream ("remote-file");
var write = fs.createWriteStream ("local-file");

get.pipe (write);
```

__PUT local > remote__

```javascript
var read = fs.createReadStream ("local-file");
var put = client.createPutStream ("remote-file", { size: totalSize });

read.pipe (put);
```

---

<a name="client_global"></a>
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

Returns a new [Client](#client_object) instance.

```javascript
var client = tftp.createClient ({
  host: "10.10.10.10",
  port: 1234
});
```

Options:

- __host__ - _String_
  The address. Both IPv4 and IPv6 are allowed as well as a domain name. Default is `localhost` (`127.0.0.1`).
- __port__ - _Number_
  The port. Default is 69.
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

  Take into account that with a bigger window more elements must be reordered (remember that UDP doesn't reorder the incoming packets). This doesn't slow down the transfer speed very much but it requires more CPU. A window size of 4 is a good trade between transfer speed and CPU usage.

  Right now a window size of 6 is the maximum in Windows due to the [packet loss](#udploss) issue. With a window size of 7 or greater a lot of timeouts and retransmissions begin to occur, so the recommendation is to use a window size of 4, the default value.
- __retries__ - _Number_
  How many retries must be done before emitting an error. Default is 3.
- __timeout__ - _Number_
  Milliseconds to wait before a retry. Default is 3000.

---

<a name="client_object"></a>
__Client__

Each of the following methods take an `options` parameter. One option available is `userExtensions`, an object with properties that can be sent with a GET or PUT operation. For example:

```javascript
var options = {
  userExtensions: {
    foo: "bar",
    num: 2
  }
};

client.get ("file", options, function (){ ... });
client.put ("file", options, function (){ ... });
client.createGetStream ("file", options);
client.createPutStream ("file", options);
```

The server may ignore or not these extensions. This feature is server-dependent. Please note that the TFTP algorithm cannot be modified. For example, you can implement a basic authentication; the client could send the extensions `user` and `password` and the server could validate the user and accept or deny the request. The extensions are transmitted in plain text.

The extensions `timeout`, `tsize`, `blksize`, `windowsize` and `rollover` are reserved and cannot be used.

__Methods__

- [Client#createGetStream(remoteFile[, options]) : GetStream](#client_creategetstream)
- [Client#createPutStream(remoteFile, options) : PutStream](#client_createputstream)
- [Client#get(remoteFile[, localFile][, options], callback) : undefined](#client_get)
- [Client#put(localFile[, remoteFile][, options], callback) : undefined](#client_put)

<a name="client_creategetstream"></a>
__Client#createGetStream(remoteFile[, options]) : GetStream__

Returns a new [GetStream](#client_getstream_putstream) instance.

Options:

- __md5__ - _String_
  MD5 sum for validating the integrity of the file.
- __sha1__ - _String_
  SHA1 sum for validating the integrity of the file.
- __userExtensions__ - _Object_
  Custom extensions to send with the request. [More information](#client_object).

```javascript
var get = client.createGetStream ("file");
```

<a name="client_createputstream"></a>
__Client#createPutStream(remoteFile, options) : PutStream__

Returns a new [PutStream](#client_getstream_putstream) instance.

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

Downloads a file from the server. If the local filename is missing, the basename of the remote file is used.

Options:

- __md5__ - _String_
  MD5 sum for validating the integrity of the file.
- __sha1__ - _String_
  SHA1 sum for validating the integrity of the file.
- __userExtensions__ - _Object_
  Custom extensions to send with the request. [More information](#client).

```javascript
//tftp://<host>/dir/to/remote-file -> ./file
client.get ("dir/to/remote-file", function (error){
  if (error) return console.error (error);
  ...
});
```

<a name="client_put"></a>
__Client#put(localFile[, remoteFile][, options], callback) : undefined__

Uploads a file to the server. If the remote filename is missing the basename of the local file is used.

Options:

- __userExtensions__ - _Object_
  Custom extensions to send with the request. [More information](#client).

```javascript
//./dir/to/local-file -> tftp://<host>/file
client.put ("dir/to/local-file", function (error){
  if (error) return console.error (error);
  ...
});
```

---

<a name="client_getstream_putstream"></a>
__GetStream and PutStream__

The GetStream inherits from a Readable stream and the PutStream from a Writable stream.

__Events__

- [abort](#client_event_abort)
- [close](#client_event_close)
- [end](#client_event_end)
- [error](#client_event_error)
- [finish](#client_event_finish)
- [stats](#client_event_stats)

__Methods__

- [abort([error]) : undefined](#client_getstream_putstream_abort)
- [close() : undefined](#client_getstream_putstream_close)

---

<a name="client_event_abort"></a>
__abort__

Arguments: none.

Emitted when the transfer has been aborted after calling to [abort()](#client_getstream_putstream_abort).

<a name="client_event_close"></a>
__close__

Arguments: none.

Emitted when the underlying socket has been closed. It is emitted __always__ and before any other event (`error`, `abort`, `end` and `finish`).

<a name="client_event_end"></a>
__end__

Arguments: none.

Emitted by the GetStream when the file download finishes.

<a name="client_event_error"></a>
__error__

Arguments: `error`.

Emitted when an error occurs. The stream is closed automatically.

<a name="client_event_finish"></a>
__finish__

Arguments: none.

Emitted by the PutStream when the file upload finishes.

<a name="client_event_stats"></a>
__stats__

Arguments: `stats`.

Emitted after the client has negotiated the best possible configuration. When it is emitted, the file transfer still hasn't begun.

`stats` is an object similar to this:

```
{
  blockSize: 1468,
  windowSize: 4,
  size: 105757295,
  userExtensions: {},
  retries: 3,
  timeout: 3000,
  localAddress: "0.0.0.0",
  localPort: 55146,
  remoteAddress: "127.0.0.1",
  remotePort: 55147
}
```

When the GetStream emits a `stats` event, the `size` property is not guaranteed to be a Number because the server may not implement the RFC related with file size. The size of the file is obtained during the negotiation but not all the servers are able to negotiate. In these cases the `size` is null.

The `userExtensions` property holds an object with the custom extensions sent by the server in response to the custom extensions sent with the request. Most of the TFTP servers don't let you respond with custom extensions when in fact this is a feature commented in the RFCs, so unless the TFTP server allows you to respond with custom extensions, this property will be always an empty object. Of course, the server provided by this module supports the user extensions.

---

<a name="client_getstream_putstream_abort"></a>
__abort([error]) : undefined__

Aborts the current transfer. The optional `error` can be an Error instance or any type (it is stringified). If no error message is given, it sends an [EABORT](#error_codes) error. The message is sent to the server but it is not guaranteed that it will reach the other side because TFTP is built on top of UDP and the error messages are not retransmitted, so the packet could be lost. If the message reaches the server, then the transfer is aborted immediately.

---

<a name="client_getstream_putstream_close"></a>
__close() : undefined__

Closes the current transfer. It's the same as the [abort()](#client_getstream_putstream_abort) function but it doesn't send to the server any message, it just closes the local socket. Note that this will cause the server to start the timeout. The recommended way to interrupt a transfer is using [abort()](#client_getstream_putstream_abort).

---

### SERVER ###

[_module_.createServer([options][, requestListener]) : Server](#createserver)

#### Documentation ####

- [Error handling](#error_handling)
- [Graceful shutdown](#graceful_shutdown)
- [Global installation](#server_global)

#### Objects ####

- [Server](#server_object)
- [GetStream and PutStream](#server_getstream_putstream)

---

<a name="error_handling"></a>
__Error handling__

It's very simple. You need to attach two `error` listeners: one for the server and one for the request. If you don't attach an `error` listener, Node.js throws the error and the server just crashes.

```javascript
var server = tftp.createServer (...);

server.on ("error", function (error){
  //Errors from the main socket
  //The current transfers are not aborted
  console.error (error);
});

server.on ("request", function (req, res){
  req.on ("error", function (error){
    //Error from the request
    //The connection is already closed
    console.error ("[" + req.stats.remoteAddress + ":" + req.stats.remotePort +
        "] (" + req.file + ") " + error.message);
  });
});
```

<a name="graceful_shutdown"></a>
__Graceful shutdown__

When the server closes the current transfers are not aborted to allow them to finish. If you need to shutdown the server completely, you must abort all the current transfers manually. Look at [this](https://github.com/gagle/node-tftp/blob/master/examples/server/graceful-shutdown.js) example to know how to do it.

---

<a name="server_global"></a>
__Global installation__


```
npm install tftp -g
```

Then you can access to the `ntftp` binary.

Use the `-l|--listen[=ROOT]` option to start the server. By default the root directory is `.`.

```
$ ntftp [options] <host>[:<port>] -l|--listen=ROOT
```

For example:

```
$ ntftp localhost -l .
```

This command starts a server listening on `localhost:69` and root `.`.

---

<a name="createserver"></a>
___module_.createServer([options][, requestListener]) : Server__

Returns a new [Server](#server_object) instance.

```javascript
var server = tftp.createServer ({
  host: "10.10.10.10",
  port: 1234,
  root: "path/to/root/dir",
  denyPUT: true
});
```

The `requestListener` is a function which is automatically attached to the [request](#server_event_request) event.

Options:

It has the same options as the [createClient()](#createclient) function with the addition of:

- __root__ - _String_
  The root directory. Default is `.`.
- __denyGET__ - _Boolean_
  Denies all the GET operations. Default is false.
- __denyPUT__ - _Boolean_
  Denies all the PUT operations. Default is false.

Setting the options `denyGET` or `denyPUT` is more efficient than aborting the request from inside the request listener.

---

<a name="server_object"></a>
__Server__

__Events__

- [close](#server_event_close)
- [error](#server_event_error)
- [listening](#server_event_listening)
- [request](#server_event_request)

__Methods__

- [close() : undefined](#server_close)
- [listen() : undefined](#server_listen)
- [requestListener(req, res) : undefined](#server_requestlistener)

__Properties__

- [host](#server_host)
- [port](#server_port)
- [root](#server_root)

[__Error codes__](#server_errors)

---

<a name="server_event_close"></a>
__close__

Arguments: none.

Emitted when the server closes. New requests are not accepted. Note that the current transfers are not aborted. If you need to abort them gracefully, look at [this](https://github.com/gagle/node-tftp/blob/master/examples/server/graceful-shutdown.js) example.

<a name="server_event_error"></a>
__error__

Arguments: `error`.

Emitted when an error occurs. The error is mostly caused by a bad packet reception, so almost always, if the server emits an error, it is still alive accepting new requests.

<a name="server_event_listening"></a>
__listening__

Arguments: none.

Emitted when the server has been bound to the socket after calling to [listen()](#server_listen).

<a name="server_event_request"></a>
__request__

Arguments: `req`, `res`.

Emitted when a new request has been received. All the connection objects that are emitted by this event can be aborted at any time.

`req` is an instance of a [GetStream](#server_getstream_putstream) and `res` is an instance of a [PutStream](#server_getstream_putstream).

Requests trying to access a path outside the root directory (eg.: `../file`) are automatically denied.

Note: If you don't need do anything with the `req` or `res` arguments, that is, if by any reason you don't want to _consume_ the current request, then you __must__ [abort()](#client_getstream_putstream_abort) or [close()](#client_getstream_putstream_close) the connection, otherwise you'll have an open socket for the rest of the server's lifetime. The client will timeout because it won't receive any packet, that's for sure, but the connection in the server will remain open and won't timeout. The timeout retransmissions at the server-side begin when the transfer starts but if you don't read/write/close, the connection won't timeout because it is simply waiting to the user to do something with it.

---

<a name="server_close"></a>
__close() : undefined__

Closes the server and stops accepting new connections.

---

<a name="server_listen"></a>
__listen() : undefined__

Starts accepting new connections.

---

<a name="server_requestlistener"></a>
__requestListener(req, res) : undefined__

This function must NOT be called from outside a `request` listener. This function is the default request listener, it automatically handles the GET and PUT requests.

---

<a name="server_host"></a>
__host__

The address that the server is listening to.

---

<a name="server_port"></a>
__port__

The port that the server is listening to.

---

<a name="server_root"></a>
__root__

The root path.

---

<a name="server_getstream_putstream"></a>
__GetStream and PutStream__

When the `request` event is emitted, a new GetStream and PutStream instances are created. These streams are similar to the [streams](#client_getstream_putstream) used in the client but with one difference, the GetStream (`req`) acts like a "connection" object. All the events from the PutStream (`res`) are forwarded to the `req` object, so you don't need to attach any event listener to the `res` object.

The GetStream has two additional properties:

- __file__ - _String_
  The path of the file. The directories are not created recursively if they don't exist.
- __method__ - _String_
  The transfer's method: `GET` or `PUT`.
- __stats__ - _Object_
  An object holding some stats from the current request. [More information](#client_event_stats).

The PutStream has two additional methods:

<a name="server_getstream_putstream_setsize"></a>
- __setSize(size) : undefined__

  Sets the size of the file to send. You need to call to this method only with GET requests when you're using a custom request listener, otherwise the request will just wait. Look at the examples [no-pipe.js](https://github.com/gagle/node-tftp/blob/master/examples/server/no-pipe.js) and [user-extensions-resume.js](https://github.com/gagle/node-tftp/blob/master/examples/user-extensions-resume.js) for more details.

- __setUserExtensions(userExtensions) : undefined__

  Sets the user extensions to send back to the client in response to the received ones. You cannot send extensions different from the ones that are sent by the client. This method must be called before [setSize()](#server_getstream_putstream_setsize).

  As said previously, the TFTP protocol doesn't have any built-in authentication mechanism but thanks to the user extensions you can implement a simple authentication as showed [here](https://github.com/gagle/node-tftp/blob/master/examples/user-extensions-authentication.js).

  Look at the [examples](https://github.com/gagle/node-tftp/tree/master/examples) for more details.

---

<a name="error_codes"></a>
### Error codes ###

The following errors are used internally but they are exposed in case you need to use any of them.

The errors emitted by any `error` event of this module can contain a property named `code`. It contains the name of the error, which is one of the following:

_module_.ENOENT - File not found
_module_.EACCESS - Access violation
_module_.ENOSPC - Disk full or allocation exceeded
_module_.EBADOP - Illegal TFTP operation
_module_.ETID - Unknown transfer ID
_module_.EEXIST - File already exists
_module_.ENOUSER - No such user
_module_.EDENY - The request has been denied
_module_.ESOCKET - Invalid remote socket
_module_.EBADMSG - Malformed TFTP message
_module_.EABORT - Aborted
_module_.EFBIG - File too big
_module_.ETIME - Timed out
_module_.EBADMODE - Invalid transfer mode
_module_.EBADNAME - Invalid filename
_module_.EIO - I/O error
_module_.ENOGET - Cannot GET files
_module_.ENOPUT - Cannot PUT files
_module_.ERBIG - Request bigger than 512 bytes
_module_.ECONPUT - Concurrent PUT request over the same file
_module_.ECURPUT - The requested file is being written by another request
_module_.ECURGET - The requested file is being read by another request