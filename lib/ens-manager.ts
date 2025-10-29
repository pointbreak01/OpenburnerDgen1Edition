import { ethers } from 'ethers';
import { Call } from './coinbase-smart-wallet';

// ENS Contract Addresses (Mainnet)
export const ENS_CONTRACTS = {
  REGISTRY: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
  BASE_REGISTRAR: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85',
  PUBLIC_RESOLVER: '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
  NAME_WRAPPER: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401',
};

// ENS Registry ABI
const ENS_REGISTRY_ABI = [
  'function owner(bytes32 node) external view returns (address)',
  'function resolver(bytes32 node) external view returns (address)',
  'function setOwner(bytes32 node, address owner) external',
];

// ENS Public Resolver ABI
const ENS_RESOLVER_ABI = [
  'function addr(bytes32 node) external view returns (address)',
  'function setAddr(bytes32 node, address addr) external',
];

// ENS Base Registrar ABI (ERC-721)
const ENS_BASE_REGISTRAR_ABI = [
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function safeTransferFrom(address from, address to, uint256 tokenId) external',
  'function transferFrom(address from, address to, uint256 tokenId) external',
];

// ENS Name Wrapper ABI (ERC-1155)
const ENS_NAME_WRAPPER_ABI = [
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external',
];

/**
 * Check if a contract address is an ENS contract
 */
export function isENSContract(contractAddress: string): boolean {
  const normalized = contractAddress.toLowerCase();
  return (
    normalized === ENS_CONTRACTS.BASE_REGISTRAR.toLowerCase() ||
    normalized === ENS_CONTRACTS.NAME_WRAPPER.toLowerCase()
  );
}

/**
 * Check if an ENS is wrapped (uses Name Wrapper)
 */
export function isWrappedENS(contractAddress: string): boolean {
  return contractAddress.toLowerCase() === ENS_CONTRACTS.NAME_WRAPPER.toLowerCase();
}

/**
 * Convert ENS token ID to namehash (node)
 */
export function tokenIdToNamehash(tokenId: bigint): string {
  // For .eth names, the token ID is derived from labelhash
  // namehash = keccak256(namehash('.eth'), labelhash(label))
  // We need to reconstruct this
  
  // namehash for .eth is: 0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae
  const ethNamehash = '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae';
  
  // The tokenId is the labelhash
  const labelhash = ethers.zeroPadValue(ethers.toBeHex(tokenId), 32);
  
  // namehash = keccak256(ethNamehash + labelhash)
  return ethers.keccak256(ethers.concat([ethNamehash, labelhash]));
}

/**
 * Get ENS info (owner, manager, ETH record)
 */
export async function getENSInfo(
  provider: ethers.Provider,
  tokenId: bigint,
  isWrapped: boolean
): Promise<{
  tokenOwner: string;
  registryOwner: string | null;
  ethRecord: string | null;
  resolver: string | null;
}> {
  try {
    if (isWrapped) {
      // Wrapped ENS: check balance (ERC-1155)
      const wrapper = new ethers.Contract(
        ENS_CONTRACTS.NAME_WRAPPER,
        ENS_NAME_WRAPPER_ABI,
        provider
      );
      
      // For ERC-1155, we can't get "owner" directly, so we just return empty
      // The balance check will happen later
      return {
        tokenOwner: '', // Not applicable for ERC-1155
        registryOwner: null,
        ethRecord: null,
        resolver: null,
      };
    } else {
      // Unwrapped ENS: check all records
      const registrar = new ethers.Contract(
        ENS_CONTRACTS.BASE_REGISTRAR,
        ENS_BASE_REGISTRAR_ABI,
        provider
      );
      
      const registry = new ethers.Contract(
        ENS_CONTRACTS.REGISTRY,
        ENS_REGISTRY_ABI,
        provider
      );
      
      const namehash = tokenIdToNamehash(tokenId);
      
      const [tokenOwner, registryOwner, resolverAddress] = await Promise.all([
        registrar.ownerOf(tokenId),
        registry.owner(namehash),
        registry.resolver(namehash),
      ]);
      
      let ethRecord = null;
      if (resolverAddress !== ethers.ZeroAddress) {
        try {
          const resolver = new ethers.Contract(
            resolverAddress,
            ENS_RESOLVER_ABI,
            provider
          );
          ethRecord = await resolver.addr(namehash);
        } catch (e) {
          console.warn('Could not get ETH record:', e);
        }
      }
      
      return {
        tokenOwner,
        registryOwner,
        ethRecord,
        resolver: resolverAddress,
      };
    }
  } catch (error) {
    console.error('Error getting ENS info:', error);
    throw error;
  }
}

/**
 * Create calls for complete ENS transfer
 * Returns array of calls to execute through Smart Wallet
 */
export function createENSTransferCalls(
  contractAddress: string,
  tokenId: bigint,
  currentOwner: string,
  newOwner: string,
  ensInfo: {
    resolver: string | null;
    registryOwner: string | null;
  }
): Call[] {
  const calls: Call[] = [];
  const isWrapped = isWrappedENS(contractAddress);
  
  if (isWrapped) {
    // Wrapped ENS: ERC-1155 transfer (amount = 1, data = "0x")
    console.log('📦 [ENS] Creating wrapped ENS transfer call (ERC-1155)');
    
    const wrapper = new ethers.Contract(
      ENS_CONTRACTS.NAME_WRAPPER,
      ENS_NAME_WRAPPER_ABI
    );
    
    calls.push({
      target: ENS_CONTRACTS.NAME_WRAPPER,
      value: 0n,
      data: wrapper.interface.encodeFunctionData('safeTransferFrom', [
        currentOwner,
        newOwner,
        tokenId,
        1, // amount = 1 for ENS
        '0x', // empty data
      ]),
    });
  } else {
    // Unwrapped ENS: Three-step process
    console.log('📜 [ENS] Creating unwrapped ENS transfer calls (3 steps)');
    
    const namehash = tokenIdToNamehash(tokenId);
    
    // Step 1: Update ETH Record (if resolver exists)
    if (ensInfo.resolver && ensInfo.resolver !== ethers.ZeroAddress) {
      console.log('  Step 1: Update ETH Record');
      const resolver = new ethers.Contract(
        ensInfo.resolver,
        ENS_RESOLVER_ABI
      );
      
      calls.push({
        target: ensInfo.resolver,
        value: 0n,
        data: resolver.interface.encodeFunctionData('setAddr', [
          namehash,
          newOwner,
        ]),
      });
    }
    
    // Step 2: Update Manager (Registry Owner)
    console.log('  Step 2: Update Manager (Registry)');
    const registry = new ethers.Contract(
      ENS_CONTRACTS.REGISTRY,
      ENS_REGISTRY_ABI
    );
    
    calls.push({
      target: ENS_CONTRACTS.REGISTRY,
      value: 0n,
      data: registry.interface.encodeFunctionData('setOwner', [
        namehash,
        newOwner,
      ]),
    });
    
    // Step 3: Transfer NFT Token
    console.log('  Step 3: Transfer NFT Token');
    const registrar = new ethers.Contract(
      ENS_CONTRACTS.BASE_REGISTRAR,
      ENS_BASE_REGISTRAR_ABI
    );
    
    calls.push({
      target: ENS_CONTRACTS.BASE_REGISTRAR,
      value: 0n,
      data: registrar.interface.encodeFunctionData('safeTransferFrom', [
        currentOwner,
        newOwner,
        tokenId,
      ]),
    });
  }
  
  return calls;
}

/**
 * Get human-readable description for each ENS transfer step
 */
export function getENSTransferSteps(isWrapped: boolean): string[] {
  if (isWrapped) {
    return ['Transfer Wrapped ENS Token'];
  } else {
    return [
      'Update ETH Record',
      'Update Manager (Registry)',
      'Transfer NFT Token (Owner)',
    ];
  }
}

