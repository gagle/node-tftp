"use strict";

var events = require ("events");
var util = require ("util");
var Request = require ("./request");
var opcode = require ("./opcode");

var hex = require ("hex");

var Writer = module.exports = function (remote, globalOptions, putOptions){
  events.EventEmitter.call (this);
  
  this._size = putOptions.size;
  this._current = 0;
  this._closed = false;
  this._closing = false;
  this._aborted = false;
  this._windowSize = null;
  this._blockSize = null;
  this._pending = null;
  this._sent = false;
  this._index = 0;
  this._block = 1;
  this._latestCb = null;
  
  var me = this;
  this._request = new Request (opcode.WRQ, remote, globalOptions,
      putOptions.size)
      .on ("error", function (error){
        me.emit ("error", error);
      })
      .on ("abort", function (){
        me.emit ("abort");
      })
      .on ("close", function (){
        me._latestCb ();
      })
      .on ("ack", function (ack){
        me._onAck (ack);
      })
      .on ("ready", function (){
        me.emit ("ready");
      })
      .on ("extensions", function (extensions){
        me._pending = me._windowSize = extensions.windowSize;
        me._blockSize = extensions.blockSize;
      });
};

util.inherits (Writer, events.EventEmitter);

Writer.prototype.abort = function (){
  this._request.abort ();
};

Writer.prototype.send = function (buffer, cb){
  //send sabe cuando envia el ultimo paquete por lo que registra el evento close en el request,
  //lo cierra y cuando ejecuta el callback ejecuta cb(), de esta forma cuando send()
  //acaba, llama al cb() de _write y por tanto se envia finish automaticamente
  
  this._sent = true;
  var bufferLength = buffer.length;
  var me = this;
  
  //The buffer needs to be sliced in blocks
  (function slice (){
    if (me._index >= bufferLength){
      me._latestCb = cb;
      me._current += bufferLength;
    }else{
      var nextIndex = me._index + me._blockSize;
      if (me._pending--){
        me._request.sendBlock (me._block++, buffer.slice (me._index, nextIndex),
            function (){
          me._index = nextIndex;
          slice ();
        });
      }
    }
  })();
};

Writer.prototype._onAck = function (ack){
  console.log(ack)
  
  if (!this._sent && ack.block === 0){
    //The server doesn't support extensions
    return this.emit ("ready");
  }
  
  //Wait for the ack of the last block sent
  if (ack.block === this._block - 1){
    if (this._current === this._size){
      this._request.close ();
    }else{
      this._latestCb ();
    }
  }
};