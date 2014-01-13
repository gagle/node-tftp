"use strict";

var util = require ("util");

module.exports = function (ctor, base){
  var fn = function (){
    var args = Array.prototype.slice.call (arguments);
    args.unshift (base);
    ctor.apply (this, args);
  };
  
  var proto = ctor.prototype;
  
  util.inherits (fn, base);
  
  for (var p in proto){
    fn.prototype[p] = proto[p];
  }
  
  return fn;
};