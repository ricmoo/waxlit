"use strict";

const assert = require("assert");
const { Ipfs } = require("../lib/index");
const ethers = require("ethers");
const { Varint } = require("../lib/varint");
const { Gateway } = require("../lib/gateway");
const fs = require("fs");

const gateway = new Gateway();
const ipfs = new Ipfs(gateway);

describe("IPFS", function () {
  describe("block get", function () {
    it("should return data from small file", async function () {
      const multihash = "Qmd2V777o5XvJbYMeMb8k2nU5f8d3ciUQ5YpYuWhzv8iDj";
      const data = await ipfs.get(multihash);
      const regex = new RegExp("meeseek");
      assert.ok(
        regex.test(ethers.utils.toUtf8String(data)),
        "meeseek not found"
      );
      assert.ok(data.length > 0, "hash has length");
    });

    it("should return data from large file", async function () {
      this.timeout(120000);
      const data = await ipfs.get(
        "QmQAsdPwfERkwHZ11Bz6cL85o6VU5cPThh4HPJXR2mDL1r"
      );

      const expected =
        "0xa67e3e74436d7497973cf5865faa801ae8faf3dab580c4a953222b7b0e4475a3";
      const calculated = ethers.utils.keccak256(data);
      assert.equal(calculated, expected, "content mismatch");
      assert.ok(data.length > 0, "hash has length");
    });

    it("temp test", async function () {
      this.timeout(120000);
      // "QmWPyMW2u7J2Zyzut7TcBMT8pG6F2cB4hmZk1vBJFBt1nP" -- 4 byte file
      // "QmXn9N1VCotpykz9s6YKs24miLHSyhMCEXBLPLua6znean" -- 6 byte file
      //const multihash = "QmQAsdPwfERkwHZ11Bz6cL85o6VU5cPThh4HPJXR2mDL1r";
      const multihash = "QmVzJ2cGEtQxn9ZK4VZYbUHib8gqvMGBzr3DixkGdgELKe";
      const data = await ipfs.get(multihash);
      //console.log("data", data);
      assert.ok(data !== null, "failed to get from ipfs");
    });
  });

  describe("Varint encode and decode", function () {
    [300, 0, 4294967296].forEach((num) => {
      it(`for ${num}`, function () {
        const encoded = Varint.encode(num);
        const decoded = Varint.decode(encoded);
        assert.equal(decoded.value, num, `decoded varint should equal ${num}`);
      });
    });
  });

  /* example
  it("multihash should work", async function () {
    this.timeout(120000);

    const Unixfs = require("ipfs-unixfs");
    const { DAGNode } = require("ipld-dag-pb");

    const data = ethers.utils.toUtf8Bytes("abcd");
    const unixFs = new Unixfs("file", data);

    const dagNode = new DAGNode(unixFs.marshal());
    const expectedCID = "Qmf412jQZiuVUtdgnB36FXFX7xg5V6KEbSJ4dpQuhkLyfD";
    console.log("serialize", new Uint8Array(dagNode.serialize()));
    console.log("dagNode", dagNode);
    console.log("unixFs", unixFs);
    console.log("data", data);
  });
  */

  describe("block put", function () {
    it("small data", async function () {
      this.timeout(120000);

      const data = Buffer.from("abcd");
      const cid = await ipfs.put(data);

      const savedData = await ipfs.get(cid.Key);
      assert.ok(savedData !== null, "failed to get from ipfs");
    });

    it("large data", async function () {
      this.timeout(120000);

      const length = 2 ** 18 + 100;
      const data = ethers.utils.randomBytes(length);
      const cid = await ipfs.put(data);

      const savedData = await ipfs.get(cid.Key);
      assert.ok(savedData !== null, "failed to get from ipfs");
    });

    it.skip("image", async function () {
      /*
      this.timeout(120000);
      const sourceFile = "avatar2.png";
      const image = fs.readFileSync(sourceFile);
      const result = await ipfs.put(image);
      console.log("saved image", result);

      const cid = result.Key;
      const savedData = await ipfs.get(cid);
      const targetFile = "avatar.png";
      fs.writeFileSync(targetFile, savedData);
      assert.ok(savedData !== null, "failed to get from ipfs");
      */
    });
  });

  describe("Gateway", function () {
    it("getTrustedUrl", function () {
      const cid = "QmPks7eJyJUW9oXYkCAk8PJZDh9rALGi5xrBBgijrrsu7i";
      const url = gateway.getTrustedUrl(cid);
      console.log("url", url);
      assert.ok(url.endsWith(cid), "url missing cid");
    });
  });
});
