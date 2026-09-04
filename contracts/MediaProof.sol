// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MediaProof
 * @notice On-chain proof-of-capture anchoring for ProofSnap
 * @dev Stores SHA-256 file hashes with digital signatures on Sepolia Testnet
 * 
 * OPTIONAL — the app does not require this contract.
 * By default CONTRACT_ADDRESS is the zero address and proofs are anchored
 * as data-only self-transfers with the ABI-encoded payload in tx.data
 * (see the fallback path in lib/blockchain.ts anchorProof). Verification
 * reads the tx by hash from Blockscout and decodes tx.input, so no
 * on-chain contract lookup is involved.
 *
 * Deploy only if you want hash-based on-chain lookup via getProof():
 * 1. Open https://remix.ethereum.org
 * 2. Create new file "MediaProof.sol" and paste this code
 * 3. Compile with Solidity 0.8.20+
 * 4. Deploy to Sepolia Testnet:
 *    - In "Deploy" tab, select "Injected Provider" (MetaMask)
 *    - Sepolia is built into MetaMask (Chain ID: 11155111,
 *      RPC: https://ethereum-sepolia-rpc.publicnode.com)
 *    - Get free SepoliaETH from
 *      https://cloud.google.com/application/web3/faucet/ethereum/sepolia
 *    - Deploy the contract
 * 5. Copy the contract address and update CONTRACT_ADDRESS in constants/config.ts
 */
contract MediaProof {

    struct Proof {
        bytes32 fileHash;       // SHA-256 hash of the media file
        string  signature;      // Ed25519 digital signature (hex)
        string  publicKey;      // Ed25519 public key (hex)
        address submitter;      // Ethereum address that submitted the proof
        uint256 timestamp;      // Block timestamp of anchoring
        uint256 blockNumber;    // Block number for reference
    }

    // Mapping from file hash to proof
    mapping(bytes32 => Proof) public proofs;

    // Array of all proof hashes for enumeration
    bytes32[] public proofHashes;

    // Events
    event ProofAnchored(
        bytes32 indexed fileHash,
        address indexed submitter,
        uint256 timestamp,
        uint256 blockNumber
    );

    /**
     * @notice Anchor a media proof on-chain
     * @param _fileHash SHA-256 hash of the media file
     * @param _signature Ed25519 digital signature
     * @param _publicKey Ed25519 public key
     */
    function anchorProof(
        bytes32 _fileHash,
        string calldata _signature,
        string calldata _publicKey
    ) external {
        require(_fileHash != bytes32(0), "Invalid file hash");
        require(proofs[_fileHash].timestamp == 0, "Proof already exists");

        proofs[_fileHash] = Proof({
            fileHash: _fileHash,
            signature: _signature,
            publicKey: _publicKey,
            submitter: msg.sender,
            timestamp: block.timestamp,
            blockNumber: block.number
        });

        proofHashes.push(_fileHash);

        emit ProofAnchored(_fileHash, msg.sender, block.timestamp, block.number);
    }

    /**
     * @notice Retrieve a proof by file hash
     * @param _fileHash SHA-256 hash to look up
     * @return The Proof struct data
     */
    function getProof(bytes32 _fileHash) external view returns (Proof memory) {
        require(proofs[_fileHash].timestamp != 0, "Proof not found");
        return proofs[_fileHash];
    }

    /**
     * @notice Check if a proof exists for a given hash
     * @param _fileHash SHA-256 hash to check
     * @return exists True if proof is anchored
     */
    function proofExists(bytes32 _fileHash) external view returns (bool exists) {
        return proofs[_fileHash].timestamp != 0;
    }

    /**
     * @notice Get total number of proofs anchored
     * @return count Number of proofs
     */
    function getProofCount() external view returns (uint256 count) {
        return proofHashes.length;
    }

    /**
     * @notice Get proof hash by index
     * @param index Index in the proofHashes array
     * @return hash The file hash at the given index
     */
    function getProofHashByIndex(uint256 index) external view returns (bytes32 hash) {
        require(index < proofHashes.length, "Index out of bounds");
        return proofHashes[index];
    }
}
