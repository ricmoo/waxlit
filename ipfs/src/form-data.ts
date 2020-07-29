"use strict";

function getBoundary(): string {
  let boundary = "--------------------------";
  for (let i = 0; i < 24; i++) {
    boundary += Math.floor(Math.random() * 10).toString(16);
  }
  return boundary;
}

export class FormData {
  headers: { [key: string]: string };
  payload: Buffer;

  constructor(data: Uint8Array) {
    const boundary = getBoundary();
    this.headers = {
      "Content-Type": "multipart/form-data; boundary=" + boundary,
    };

    const head =
      `--${boundary}\r\n` + "Content-Type:application/octet-stream\r\n\r\n";
    this.payload = Buffer.concat([
      Buffer.from(head, "utf8"),
      Buffer.from(data),
      Buffer.from("\r\n--" + boundary + "--\r\n", "utf8"),
    ]);
  }
}
