"use strict";

import { ethers } from "ethers";
import { getUrl } from "./geturl";
import { BaseX } from "@ethersproject/basex";
import { Varint } from "./varint";
import { Multihash } from "./multihash";
import { FormData } from "./form-data";

//const CHUNK_SIZE = 2 ** 18;
const INFURA_IPFS_URL = "https://ipfs.infura.io:5001/api/v0/block";

const base58 = new BaseX(
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
);

const CHUNK_SIZE = 2 ** 18;

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
enum WireType {
  Varint = 0,
  Fixed64 = 1,
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
    types: [WireType.VarLength, WireType.VarLength, WireType.Fixed64],
  },
  [SchemaType.UNIXFS]: {
    names: ["type", "data", "filesize", "blocksize", "hashtype", "fanout"],
    types: [
      WireType.Varint,
      WireType.VarLength,
      WireType.Fixed64,
      WireType.Fixed64,
      WireType.Fixed64,
    ],
  },
};

function encodeTag(name: string, schema: SchemaDefinition): Uint8Array {
  const tag = schema.names.findIndex((i) => i === name);
  return Varint.encode(((tag + 1) << 3) + schema.types[tag]);
}

class PBNode {
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
      const encodedLinks = ethers.utils.concat(
        links.map((link) => {
          return link.encode();
        })
      );

      // tag, size, links
      result.push(encodeTag("links", schema));
      result.push(Varint.encode(encodedLinks.byteLength));
      result.push(encodedLinks);
    }
    return ethers.utils.concat(result);
  }

  static parse(data: Uint8Array): Promise<Uint8Array> {
    const schema: SchemaDefinition = Schemas[SchemaType.PBNODE];
    const result = ProtoBuf.parse(data, schema);
    if (result.links) {
      if (result.data && result.data.constructor === Uint8Array) {
        const parsed = PBData.parse(result.data);
        if (parsed.byteLength > 0) {
          throw new Error("Unexpected data");
        }
      }
      var promises: Array<Promise<Uint8Array>> = [];
      result.links.forEach(function (hash: Uint8Array) {
        promises.push(PBLink.parse(hash));
      });
      return Promise.all(promises).then(function (blocks) {
        return ethers.utils.concat(blocks);
      });
    }
    if (result.data && result.data.constructor === Uint8Array) {
      return Promise.resolve(PBData.parse(result.data));
    }

    throw new Error("Missing links or data");
  }
}

class PBLink {
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
    const hash = ethers.utils.toUtf8Bytes(this.hash);
    const size = Varint.encode(this.tsize);
    const length = Varint.encode(hash.byteLength);
    result.push(encodeTag("hash", schema));
    result.push(length);
    result.push(hash);
    result.push(encodeTag("tsize", schema));
    result.push(size);

    return ethers.utils.concat(result);
  }

  static parse(data: Uint8Array): Promise<Uint8Array> {
    const schema: SchemaDefinition = Schemas[SchemaType.PBLINK];
    const result = ProtoBuf.parse(data, schema);
    if (result.hash.length !== 34) {
      throw new Error(`unsupported hash ${ethers.utils.hexlify(result.hash)}`);
    }
    return ProtoBuf.get(base58.encode(result.hash));
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
    // result.filesize = 262144
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
  /*
   * get from ipfs by multihash
   */
  static get(multihash: string): Promise<Uint8Array> {
    const url = `${INFURA_IPFS_URL}/get?arg=${multihash}`;

    return getUrl(url).then((res) => {
      const hash = ethers.utils.sha256(res.body);
      const hashFromCID = ethers.utils.hexlify(
        base58.decode(multihash).slice(2)
      );
      if (hash !== hashFromCID) {
        throw new Error("hash mismatch");
      }

      return PBNode.parse(res.body);
    });
  }

  IpfsPut(data: Uint8Array, links: Array<PBLink>): Promise<any> {
    const url = `${INFURA_IPFS_URL}/put`;
    const encoded = PBNode.encode(data, links);
    const multihash = Multihash.encode(encoded);
    const formData = new FormData(encoded);

    const options = {
      method: "POST",
      body: formData.payload,
      headers: formData.headers,
    };

    return getUrl(url, options).then((res) => {
      const result = JSON.parse(ethers.utils.toUtf8String(res.body));
      if (!result.Key || result.Key !== multihash) {
        const actual = result.Key ? result.Key : "missing";
        throw new Error(
          `Multihash mismatch, expected ${multihash} got ${actual}`
        );
      }
      return result;
    });
  }

  /*
   * put file ipfs
   */
  async put(data: Uint8Array): Promise<any> {
    const links: Array<PBLink> = [];
    let result;
    let end;

    for (let offset = 0; offset < data.byteLength; offset = end) {
      end = offset + CHUNK_SIZE;
      const putResult = await this.IpfsPut(data.slice(offset, end), null);
      const link = new PBLink(putResult.Key, null, putResult.size);
      links.push(link);
    }

    if (links.length > 1) {
      result = await this.IpfsPut(null, links);
    } else if (links.length === 1) {
      result = { Key: links[0].hash, size: links[0].tsize };
    }

    return result;
  }

  static parse(data: Uint8Array, schema: SchemaDefinition): any {
    let tempResult: { [key: string]: Array<any> } = {};
    let result: { [key: string]: any } = {};
    let offset = 0;

    while (offset < data.length) {
      let varint = Varint.decode(data, offset);
      const v = varint.value;

      offset += varint.length;
      const tag = schema.names[(v >>> 3) - 1];

      if (!tag) {
        throw new Error("unknown field - " + v);
      }

      if (!tempResult[tag]) {
        tempResult[tag] = [];
      }
      // now get the wire type from v
      switch (v & 7) {
        // varint
        case WireType.Varint:
        case WireType.Fixed64:
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

          /*   --- debug
          if (tag === "links") {
            console.log(
              "tag",
              tag,
              databyte,
              length,
              data.slice(offset, offset + length)
            );
          }
*/
          tempResult[tag].push(data.slice(offset, offset + length));
          offset += length;
          break;
        }

        default:
          console.log("unsupported type - " + tag);
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
