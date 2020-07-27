(function() {
    const inject = document.getElementById("inject");

    const Types = {
        "bold": "b",
        "code": "code",
        "italic": "i",
        "strikeout": "strike",
        "underline": "u",
    }

    function updateDocument(markdown) {
        console.log("MARKDOWN", markdown);
        const ast = exports.parseMarkdown(markdown)
        console.log("AST", ast);

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
            console.log("NODE", node, element);
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
