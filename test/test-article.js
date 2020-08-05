"use strict";

const { ethers } = require("ethers");

const { Article } = require("../lib/article");

(async function() {
    const key = "0x01234567012345670123456701234567";
    const art = Article.from("Hello World", "My body, my rules");
    const hash = await art.save(key);
    console.log("Saved:", hash);
    const loadedArt = await Article.load(key, "QmVjjLMHZLr8p7ycyacBYGGgveAoTXMvtMwberccWUvDFY");
    console.log("Loaded:", loadedArt);

    const articles = await Article.listArticles(ethers.getDefaultProvider("ropsten"), "ricmoose.eth");
    console.log(articles);
})();
