"use strict";

import { Gateway } from "./gateway";
import { ethers } from "ethers";
import { PBNode, PBLink } from "./protobuf";
import { Multihash } from "./multihash";
import { FormData } from "./form-data";

const CHUNK_SIZE = 2 ** 18;

function makeNode(data: Uint8Array, links: Array<PBLink>): any {
  const encoded = PBNode.encode(data, links);
  const formData = new FormData(encoded);
  const multihash = Multihash.encode(encoded);
  return { headers: formData.headers, payload: formData.payload, multihash };
}

type PutResult = {
  Key: string;
  Size: number;
};

export class Ipfs {
  gateway: Gateway;

  constructor(gateway: Gateway) {
    this.gateway = gateway;
  }

  // get data from ipfs by multihash
  get(multihash: string): Promise<Uint8Array> {
    if (!multihash) {
      throw new Error("Get error: missng multihash");
    }

    const url = this.gateway.getUrl(multihash);
    return ethers.utils
      ._fetchData(url.href)
      .then((res) => {
        if (Multihash.encode(res) !== multihash) {
          throw new Error("hash mismatch");
        }

        const node = PBNode.parse(res);
        if (node.links) {
          const promises = node.links.map((hash) => this.get(hash));
          return Promise.all(promises).then((blocks) =>
            ethers.utils.concat(blocks)
          );
        }
        if (node.data && node.data.constructor === Uint8Array) {
          return Promise.resolve(node.data);
        }

        throw new Error("Missing links or data");
      })
      .catch((err) => {
        console.log(
          "get error",
          err.url,
          err.requestMethod,
          err.reason,
          err.status
        );
        this.gateway.markGatewayError(url.origin);
        return this.get(multihash);
      });
  }

  putNode(formData: FormData): Promise<PutResult> {
    const url = this.gateway.putUrl();

    const connection = {
      method: "POST",
      headers: formData.headers,
      url: url.href,
    };

    return ethers.utils
      ._fetchData(connection, formData.payload)
      .then((res: Uint8Array) => {
        const result = JSON.parse(ethers.utils.toUtf8String(res));
        if (!result.Key || result.Key !== formData.multihash) {
          const actual = result.Key ? result.Key : "missing";
          throw new Error(
            `Multihash mismatch, expected ${formData.multihash} got ${actual}`
          );
        }
        return result;
      })
      .catch((err) => {
        console.log(
          "put error",
          err.url,
          err.requestMethod,
          err.reason,
          err.status
        );
        this.gateway.markPinnerError(url.origin);
        return this.putNode(formData);
      });
  }

  // put data in ipfs and returns the multihash
  put(data: Uint8Array): Promise<PutResult> {
    const promises: Array<Promise<PutResult>> = [];
    let end;

    for (let offset = 0; offset < data.byteLength; offset = end) {
      end = offset + CHUNK_SIZE;
      const node = makeNode(data.slice(offset, end), null);
      promises.push(this.putNode(node));
    }

    if (promises.length === 0) {
      throw new Error("Missng data");
    }

    return Promise.all(promises).then((result) => {
      if (promises.length === 1) {
        return result[0];
      }

      const links = result.map((link) => {
        return new PBLink(link.Key, null, link.Size);
      });
      const node = makeNode(null, links);
      return this.putNode(node);
    });
  }
}
