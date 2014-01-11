"use strict";

module.exports = {
  rfc: [
    null,
    "File not found",
    "Access violation",
    "Disk full or allocation exceeded",
    "Illegal TFTP operation",
    "Unknown transfer ID",
    "File already exists",
    "No such user",
    "The request has been denied"
  ],
  ENOENT: 1,
  EACCESS: 2,
  ENOSPC: 3,
  EBADOP: 4,
  ETID: 5,
  EEXIST: 6,
  ENOUSER: 7,
  EDENY: 8,
  ESOCKET: "Invalid remote socket",
  EBADMSG: "Malformed TFTP message",
  EABORT: "Aborted",
  EFBIG: "File bigger than 33554432 bytes",
  ETIME: "Timed out",
  EBADMODE: "Invalid transfer mode",
  EBADNAME: "Invalid filename",
  EISDIR: "Path is a directory",
  EIO: "I/O error",
  ENOGET: "Cannot GET files",
  ENOPUT: "Cannot PUT files",
};