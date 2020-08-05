"use strict";

import { ethers } from "ethers";
import { Varint } from "./varint";

export class Multihash {
  static encode(data: Uint8Array): string {
    const hash = ethers.utils.sha256(data);
    const sha256 = Varint.encode(0x12);

    const hashLength = Varint.encode((hash.length - 2) / 2);
    return ethers.utils.base58.encode(
      ethers.utils.concat([sha256, hashLength, hash])
    );
  }
}
