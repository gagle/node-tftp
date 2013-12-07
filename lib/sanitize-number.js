"use strict";

module.exports = function (n){
  n = ~~n;
  return n < 1 ? 1 : n;
};