"use strict";

// https://ipfs.github.io/public-gateway-checker/
// https://github.com/ipfs/public-gateway-checker/blob/master/gateways.json
const IPFS_GATEWAYS = [
  "https://ipfs.infura.io:5001",
  "https://dweb.link",
  "https://gateway.ipfs.io",
];

const IPFS_TRUSTED_GATEWAYS = [
  "https://ipfs.infura.io",
  "https://gateway.ipfs.io",
  "https://ipfs.io",
];

// only ipfs pinning service can put block
// use infura service for now as other providers (pinata, textile, temporal)
// all require authentication
const IPFS_PINNERS = ["https://ipfs.infura.io:5001"];

const TIMEOUT_GRACE = 30 * 60 * 1000;

type Providers = {
  [url: string]: { lastError: number };
};

export class Gateway {
  gatewaysTrusted: Providers;
  gateways: Providers;
  pinners: Providers;
  timeoutGrace: number;

  constructor(option: any = {}) {
    this.timeoutGrace = option.timeoutGrace
      ? option.timeoutGrace
      : TIMEOUT_GRACE;

    this.gateways = IPFS_GATEWAYS.reduce((gateways, url) => {
      return Object.assign(gateways, { [url]: { lastError: 0 } });
    }, {});

    this.gatewaysTrusted = IPFS_TRUSTED_GATEWAYS.reduce((gateways, url) => {
      return Object.assign(gateways, { [url]: { lastError: 0 } });
    }, {});

    this.pinners = IPFS_PINNERS.reduce((pinners, url) => {
      return Object.assign(pinners, { [url]: { lastError: 0 } });
    }, {});
  }

  url(providers: Providers): string {
    const now = new Date().getTime();
    const activeProviders = Object.entries(providers)
      .filter((provider) => {
        return now - provider[1].lastError > this.timeoutGrace;
      })
      .map((g) => g[0]);

    if (activeProviders.length === 0) {
      throw new Error(
        "Active IPFS gateways not found; there may be connection problems"
      );
    }

    const index = Math.floor(Math.random() * activeProviders.length);
    return activeProviders[index];
  }

  getTrustedUrl(multihash: string): string {
    return `${this.url(this.gatewaysTrusted)}/ipfs/${multihash}`;
  }

  getUrl(multihash: string): URL {
    return new URL(
      `${this.url(this.gateways)}/api/v0/block/get?arg=${multihash}`
    );
  }

  putUrl(): URL {
    return new URL(`${this.url(this.pinners)}/api/v0/block/put`);
  }

  markGatewayError(url: string) {
    this.gateways[url].lastError = new Date().getTime();
  }

  markPinnerError(url: string) {
    this.pinners[url].lastError = new Date().getTime();
  }
}
