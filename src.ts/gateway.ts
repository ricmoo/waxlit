"use strict";

// https://ipfs.github.io/public-gateway-checker/
const IPFS_GATEWAYS = [
  "https://ipfs.infura.io:5001",
  "https://ipfs.io",
  "https://dweb.link",
  "https://gateway.ipfs.io",
];

const TIMEOUT_GRACE = 30 * 60 * 1000;

export class Gateway {
  gateways: Array<{ url: string; lastError: number }>;
  timeoutGrace: number;

  constructor(option: any = {}) {
    this.timeoutGrace = option.timeoutGrace
      ? option.timeoutGrace
      : TIMEOUT_GRACE;

    this.gateways = IPFS_GATEWAYS.map((url) => {
      return { url, lastError: 0 };
    });
  }

  get url(): string {
    const now = new Date().getTime();
    const activeGateways = this.gateways.filter((gateway) => {
      return now - gateway.lastError > this.timeoutGrace;
    });

    if (activeGateways.length === 0) {
      throw new Error(
        "Active IPFS gateways not found; there may be connection problems"
      );
    }

    const index = Math.floor(Math.random() * 10) % activeGateways.length;
    return activeGateways[index].url;
  }

  getUrl(multihash: string): URL {
    return new URL(`${this.url}/api/v0/block/get?arg=${multihash}`);
  }

  putUrl(): URL {
    return new URL(`${this.url}/api/v0/block/put`);
  }

  markError(url: string) {
    const index = this.gateways.findIndex((gateway) => gateway.url === url);

    if (index > -1) {
      this.gateways[index].lastError = new Date().getTime();
    }
  }
}
