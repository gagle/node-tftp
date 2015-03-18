"use strict";

var dgram = require ("dgram");
var errors = require ("./errors");
var packets = require ("./packets");

var normalizeError = function (error){
	if (!error){
		return errors.EABORT;
	}else if (error instanceof Error){
		return errors.wrap (error.message || errors.EABORT.message);
	}else{
		return errors.wrap (error + "");
	}
};

var Request = module.exports = function (address, port, retries,
		timeout){
	this._address = address;
	this._port = port;
	this._retries = retries;
	this._timeout = timeout;
	this._socket = null;
	this._closed = false;
	this._closing = false;
	this._aborted = false;
	this._error = null;
	//The string is modified from the ClientRequest subclass
	this._prefixError = "";
	this._requestTimer = this._createRetransmitter ();
};

Request.prototype.abort = function (error){
	if (this._closed || this._closing || this._aborted) return;
	this._aborted = true;
	var me = this;
	this._send (packets.error.serialize (normalizeError (error)), function() { me._close () });
};

Request.prototype.close = function (){
	if (this._closed || this._closing || this._aborted) return;
	this._close ();
};

Request.prototype._close = function (error){
	if (this._closed || this._closing || !this._socket) return;
	//If multiples closes occur inside the same tick (because abort() and _close()
	//are called in the same tick) the socket throws the error "Not running"
	//because the socket is already closed when the second close occurs, this is
	//why there's a closing flag
	this._closing = true;
	
	//Store the error after the flag is set to true, otherwise the error could be
	//misused by another close
	if (error) this._error = error;
	
	var me = this;
	//Close in the next tick to allow sending files in the same tick
	process.nextTick (function (){
		me._socket.close ();
	});
};

Request.prototype._initSocket = function (socket, onMessage){
	var me = this;
	this._onCloseFn = function (){
		me._closed = true;
		me._requestTimer.reset ();
		if (me._aborted) return me._onAbort ();
		if (me._error){
			me._onError (me._error);
		}else{
			//Transfer ended successfully
			me._onClose ();
		}
	};
	this._socket = (socket || dgram.createSocket ("udp" + this._ipFamily))
			.on ("error", function (error){
				me._closed = true;
				me._requestTimer.reset ();
				me._onError (error);
			})
			.on ("close", this._onCloseFn)
			.on ("message", onMessage);
};

Request.prototype._sendAck = function (block){
	this._send (packets.ack.serialize (block));
};

Request.prototype._sendBlock = function (block, buffer){
	this._send (packets.data.serialize (block, buffer));
};

Request.prototype._sendErrorAndClose = function (obj){
	this._send (packets.error.serialize (obj));
	this._closeWithError (obj);
};

Request.prototype._closeWithError = function (obj){
	var error = new Error (this._prefixError + obj.message);
	if (obj.name) error.code = obj.name;
	this._close (error);
};

Request.prototype._sendAndRetransmit = function (buffer){
	//Return if the transfer was aborted from inside the stats event (server)
	if (this._aborted) return;
	this._send (buffer);
	var me = this;
	this._requestTimer.start (function (){
		me._send (buffer);
	});
};

Request.prototype._send = function (buffer, cb){
	if (this._closed || this._closing) return;
	this._socket.send (buffer, 0, buffer.length, this._port, this._address, cb);
};

Request.prototype._createRetransmitter = function (){
	return new Retransmitter (this);
};

var Retransmitter = function (request){
	this._request = request;
	this._timer = null;
	this._pending = this._request._retries;
};

Retransmitter.prototype.reset = function (){
	if (!this._timer) return;
	clearTimeout (this._timer);
	this._pending = this._request._retries;
	this._timer = null;
};

Retransmitter.prototype.start = function (fn){
	var me = this;
	this._timer = setTimeout (function (){
		if (!me._pending){
			//No more retries
			me._request._close (new Error (errors.ETIME.message));
		}else{
			me._pending--;
			fn ();
			//Try again
			me.start (fn);
		}
	}, this._request._timeout);
};

Request.Helper = function (rinfo, family){
	this._rinfo = rinfo;
	this._socket = dgram.createSocket ("udp" + family);
};

Request.Helper.prototype.abort = function (error){
	this.sendErrorAndClose (normalizeError (error));
};

Request.Helper.prototype.sendErrorAndClose = function (obj){
	var buffer = packets.error.serialize (obj);
	var me = this;
	this._socket.send (buffer, 0, buffer.length, this._rinfo.port,
			this._rinfo.address, function (){
		me._socket.close ();
	});
};