import { ethers } from 'ethers';

/**
 * Coinbase Smart Wallet ABI
 * Based on ERC-4337 Account Abstraction standard
 * The smart wallet contract has an execute function to send transactions
 */
const COINBASE_SMART_WALLET_ABI = [
  // Execute a single call
  "function execute(address target, uint256 value, bytes calldata data) external payable",
  
  // Execute multiple calls in batch
  "function executeBatch((address target, uint256 value, bytes data)[] calldata calls) external payable",
  
  // Check if address is owner
  "function isOwnerAddress(address account) external view returns (bool)",
  
  // Get owners
  "function ownerAtIndex(uint256 index) external view returns (bytes memory)",
  
  // Check if bytes is owner
  "function isOwnerBytes(bytes memory account) external view returns (bool)",
  
  // Owner management functions
  "function addOwnerAddress(address account) external",
  "function removeOwnerAtIndex(uint256 index, bytes owner) external",
  "function isOwnerAddress(address account) external view returns (bool)",
  "function ownerCount() external view returns (uint256)",
  
  // EIP-1271 Signature Validation
  "function isValidSignature(bytes32 _hash, bytes memory _signature) external view returns (bytes4)",
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const ERC721_ABI = [
  "function transferFrom(address from, address to, uint256 tokenId) external",
  "function safeTransferFrom(address from, address to, uint256 tokenId) external",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

const ERC1155_ABI = [
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function uri(uint256 id) view returns (string)",
];

// Coinbase Smart Wallet Factory Contracts
export const COINBASE_SMART_WALLET_FACTORIES = {
  v1: '0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a',
  v1_1: '0xBA5ED110eFDBa3D005bfC882d75358ACBbB85842',
};

const FACTORY_ABI = [
  'function getAddress(address[] owners, uint256 nonce) view returns (address)',
  'function createAccount(address[] owners, uint256 nonce) returns (address)',
];

export interface Call {
  target: string;
  value: bigint;
  data: string;
}

// EIP-1271 Magic Value: 0x1626ba7e
const EIP1271_MAGIC_VALUE = "0x1626ba7e";

/**
 * Verify if a Smart Wallet supports EIP-1271 signature validation
 */
export async function supportsEIP1271(
  provider: ethers.Provider,
  smartWalletAddress: string
): Promise<boolean> {
  try {
    const wallet = new ethers.Contract(
      smartWalletAddress,
      COINBASE_SMART_WALLET_ABI,
      provider
    );
    
    // Try to call isValidSignature with a dummy hash and signature
    // If it doesn't revert and returns the magic value, it supports EIP-1271
    const dummyHash = ethers.ZeroHash;
    const dummySignature = "0x" + "0".repeat(130); // 65 bytes (r + s + v)
    
    try {
      const result = await wallet.isValidSignature(dummyHash, dummySignature);
      // If it returns the magic value (even for invalid signature), it means the method exists
      // We're just checking if the method is callable, not if it returns valid
      return typeof result === 'string' || (typeof result === 'bigint' && result !== 0n);
    } catch (e: any) {
      // If the method doesn't exist, it will revert
      if (e.code === 'CALL_EXCEPTION' || e.message?.includes('execution reverted')) {
        return false;
      }
      // Other errors might mean the method exists but signature was invalid
      return true;
    }
  } catch (error) {
    console.error('[EIP-1271] Error checking support:', error);
    return false;
  }
}

/**
 * Verify an EIP-1271 signature on a Smart Wallet
 */
export async function verifyEIP1271Signature(
  provider: ethers.Provider,
  smartWalletAddress: string,
  hash: string,
  signature: string
): Promise<boolean> {
  try {
    const wallet = new ethers.Contract(
      smartWalletAddress,
      COINBASE_SMART_WALLET_ABI,
      provider
    );
    
    const result = await wallet.isValidSignature(hash, signature);
    // EIP-1271 magic value is 0x1626ba7e
    const magicValue = ethers.getBytes(EIP1271_MAGIC_VALUE);
    const resultBytes = ethers.getBytes(result);
    
    return resultBytes.length === 4 && 
           resultBytes[0] === magicValue[0] &&
           resultBytes[1] === magicValue[1] &&
           resultBytes[2] === magicValue[2] &&
           resultBytes[3] === magicValue[3];
  } catch (error) {
    console.error('[EIP-1271] Error verifying signature:', error);
    return false;
  }
}

/**
 * Check if an address is an owner of the Smart Wallet
 */
export async function isOwner(
  provider: ethers.Provider,
  smartWalletAddress: string,
  ownerAddress: string
): Promise<boolean> {
  try {
    const wallet = new ethers.Contract(
      smartWalletAddress,
      COINBASE_SMART_WALLET_ABI,
      provider
    );
    
    return await wallet.isOwnerAddress(ownerAddress);
  } catch (error) {
    console.error('Error checking owner:', error);
    return false;
  }
}

/**
 * Get token balance of the Smart Wallet
 */
export async function getSmartWalletTokenBalance(
  provider: ethers.Provider,
  smartWalletAddress: string,
  tokenAddress: string
): Promise<bigint> {
  try {
    if (tokenAddress === 'native') {
      // Get native ETH balance
      return await provider.getBalance(smartWalletAddress);
    } else {
      // Get ERC20 token balance
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        provider
      );
      return await tokenContract.balanceOf(smartWalletAddress);
    }
  } catch (error) {
    console.error('Error getting balance:', error);
    return 0n;
  }
}

/**
 * Create a transaction to send native ETH from Smart Wallet
 */
export function createSendETHCall(
  recipient: string,
  amountWei: bigint
): Call {
  return {
    target: recipient,
    value: amountWei,
    data: '0x', // Empty data for ETH transfer
  };
}

/**
 * Create a transaction to send ERC20 tokens from Smart Wallet
 */
export function createSendERC20Call(
  tokenAddress: string,
  recipient: string,
  amountWei: bigint
): Call {
  const tokenInterface = new ethers.Interface(ERC20_ABI);
  const data = tokenInterface.encodeFunctionData('transfer', [
    recipient,
    amountWei,
  ]);

  return {
    target: tokenAddress,
    value: 0n,
    data,
  };
}

/**
 * Encode execute call data for Smart Wallet
 */
export function encodeExecuteCall(call: Call): string {
  const walletInterface = new ethers.Interface(COINBASE_SMART_WALLET_ABI);
  return walletInterface.encodeFunctionData('execute', [
    call.target,
    call.value,
    call.data,
  ]);
}

/**
 * Encode executeBatch call data for Smart Wallet
 */
export function encodeExecuteBatchCall(calls: Call[]): string {
  const walletInterface = new ethers.Interface(COINBASE_SMART_WALLET_ABI);
  return walletInterface.encodeFunctionData('executeBatch', [calls]);
}

/**
 * Create a transaction request to execute a call through Smart Wallet
 * This transaction will be signed by the Burner card (owner)
 */
export async function createSmartWalletTransaction(
  provider: ethers.Provider,
  smartWalletAddress: string,
  ownerAddress: string,
  call: Call,
  chainId: number
): Promise<ethers.TransactionRequest> {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("🔍 [Smart Wallet] CREATING TRANSACTION");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`   Smart Wallet: ${smartWalletAddress}`);
  console.log(`   Owner: ${ownerAddress}`);
  console.log(`   Target: ${call.target}`);
  console.log(`   Value: ${call.value}`);
  console.log(`   Data: ${call.data.slice(0, 66)}...`);
  
  // Check if Smart Wallet contract exists (but allow proceeding even if check fails)
  // Coinbase Smart Wallets can be counterfactual - the address exists deterministically
  // but the contract is only deployed on first transaction
  // IMPORTANT: We proceed anyway even if getCode fails (RPC might be slow/unreliable)
  console.log("🔍 [Smart Wallet] Checking contract deployment...");
  let code: string | null = null;
  let isCounterfactual = false;
  let contractCheckPassed = false;
  
  try {
    // Set a timeout for the RPC call (5 seconds)
    const codePromise = provider.getCode(smartWalletAddress);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('RPC timeout')), 5000)
    );
    
    code = await Promise.race([codePromise, timeoutPromise]);
    
    if (code === '0x' || code.length <= 2) {
      console.log(`⚠️ [Smart Wallet] Contract not yet deployed (counterfactual wallet)`);
      console.log(`ℹ️ [Smart Wallet] The contract will be auto-deployed on first transaction`);
      console.log(`✅ [Smart Wallet] Proceeding with transaction - deployment will happen automatically`);
      isCounterfactual = true;
      contractCheckPassed = true;
    } else {
      console.log(`✅ [Smart Wallet] Contract already deployed (${code.length / 2 - 1} bytes)`);
      isCounterfactual = false;
      contractCheckPassed = true;
    }
  } catch (error: any) {
    // For ANY error (RPC timeout, network issues, etc.), proceed anyway
    // The contract might exist but RPC is just slow/unreliable
    console.warn(`⚠️ [Smart Wallet] Could not check contract deployment:`, error?.message || error);
    console.log(`ℹ️ [Smart Wallet] This might be an RPC issue (slow/unreliable network)`);
    console.log(`ℹ️ [Smart Wallet] Proceeding with transaction anyway`);
    console.log(`ℹ️ [Smart Wallet] If contract exists: transaction will succeed`);
    console.log(`ℹ️ [Smart Wallet] If counterfactual: will be auto-deployed`);
    isCounterfactual = true; // Assume counterfactual to allow proceeding
    contractCheckPassed = false; // Mark that we couldn't verify
  }
  
  // CRITICAL: Verify ownership before creating transaction (only if contract check passed)
  // Skip ownership check if we couldn't verify contract (might be RPC issue)
  if (contractCheckPassed && !isCounterfactual) {
    console.log("🔐 [Smart Wallet] Verifying ownership...");
    try {
      // Set a timeout for ownership check (3 seconds)
      const ownershipPromise = isOwner(provider, smartWalletAddress, ownerAddress);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Ownership check timeout')), 3000)
      );
      
      const isOwnerResult = await Promise.race([ownershipPromise, timeoutPromise]);
      console.log(`   Is Owner: ${isOwnerResult}`);
      
      if (!isOwnerResult) {
        throw new Error(
          `❌ ERROR: ${ownerAddress} is not the owner of Smart Wallet ${smartWalletAddress}. ` +
          `Please verify the Smart Wallet address in the configuration.`
        );
      }
      
      console.log("✅ [Smart Wallet] Ownership verified!");
    } catch (ownershipError: any) {
      // If ownership check fails due to timeout or RPC issue, proceed anyway
      if (ownershipError.message?.includes('timeout') || ownershipError.message?.includes('RPC')) {
        console.warn(`⚠️ [Smart Wallet] Ownership check timed out or RPC error, but proceeding:`, ownershipError?.message || ownershipError);
        console.warn(`⚠️ [Smart Wallet] Transaction will be created - owner will sign as usual`);
      } else if (ownershipError.message?.includes('not the owner')) {
        // Only throw if it's a real ownership issue (not RPC/timeout)
        throw ownershipError;
      } else {
        // Other errors: assume RPC issue and proceed
        console.warn(`⚠️ [Smart Wallet] Ownership check failed (RPC issue?), but proceeding:`, ownershipError?.message || ownershipError);
      }
    }
  } else if (isCounterfactual) {
    console.log("ℹ️ [Smart Wallet] Skipping ownership check for counterfactual wallet (will be verified on deployment)");
  } else {
    console.log("ℹ️ [Smart Wallet] Skipping ownership check (could not verify contract - likely RPC issue)");
    console.log("ℹ️ [Smart Wallet] Transaction will proceed - owner will sign as usual");
  }
  
  // Pre-flight checks based on call type
  if (call.target !== smartWalletAddress && call.data !== '0x') {
    const selector = call.data.slice(0, 10);
    
    // ERC-721 transferFrom check
    if (selector === '0x42842e0e' || selector === '0x23b872dd') {
      // This is an ERC-721 transferFrom(address from, address to, uint256 tokenId)
      console.log("🎨 [Smart Wallet] Detected ERC-721 (NFT) transfer");
      
      try {
        const nftContract = new ethers.Contract(
          call.target,
          ERC721_ABI,
          provider
        );
        
        // Decode the transfer data
        const decoded = nftContract.interface.decodeFunctionData('transferFrom', call.data);
        const from = decoded[0];
        const to = decoded[1];
        const tokenId = decoded[2];
        
        console.log(`📊 [Smart Wallet] NFT Transfer Details:`);
        console.log(`   Contract: ${call.target}`);
        console.log(`   From: ${from}`);
        console.log(`   To: ${to}`);
        console.log(`   Token ID: ${tokenId.toString()}`);
        
        // Check ownership
        try {
          const owner = await nftContract.ownerOf(tokenId);
          console.log(`👤 [Smart Wallet] Current owner: ${owner}`);
          
          if (owner.toLowerCase() !== smartWalletAddress.toLowerCase()) {
            throw new Error(
              `❌ ERRORE: Lo Smart Wallet NON possiede questo NFT! ` +
              `Owner attuale: ${owner}, Smart Wallet: ${smartWalletAddress}. ` +
              `Verifica il Token ID o che l'NFT non sia già stato trasferito.`
            );
          }
          
          console.log("✅ [Smart Wallet] NFT ownership verified");
        } catch (ownerError: any) {
          if (ownerError.message.includes('NON possiede')) {
            throw ownerError;
          }
          console.error("❌ [Smart Wallet] Could not verify NFT ownership:", ownerError.message);
          throw new Error(
            `❌ ERRORE: Impossibile verificare l'ownership dell'NFT. ` +
            `Il Token ID potrebbe non esistere o il contratto non è un NFT standard. ` +
            `Token ID: ${tokenId.toString()}`
          );
        }
        
        // Verify 'from' address matches Smart Wallet
        if (from.toLowerCase() !== smartWalletAddress.toLowerCase()) {
          console.warn(`⚠️ [Smart Wallet] 'from' address (${from}) doesn't match Smart Wallet (${smartWalletAddress})`);
          console.warn(`   This might cause the transaction to fail`);
        }
        
        // Test the direct call
        try {
          console.log("🧪 [Smart Wallet] Testing direct NFT transfer simulation...");
          
          await provider.call({
            from: smartWalletAddress,
            to: call.target,
            data: call.data,
          });
          
          console.log("✅ [Smart Wallet] Direct NFT transfer would succeed");
        } catch (testError: any) {
          console.error("❌ [Smart Wallet] Direct NFT transfer would FAIL!");
          console.error("   Error:", testError.message);
          
          throw new Error(
            `❌ ERRORE: Il trasferimento NFT fallirebbe. ` +
            `Possibili cause: NFT locked, contratto in pausa, o lo Smart Wallet non è approvato. ` +
            `Controlla il contratto NFT su Etherscan.`
          );
        }
      } catch (error: any) {
        if (error.message.includes('❌ ERRORE')) {
          throw error;
        }
        console.warn("⚠️ [Smart Wallet] Could not complete NFT checks:", error.message);
      }
    }
    
    // ERC-1155 safeTransferFrom check (for wrapped ENS)
    else if (selector === '0xf242432a') {
      // This is an ERC-1155 safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)
      console.log("🎨 [Smart Wallet] Detected ERC-1155 (Multi-token/Wrapped ENS) transfer");
      
      try {
        const nftContract = new ethers.Contract(
          call.target,
          ERC1155_ABI,
          provider
        );
        
        // Decode the transfer data
        const decoded = nftContract.interface.decodeFunctionData('safeTransferFrom', call.data);
        const from = decoded[0];
        const to = decoded[1];
        const tokenId = decoded[2];
        const amount = decoded[3];
        
        console.log(`📊 [Smart Wallet] ERC-1155 Transfer Details:`);
        console.log(`   Contract: ${call.target}`);
        console.log(`   From: ${from}`);
        console.log(`   To: ${to}`);
        console.log(`   Token ID: ${tokenId.toString()}`);
        console.log(`   Amount: ${amount.toString()}`);
        
        // Check balance (ERC-1155 uses balanceOf instead of ownerOf)
        try {
          const balance = await nftContract.balanceOf(smartWalletAddress, tokenId);
          console.log(`👤 [Smart Wallet] Current balance: ${balance.toString()}`);
          
          if (balance < amount) {
            throw new Error(
              `❌ ERRORE: Lo Smart Wallet NON possiede abbastanza di questo token! ` +
              `Balance: ${balance.toString()}, Required: ${amount.toString()}, Smart Wallet: ${smartWalletAddress}. ` +
              `Verifica il Token ID o che il token non sia già stato trasferito.`
            );
          }
          
          console.log("✅ [Smart Wallet] ERC-1155 balance verified");
        } catch (balanceError: any) {
          if (balanceError.message.includes('NON possiede')) {
            throw balanceError;
          }
          console.error("❌ [Smart Wallet] Could not verify ERC-1155 balance:", balanceError.message);
          throw new Error(
            `❌ ERRORE: Impossibile verificare il balance dell'ERC-1155. ` +
            `Il Token ID potrebbe non esistere o il contratto non è un ERC-1155 standard. ` +
            `Token ID: ${tokenId.toString()}`
          );
        }
        
        // Verify 'from' address matches Smart Wallet
        if (from.toLowerCase() !== smartWalletAddress.toLowerCase()) {
          console.warn(`⚠️ [Smart Wallet] 'from' address (${from}) doesn't match Smart Wallet (${smartWalletAddress})`);
          console.warn(`   This might cause the transaction to fail`);
        }
        
        // Test the direct call
        try {
          console.log("🧪 [Smart Wallet] Testing direct ERC-1155 transfer simulation...");
          
          await provider.call({
            from: smartWalletAddress,
            to: call.target,
            data: call.data,
          });
          
          console.log("✅ [Smart Wallet] Direct ERC-1155 transfer would succeed");
        } catch (testError: any) {
          console.error("❌ [Smart Wallet] Direct ERC-1155 transfer would FAIL!");
          console.error("   Error:", testError.message);
          
          throw new Error(
            `❌ ERRORE: Il trasferimento ERC-1155 fallirebbe. ` +
            `Possibili cause: Token locked, contratto in pausa, o lo Smart Wallet non è approvato. ` +
            `Controlla il contratto su Etherscan.`
          );
        }
      } catch (error: any) {
        if (error.message.includes('❌ ERRORE')) {
          throw error;
        }
        console.warn("⚠️ [Smart Wallet] Could not complete ERC-1155 checks:", error.message);
      }
    }
    
    // ERC-20 transfer check
    else if (selector === '0xa9059cbb') {
      try {
        // This is an ERC20 transfer(address,uint256)
        console.log("🔍 [Smart Wallet] Detected ERC-20 transfer, checking balance...");
        
        const tokenContract = new ethers.Contract(
          call.target,
          ERC20_ABI,
          provider
        );
        
        // Get token info (with fallback for non-standard tokens)
        let tokenBalance = 0n;
        let tokenSymbol = 'UNKNOWN';
        let tokenDecimals = 18;
        
        try {
          tokenBalance = await tokenContract.balanceOf(smartWalletAddress);
        } catch (e) {
          console.warn("⚠️ [Smart Wallet] Could not get token balance");
        }
        
        try {
          tokenSymbol = await tokenContract.symbol();
        } catch (e) {
          console.warn("⚠️ [Smart Wallet] Could not get token symbol (non-standard token)");
        }
        
        try {
          tokenDecimals = await tokenContract.decimals();
        } catch (e) {
          console.warn("⚠️ [Smart Wallet] Could not get token decimals, using 18");
        }
        
        // Decode the transfer call data
        // call.data format: 0xa9059cbb + 32 bytes (recipient) + 32 bytes (amount)
        const decoded = tokenContract.interface.decodeFunctionData('transfer', call.data);
        const recipient = decoded[0];
        const transferAmount = decoded[1];
        
        console.log(`📊 [Smart Wallet] Token: ${tokenSymbol}`);
        console.log(`   Recipient: ${recipient}`);
        console.log(`   Balance: ${ethers.formatUnits(tokenBalance, tokenDecimals)} ${tokenSymbol}`);
        console.log(`   Transfer Amount: ${ethers.formatUnits(transferAmount, tokenDecimals)} ${tokenSymbol}`);
        
        if (tokenBalance < transferAmount) {
          throw new Error(
            `❌ ERRORE: Balance insufficiente. ` +
            `Hai ${ethers.formatUnits(tokenBalance, tokenDecimals)} ${tokenSymbol} ` +
            `ma stai cercando di trasferire ${ethers.formatUnits(transferAmount, tokenDecimals)} ${tokenSymbol}.`
          );
        }
        
        console.log("✅ [Smart Wallet] Token balance OK");
        
        // Test: Can the Smart Wallet actually call this token?
        // Try to simulate the direct token.transfer call from Smart Wallet
        try {
          console.log("🧪 [Smart Wallet] Testing direct token transfer simulation...");
          
          await provider.call({
            from: smartWalletAddress,
            to: call.target,
            data: call.data, // Use the exact same data
          });
          
          console.log("✅ [Smart Wallet] Direct token transfer would succeed");
        } catch (testError: any) {
          console.error("❌ [Smart Wallet] Direct token transfer would FAIL!");
          console.error("   Error:", testError.message);
          console.error("   This suggests the token contract has restrictions:");
          console.error("     • Token may be paused");
          console.error("     • Smart Wallet may be blacklisted");
          console.error("     • Token requires approval or has custom logic");
          
          if (testError.data) {
            console.error("   Error data:", testError.data);
          }
          
          // This is a critical error - the token itself can't be transferred from Smart Wallet
          throw new Error(
            `❌ ERRORE CRITICO: Il token ${tokenSymbol} non può essere trasferito dallo Smart Wallet. ` +
            `Possibili cause: token in pausa, Smart Wallet nella blacklist, o il token richiede approvazioni speciali. ` +
            `Prova a verificare il contratto del token su Etherscan.`
          );
        }
      } catch (error: any) {
        if (error.message.includes('Balance insufficiente') || error.message.includes('ERRORE CRITICO')) {
          throw error;
        }
        console.warn("⚠️ [Smart Wallet] Could not complete token checks:", error.message);
      }
    }
  }
  
  // Encode the execute call
  const data = encodeExecuteCall(call);
  console.log(`📦 [Smart Wallet] Encoded data length: ${data.length} bytes`);

  // Get transaction parameters
  const [nonce, feeData] = await Promise.all([
    provider.getTransactionCount(ownerAddress),
    provider.getFeeData(),
  ]);
  
  console.log(`📊 [Smart Wallet] Nonce: ${nonce}`);
  console.log(`💰 [Smart Wallet] Max Fee: ${ethers.formatUnits(feeData.maxFeePerGas || 0n, 'gwei')} gwei`);

  // Estimate gas (with fallback like Send flow)
  let gasLimit = 200000n; // base
  try {
    const est = await provider.estimateGas({ from: ownerAddress, to: smartWalletAddress, data, value: 0n });
    console.log(`⛽ [Smart Wallet] Gas estimated: ${est}`);
    gasLimit = (est * 150n) / 100n; // +50%
    console.log(`⛽ [Smart Wallet] Gas with buffer: ${gasLimit}`);
  } catch (error: any) {
    console.warn('⚠️ [Smart Wallet] Gas estimation failed, using conservative default');
    if (error?.data) console.error('   Error data:', error.data);
    // Use a conservative limit to allow routers/approvals to pass
    gasLimit = 800000n;
  }
  
  // Check owner balance for gas
  const ownerBalance = await provider.getBalance(ownerAddress);
  console.log(`💰 [Smart Wallet] Owner balance: ${ethers.formatEther(ownerBalance)} ETH`);
  
  // Estimate total cost
  const maxCost = gasLimit * (feeData.maxFeePerGas || 0n);
  console.log(`💸 [Smart Wallet] Estimated max cost: ${ethers.formatEther(maxCost)} ETH`);
  
  if (ownerBalance < maxCost) {
    throw new Error(`Fondi insufficienti per il gas. Servono ${ethers.formatEther(maxCost)} ETH, disponibili ${ethers.formatEther(ownerBalance)} ETH sull'indirizzo owner (Burner card).`);
  }

  return {
    to: smartWalletAddress,
    value: 0n, // The value is inside the call data
    data,
    nonce,
    chainId,
    type: 2,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    gasLimit,
  };
}

/**
 * Create a transaction request to execute multiple calls through Smart Wallet
 */
export async function createSmartWalletBatchTransaction(
  provider: ethers.Provider,
  smartWalletAddress: string,
  ownerAddress: string,
  calls: Call[],
  chainId: number
): Promise<ethers.TransactionRequest> {
  // Encode the executeBatch call
  const data = encodeExecuteBatchCall(calls);

  // Get transaction parameters
  const [nonce, feeData] = await Promise.all([
    provider.getTransactionCount(ownerAddress),
    provider.getFeeData(),
  ]);

  // Estimate gas (with fallback)
  let gasLimit = 300000n; // Default estimate for batch
  try {
    gasLimit = await provider.estimateGas({
      from: ownerAddress,
      to: smartWalletAddress,
      data,
      value: 0n,
    });
    console.log(`⛽ [Smart Wallet Batch] Gas estimated: ${gasLimit}`);
    // Add 50% buffer for safety
    gasLimit = (gasLimit * 150n) / 100n;
    console.log(`⛽ [Smart Wallet Batch] Gas with buffer: ${gasLimit}`);
  } catch (error) {
    console.warn('⚠️ [Smart Wallet Batch] Gas estimation failed, using default:', error);
  }
  
  // Check owner balance for gas
  const ownerBalance = await provider.getBalance(ownerAddress);
  console.log(`💰 [Smart Wallet Batch] Owner balance: ${ethers.formatEther(ownerBalance)} ETH`);
  
  // Estimate total cost
  const maxCost = gasLimit * (feeData.maxFeePerGas || 0n);
  console.log(`💸 [Smart Wallet Batch] Estimated max cost: ${ethers.formatEther(maxCost)} ETH`);
  
  if (ownerBalance < maxCost) {
    throw new Error(`Fondi insufficienti per il gas. Servono ${ethers.formatEther(maxCost)} ETH, disponibili ${ethers.formatEther(ownerBalance)} ETH sull'indirizzo owner (Burner card).`);
  }

  return {
    to: smartWalletAddress,
    value: 0n,
    data,
    nonce,
    chainId,
    type: 2,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    gasLimit,
  };
}

/**
 * Find Coinbase Smart Wallets associated with an owner address
 * Uses Markushaas recovery API to retrieve Smart Wallet addresses
 * Falls back to on-chain search if API fails
 */
export async function findSmartWallets(
  provider: ethers.Provider,
  ownerAddress: string,
  maxNonce: number = 5
): Promise<Array<{ address: string; nonce: number; version: string; exists: boolean }>> {
  console.log('\n🔍 [Smart Wallet Discovery] Querying Markushaas API...');
  console.log('   Owner (Burner card):', ownerAddress);

  // Try API first
  try {
    const apiUrl = `https://api.markushaas.com/api/get-recovery-setups?recoveryAddress=${ownerAddress}`;
    console.log(`📡 [API] Fetching from: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📋 [API] Response received:', data);
    
    if (data.setups && Array.isArray(data.setups)) {
      const wallets = data.setups
        .filter((setup: any) => setup.aaWalletAddress && ethers.isAddress(setup.aaWalletAddress))
        .map((setup: any) => ({
          address: setup.aaWalletAddress,
          nonce: 0, // API doesn't provide nonce info
          version: 'v1', // Assume v1 unless we can determine otherwise
          exists: true,
        }));
      
      if (wallets.length > 0) {
        console.log(`\n✅ [API] Found ${wallets.length} Smart Wallet(s) via API:`);
        wallets.forEach((w: { address: string; nonce: number; version: string; exists: boolean }) =>
          console.log(`   • ${w.address}`)
        );
        return wallets;
      }
    }
    
    console.log('⚠️ [API] No Smart Wallets found in API response');
  } catch (error) {
    console.error('❌ [API] Error querying Markushaas API:', error);
    console.log('🔄 [Fallback] Falling back to on-chain search...');
  }
  
  // Fallback: on-chain search (legacy implementation)
  console.log('\n🔍 [On-Chain] Searching for Smart Wallets owned by Burner card...');
  console.log('   Owner (Burner card):', ownerAddress);
  console.log('   Checking Factory v1:', COINBASE_SMART_WALLET_FACTORIES.v1);
  console.log('   Checking Factory v1.1:', COINBASE_SMART_WALLET_FACTORIES.v1_1);
  
  const wallets: Array<{ address: string; nonce: number; version: string; exists: boolean }> = [];
  
  // Check both factory versions
  for (const [version, factoryAddress] of Object.entries(COINBASE_SMART_WALLET_FACTORIES)) {
    console.log(`\n📍 [Discovery] Checking Factory ${version.replace('_', '.')}...`);
    
    const factory = new ethers.Contract(
      factoryAddress,
      FACTORY_ABI,
      provider
    );
    
    // Try different nonces (most common are 0 and 1)
    for (let nonce = 0; nonce < maxNonce; nonce++) {
      try {
        // Compute the deterministic address for this owner + nonce
        // Avoid name clash with ethers.Contract.getAddress() by using getFunction
        const getAddressFn = factory.getFunction("getAddress");
        const predictedAddress = await getAddressFn([ownerAddress], nonce);
        
        // Check if wallet exists (has code deployed)
        const code = await provider.getCode(predictedAddress);
        const exists = code !== '0x' && code.length > 2;
        
        if (exists) {
          console.log(`   ✅ Found Smart Wallet at nonce ${nonce}:`, predictedAddress);
          
          // Verify ownership
          const wallet = new ethers.Contract(
            predictedAddress,
            COINBASE_SMART_WALLET_ABI,
            provider
          );
          
          try {
            const isOwner = await wallet.isOwnerAddress(ownerAddress);
            if (isOwner) {
              console.log(`      ✓ Ownership confirmed - Burner card IS owner!`);
              wallets.push({ 
                address: predictedAddress, 
                nonce, 
                version: version.replace('_', '.'),
                exists: true 
              });
            } else {
              console.log(`      ✗ Ownership not confirmed - Burner card is NOT owner`);
            }
          } catch (err) {
            console.log(`      ⚠️ Could not verify ownership:`, err);
            // Still add it, user might have different owner setup
            wallets.push({ 
              address: predictedAddress, 
              nonce, 
              version: version.replace('_', '.'),
              exists: true 
            });
          }
        } else {
          console.log(`      No wallet deployed at nonce ${nonce}`);
        }
      } catch (err) {
        console.error(`      ❌ Error checking nonce ${nonce}:`, err);
      }
    }
  }
  
  console.log(`\n📊 [Discovery] Summary: Found ${wallets.filter(w => w.exists).length} Smart Wallet(s) where Burner card is owner`);
  wallets.filter(w => w.exists).forEach(w => {
    console.log(`   • ${w.address} (Factory ${w.version}, nonce ${w.nonce})`);
  });
  
  return wallets;
}

/**
 * Get the primary Smart Wallet address for an owner
 * Returns null if no wallet exists
 * Prioritizes: v1.1 factory nonce 0, then v1 factory nonce 0, then any found
 */
export async function getPrimarySmartWallet(
  provider: ethers.Provider,
  ownerAddress: string
): Promise<string | null> {
  const wallets = await findSmartWallets(provider, ownerAddress, 3);
  const existingWallets = wallets.filter(w => w.exists);
  
  if (existingWallets.length === 0) {
    console.log('\n❌ [Discovery] No Smart Wallet found where Burner card is owner');
    return null;
  }
  
  // Prioritize v1.1 with nonce 0 (newest)
  let primary = existingWallets.find(w => w.version === 'v1.1' && w.nonce === 0);
  
  // Fallback to v1 with nonce 0
  if (!primary) {
    primary = existingWallets.find(w => w.version === 'v1' && w.nonce === 0);
  }
  
  // Fallback to any wallet found
  if (!primary) {
    primary = existingWallets[0];
  }
  
  console.log(`\n✅ [Discovery] Selected Primary Smart Wallet:`);
  console.log(`   Address: ${primary.address}`);
  console.log(`   Factory: ${primary.version}`);
  console.log(`   Nonce: ${primary.nonce}`);
  
  return primary.address;
}

/**
 * Create a transaction to add an owner to the Smart Wallet
 */
export function createAddOwnerTransaction(
  provider: ethers.Provider,
  smartWalletAddress: string,
  ownerAddress: string,
  newOwnerAddress: string,
  chainId: number
): Call {
  console.log(`🔧 [Owner Management] Creating add owner transaction`);
  console.log(`   Smart Wallet: ${smartWalletAddress}`);
  console.log(`   Adding: ${newOwnerAddress}`);
  
  // Encode the addOwnerAddress call
  const walletInterface = new ethers.Interface(COINBASE_SMART_WALLET_ABI);
  const data = walletInterface.encodeFunctionData('addOwnerAddress', [newOwnerAddress]);
  
  return {
    target: smartWalletAddress,
    value: 0n,
    data: data,
  };
}

/**
 * Create a transaction to remove an owner from the Smart Wallet by index
 */
export function createRemoveOwnerTransaction(
  provider: ethers.Provider,
  smartWalletAddress: string,
  ownerAddress: string,
  ownerIndex: number,
  ownerBytes: string,
  chainId: number
): Call {
  console.log(`🔧 [Owner Management] Creating remove owner transaction`);
  console.log(`   Smart Wallet: ${smartWalletAddress}`);
  console.log(`   Removing owner at index: ${ownerIndex}`);
  console.log(`   Owner bytes: ${ownerBytes}`);
  
  // Encode the removeOwnerAtIndex call with both index and owner bytes
  const walletInterface = new ethers.Interface(COINBASE_SMART_WALLET_ABI);
  const data = walletInterface.encodeFunctionData('removeOwnerAtIndex', [ownerIndex, ownerBytes]);
  
  return {
    target: smartWalletAddress,
    value: 0n,
    data: data,
  };
}

/**
 * Owner information structure
 */
export interface OwnerInfo {
  address: string;
  publicKey: string;
  index: number;
}

/**
 * Get all owners of a Smart Wallet
 */
export async function getSmartWalletOwners(
  provider: ethers.Provider,
  smartWalletAddress: string
): Promise<OwnerInfo[]> {
  try {
    const wallet = new ethers.Contract(
      smartWalletAddress,
      COINBASE_SMART_WALLET_ABI,
      provider
    );
    
    // Get owner count
    const ownerCountBigInt = await wallet.ownerCount();
    const ownerCount = Number(ownerCountBigInt);
    console.log(`👥 [Owner List] Smart Wallet has ${ownerCount} owner(s)`);
    console.log(`   ownerCount() returned: ${ownerCountBigInt}`);
    
    const owners: OwnerInfo[] = [];
    
    // Fetch each owner
    for (let i = 0; i < ownerCount; i++) {
      try {
        console.log(`   Fetching owner at index ${i}...`);
        const ownerBytes = await wallet.ownerAtIndex(i);
        console.log(`   ownerAtIndex(${i}) returned: ${ownerBytes}`);
        console.log(`   ownerBytes type: ${typeof ownerBytes}`);
        console.log(`   ownerBytes length: ${ownerBytes.length}`);
        
        // ownerAtIndex returns bytes - typically a 32-byte padded address
        // Example: 0x00000000000000000000000071bed9a64c4512b9dbf0c8fcf98e8c7ad08b1390
        // We need to extract the last 20 bytes (40 hex chars) as the address
        
        let ownerAddress: string;
        let publicKey: string = ownerBytes; // Store the full bytes as "public key"
        
        // Remove 0x prefix for length calculation
        const hexWithoutPrefix = ownerBytes.startsWith('0x') ? ownerBytes.slice(2) : ownerBytes;
        
        if (hexWithoutPrefix.length === 64) {
          // 32 bytes (64 hex chars) - padded address format
          // Extract last 20 bytes (40 hex chars)
          const addressHex = '0x' + hexWithoutPrefix.slice(-40);
          ownerAddress = ethers.getAddress(addressHex);
          console.log(`   Extracted address from padded bytes: ${ownerAddress}`);
        } else if (hexWithoutPrefix.length === 40) {
          // 20 bytes (40 hex chars) - already an address
          ownerAddress = ethers.getAddress(ownerBytes);
          console.log(`   Direct address: ${ownerAddress}`);
        } else {
          // Unknown format, try to get last 20 bytes
          console.log(`   Unknown format, extracting last 20 bytes...`);
          const addressHex = '0x' + hexWithoutPrefix.slice(-40);
          ownerAddress = ethers.getAddress(addressHex);
        }
        
        owners.push({
          address: ownerAddress,
          publicKey: publicKey,
          index: i
        });
        console.log(`   ✅ Owner ${i}: ${ownerAddress}`);
        console.log(`   Full bytes: ${publicKey}`);
      } catch (error) {
        console.error(`❌ Error fetching owner at index ${i}:`, error);
      }
    }
    
    return owners;
  } catch (error) {
    console.error('Error getting Smart Wallet owners:', error);
    throw error;
  }
}

