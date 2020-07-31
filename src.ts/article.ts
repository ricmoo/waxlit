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

console.log(MAGIC);

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

    encrypt(key: string): Uint8Array {
        const baseSymKey = ethers.utils.id(key);
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

    save(key: string): Promise<string> {
        const data = this.encrypt(key);
        console.log(data);
        return null;
    }

    static from(title: string, body: string): Article {
        return new Article(_constructorGuard, title, body);
    }

    static decrypt(key: string, data: Uint8Array): Article {
        // Check the Magic Number
        try {
            for (let i = 0; i < MAGIC.length; i++) {
                if (data[i] !== MAGIC[i]) { throw new Error(""); }
            }
        } catch (error) {
            throw new Error("invalid waxLit article magic number");
        }

        const baseSymKey = ethers.utils.id(key);
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

const art = Article.from("Hello World", "My body, my rules");
const data = art.encrypt("01234567")
const orig = Article.decrypt("01234567", data);
console.log(orig);
