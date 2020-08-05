"use strict";

let ethers: any = {};

const w = window as any;
if (w._ethers == null) {
  console.log("WARNING: ethers must be loaded first");
} else {
  ethers = w._ethers;
}

export { ethers };
