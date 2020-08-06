"use strict";

const assert = require("assert");
const { ethers } = require("ethers");

const { Article } = require("../lib/article");

describe("Article", function () {
  it("should save an article successfully", async function () {
    this.timeout(120000);

    const key = "0x01234567012345670123456701234567";
    const title = "Hello World";
    const body = "My body, my rules";
    const art = Article.from(title, body);
    const hash = await art.save(key);
    console.log("Saved:", hash);

    const loadedArt = await Article.load(key, hash);
    console.log("Loaded:", loadedArt);

    assert.equal(loadedArt.title, title, "title mismatch");
    assert.equal(loadedArt.body, body, "body mismatch");

    const articles = await Article.listArticles(
      ethers.getDefaultProvider("ropsten"),
      "ricmoose.eth"
    );

    assert.ok(articles.length >= 2, "Number of articles should be at least 2");
    articles.forEach((art) => {
      assert.ok(art.hash.startsWith("Qm"), "hash should start with Qm");
      assert.ok(art.secretKey.startsWith("0x"), "unexpected secretKey value");
    });
    console.log(articles);
  });
});
