"use strict";

export type Visitor = (node: Node) => void;

export class Node {
    visit(visitor: Visitor): void {
        visitor(this);
    }
}

export interface InlineNode extends Node { }

export interface BlockNode extends Node { }


export abstract class ParentNode extends Node {
    children: Array<InlineNode>

    constructor(children: Array<InlineNode>) {
        super();
        this.children = children.slice();
    }

    visit(visitor: Visitor): void {
        super.visit(visitor);
        this.children.forEach((child) => {
            child.visit(visitor);
        });
    }
}


export class TitleNode extends Node implements BlockNode {
    title: string;

    constructor(title: string) {
        super();
        this.title = title;
    }
}

export class SubtitleNode extends TitleNode { }

export class ParagraphNode extends Node implements BlockNode {
    root: ElementNode;

    constructor(root: ElementNode) {
        super();
        this.root = root;
    }
}

export class ListNode extends Node implements BlockNode {
    items: Array<InlineNode>;

    constructor(items: Array<InlineNode>) {
        super();
        this.items = items;
    }
}

export class CodeNode extends Node implements BlockNode {
    code: string;
    language?: string;

    constructor(code: string, language?: string) {
        super();
        this.code = code;
        this.language = language || null;
    }
}


export enum ElementType {
    BOLD      = "bold",
    CODE      = "code",
    ITALIC    = "italic",
    STRIKEOUT = "strikeout",
    SUPER     = "super",
    UNDERLINE = "underline"
};

export class ElementNode extends ParentNode implements InlineNode {
    static TYPES = ElementType;

    readonly type: ElementType;

    constructor(type: ElementType, children: Array<InlineNode>) {
        super(children);
        this.type = type;
    }
}

export class TextNode extends Node implements InlineNode {
    text: string;

    constructor(text: string) {
        super();
        this.text = text;
    }
}

/* @TODO:
export function unescapeBackslash(text: string): string {
    return text.replace(/\\(.)/g, function(all, char) {
        return char;
    });
}
*/

type Candidate = {
    offset: number;
    process: () => InlineNode;
};

function _parseParagraph(markdown: string): InlineNode {

    const candidates: Array<Candidate> = [ ];

    (function (matchStyle) {
        if (matchStyle == null) { return; }

        const open = matchStyle[1].length;
        const close = markdown.indexOf(matchStyle[2], open + 2);

        if (close === -1) {
            return;
            // @TODO: Strict mode (so this code could eventually be reused in Flatworm?)
            //throw new Error(`missing closing "${ matchStyle[2] }" near ${ JSON.stringify(markdown) }`);
        }

        const Types: { [ token: string ]: ElementType } = {
            "**": ElementNode.TYPES.BOLD,
            "``": ElementNode.TYPES.CODE,
            "/\/": ElementNode.TYPES.ITALIC,
            "~~": ElementNode.TYPES.STRIKEOUT,
            "^^": ElementNode.TYPES.SUPER,
            "__": ElementNode.TYPES.UNDERLINE,
        };

        const type = Types[matchStyle[2]];

        candidates.push({
            offset: matchStyle[1].length,
            process: () => {
                const result: Array<InlineNode> = [ ];
                if (open > 0) {
                    result.push(new TextNode(matchStyle[1]));
                }

                const node = _parseParagraph(markdown.substring(open + 2, close))
                if (node instanceof ElementNode && node.type == null) {
                    result.push(new ElementNode(type, node.children));
                } else {
                    result.push(new ElementNode(type, [ node ]));
                }

                if (close + 2 < markdown.length) {
                    const tail = _parseParagraph(markdown.substring(close + 2));
                    if (tail instanceof ElementNode && tail.type == null) {
                        tail.children.forEach((child) => {
                            result.push(child);
                        });
                    } else {
                        result.push(tail);
                    }
                }

                if (result.length === 1) { return result[0]; }
                return new ElementNode(null, result);
            }
        });
    })(markdown.match(/^((?:.|\n)*?)(\*\*|\/\/|__|\^\^|~~|``)((?:.|\n)*)$/));

    if (candidates.length) {
        return candidates[0].process();
    }

    return new TextNode(markdown);
}

export function parseParagraph(markdown: string): InlineNode {
    markdown = markdown.replace(/\s+/g, " ").trim();
    const node = _parseParagraph(markdown);
    if (node instanceof ElementNode && node.type == null && node.children.length === 1) {
        return node.children[0];
    }
    return node;
}

export function parseListNode(markdownItems: Array<string>): ListNode {
    return new ListNode(markdownItems.map((i) => parseParagraph(i)));
}

export function parseMarkdown(markdown: string): Array<BlockNode> {
    const blocks: Array<BlockNode> = [ ];

    let currentBlock: Array<string> = [ ];
    let inList = false, inCode = false;

    const clearBlock = function() {
        if (currentBlock.length !== 0) {
            if (inList) {
                const items = currentBlock.reduce((accum, item) => {
                    item = item.trim();
                    if (item[0] === "-") {
                        accum.push("");
                        item = item.substring(1);
                    }
                    accum[accum.length - 1] += " " + item
                    return accum;
                },  <Array<string>>[ ]);

                blocks.push(new ListNode(items.map((i) => parseParagraph(i))));

            } else {
                blocks.push(parseParagraph(currentBlock.join(" ")));
            }
        }
        inList = false;
        currentBlock = [ ];
    };

    const clearCode = function() {
        const language = currentBlock.shift().substring(3) || null;
        blocks.push(new CodeNode(currentBlock.join("\n").trim(), language));
        inCode = false;
        currentBlock = [ ];
    };

    markdown.split("\n").forEach((line, index) => {
        // Code Blocks (which allow blank lines)
        if (line.substring(0, 3) === "```") {
            if (inCode) {
                clearCode();
            } else {
                clearBlock();
                inCode = true;
                currentBlock.push(line);
            }
        } else if (inCode) {
            currentBlock.push(line);

        // Blank lines end a block
        } else if (line.trim() === "") {
            clearBlock();

        // Titles
        } else if (line.match(/^##/)) {
            clearBlock();
            blocks.push(new SubtitleNode(line.substring(2).trim()));
        } else if (line.match(/^#/)) {
            clearBlock();
            blocks.push(new TitleNode(line.substring(2).trim()));

        // Bullet list item (may be starting a new list or continuing)
        } else if (line.trim()[0] === "-") {
            if (!inList) {
                clearBlock();
                inList = true;
            }
            currentBlock.push(line);
        } else {
            currentBlock.push(line);
        }
    });

    if (inCode) {
        clearCode();
    } else {
        clearBlock();
    }

    return blocks;
}

