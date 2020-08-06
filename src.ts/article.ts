
import aesjs from "aes-js";
import { ethers } from "ethers";

const { Ipfs } = require("./ipfs");
const { Gateway } = require("./gateway");

const ipfs = new Ipfs(new Gateway());

const _constructorGuard = {};

// Magic Number; based on PNG magic number
// See:  https://en.wikipedia.org/wiki/Portable_Network_Graphics#File_header
const MAGIC = ethers.utils.concat([
    [ 0x89 ],
    ethers.utils.toUtf8Bytes("waxLit"),
    ethers.utils.toUtf8Bytes("\r\n"),
    [ 0x1a ],
    ethers.utils.toUtf8Bytes("\n"),
]);

const spoolAddress = "0x5C9bef28344Df7F7e67a1C5CF124dC707a973b07";

const spoolAbi = [
    "event NewArticle(bytes32 indexed nodehash, bytes32 info, bytes32 multihash)",
    "function delegatedPostArticles(bytes32[] nodehashes, bytes32[] articleInfos, bytes32[] multihashes, tuple(bytes32 r, bytes32 vs)[] signatures)",
    "function isAuthorized(bytes32 nodehash, address addr, uint256 gasLimit) view returns (bool)",
    "function postArticles(bytes32[] nodehashes, bytes32[] articleInfos, bytes32[] multihashes)"
];

function getSpoolContract(provider: ethers.providers.Provider): ethers.Contract {
    return new ethers.Contract(spoolAddress, spoolAbi, provider);
}

const VERSION = ethers.BigNumber.from(1);
export function getArticleInfo(article: number, revision: number, secretKey: ethers.utils.BytesLike): string {
    const articleId = ethers.BigNumber.from(article);
    if (!articleId.shr(8 * 6).isZero()) { throw new Error("articleId too large"); }

    const revisionId = ethers.BigNumber.from(revision);
    if (!revisionId.shr(8 * 4).isZero()) { throw new Error("revisionId too large"); }

    const secret = ethers.BigNumber.from(secretKey);
    if (!secret.shr(8 * 16).isZero()) { throw new Error("secret too large"); }

    return ethers.utils.hexZeroPad(ethers.constants.Zero
           .or(VERSION.shl(8 * 31))
           .or(secret.shl(8 * 10))
           .or(articleId.shl(8 * 4))
           .or(revisionId.shl(8 * 0)).toHexString(), 32);
}

export interface ArticleInfo {
    readonly articleId: number;
    readonly revision: number;
    readonly secretKey: string;
    readonly hash: string;
    readonly blockNumber: number;
    readonly transaction: string;
}

export class Article {
    readonly body: string;

    constructor(constructorGuard: any, body: string) {
        if (constructorGuard !== _constructorGuard) {
            throw new Error("do not constructor");
        }
        this.body = body;
    }

    payload(salt: string): string {
        return JSON.stringify({
            body: this.body,
            salt: salt
        });
    }

    encrypt(key: ethers.utils.BytesLike): Uint8Array {
        const keyBytes = ethers.utils.arrayify(key);
        if (keyBytes.length !== 16) { throw new Error("invalid key"); }

        const baseSymKey = ethers.utils.keccak256(keyBytes);
        const secretSalt = ethers.utils.hexlify(ethers.utils.randomBytes(16));
        const salt = ethers.utils.arrayify(ethers.utils.keccak256(secretSalt)).slice(0, 16);
        const symKey = ethers.utils.keccak256(ethers.utils.concat([ baseSymKey, salt ]));
        const aes = new aesjs.ModeOfOperation.ctr(ethers.utils.arrayify(symKey), new aesjs.Counter(salt));
        return ethers.utils.concat([
            MAGIC,
            salt,
            aes.encrypt(ethers.utils.toUtf8Bytes(this.payload(secretSalt)))
        ]);
    }

    async save(key: ethers.utils.BytesLike): Promise<string> {
        const data = this.encrypt(key);
        const result = await ipfs.put(data);
        return result.Key;
    }

    async publishTransaction(ensName: string, key: ethers.utils.BytesLike, articleId: number, revisionId: number): Promise<ethers.providers.TransactionRequest> {
        const hash = await this.save(key);
        const contract = getSpoolContract(ethers.getDefaultProvider())
        const tx = await contract.populateTransaction.postArticles(
            [ ethers.utils.namehash(ensName) ],
            [ getArticleInfo(articleId, revisionId, key) ],
            [ ethers.utils.base58.decode(hash).slice(2) ]
        );

        return tx;
    }

    static async listArticles(provider: ethers.providers.Provider, ensName: string): Promise<Array<ArticleInfo>> {
        const contract = getSpoolContract(provider);

        const articles: { [ articleId: number ]: ArticleInfo } = { };

        const filter = contract.filters.NewArticle(ethers.utils.namehash(ensName));
        const logs = await contract.queryFilter(filter, 0);

        logs.forEach((log) => {
            try {
                const blockNumber = log.blockNumber;
                const transaction = log.transactionHash;

                const version = ethers.BigNumber.from(log.args[1]).shr(8 * 31).toNumber();
                if (version !== 1) { throw new Error("unsupported version"); }

                const secretKey = ethers.utils.hexZeroPad(ethers.BigNumber.from(log.args[1]).shr(8 * 10).mask(8 * 16).toHexString(), 16);
                const articleId = ethers.BigNumber.from(log.args[1]).shr(8 * 4).mask(8 * 6).toNumber();
                const revision = ethers.BigNumber.from(log.args[1]).shr(8 * 0).mask(8 * 4).toNumber();
                const hashBin = ethers.utils.concat([ [ 18, 32 ], log.args[2] ]);
                const hash = ethers.utils.base58.encode(hashBin);

                if (articles[articleId] == null || articles[articleId].revision < revision) {
                    articles[articleId] = { articleId, blockNumber, hash, transaction, revision, secretKey };
                }
            } catch (error) {
                console.log("Error processing article entry", error);
            }
        });

        const result = Object.values(articles).filter((ai) => !ethers.BigNumber.from(ai.secretKey).isZero());
        result.sort((a, b) => (a.articleId - b.articleId));

        return result;
    }

    static async fromArticleInfo(articleInfo: ArticleInfo): Promise<Article> {
        const article = await Article.load(articleInfo.secretKey, articleInfo.hash);
        return article;
    }

    static from(body: string): Article {
        return new Article(_constructorGuard, body);
    }

    static decrypt(key: ethers.utils.BytesLike, data: Uint8Array): Article {
        // Check the Magic Number
        try {
            for (let i = 0; i < MAGIC.length; i++) {
                if (data[i] !== MAGIC[i]) { throw new Error(""); }
            }
        } catch (error) {
            throw new Error("invalid waxLit article magic number");
        }

        const keyBytes = ethers.utils.arrayify(key);
        if (keyBytes.length !== 16) { throw new Error("invalid key"); }

        const baseSymKey = ethers.utils.keccak256(keyBytes);
        const salt = data.slice(MAGIC.length, MAGIC.length + 16);
        const symKey = ethers.utils.keccak256(ethers.utils.concat([ baseSymKey, salt ]));
        const aes = new aesjs.ModeOfOperation.ctr(ethers.utils.arrayify(symKey), new aesjs.Counter(salt));

        try {
            const content = JSON.parse(ethers.utils.toUtf8String(aes.decrypt(data.slice(MAGIC.length + 16))));
            const secretSalt = content.salt;
            const saltCheck = ethers.utils.arrayify(ethers.utils.keccak256(secretSalt)).slice(0, 16);
            if (ethers.utils.hexlify(salt) !== ethers.utils.hexlify(saltCheck)) {
                throw new Error("incorrect key");
            }
            return new Article(_constructorGuard, content.body);
        } catch (error) { }

        throw new Error("incorrect key");
    }

    static async load(key: ethers.utils.BytesLike, hash: string): Promise<Article> {
        console.log(hash);
        const data = await ipfs.get(hash);
        return Article.decrypt(key, data);
    }
}

/*
(async function() {
    const key = "0x01234567012345670123456701234567";
    const art = Article.from("Hello World", "My body, my rules");
    const hash = await art.save(key);
    console.log(hash);
    const loadedArt = await Article.load(key, "QmVjjLMHZLr8p7ycyacBYGGgveAoTXMvtMwberccWUvDFY");
    console.log("Loaded:", loadedArt);
    //const data = art.encrypt(key)
    //const orig = Article.decrypt(key, data);
    //console.log(ethers.utils.hexlify(data), orig);

    const articles = await Article.listArticles(ethers.getDefaultProvider("ropsten"), "ricmoose.eth");
    console.log(articles);
})();
*/
