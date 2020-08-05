(async function() {
    const ethers = window._ethers;

    const provider = ethers.getDefaultProvider("ropsten");

    async function getArticles(ensName) {
        const address = "0x5C9bef28344Df7F7e67a1C5CF124dC707a973b07";
        const abi = [
            "event NewArticle(bytes32 indexed nodehash, bytes32 info, bytes32 multihash)"
        ];
        const contract = new ethers.Contract(address, abi, provider);

        const articles = { };

        const filter = contract.filters.NewArticle(ethers.utils.namehash(ensName));
        const logs = await contract.queryFilter(filter, 0);

        logs.forEach((log) => {
            try {
                const version = ethers.BigNumber.from(log.args[1]).shr(8 * 31).toNumber();
                if (version !== 1) { throw new Error("unsupported version"); }

                const secret = ethers.BigNumber.from(log.args[1]).shr(8 * 10).mask(8 * 16).toHexString();
                const articleId = ethers.BigNumber.from(log.args[1]).shr(8 * 4).mask(8 * 6).toNumber();
                const revisionId = ethers.BigNumber.from(log.args[1]).shr(8 * 0).mask(8 * 4).toNumber();
                const hash = log.args[2];

                if (!articles[articleId]) { articles[articleId] = { revision: -1 }; }
                if (articles[articleId].revision < revisionId) {
                    articles[articleId] = {
                        articleId: articleId,
                        blockNumber: log.blockNumber,
                        transaction: log.transactionHash,
                        revision: revisionId,
                        hash: hash
                    };
                }
            } catch (error) {
                console.log("Error processing article entry", error);
            }
        });

        const result = Object.values(articles);

        result.sort((a, b) => {
            return (a.articleId - b.articleId);
        });

        return result;
    }

    // Determine the source for the article based on the URL
    const source = { };
    {
        const fragment = location.hash.substring(1).split("&").reduce((accum, pair) => {
            const match = pair.match(/([a-z]+)=(.*)/i);
            if (!match) {
                console.log("invalid hash pair", pair);
            } else if (fragment[match[1]]) {
                console.log("duplicate hash key", pair);
            } else {
                accum[match[1]] = match[2];
            }
            return accum
        }, { });
        console.log(fragment);

        const comps = location.hostname.split(".");
        if (comps.length === 3) {

            // NAME.waxlit.com/ARTICLE_ID-junk
            // NAME.waxlit.com/#ARTICLE_ID-junk
            source.ensName = comps[0] + ".eth";
            {
                const pathId = location.pathname.substring(1).split("-")[0];
                if (pathId.match(/[0-9]+/)) {
                    source.articleId = parseInt(pathId);
                } else if ((location.hash || "#").substring(1).match(/[0-9]+/)) {
                    source.articleId = parseInt(location.hash.substring(1));
                }
            }

//        } else if (comps.length < 3) {
            // waxlit.com#ensName=NAME&hash=HASH&secret=SECRET&network=NETWROK
//            source.ensName = fragment.ensName;
//            source.articleId = fragment

        } else {
            throw new Error("bad hostname");
        }
    }
    console.log(source);

    // Get the correct article
    const articles = await getArticles(source.ensName);
    console.log(articles);

    const article = articles[source.articleId];
    console.log("Loadin Article: ", article);

    const { timestamp, } = await ethers.providers.resolveProperties({
        timestamp: provider.getBlock(article.blockNumber).then((block) => {
            return new Date(block.timestamp * 1000);
        })
    });

    console.log(timestamp);

    const inject = document.getElementById("inject");

    const Types = {
        "bold": "b",
        "code": "code",
        "italic": "i",
        "strikeout": "strike",
        "underline": "u",
    }

    function updateDocument(markdown) {
        //console.log("MARKDOWN", markdown);
        const ast = exports.parseMarkdown(markdown)
        //console.log("AST", ast);

        function build(node) {
            let element = null;
            if (node instanceof exports.ParentNode) {
                element = document.createElement(Types[node.type] || "span");
                node.children.forEach((child) => {
                    element.appendChild(build(child));
                });
            } else if (node instanceof exports.TextNode) {
                element = document.createTextNode(node.text);

            } else if (node instanceof exports.SubtitleNode) {
                element = document.createElement("h2");
                element.appendChild(document.createTextNode(node.title));
            } else if (node instanceof exports.TitleNode) {
                element = document.createElement("h1");
                element.appendChild(document.createTextNode(node.title));

            } else if (node instanceof exports.ListNode) {
                element = document.createElement("ul");
                node.items.forEach((item) => {
                    const li = document.createElement("li");
                    li.appendChild(build(item));
                    element.appendChild(li);
                });
            } else if (node instanceof exports.CodeNode) {
                element = document.createElement("code");
                element.appendChild(document.createTextNode(node.code));
            }
            //console.log("NODE", node, element);
            return element;
        }

        while (inject.firstChild) { inject.removeChild(inject.firstChild); }
        ast.forEach((block) => {
            const p = document.createElement("p");
            p.appendChild(build(block));
            inject.appendChild(p);
        });
    }

    const textarea = document.getElementById("editor");
    textarea.oninput = function() {
        updateDocument(textarea.value);
    };
    updateDocument(textarea.value);


})();
