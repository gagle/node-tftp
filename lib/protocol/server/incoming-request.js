"use strict";

var util = require ("util");
var packets = require ("../packets");
var opcodes = require ("../opcodes");
var errors = require ("../errors");
var Request = require ("../request");

var IncomingRequest = module.exports = function (args){
  Request.call (this, args.helper._rinfo.address, args.helper._rinfo.port,
      args.globalOptions.retries, args.globalOptions.extensions.timeout);
  
  this._isRRQ = !args.reader;
  this._globalOptions = args.globalOptions;
  this._maxDataLength = 4;
  this._file = args.message.file;
  this._size = args.size || null;
  this._userExtensions = args.message.userExtensions;
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
      //The client doesn't support extensions
      if (me._isRRQ && me._size > 33554432){
        return me._sendErrorAndClose (errors.EFBIG);
      }
      me._onReady (me._createStats (512, 1));
      if (me._isRRQ){
        me.onContinue ();
      }else{
        //The ACK of the block 0 is retransmitted from the reader
        me._sendAck (0);
      }
    }else{
      //Send OACK
      me._sendOack (args.message.extensions);
    }
  });
};

util.inherits (IncomingRequest, Request);

IncomingRequest.prototype._createStats = function (blockSize, windowSize){
  //Save max data length
  this._maxDataLength += blockSize;
  
  var address = this._socket.address ();
  
  return {
    blockSize: blockSize,
    windowSize: windowSize,
    rollover: 0,
    size: this._size,
    userExtensions: this._userExtensions,
    timeout: this._timeout,
    localSocket: {
      address: address.address,
      port: address.port
    },
    remoteSocket: {
      address: this._address,
      port: this._port
    },
    file: this._file,
    retries: this._globalOptions.retries
  };
};

IncomingRequest.prototype._onMessage = function (buffer){
  var op = buffer.readUInt16BE (0);
  
  if (op === opcodes.DATA){
    if (!this._isRRQ){
      if (buffer.length < 4 || buffer.length > this._maxDataLength){
        return this._sendErrorAndClose (errors.EBADMSG);
      }
      this._onData (packets.data.deserialize (buffer));
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
        this._onAck (packets.ack.deserialize (buffer));
      }
    }else{
      this._sendErrorAndClose (errors.EBADOP);
    }
  }else if (op === opcodes.ERROR){
    if (buffer.length <= 4) return this._closeWithError (errors.EBADMSG);
    try{
      buffer = packets.error.deserialize (buffer);
    }catch (error){
      return this._closeWithError (error);
    }
    this._close (new Error ("(Client) " + buffer.message));
  }else{
    this._sendErrorAndClose (errors.EBADOP);
  }
};

IncomingRequest.prototype._sendOack = function (extensions){
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
  }
  if (extensions.rollover !== undefined){
    ext.rollover = 0;
  }
  
  this._oackSent = true;
  this._onReady (this._createStats (ext.blksize || 512, ext.windowsize || 1),
      true);
  this._sendAndRetransmit (packets.oack.serialize (ext));
};