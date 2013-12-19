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

Per se, the TFTP is a lock-step protocol built on top of UDP for transferring files between two machines. It was useful in the past but nowadays it's practically an obsolete legacy protocol useful in a very few scenarios. Without the  extensions support, the RFC says that a file bigger than 32MB cannot be sent. This limit can be incremented to 91.74MB if both machines support the block size extension and they agree to use a block size of 1468 bytes, the MTU size before IP fragmentation in Ethernet networks. Also, the file transfer is pretty slow due to the lock-step mechanism, one ack for each packet.

However, there are two de facto extensions that can boost the TFTP transfer speed achieving good speeds with an unlimited file size: the rollover and the window size.

This module it's perfectly integrated with Node.js, providing an streaming interface for GETting and PUTing files very easily. No configuration is needed. By default the client tries to negotiate with the server the best possible configuration. If that's not possible it simply fallbacks to the official lock-step TFTP implementation.

#### Quick example ####

```javascript
var ntftp = require ("ntftp");

var client = ntftp.createClient ({
  hostname: <server_hostname>
  //Default port is 69
});

//Without streams
client.get ("remote-file", "local-file", function (error){
  if (error) return console.error (error);
  ...
});

client.put ("local-file", "remote-file", function (error){
  if (error) return console.error (error);
  ...
});

//With streams (for a complete example look in the examples directory)
var get = client.createGetStream ("remote-file")
    .on ("error", function (error){
     write.destroy ();
    });

var write = fs.createWriteStream ("local-file")
    .on ("error", function (error){
      get.abort ();
    });

get.pipe (write);

var read = fs.createReadStream ("local-file")
    .on ("error", function (error){
      put.abort ();
    });
		
var put = client.createPutStream ("remote-file")
    .on ("error", function (error){
      read.destroy ();
    });

read.pipe (put);
```