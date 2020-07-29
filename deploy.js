"use strict";

const fs = require("fs");

const { solc } = require("@ethersproject/cli");

(async function() {
    const source = fs.readFileSync("./contracts/WaxLitSpool.sol").toString();
    let code = null;
    try {
        code = solc.compile(source, { optimize: true }).filter((c) => (c.name === "WaxLitSpool"))[0];
        console.log(code);
    } catch (error) {
        console.log(error);
        console.log("================");
        (error.errors || []).forEach((error) => {
            console.log(error);
        });
        throw error;
    }
    console.log(code.bytecode);
    console.log(code.interface.format());

    const network = await provider.getNetwork();

    const factory = new ethers.ContractFactory(code.interface, code.bytecode, accounts[0]);

    const contract = await factory.deploy(network.ensAddress, { gasLimit: 900000 });
    console.log(contract);

})();
