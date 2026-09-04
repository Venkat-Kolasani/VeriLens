// MediaProof smart contract ABI (minimal)
export const MEDIA_PROOF_ABI = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'fileHash', type: 'bytes32' },
      { internalType: 'string', name: 'signature', type: 'string' },
      { internalType: 'string', name: 'publicKey', type: 'string' },
    ],
    name: 'anchorProof',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: 'fileHash', type: 'bytes32' }],
    name: 'getProof',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'signer', type: 'address' },
          { internalType: 'uint256', name: 'timestamp', type: 'uint256' },
          { internalType: 'bytes32', name: 'fileHash', type: 'bytes32' },
          { internalType: 'string', name: 'signature', type: 'string' },
          { internalType: 'string', name: 'publicKey', type: 'string' },
          { internalType: 'bool', name: 'exists', type: 'bool' },
        ],
        internalType: 'struct MediaProof.ProofRecord',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'fileHash', type: 'bytes32' },
      { indexed: true, internalType: 'address', name: 'signer', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'ProofAnchored',
    type: 'event',
  },
] as const;
