"use strict";

import { ProtoBuf } from "./protobuf";

export class Ipfs {
  // get data from ipfs by multihash
  static get(multihash: string): Promise<Uint8Array> {
    return ProtoBuf.get(multihash);
  }

  // put data in ipfs and returns the multihash
  static put(data: Uint8Array): Promise<string> {
    const proto = new ProtoBuf();
    return proto.put(data);
  }
}
