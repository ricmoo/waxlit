"use strict";

import { ethers } from "ethers";
import { Varint } from "./varint";

// UnixFs data type
enum UnixFsType {
  Raw = 0,
  Directory = 1,
  File = 2,
  Metadata = 3,
  Symlink = 4,
  HAMTShard = 5,
}

// https://developers.google.com/protocol-buffers/docs/encoding
//  varint => int32, int64, uint32, uint64, sint32, sint64, bool, enum
//  varlength => string, bytes, embedded messages, packed repeated fields
enum WireType {
  Varint = 0,
  VarLength = 2,
}

enum SchemaType {
  PBNODE = 1,
  PBLINK = 2,
  UNIXFS = 3,
}

// Protobuf definitions for merkledag node and links:
// https://github.com/ipld/js-ipld-dag-pb/blob/master/src/dag.proto.js
//    https://github.com/ipfs/go-merkledag/blob/master/pb/merkledag.proto
// Protobuf defintions for unixfs:
//    https://github.com/ipfs/go-unixfs/blob/master/pb/unixfs.proto

type SchemaDefinition = {
  names: Array<string>;
  types: Array<number>;
  repeated?: { [key: string]: boolean };
};

const Schemas: { [name: string]: SchemaDefinition } = {
  [SchemaType.PBNODE]: {
    names: ["data", "links"],
    types: [WireType.VarLength, WireType.VarLength],
    repeated: { links: true },
  },
  [SchemaType.PBLINK]: {
    names: ["hash", "name", "tsize"],
    types: [WireType.VarLength, WireType.VarLength, WireType.Varint],
  },
  [SchemaType.UNIXFS]: {
    names: ["type", "data", "filesize", "blocksize", "hashtype", "fanout"],
    types: [
      WireType.Varint,
      WireType.VarLength,
      WireType.Varint,
      WireType.Varint,
      WireType.Varint,
      WireType.Varint,
    ],
  },
};

function encodeTag(name: string, schema: SchemaDefinition): Uint8Array {
  const tag = schema.names.findIndex((i) => i === name);
  return Varint.encode(((tag + 1) << 3) + schema.types[tag]);
}

export class PBNode {
  links: Array<string>;
  data: Uint8Array;

  constructor(data?: Uint8Array, links?: Array<string>) {
    this.links = links;
    this.data = data;
  }

  static encode(data?: Uint8Array, links?: Array<PBLink>): Uint8Array {
    const schema: SchemaDefinition = Schemas[SchemaType.PBNODE];
    const result: Array<Uint8Array> = [];

    if (data) {
      // tag, length of unixfs encoded data, unixfs encoded data
      result.push(encodeTag("data", schema));

      const encodedData = PBData.encode(data);
      const size = Varint.encode(encodedData.byteLength);
      result.push(size);
      result.push(encodedData);
    }

    if (links) {
      const tag = encodeTag("links", schema);

      links.forEach((link) => {
        const encoded = link.encode();
        result.push(tag);
        result.push(Varint.encode(encoded.length));
        result.push(encoded);
      });
    }

    return ethers.utils.concat(result);
  }

  static parse(rawData: Uint8Array): PBNode {
    const schema: SchemaDefinition = Schemas[SchemaType.PBNODE];
    const node = ProtoBuf.parse(rawData, schema);
    let links;
    let data;

    if (node.links) {
      links = node.links.map((link: Uint8Array) => PBLink.parse(link));
    }

    if (node.data && node.data.constructor === Uint8Array) {
      data = PBData.parse(node.data);
    }

    return new PBNode(data, links);
  }
}

export class PBLink {
  hash: string;
  filename: string;
  tsize: number;

  constructor(hash: string, filename: string, tsize: number) {
    this.hash = hash;
    this.filename = filename;
    this.tsize = tsize;
  }

  encode(): Uint8Array {
    const schema: SchemaDefinition = Schemas[SchemaType.PBLINK];

    const result: Array<Uint8Array> = [];
    const hash = ethers.utils.base58.decode(this.hash);
    const size = Varint.encode(this.tsize);
    const length = Varint.encode(hash.byteLength);
    result.push(encodeTag("hash", schema));
    result.push(length);
    result.push(hash);
    result.push(encodeTag("tsize", schema));
    result.push(size);

    const finalResult = ethers.utils.concat(result);
    return finalResult;
  }

  static parse(data: Uint8Array): string {
    const schema: SchemaDefinition = Schemas[SchemaType.PBLINK];
    const result = ProtoBuf.parse(data, schema);
    if (result.hash.length !== 34) {
      throw new Error(`unsupported hash ${ethers.utils.hexlify(result.hash)}`);
    }

    return ethers.utils.base58.encode(result.hash);
  }
}

class PBData {
  static encode(data: Uint8Array): Uint8Array {
    const schema: SchemaDefinition = Schemas[SchemaType.UNIXFS];
    const result: Array<Uint8Array> = [];

    const type = Varint.encode(UnixFsType.File);
    result.push(encodeTag("type", schema));
    result.push(type);

    const size = Varint.encode(data.byteLength);
    result.push(encodeTag("data", schema));
    result.push(size);
    result.push(data);

    result.push(encodeTag("filesize", schema));
    result.push(size);

    return ethers.utils.concat(result);
  }

  static parse(data: Uint8Array): Uint8Array {
    const schema: SchemaDefinition = Schemas[SchemaType.UNIXFS];
    const result = ProtoBuf.parse(data, schema);

    if (result.type !== UnixFsType.File) {
      throw new Error("unsupported type");
    }
    if (!result.data) {
      return new Uint8Array([]);
    }
    if (result.data.constructor !== Uint8Array) {
      throw new Error("bad Data");
    }
    return result.data;
  }
}

export class ProtoBuf {
  static parse(data: Uint8Array, schema: SchemaDefinition): any {
    let tempResult: { [key: string]: Array<any> } = {};
    let result: { [key: string]: any } = {};
    let offset = 0;

    while (offset < data.length) {
      let varint = Varint.decode(data, offset);
      const v = varint.value;
      const tag = schema.names[(v >>> 3) - 1];

      if (!tag) {
        throw new Error("unknown field - " + v);
      }

      offset += varint.length;

      if (!tempResult[tag]) {
        tempResult[tag] = [];
      }
      // now get the wire type from v
      switch (v & 7) {
        // varint
        case WireType.Varint:
          varint = Varint.decode(data, offset);
          tempResult[tag].push(varint.value);
          offset += varint.length;
          break;

        // bytes
        case WireType.VarLength: {
          varint = Varint.decode(data, offset);
          const length = varint.value;
          if (offset + length > data.length) {
            throw new Error("buffer overrun");
          }
          offset += varint.length;

          tempResult[tag].push(data.slice(offset, offset + length));
          offset += length;
          break;
        }

        default:
          throw new Error("unsupported type - " + tag);
      }
    }

    Object.keys(tempResult).forEach((key: string) => {
      result[key] =
        schema.repeated && schema.repeated[key]
          ? tempResult[key]
          : tempResult[key][0];
    });
    return result;
  }
}
