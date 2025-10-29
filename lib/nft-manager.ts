import { ethers } from 'ethers';
import { createSmartWalletTransaction, createSmartWalletBatchTransaction, Call } from './coinbase-smart-wallet';
import {
  isENSContract as isENSContractUtil,
  isWrappedENS,
  getENSInfo,
  createENSTransferCalls,
  getENSTransferSteps,
} from './ens-manager';

// ERC-721 ABI (NFT standard)
const ERC721_ABI = [
  "function safeTransferFrom(address from, address to, uint256 tokenId) external",
  "function transferFrom(address from, address to, uint256 tokenId) external",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
];

// ERC-1155 ABI (Multi-token standard, used for wrapped ENS)
const ERC1155_ABI = [
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function uri(uint256 id) external view returns (string)",
];

export interface NFT {
  contractAddress: string;
  tokenId: string;
  name?: string;
  symbol?: string;
  tokenURI?: string;
  type: 'ERC721' | 'ERC1155';
  balance?: string; // For ERC1155
}

/**
 * Check if an address owns an NFT (supports both ERC-721 and ERC-1155)
 */
export async function checkNFTOwnership(
  provider: ethers.Provider,
  contractAddress: string,
  tokenId: string,
  ownerAddress: string
): Promise<boolean> {
  try {
    // Check if it's wrapped ENS (ERC-1155)
    const isWrapped = isWrappedENS(contractAddress);
    
    if (isWrapped) {
      // ERC-1155: check balance
      const contract = new ethers.Contract(contractAddress, ERC1155_ABI, provider);
      const balance = await contract.balanceOf(ownerAddress, tokenId);
      return balance > 0n;
    } else {
      // ERC-721: check owner
      const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
      const owner = await contract.ownerOf(tokenId);
      return owner.toLowerCase() === ownerAddress.toLowerCase();
    }
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    return false;
  }
}

/**
 * Get NFT metadata
 */
export async function getNFTMetadata(
  provider: ethers.Provider,
  contractAddress: string,
  tokenId: string
): Promise<{ name: string; symbol: string; tokenURI: string }> {
  try {
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    const [name, symbol, tokenURI] = await Promise.all([
      contract.name().catch(() => 'Unknown'),
      contract.symbol().catch(() => 'NFT'),
      contract.tokenURI(tokenId).catch(() => ''),
    ]);
    
    return { name, symbol, tokenURI };
  } catch (error) {
    console.error('Error getting NFT metadata:', error);
    return { name: 'Unknown', symbol: 'NFT', tokenURI: '' };
  }
}

/**
 * Create a call to transfer NFT from Smart Wallet (supports both ERC-721 and ERC-1155)
 */
export function createNFTTransferCall(
  nftContractAddress: string,
  fromAddress: string,
  toAddress: string,
  tokenId: string
): Call {
  const isWrapped = isWrappedENS(nftContractAddress);
  
  if (isWrapped) {
    // ERC-1155 transfer
    const nftInterface = new ethers.Interface(ERC1155_ABI);
    const data = nftInterface.encodeFunctionData('safeTransferFrom', [
      fromAddress,
      toAddress,
      tokenId,
      1, // amount = 1 for ENS
      '0x', // empty data
    ]);

    return {
      target: nftContractAddress,
      value: 0n,
      data,
    };
  } else {
    // ERC-721 transfer
    const nftInterface = new ethers.Interface(ERC721_ABI);
    const data = nftInterface.encodeFunctionData('safeTransferFrom', [
      fromAddress,
      toAddress,
      tokenId,
    ]);

    return {
      target: nftContractAddress,
      value: 0n,
      data,
    };
  }
}

/**
 * Create a transaction to transfer NFT through Smart Wallet
 * Handles both regular NFTs and ENS domains (with multi-step process)
 */
export async function createNFTTransferTransaction(
  provider: ethers.Provider,
  smartWalletAddress: string,
  ownerAddress: string,
  nftContractAddress: string,
  toAddress: string,
  tokenId: string,
  chainId: number
): Promise<ethers.TransactionRequest> {
  // Check if it's ENS
  const isENS = isENSContractUtil(nftContractAddress);
  
  if (isENS) {
    console.log("🎯 [NFT Transfer] Detected ENS domain transfer");
    
    const isWrapped = isWrappedENS(nftContractAddress);
    console.log(`   Type: ${isWrapped ? 'Wrapped' : 'Unwrapped'} ENS`);
    
    // Get ENS info
    const ensInfo = await getENSInfo(provider, BigInt(tokenId), isWrapped);
    console.log("   ENS Info:", ensInfo);
    
    // Create ENS transfer calls
    const calls = createENSTransferCalls(
      nftContractAddress,
      BigInt(tokenId),
      smartWalletAddress,
      toAddress,
      ensInfo
    );
    
    const steps = getENSTransferSteps(isWrapped);
    console.log(`   Steps (${calls.length}):`, steps);
    
    if (calls.length === 1) {
      // Wrapped ENS: single transaction
      return await createSmartWalletTransaction(
        provider,
        smartWalletAddress,
        ownerAddress,
        calls[0],
        chainId
      );
    } else {
      // Unwrapped ENS: batch transaction
      console.log("   Using executeBatch for unwrapped ENS");
      return await createSmartWalletBatchTransaction(
        provider,
        smartWalletAddress,
        ownerAddress,
        calls,
        chainId
      );
    }
  } else {
    // Regular NFT transfer
    console.log("🖼️ [NFT Transfer] Regular NFT transfer");
    
    const call = createNFTTransferCall(
      nftContractAddress,
      smartWalletAddress, // from = smart wallet
      toAddress,
      tokenId
    );

    return await createSmartWalletTransaction(
      provider,
      smartWalletAddress,
      ownerAddress,
      call,
      chainId
    );
  }
}

/**
 * ENS specific functions
 */
export const ENS_CONTRACTS = {
  1: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85', // Mainnet ENS .eth Registrar
  5: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85', // Goerli
  11155111: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85', // Sepolia
};

/**
 * Check if a contract is ENS
 */
export function isENSContract(contractAddress: string, chainId: number): boolean {
  const ensAddress = ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS];
  return ensAddress ? contractAddress.toLowerCase() === ensAddress.toLowerCase() : false;
}

/**
 * Get ENS name from token ID
 */
export function getENSNameFromTokenId(tokenId: string): string {
  try {
    // ENS uses keccak256 hash as token ID
    // This is a simplified version - ideally you'd query the ENS subgraph
    return `Token ID: ${tokenId.slice(0, 10)}...`;
  } catch {
    return `ENS Domain #${tokenId}`;
  }
}

/**
 * Create a call to transfer ERC-1155 NFT from Smart Wallet
 */
export function createERC1155TransferCall(
  nftContractAddress: string,
  fromAddress: string,
  toAddress: string,
  tokenId: string,
  amount: bigint
): Call {
  const nftInterface = new ethers.Interface(ERC1155_ABI);
  const data = nftInterface.encodeFunctionData('safeTransferFrom', [
    fromAddress,
    toAddress,
    tokenId,
    amount,
    '0x', // empty data
  ]);

  return {
    target: nftContractAddress,
    value: 0n,
    data,
  };
}

