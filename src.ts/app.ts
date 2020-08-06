"use strict";

import { ethers } from "ethers";

import { Article, ArticleInfo } from "./article";
import {
    Node as MarkdownNode,
    CodeNode as MarkdownCodeNode,
    ElementNode as MarkdownElementNode,
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

const baseUrl = "http://waxlit.local:8001";

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
            window.open(`${ baseUrl }/#action=edit&ens=${ ensName }&key=${ key }`, "_blank");
        };
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
        preview.setAttribute("href", `${ baseUrl }/#action=preview&ens=${ this.ensName  }&key=${ key }&hash=${ hash }`);
    }

    renderPublishLink(articleId: number): void {
        const container = document.getElementById("publish-link-container");
        const link = document.getElementById("publish-link");

        container.classList.add("enabled");

        link.setAttribute("href", baseUrl.replace(":/\/", ":/\/" + this.ensName.split(".")[0] + ".") + ((baseUrl.indexOf("local") >= 0) ? "?": "") + articleId);
    }

    setupEditor(markdown?: string): void {
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
            console.log("HH", this);
            Article.from(content).save(this.secretKey).then((hash) => {
                if (content === textarea.value) {
                    textarea.classList.add("saved");
                    this.renderPreview(this.secretKey, hash);
                }
            }, (error) => {
                console.log(error);
            });
        };

        const ethereum = (<any>window).ethereum;
        if (ethereum) {
            const buttonPublish = document.getElementById("button-publish");
            buttonPublish.classList.add("enabled");
            buttonPublish.onclick = async () => {
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
                let revision = 1;
                let articleId = 11;
                if (articles.length) {
                    const latest = articles[articles.length - 1];
                    articleId = latest.articleId + 10;
                    revision = latest.revision + 1;
                }

                const article = Article.from(textarea.value);
                const tx = await article.publishTransaction(this.ensName, this.secretKey, articleId, revision);
                console.log(tx);

                const txResponse = await signer.sendTransaction(tx);
                console.log(txResponse);

                const receipt = await txResponse.wait();
                console.log(receipt);

                this.renderPublishLink(articleId);
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
                this.startPreview();

            } else if (params.action === "edit") {
                ethers.utils.defineReadOnly(this, "secretKey", params.key);
                ethers.utils.defineReadOnly(this, "ensName", params.ens);

                if (params.hash) {
                    ethers.utils.defineReadOnly(this, "hash", params.hash);

                    const article = await Article.load(this.secretKey, this.hash);
                    this.startEditor(article.body);
                    this.renderPreview(this.secretKey, this.hash);
                } else {
                    this.startEditor();
                }

            } else {
                alert(`unknown action`);
            }

        } else if (comps.length === 3) {
            ethers.utils.defineReadOnly(this, "ensName", comps[0] + ".eth");
            const articles = await Article.listArticles(this.provider, this.ensName);

            let articleId: number = null;
            if (baseUrl.substring(0, 7) === "http:/\/") {
                articleId = parseInt(location.search.substring(1).split("-")[0]);
            } else {
                articleId = parseInt(location.pathname.substring(1).split("-")[0]);
            }
            const article = articles.filter((a) => a.articleId === articleId)[0];

            if (article) {
                this.startView(article);
            } else {
                alert(`article ${ articleId } not found for ${ this.ensName }.`);
            }
        }
    }
}

let app: App = null;
export function start(network?: string) {
    if (app) { throw new Error("app already created"); }
    app = new App(ethers.getDefaultProvider(network || "homestead"));
    app.start();
};
