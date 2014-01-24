"use strict";

var util = require ("util");
var packets = require ("../packets");
var opcodes = require ("../opcodes");
var errors = require ("../errors");
var Request = require ("../request");
var knownExtensions = require ("../known-extensions");

var IncomingRequest = module.exports = function (args){
  Request.call (this, args.helper._rinfo.address, args.helper._rinfo.port,
      args.globalOptions.retries, args.globalOptions.extensions.timeout);
  
  this._isRRQ = !args.reader;
  this._globalOptions = args.globalOptions;
  this._maxDataLength = 4;
  this._file = args.message.file;
  this._size = args.size || null;
  this._requestUserExtensions = args.message.userExtensions;
  this._responseUserExtensions = args.userExtensions;
  this._oackSent = false;
  this._firstPacket = true;
  
  var me = this;
  this._initSocket (args.helper._socket, function (message){
    if (me._firstPacket){
      me._firstPacket = false;
      me._requestTimer.reset ();
    }
    me._onMessage (message);
  });
  
  //The socket is still not bound to an address and port because no packet is
  //still sent, so the stats cannot be emitted yet (the call to address() fails)
  //The socket must be manually bound
  this._socket.bind (0, null, function (){
    if (args.message.extensions === null){
      if (me._isRRQ && me._checkSize ()) return;
      me._onReady (me._createStats (512, 1));
      if (me._isRRQ){
        me.onContinue ();
      }else{
        //The ACK of the block 0 is retransmitted from the reader
        me._sendAck (0);
      }
    }else{
      //Send OACK
      me._sendOackMessage (args.message.extensions);
    }
  });
};

util.inherits (IncomingRequest, Request);

IncomingRequest.prototype._checkSize = function (blockSize){
  var max = (blockSize || 512)*65535;
  if (this._size > max){
    this._sendErrorAndClose (errors.EFBIG);
    return true;
  }
  return false;
};

IncomingRequest.prototype._createStats = function (blockSize, windowSize){
  //Save max data length
  this._maxDataLength += blockSize;
  
  var address = this._socket.address ();
  
  return {
    blockSize: blockSize,
    windowSize: windowSize,
    rollover: 0,
    size: this._size,
    userExtensions: this._requestUserExtensions,
    file: this._file,
    retries: this._globalOptions.retries,
    timeout: this._timeout,
    localAddress: address.address,
    localPort: address.port,
    remoteAddress: this._address,
    remotePort: this._port,
  };
};

IncomingRequest.prototype._onMessage = function (buffer){
  var op = buffer.readUInt16BE (0);
  
  if (op === opcodes.DATA){
    if (!this._isRRQ){
      if (buffer.length < 4 || buffer.length > this._maxDataLength){
        return this._sendErrorAndClose (errors.EBADMSG);
      }
      try{
        this._onData (packets.data.deserialize (buffer));
      }catch (error){
        this._sendErrorAndClose (error);
      }
    }else{
      this._sendErrorAndClose (errors.EBADOP);
    }
  }else if (op === opcodes.ACK){
    if (this._isRRQ){
      if (buffer.length !== 4){
        return this._sendErrorAndClose (errors.EBADMSG);
      }
      if (this._oackSent){
        this._oackSent = false;
        if (buffer.readUInt16BE (2) !== 0){
          this._sendErrorAndClose (errors.EBADMSG);
        }else{
          this.onContinue ();
        }
      }else{
        try{
          this._onAck (packets.ack.deserialize (buffer));
        }catch (error){
          this._sendErrorAndClose (error);
        }
      }
    }else{
      this._sendErrorAndClose (errors.EBADOP);
    }
  }else if (op === opcodes.ERROR){
    if (buffer.length < 4) return this._closeWithError (errors.EBADMSG);
    try{
      this._close (new Error (packets.error.deserialize (buffer).message));
    }catch (error){
      return this._closeWithError (error);
    }
  }else{
    this._sendErrorAndClose (errors.EBADOP);
  }
};

IncomingRequest.prototype._sendOackMessage = function (extensions){
  var ext = {};
  if (extensions.blksize !== undefined){
    var blksize = this._globalOptions.extensions.blksize;
    ext.blksize = extensions.blksize > blksize ? blksize : extensions.blksize;
  }
  if (extensions.windowsize !== undefined){
    var windowsize = this._globalOptions.extensions.windowsize;
    ext.windowsize = extensions.windowsize > windowsize
        ? windowsize
        : extensions.windowsize;
  }
  if (extensions.tsize !== undefined){
    if (!this._isRRQ) this._size = extensions.tsize;
    ext.tsize = this._size;
  }else if (this._isRRQ && this._checkSize (ext.blksize)){
    //The server supports the extensions but doesn't return the tsize extension
    //and the file to send is too big. This is a very odd case, but could happen
    return;
  }
  if (extensions.rollover !== undefined){
    ext.rollover = 0;
  }
  
  this._oackSent = true;
  this._onReady (this._createStats (ext.blksize || 512, ext.windowsize || 1),
      true);
  
  //Set the user extensions after the onReady call (emits the stats object) to
  //let the user set the extensions based on the extensions received from the
  //client
  if (this._requestUserExtensions){
    for (var p in this._responseUserExtensions){
      //Ignore invalid extensions
      if (knownExtensions[p]) continue;
      if (this._requestUserExtensions[p] === undefined) continue;
      ext[p] = this._responseUserExtensions[p];
    }
  }
  
  this._sendAndRetransmit (packets.oack.serialize (ext));
};