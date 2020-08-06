"use strict";

import { ethers } from "ethers";

import { Article, ArticleInfo } from "./article";
import {
    Node as MarkdownNode,
    CodeNode as MarkdownCodeNode,
    ElementNode as MarkdownElementNode,
    ImageNode as MarkdownImageNode,
    ListNode as MarkdownListNode,
    ParentNode as MarkdownParentNode,
    SubtitleNode as MarkdownSubtitleNode,
    TextNode as MarkdownTextNode,
    TitleNode as MarkdownTitleNode,
} from "./markdown";
import { parseMarkdown } from "./markdown";

const Types: { [ tag: string ]: string } = {
    "bold": "b",
    "code": "code",
    "italic": "i",
    "strikeout": "strike",
    "underline": "u",
}


function renderBlock(node: MarkdownNode): Node {
    let element: Node = null;
    if (node instanceof MarkdownParentNode) {
        element = document.createElement(Types[(<MarkdownElementNode>node).type] || "span");
        node.children.forEach((child) => {
            element.appendChild(renderBlock(child));
        });

    } else if (node instanceof MarkdownTextNode) {
        element = document.createTextNode(node.text);

    } else if (node instanceof MarkdownSubtitleNode) {
        element = document.createElement("h3");
        element.appendChild(document.createTextNode(node.title));
    } else if (node instanceof MarkdownTitleNode) {
        element = document.createElement("h2");
        element.appendChild(document.createTextNode(node.title));

    } else if (node instanceof MarkdownImageNode) {
        element = document.createElement("div");

        // @TODO: Prolly want to sanitize src?
        const img = document.createElement("img");
        img.setAttribute("src", node.src);

        const divImg = document.createElement("div");
        (<HTMLElement>element).appendChild(divImg);
        divImg.classList.add("image");
        divImg.appendChild(img);

        if (node.caption) {
            const divCaption = document.createElement("div");
            (<HTMLElement>element).appendChild(divCaption);
            divCaption.classList.add("caption");
            divCaption.classList.add("image");
            divCaption.appendChild(document.createTextNode(node.caption));
        }

    } else if (node instanceof MarkdownListNode) {
        element = document.createElement("ul");
        node.items.forEach((item) => {
            const li = document.createElement("li");
            li.appendChild(renderBlock(item));
            element.appendChild(li);
        });

    } else if (node instanceof MarkdownCodeNode) {
        const content = document.createElement("code");
        content.appendChild(document.createTextNode(node.code));

        element = document.createElement("div");
        (<HTMLElement>element).className = "code-block";
        element.appendChild(content);
    }

    return element;
}

const Months = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "Octoboer", "November", "December" ];

class App {
    readonly provider: ethers.providers.Provider;

    readonly secretKey: string;
    readonly hash: string;
    readonly ensName: string;
    readonly articleId: number;

    constructor(provider: ethers.providers.Provider) {
        this.provider = provider;
    }

    renderMarkdown(markdown: string): void {
        const ast = parseMarkdown(markdown)

        const inject = document.getElementById("inject");

        while (inject.firstChild) { inject.removeChild(inject.firstChild); }

        let titleFound = false;
        ast.forEach((block) => {
            if (block instanceof MarkdownTitleNode && !titleFound) {
                document.getElementById("title").textContent = block.title;
                titleFound = true;
                return;
            }

            const p = document.createElement("p");
            p.appendChild(renderBlock(block));
            inject.appendChild(p);
        });
    }

    setupInterface(): void {
        document.getElementById("button-new").onclick = () => {
            const ensName = prompt("What is your ENS name?");
            const key = ethers.utils.hexlify(ethers.utils.randomBytes(16));
            window.open(`${ this.getBaseUrl() }#action=edit&ens=${ ensName }&key=${ key }`, "_blank");
        };

        document.getElementById("button-edit").onclick = () => {
            console.log(this);
            if (this.articleId) {
                window.open(`${ this.getBaseUrl() }#action=edit&ens=${ this.ensName }&article=${ this.articleId }`, "_blank");
            } else {
                window.open(`${ this.getBaseUrl() }#action=edit&ens=${ this.ensName }&key=${ this.secretKey }&hash=${ this.hash }`, "_blank");
            }
        };
    }

    async renderBanner(): Promise<void> {
        const nodehash = ethers.utils.namehash(this.ensName);
        console.log(nodehash);

        const network = await this.provider.getNetwork();
        const ens = new ethers.Contract(network.ensAddress, [
            "function resolver(bytes32 node) view returns (address)"
        ], this.provider);

        const resolverAddr = await ens.resolver(nodehash);
        const resolver = new ethers.Contract(resolverAddr, [
            "function text(bytes32 nodehash, string key) view returns (string)"
        ], this.provider);

        const { avatar } = await ethers.utils.resolveProperties({
            avatar: resolver.text(nodehash, "avatar")
        });
        // @TODO: USe default image
        console.log(avatar);

        document.getElementById("avatar").setAttribute("src", avatar);
        document.getElementById("name").textContent = this.ensName.split(".")[0];
    }

    renderDate(date: Date): void {
        document.getElementById("date-month").textContent = String(Months[date.getMonth()]);

        const day = date.getDate();
        document.getElementById("date-day").textContent = String(day);
        switch (day % 10) {
            case 1: case 21: case 31:
                document.getElementById("date-suffix").textContent = "st";
                break;
            case 2: case 22:
                document.getElementById("date-suffix").textContent = "nd";
                break;
            case 3: case 23:
                document.getElementById("date-suffix").textContent = "rd";
                break;
            default:
                document.getElementById("date-suffix").textContent = "th";
                break;
        }

        const delta = (new Date()).getTime() - date.getTime();
        if (delta > (5 * 31 * 24 * 60 * 60 * 1000)) {
            document.getElementById("date-year").textContent = (", " + String(date.getFullYear()));
        }
    }

    clearPreview(): void {
        const previewContainer = document.getElementById("preview-container");
        previewContainer.classList.remove("enabled");
    }

    renderPreview(key: string, hash: string): void {
        const previewContainer = document.getElementById("preview-container");
        const preview = document.getElementById("preview");

        previewContainer.classList.add("enabled");
        preview.setAttribute("href", `${ this.getBaseUrl() }#action=preview&ens=${ this.ensName  }&key=${ key }&hash=${ hash }`);
    }

    renderPublishLink(articleId: number): void {
        const container = document.getElementById("publish-link-container");
        const link = document.getElementById("publish-link");

        container.classList.add("enabled");

        link.setAttribute("href", this.getBaseUrl(this.ensName) + (this.isDev ? "?": "") + articleId);
    }

    setupEditor(markdown?: string): void {
        const ethereum = (<any>window).ethereum;

        //const buttonAdd = document.getElementById("button-add");
        const buttonSave = document.getElementById("button-save");

        const textarea: HTMLInputElement = <HTMLInputElement>(document.getElementById("editor"));
        textarea.oninput = () => {
            this.renderMarkdown(textarea.value);
            this.clearPreview();

            if (textarea.value.length === 0) {
                buttonSave.classList.remove("enabled");
            } else {
                buttonSave.classList.add("enabled");
            }
            textarea.classList.remove("saved");
        };

        if (markdown) {
            textarea.classList.add("saved");
            textarea.value = markdown;
            this.renderMarkdown(markdown);
        }

        buttonSave.onclick = () => {
            const content = textarea.value;
            Article.from(content).save(this.secretKey).then((hash) => {
                if (content === textarea.value) {
                    textarea.classList.add("saved");
                    this.updateParameters({ hash });
                    this.renderPreview(this.secretKey, hash);
                }
            }, (error) => {
                console.log(error);
            });
        };

        if (ethereum) {
            const buttonPublish = document.getElementById("button-publish");
            buttonPublish.classList.add("enabled");

            buttonPublish.onclick = async () => {
                const content = textarea.value;

                let enabled = false;
                if (ethereum.enable) {
                    enabled = await ethereum.enable();
                }
                console.log(enabled);
                if (!enabled) {
                    alert("app not authorized");
                    return;
                }

                const signer = (new ethers.providers.Web3Provider(ethereum)).getSigner();
                console.log(signer);
                const { ensAddr, signerAddr } = await ethers.utils.resolveProperties({
                    ensAddr: this.provider.resolveName(this.ensName),
                    signerAddr: signer.getAddress()
                });

                if (ensAddr !== signerAddr) {
                    console.log(ensAddr, signerAddr);
                    alert("Current account does not match waxlit account");
                    return;
                }

                const articles = await Article.listArticles(this.provider, this.ensName);

                // Defaults for a new (first) article
                let revision = 1;
                let articleId = 11;

                if (this.articleId != null) {
                    // We are modifying an existing article...
                    articleId = this.articleId;

                    // Find the current revision and increment this revision
                    const info = articles.filter((a) => (a.articleId === articleId))[0];
                    if (!info) {
                        alert(`Could not find article ${ articleId } for ${ this.ensName }`);
                        return;
                    }
                    revision = info.revision + 1;

                } else if (articles.length) {
                    // We already have articles; find the next articleId
                    // Note: we space them out by 10 so we can insert in the middle
                    // in the future if needed
                    const latest = articles[articles.length - 1];
                    articleId = latest.articleId + 10;
                    revision = latest.revision + 1;
                }

                const article = Article.from(content);
                const tx = await article.publishTransaction(this.ensName, this.secretKey, articleId, revision);
                console.log(tx);

                if (content === textarea.value) {
                    textarea.classList.add("saved");
                }

                const txResponse = await signer.sendTransaction(tx);
                console.log(txResponse);

                const receipt = await txResponse.wait();
                console.log(receipt);

                this.renderPublishLink(articleId);
                this.updateParameters({ article: String(articleId), key: null, hash: null });
            };
        }
    }

    getParameters(): { [ key: string ]: string } {
        return location.hash.substring(1).split("&").reduce((accum, pair) => {
            const match = pair.match(/([a-z]+)=(.*)/i);
            if (!match) {
                console.log("invalid hash pair", pair);
            } else if (accum[match[1]]) {
                console.log("duplicate hash key", pair);
            } else {
                accum[match[1]] = match[2];
            }
            return accum
        }, <{ [ key: string ]: string }>{ });
    }

    updateParameters(updates: { [ key: string ]: string }): void {
        const params = this.getParameters();
        for (const key in updates) { params[key] = updates[key]; }

        location.hash = "#" + Object.keys(params).map((key) => {
            if (params[key] == null) { return null; }
            return `${ key }=${ params[key] }`
        }).filter((p) => !!p).join("&");
    }

    startEditor(markdown?: string): void {
        document.body.classList.add("editing");
        this.setupEditor(markdown);
    }

    startPreview(): void {
        Article.load(this.secretKey, this.hash).then((article) => {
            this.renderMarkdown(article.body);
        });
    }

    startView(articleInfo: ArticleInfo): void {
        this.provider.getBlock(articleInfo.blockNumber).then((block) => {
            this.renderDate(new Date(block.timestamp * 1000));
        });

        Article.load(articleInfo.secretKey, articleInfo.hash).then((article) => {
            this.renderMarkdown(article.body);
        });
    }

    get isDev(): boolean {
        return (location.href.substring(0, 7) === "http://");
    }

    getBaseUrl(ensName?: string): string {
        if (ensName) {
            ensName = ensName.split(".")[0] + ".";
        } else {
            ensName = "";
        }

        if (this.isDev) {
            return `http://${ ensName }waxlit.local:8001/`;
        }

        return `https://${ ensName }waxlit.com/`;
    }

    async getArticleInfo(articleId: number): Promise<ArticleInfo> {
        const infos = await Article.listArticles(this.provider, this.ensName);
        const info = infos.filter((a) => (a.articleId === articleId))[0];
        if (!info) { return null; }
        return info;
    }

    async start(): Promise<void> {
        console.log("Starting app...");

        this.setupInterface();

        const comps = location.hostname.split(".");
        if (comps.length === 2) {
            const params = this.getParameters();

            if (params.action === "preview") {
                ethers.utils.defineReadOnly(this, "secretKey", params.key);
                ethers.utils.defineReadOnly(this, "hash", params.hash);
                ethers.utils.defineReadOnly(this, "ensName", params.ens);
                this.renderBanner();
                this.startPreview();

            } else if (params.action === "edit") {
                ethers.utils.defineReadOnly(this, "ensName", params.ens);
                this.renderBanner();

                if (params.article) {
                    ethers.utils.defineReadOnly(this, "articleId", parseInt(params.article));

                    const info = await this.getArticleInfo(this.articleId);
                    if (!info) {
                        alert(`article ${ params.article } not found for ${ this.ensName }.`);
                        return;
                    }

                    ethers.utils.defineReadOnly(this, "secretKey", info.secretKey);
                    ethers.utils.defineReadOnly(this, "hash", info.hash);

                    const article = await Article.load(this.secretKey, this.hash);
                    this.startEditor(article.body);

                } else if (params.hash) {
                    ethers.utils.defineReadOnly(this, "hash", params.hash);
                    ethers.utils.defineReadOnly(this, "secretKey", params.key);

                    const article = await Article.load(this.secretKey, this.hash);
                    this.startEditor(article.body);
                    this.renderPreview(this.secretKey, this.hash);

                } else {
                    ethers.utils.defineReadOnly(this, "secretKey", params.key);
                    this.startEditor();
                }

            } else {
                alert(`unknown action`);
            }

        } else if (comps.length === 3) {
            ethers.utils.defineReadOnly(this, "ensName", comps[0] + ".eth");
            this.renderBanner();

            let articleId: number = null;
            if (this.isDev) {
                articleId = parseInt(location.search.substring(1).split("-")[0]);
            } else {
                articleId = parseInt(location.pathname.substring(1).split("-")[0]);
            }
            ethers.utils.defineReadOnly(this, "articleId", articleId);
            const info = await this.getArticleInfo(articleId); //articles.filter((a) => a.articleId === articleId)[0];

            if (info) {
                this.startView(info);
            } else {
                alert(`article ${ articleId } not found for ${ this.ensName }.`);
            }
        }

        console.log(await Article.listArticles(this.provider, this.ensName));
    }
}

let app: App = null;
export function start(network?: string) {
    if (app) { throw new Error("app already created"); }
    app = new App(ethers.getDefaultProvider(network || "homestead"));
    app.start();
};
