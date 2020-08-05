pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

interface ENS {
    function resolver(bytes32 nodehash) external returns (address);
}

interface Resolver {
    function addr(bytes32 nodehash) external returns (address);
}


// Info Format
// 1  byte     version 1
// 5  bytes    reserved
// 16 bytes    secretSalt
// 6  bytes    Article ID (used to de-dup revisions)
// 4  bytes    Revision ID

contract WaxLitSpool {

    // Mask for isolating the v and s from EIP-2098 vs
    bytes32 constant MASK_V = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;


    // A multihash is expected to be SHA2-256, so we omit the first 2 bytes
    event NewArticle(bytes32 indexed nodehash, bytes32 info, bytes32 multihash);

    struct Signature {
        bytes32 r;
        bytes32 vs;
    }

    ENS _ens;

    constructor(address ens) public {
        _ens = ENS(ens);
    }

    // NOTE: A resovler can be arbitrary code and should be considered generally
    //       unsafe. For this reason, we only allow calling it stsatically and
    //       with an upper gas limit, so the gas paid by a delegate cannot be
    //       nneedlessly drained or used for other purposes.
    function isAuthorized(bytes32 nodehash, address addr, uint gasLimit) view public returns (bool) {

        // We can trust the ENS contract
        address resolver = _ens.resolver(nodehash);

        // The calldata to get the address from the resovler
        bytes memory bytecode = abi.encodeWithSignature("addr(bytes32)", nodehash);

        // Safely get the address from the resolver
        bytes32 result = 0;
        assembly {
            let status := staticcall(gasLimit, resolver, add(bytecode, 32), mload(bytecode), 0, 32)

            // There was an error; make sure the address is zero-ed out
            if eq(status, 1) {
                result := mload(0)
            }
        }

        // Result contains junk in the top (beyond address) bits
        if ((result >> 160) != 0) { return false; }

        // Does the address match?
        return (address(uint160(uint256(result))) == addr);
    }

    function postArticles(bytes32[] calldata nodehashes, bytes32[] calldata articleInfos, bytes32[] calldata multihashes) external {
        require(nodehashes.length == articleInfos.length);
        require(nodehashes.length == multihashes.length);
        for (uint256 i = 0; i < nodehashes.length; i++) {
            bytes32 nodehash = nodehashes[i];

            // Verify the signer controls the ENS name (since we are executing
            // this ourselves, we won't likely execute malicious code, so we
            // allow arbitrary gas usage)
            if (!isAuthorized(nodehash, msg.sender, gasleft())) { continue; }

            emit NewArticle(nodehash, articleInfos[i], multihashes[i]);
        }
    }

    function delegatedPostArticles(bytes32[] calldata nodehashes, bytes32[] calldata articleInfos, bytes32[] calldata multihashes, Signature[] calldata signatures) external {
        require(nodehashes.length == articleInfos.length);
        require(nodehashes.length == multihashes.length);
        require(nodehashes.length == signatures.length);

        for (uint256 i = 0; i < nodehashes.length; i++) {
            bytes32 nodehash = nodehashes[i];
            bytes32 articleInfo = articleInfos[i];
            bytes32 multihash = multihashes[i];

            // Uncompact signature
            // See: https://eips.ethereum.org/EIPS/eip-2098
            Signature memory signature = signatures[i];
            bytes32 s = signature.vs & MASK_V;
            uint8 v = 27 + uint8(uint256(signature.vs) >> 255);
            address addr = ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n109waxlitUpdate=", nodehash, articleInfo, multihash)), v, signature.r, s);

            // Verify the signer controls the ENS name (we are likely executing
            // this for other users, so we cap each update at 5000 gas to mitigate
            // malicious behaviour in the resolver)
            if (!isAuthorized(nodehash, addr, 5000)) { continue; }

            emit NewArticle(nodehash, articleInfo, multihash);
        }
    }
}
