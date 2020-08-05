
import aesjs from "aes-js";
import { ethers } from "ethers";


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


export interface ArticleInfo {
    readonly articleId: number;
    readonly revision: number;
    readonly secretSalt: string;
    readonly hash: string;
    readonly blockNumber: number;
    readonly transaction: string;
}

export class Article {
    readonly title: string;
    readonly body: string;

    constructor(constructorGuard: any, title: string, body: string) {
        if (constructorGuard !== _constructorGuard) {
            throw new Error("do not constructor");
        }
        this.title = title;
        this.body = body;
    }

    payload(salt: string): string {
        return JSON.stringify({
            title: this.title,
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

    async save(key: string): Promise<string> {
        const data = this.encrypt(key);
        console.log(data);
        return null;
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

                const secretSalt = ethers.utils.hexZeroPad(ethers.BigNumber.from(log.args[1]).shr(8 * 10).mask(8 * 16).toHexString(), 16);
                const articleId = ethers.BigNumber.from(log.args[1]).shr(8 * 4).mask(8 * 6).toNumber();
                const revision = ethers.BigNumber.from(log.args[1]).shr(8 * 0).mask(8 * 4).toNumber();
                const hashBin = ethers.utils.concat([ [ 18, 32 ], log.args[2] ]);
                const hash = ethers.utils.base58.encode(hashBin);

                if (articles[articleId] == null || articles[articleId].revision < revision) {
                    articles[articleId] = { articleId, blockNumber, hash, transaction, revision, secretSalt };
                }
            } catch (error) {
                console.log("Error processing article entry", error);
            }
        });

        const result = Object.values(articles).filter((ai) => !ethers.BigNumber.from(ai.secretSalt).isZero());
        result.sort((a, b) => (a.articleId - b.articleId));

        return result;
    }

    static from(title: string, body: string): Article {
        return new Article(_constructorGuard, title, body);
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
            return new Article(_constructorGuard, content.title, content.body);
        } catch (error) { }

        throw new Error("incorrect key");
    }

    static async load(key: string, multihash: string): Promise<void> {
        return null;
    }
}

(async function() {
    const key = "0x01234567012345670123456701234567";
    const art = Article.from("Hello World", "My body, my rules");
    const hash = await art.save(key);
    console.log(hash);
    const data = art.encrypt(key)
    const orig = Article.decrypt(key, data);
    console.log(ethers.utils.hexlify(data), orig);

    const articles = await Article.listArticles(ethers.getDefaultProvider("ropsten"), "ricmoose.eth");
    console.log(articles);
})();
