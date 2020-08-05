"use strict";

export type VarintType = {
  value: number;
  length: number;
};

export class Varint {
  static encode(num: number): Uint8Array {
    let numVal = num;
    let offset = 0;
    let result: Array<number> = [];

    while (numVal >= 128) {
      result[offset++] = (numVal & 0x7f) | 0x80;
      numVal /= 128;
    }

    result[offset] = numVal | 0;
    return new Uint8Array(result);
  }

  static decode(data: Uint8Array, offset: number = 0): VarintType {
    let result: number;
    let currentOffset = offset;

    let v = [data[currentOffset] & 0x7f];
    while (data[currentOffset++] & 0x80) {
      if (offset === data.length) {
        throw new Error("buffer overrun");
      }
      v.unshift(data[currentOffset] & 0x7f);
    }

    result = 0;
    v.forEach(function (v) {
      result = result * 128 + v;
    });

    const length = currentOffset - offset;
    return { value: result, length };
  }
}
