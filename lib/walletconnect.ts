"use client";

import SignClient from "@walletconnect/sign-client";
import QRCodeModal from "@walletconnect/qrcode-modal";
import { ethers } from "ethers";
import { useWalletStore } from "@/store/wallet-store";
import { signTransactionWithBurner, signTypedDataWithBurner, signPersonalMessageWithBurner, signDigestWithBurner } from "@/lib/burner";
import { getGlobalGateway, signTransactionWithGateway, signDigestWithGateway } from "@/lib/burner-gateway";
import { createSmartWalletTransaction, supportsEIP1271, verifyEIP1271Signature } from "@/lib/coinbase-smart-wallet";

// Supported chains with their RPC URLs and names for auto-switching
const SUPPORTED_CHAINS: Record<number, { name: string; rpcUrl: string }> = {
  1: { name: "Ethereum", rpcUrl: "https://eth.llamarpc.com" },
  8453: { name: "Base", rpcUrl: "https://mainnet.base.org" },
  56: { name: "BNB Chain", rpcUrl: "https://bsc-dataseed1.binance.org" },
  42161: { name: "Arbitrum One", rpcUrl: "https://arb1.arbitrum.io/rpc" },
  43114: { name: "Avalanche", rpcUrl: "https://api.avax.network/ext/bc/C/rpc" },
  81457: { name: "Blast", rpcUrl: "https://rpc.blast.io" },
  59144: { name: "Linea Mainnet", rpcUrl: "https://rpc.linea.build" },
  5000: { name: "Mantle", rpcUrl: "https://rpc.mantle.xyz" },
  34443: { name: "Mode Mainnet", rpcUrl: "https://mainnet.mode.network" },
  10: { name: "OP Mainnet", rpcUrl: "https://mainnet.optimism.io" },
  137: { name: "Polygon", rpcUrl: "https://polygon-rpc.com" },
  534352: { name: "Scroll", rpcUrl: "https://rpc.scroll.io" },
  1301: { name: "Unichain", rpcUrl: "https://sepolia.unichain.org" },
  // Testnets
  11155111: { name: "Sepolia", rpcUrl: "https://rpc.sepolia.org" },
  5: { name: "Goerli", rpcUrl: "https://rpc.ankr.com/eth_goerli" },
  84532: { name: "Base Sepolia", rpcUrl: "https://sepolia.base.org" },
  // Additional chains
  250: { name: "Fantom", rpcUrl: "https://rpc.ftm.tools" },
  100: { name: "Gnosis", rpcUrl: "https://rpc.gnosischain.com" },
  42220: { name: "Celo", rpcUrl: "https://forno.celo.org" },
  1101: { name: "Polygon zkEVM", rpcUrl: "https://zkevm-rpc.com" },
};

type WCClient = SignClient | null;

export type WalletConnectState = {
  wcClient: WCClient;
  pairingUri: string | null;
  sessions: Array<{ topic: string; peer: { name?: string; url?: string } }>; 
  isConnecting: boolean;
  error: string | null;
};

let client: WCClient = null;
let initialized = false;
let handlersBound = false;

function isGatewayAvailable(): boolean {
  try {
    getGlobalGateway();
    return true;
  } catch {
    return false;
  }
}

let pinProvider: (() => Promise<string | undefined>) | null = null;
export function setWalletConnectPinProvider(provider: () => Promise<string | undefined>) {
  pinProvider = provider;
}
// Track processed proposals to avoid duplicates
// Clean up old entries periodically to prevent memory leaks (keep last 1000)
const processedProposals = new Set<number>();
const processedRequests = new Set<number>();

// Cleanup function to prevent memory leaks
function cleanupProcessedItems() {
  // Keep only the most recent 500 items in each set
  if (processedProposals.size > 500) {
    const array = Array.from(processedProposals);
    const toRemove = array.slice(0, array.length - 500);
    toRemove.forEach(id => processedProposals.delete(id));
  }
  if (processedRequests.size > 500) {
    const array = Array.from(processedRequests);
    const toRemove = array.slice(0, array.length - 500);
    toRemove.forEach(id => processedRequests.delete(id));
  }
}

// Run cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(cleanupProcessedItems, 5 * 60 * 1000);
}
async function requestPin(): Promise<string | undefined> {
  if (pinProvider) {
    try { return await pinProvider(); } catch { return undefined; }
  }
  // Fallback prompt
  if (typeof window !== 'undefined') {
    const input = window.prompt("Enter PIN (optional):", "");
    return input && input.length > 0 ? input : undefined;
  }
  return undefined;
}

// Transaction confirmation callback
export type WalletConnectTxConfirmation = {
  txHash: string;
  chainId: number;
  method: string;
  from: string;
  to: string | null;
  value: string;
  data: string;
  dAppName?: string;
};

let txConfirmationProvider: ((confirmation: WalletConnectTxConfirmation) => void) | null = null;
export function setWalletConnectTxConfirmationProvider(provider: (confirmation: WalletConnectTxConfirmation) => void) {
  txConfirmationProvider = provider;
}

// Storage adapter for WalletConnect persistence
const createStorage = () => {
  const storageKey = 'walletconnect-v2-storage';
  
  return {
    getItem: async (key: string): Promise<string | undefined> => {
      try {
        if (typeof window === 'undefined') return undefined;
        const fullKey = `${storageKey}-${key}`;
        const stored = localStorage.getItem(fullKey);
        // Return stored value as-is - WalletConnect handles deserialization
        // If it's null or invalid, WalletConnect will handle it
        return stored || undefined;
      } catch (e) {
        console.warn(`[WC] Error reading from storage (key: ${key}):`, e);
        return undefined;
      }
    },
    setItem: async (key: string, value: string): Promise<void> => {
      try {
        if (typeof window === 'undefined') return;
        const fullKey = `${storageKey}-${key}`;
        // WalletConnect handles serialization internally, so we just store what it gives us
        // Note: value should already be a string (JSON) from WalletConnect
        localStorage.setItem(fullKey, value);
      } catch (e: any) {
        // Handle quota exceeded or other storage errors gracefully
        if (e.name === 'QuotaExceededError') {
          console.warn(`[WC] Storage quota exceeded for key: ${key}, attempting cleanup...`);
          // Try to clean up old messages/history if quota is exceeded
          try {
            const keysToCheck = ['messages', 'history', 'expirer'];
            for (const checkKey of keysToCheck) {
              if (key.includes(checkKey)) {
                // Could implement cleanup logic here if needed
                break;
              }
            }
          } catch {}
        }
        console.warn(`[WC] Failed to persist to localStorage (key: ${key}):`, e.message || e);
      }
    },
    removeItem: async (key: string): Promise<void> => {
      try {
        if (typeof window === 'undefined') return;
        const fullKey = `${storageKey}-${key}`;
        localStorage.removeItem(fullKey);
      } catch (e) {
        console.warn(`[WC] Error removing from storage (key: ${key}):`, e);
      }
    },
    getKeys: async (): Promise<string[]> => {
      try {
        if (typeof window === 'undefined') return [];
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(`${storageKey}-`)) {
            // Remove the storage key prefix
            keys.push(key.substring(storageKey.length + 1));
          }
        }
        return keys;
      } catch (e) {
        console.warn(`[WC] Error getting storage keys:`, e);
        return [];
      }
    },
    getEntries: async <T = string>(): Promise<[string, T][]> => {
      try {
        if (typeof window === 'undefined') return [];
        const entries: [string, T][] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(`${storageKey}-`)) {
            const value = localStorage.getItem(key);
            if (value !== null) {
              // Remove the storage key prefix from the key
              const shortKey = key.substring(storageKey.length + 1);
              entries.push([shortKey, value as T]);
            }
          }
        }
        return entries;
      } catch (e) {
        console.warn(`[WC] Error getting storage entries:`, e);
        return [];
      }
    },
  } as any; // Type assertion to satisfy IKeyValueStorage generic type requirements
};

export async function initWalletConnect(projectId: string): Promise<SignClient> {
  if (initialized && client) {
    // Try to restore sessions from storage
    try {
      const sessions = client.session.getAll();
      if (sessions.length > 0) {
        console.log(`[WC] Restored ${sessions.length} existing session(s)`);
      }
    } catch (e) {
      console.warn('[WC] Error restoring sessions:', e);
    }
    return client;
  }

  client = await SignClient.init({
    projectId,
    relayUrl: "wss://relay.walletconnect.com",
    metadata: {
      name: "OpenBurner dGEN1 Edition",
      description: "Burner & Smart Wallet via WalletConnect",
      url: typeof window !== 'undefined' ? window.location.origin : "https://openburner.xyz",
      icons: ["https://openburner.xyz/images/openburnerlogo.svg"],
    },
    storage: createStorage(),
  });

  // Restore existing sessions on init
  try {
    const sessions = client.session.getAll();
    if (sessions.length > 0) {
      console.log(`[WC] Found ${sessions.length} existing session(s) on init`);
      sessions.forEach((session) => {
        try {
          console.log(`[WC] Session topic: ${session.topic}, dApp: ${session.peer.metadata?.name || 'Unknown'}`);
        } catch (e) {
          console.warn(`[WC] Error reading session ${session.topic}:`, e);
        }
      });
    }
  } catch (e) {
    console.warn('[WC] Error checking existing sessions:', e);
    // If session restore fails, try to clean up corrupted storage
    try {
      console.log('[WC] Attempting to clean up potentially corrupted session storage...');
      // Don't delete everything, just log the issue
    } catch (cleanupError) {
      console.error('[WC] Failed to cleanup storage:', cleanupError);
    }
  }

  initialized = true;
  return client!;
}

export async function createPairing(projectId: string): Promise<string> {
  const c = await initWalletConnect(projectId);
  const { uri, approval } = await c!.connect({
    requiredNamespaces: {
      eip155: {
        methods: [
          "eth_requestAccounts",
          "personal_sign",
          "eth_signTypedData",
          "eth_sendTransaction",
        ],
        chains: [
          "eip155:1",      // Ethereum Mainnet
          "eip155:8453",   // Base
          "eip155:137",    // Polygon
          "eip155:56",     // BSC
          "eip155:10",     // Optimism
          "eip155:42161",  // Arbitrum One
          "eip155:11155111", // Sepolia
          "eip155:5",      // Goerli
          "eip155:43114",  // Avalanche
          "eip155:250",    // Fantom
          "eip155:100",    // Gnosis
          "eip155:42220",  // Celo
          "eip155:1101",   // Polygon zkEVM
          "eip155:84532",  // Base Sepolia
        ],
        events: ["accountsChanged", "chainChanged"],
      },
    },
  });

  if (uri) {
    return uri;
  }

  // If no URI (e.g., pairing via deep link), wait approval just to ensure flow
  await approval();
  return "";
}

export async function getActiveSessions() {
  if (!client) return [];
  try {
    return client.session.getAll();
  } catch (e) {
    console.warn('[WC] Error getting active sessions:', e);
    return [];
  }
}

// Helper function to auto-switch chain if supported
function autoSwitchChain(targetChainId: number): boolean {
  try {
    const chainInfo = SUPPORTED_CHAINS[targetChainId];
    if (!chainInfo) {
      console.log(`[WC] Chain ${targetChainId} not in supported list, cannot auto-switch`);
      return false;
    }

    // Get wallet store and switch chain
    const { getState } = useWalletStore as any;
    const state = getState();
    const currentChainId = state.chainId;
    const currentAddress = state.getActiveWalletAddress();
    const isConnected = state.isConnected;

    console.log(`[WC] Auto-switch check: current=${currentChainId}, target=${targetChainId}, connected=${isConnected}, address=${currentAddress}`);

    if (currentChainId === targetChainId) {
      console.log(`[WC] Already on chain ${targetChainId}, no switch needed`);
      return true;
    }

    if (!isConnected || !currentAddress) {
      console.warn(`[WC] Cannot switch chain: wallet not connected (isConnected=${isConnected}, address=${currentAddress})`);
      return false;
    }

    console.log(`[WC] Auto-switching from chain ${currentChainId} (${state.chainName}) to ${targetChainId} (${chainInfo.name})`);
    state.setChain(targetChainId, chainInfo.rpcUrl, chainInfo.name);
    
    // Verify switch was successful
    const newState = getState();
    if (newState.chainId === targetChainId) {
      console.log(`[WC] Successfully switched to ${chainInfo.name} (${targetChainId}). Wallet still connected: ${newState.isConnected}, address: ${newState.getActiveWalletAddress()}`);
      return true;
    } else {
      console.error(`[WC] Chain switch failed: expected ${targetChainId}, got ${newState.chainId}`);
      return false;
    }
  } catch (e: any) {
    console.error(`[WC] Error auto-switching to chain ${targetChainId}:`, e);
    return false;
  }
}

export async function subscribeWalletConnectHandlers(projectId: string, getProviderForChain: (chainId: number) => ethers.Provider) {
  if (!client) {
    await initWalletConnect(projectId);
  }
  
  // Restore active sessions after handlers are bound
  if (!handlersBound) {
    try {
      const sessions = await getActiveSessions();
      if (sessions.length > 0) {
        console.log(`[WC] Restoring ${sessions.length} active session(s)`);
      }
    } catch (e) {
      console.warn('[WC] Error restoring sessions:', e);
    }
  }
  
  if (handlersBound) return;

  if (!client) {
    console.warn('[WC] Cannot subscribe handlers: client not initialized');
    return;
  }

  client.on("session_proposal", async (proposal: any) => {
    const { id, params } = proposal;
    try {
      
      // Check if we've already processed this proposal
      if (processedProposals.has(id)) {
        console.debug("[WC] Proposal already processed, skipping:", id);
        return;
      }
      
      // Verify proposal still exists before processing
      try {
        const existingProposal = client!.proposal.get(id);
        if (!existingProposal) {
          console.warn("[WC] Proposal expired or already processed:", id);
          return;
        }
      } catch (e: any) {
        if (e.message?.includes("No matching key")) {
          console.debug("[WC] Proposal lookup failed (likely expired):", id);
          return;
        }
      }
      
      const { requiredNamespaces, optionalNamespaces, relays } = params;

      // Build accounts list from active wallet and chain
      const { getState } = useWalletStore as any;
      const state = getState();
      const address = state.getActiveWalletAddress();
      const fallbackChainId = state.chainId;
      const activeWalletType = state.activeWalletType as "burner" | "smart";
      const smartWalletAddress = state.activeSmartWalletAddress as string | null;

      console.log(`[WC] Session proposal: address=${address}, type=${activeWalletType}, smartWallet=${smartWalletAddress}`);

      if (!address) {
        console.error("[WC] No active wallet address found for session proposal!");
        try { await client!.reject({ id, reason: { code: 4001, message: "No active wallet address to approve session" } }); } catch {}
        return;
      }

      // Log wallet type for debugging
      if (activeWalletType === "smart" && smartWalletAddress) {
        console.log(`[WC] Using Smart Wallet: ${smartWalletAddress} (owner: ${state.address || 'unknown'})`);
      } else {
        console.log(`[WC] Using Burner Card: ${address}`);
      }

      // Support both requiredNamespaces and optionalNamespaces (WC v2)
      const nsSource = requiredNamespaces || optionalNamespaces || {};

      const namespaces: any = {};
      const REQUIRED_METHODS = [
        "eth_requestAccounts",
        "eth_sendTransaction",
        "personal_sign",
        "eth_sign",
        "eth_signTypedData",
        "eth_signTypedData_v3",
        "eth_signTypedData_v4",
        "eth_accounts",
        "eth_chainId",
        "eth_getBalance",
        "eth_getTransactionCount",
        "eth_getTransactionByHash",
        "eth_getTransactionReceipt",
        "eth_estimateGas",
        "eth_gasPrice",
        "eth_call",
        "eth_blockNumber",
        "eth_getCode",
        "eth_getBlockByNumber",
        "eth_getBlockByHash",
        "eth_getLogs",
        "wallet_switchEthereumChain",
        "wallet_addEthereumChain",
      ];
      const REQUIRED_EVENTS = ["accountsChanged", "chainChanged", "connect", "disconnect"];
      Object.keys(nsSource).forEach((ns) => {
        const nsDef = nsSource[ns] || {};
        const chains = Array.isArray(nsDef.chains) && nsDef.chains.length > 0
          ? nsDef.chains
          : [`eip155:${fallbackChainId}`];
        // IMPORTANT: Always use getActiveWalletAddress() to ensure we use Smart Wallet when active
        const activeAddress = state.getActiveWalletAddress();
        if (!activeAddress) {
          console.error("[WC] No active address found when building namespaces!");
          return;
        }
        const accounts = chains.map((c: string) => `${c}:${activeAddress}`);
        console.log(`[WC] Building namespace ${ns}: accounts=${JSON.stringify(accounts)}, walletType=${activeWalletType}`);

        const methods = Array.isArray(nsDef.methods) ? nsDef.methods.slice() : [];
        REQUIRED_METHODS.forEach((m) => { if (!methods.includes(m)) methods.push(m); });
        const events = Array.isArray(nsDef.events) ? nsDef.events.slice() : [];
        REQUIRED_EVENTS.forEach((e) => { if (!events.includes(e)) events.push(e); });

        namespaces[ns] = { accounts, methods, events };
      });

      // Fallback: if the dApp sent empty/unsupported namespaces, provide a sane default
      if (Object.keys(namespaces).length === 0) {
        const chains = [`eip155:${fallbackChainId}`];
        const activeAddress = state.getActiveWalletAddress();
        if (!activeAddress) {
          console.error("[WC] No active address found for fallback namespace!");
          try { await client!.reject({ id, reason: { code: 4001, message: "No active wallet address" } }); } catch {}
          return;
        }
        const accounts = chains.map((c: string) => `${c}:${activeAddress}`);
        console.log(`[WC] Using fallback namespace: accounts=${JSON.stringify(accounts)}, walletType=${activeWalletType}`);
        const methods = REQUIRED_METHODS.slice();
        const events = REQUIRED_EVENTS.slice();
        namespaces["eip155"] = { accounts, methods, events };
      }

      // Safely extract relay protocol
      let relayProtocol: string | undefined = undefined;
      try {
        if (relays && Array.isArray(relays) && relays.length > 0 && relays[0]?.protocol) {
          relayProtocol = relays[0].protocol;
        }
      } catch (e) {
        console.warn('[WC] Error extracting relay protocol:', e);
      }
      
      // Double-check proposal still exists before approving (it may have expired during processing)
      try {
        const finalCheck = client!.proposal.get(id);
        if (!finalCheck) {
          console.warn("[WC] Proposal expired during processing, cannot approve:", id);
          return;
        }
      } catch (checkErr: any) {
        if (checkErr.message?.includes("No matching key")) {
          console.debug("[WC] Proposal no longer exists, cannot approve:", id);
          return;
        }
        // If it's a different error, continue with approval attempt
      }
      
      console.log(`[WC] Approving session proposal ${id} with namespaces:`, JSON.stringify(namespaces, null, 2));
      await client!.approve({ id, relayProtocol, namespaces });
      processedProposals.add(id); // Mark as processed
      cleanupProcessedItems(); // Periodic cleanup
      console.log(`[WC] ✅ Session proposal ${id} approved successfully with walletType=${activeWalletType}, address=${address}`);
    } catch (e: any) {
      const proposalId = (proposal as any)?.id || id || 'unknown';
      console.error(`[WC] Error approving session proposal ${proposalId}:`, e?.message || e);
      // Only try to reject if proposal still exists
      try {
        const proposalId = (proposal as any).id || id;
        const existingProposal = client!.proposal.get(proposalId);
        if (existingProposal) {
          await client!.reject({ id: proposalId, reason: { code: 5000, message: "User rejected" } });
        } else {
          console.debug(`[WC] Proposal ${proposalId} already expired/processed, skipping reject`);
        }
      } catch (rejectErr: any) {
        if (rejectErr.message?.includes("No matching key")) {
          console.debug("[WC] Cannot reject - proposal no longer exists");
        } else {
          console.warn("[WC] Error rejecting proposal:", rejectErr?.message || rejectErr);
        }
      }
    }
  });

  // Handle session deletion (dApp disconnects)
  client.on("session_delete", (event: any) => {
    console.log("[WC] Session deleted:", event);
    try {
      // Session is already removed from client, but we can clean up any related storage
      const topic = event.topic;
      if (topic) {
        console.log(`[WC] Cleaning up storage for deleted session: ${topic}`);
      }
    } catch (e) {
      console.warn("[WC] Error handling session_delete:", e);
    }
  });

  // Handle session expiration
  client.on("session_expire", (event: any) => {
    console.log("[WC] Session expired:", event);
    try {
      const topic = event.topic;
      if (topic) {
        console.log(`[WC] Session expired: ${topic}`);
      }
    } catch (e) {
      console.warn("[WC] Error handling session_expire:", e);
    }
  });

  // Handle pairing expiration (commented out - not a valid event in SignClient)
  // client.on("pairing_expire", (event: any) => {
  //   console.log("[WC] Pairing expired:", event);
  // });

  // Handle errors from WalletConnect core
  client.core.relayer.on("relayer_message", () => {
    // This is just to ensure we're listening to relay messages
  });

  // Suppress "No matching key" errors by catching them early
  const originalErrorHandler = console.error;
  if (typeof window !== 'undefined') {
    // Intercept WalletConnect errors and handle them gracefully
    const suppressNoMatchingKey = (message: any) => {
      if (typeof message === 'string' && message.includes('No matching key')) {
        // This is expected when WalletConnect tries to access a session that was deleted
        // We'll let it fail silently as it's not critical
        console.debug('[WC] Suppressed "No matching key" error (session may have been deleted)');
        return;
      }
      originalErrorHandler(message);
    };
    
    // Note: We can't easily intercept WalletConnect's internal console.error calls
    // But we can handle the errors in our code paths
  }

  client.on("session_request", async (event: any) => {
    const { topic, params, id } = event;
    
    // Verify session exists (with better error handling for missing sessions)
    let session;
    let canRespond = false;
    try {
      session = client!.session.get(topic);
      if (!session) {
        console.warn("[WC] Session not found for topic:", topic, "- This may happen if session was deleted");
        // Don't try to respond if session doesn't exist - WalletConnect will handle it
        return;
      }
      canRespond = true;
    } catch (e: any) {
      // Handle "No matching key" errors gracefully
      if (e.message?.includes("No matching key") || e.message?.includes("session") || e.message?.includes("proposal")) {
        console.debug("[WC] Session/proposal lookup failed (likely expired or deleted):", topic);
        // Don't try to respond - the session/proposal doesn't exist
        return;
      }
      console.error("[WC] Error verifying session:", e);
      // If we can't verify the session, we shouldn't respond
      return;
    }
    
    if (!canRespond) {
      console.debug("[WC] Cannot process request - session not available");
      return;
    }

    const { request, chainId } = params;
    const method = request.method as string;

    // Helper function to safely respond to requests
    const safeRespond = async (response: any) => {
      try {
        // Check if already processed
        if (processedRequests.has(id)) {
          console.debug("[WC] Request already processed, skipping response:", id);
          return false;
        }
        
        // Double-check session still exists before responding
        let sessionExists = false;
        try {
          const verifySession = client!.session.get(topic);
          if (verifySession) {
            sessionExists = true;
          } else {
            console.debug("[WC] Session no longer exists, cannot send response for request:", id);
            processedRequests.add(id); // Mark as processed even if failed
            return false;
          }
        } catch (verifyErr: any) {
          if (verifyErr.message?.includes("No matching key") || verifyErr.message?.includes("session")) {
            console.debug("[WC] Session verification failed, cannot send response for request:", id);
            processedRequests.add(id); // Mark as processed even if failed
            return false;
          }
          // If it's a different error, continue (might be recoverable)
        }
        
        if (!sessionExists) {
          processedRequests.add(id); // Mark as processed even if failed
          return false;
        }
        
        await client!.respond({ topic, response });
        processedRequests.add(id); // Mark as processed after successful response
        cleanupProcessedItems(); // Periodic cleanup
        return true;
      } catch (respondErr: any) {
        // Handle "No matching key" and "without any listeners" errors silently
        if (respondErr.message?.includes("No matching key") || 
            respondErr.message?.includes("without any listeners") ||
            respondErr.message?.includes("proposal") ||
            respondErr.message?.includes("session")) {
          console.debug("[WC] Cannot send response - session/proposal expired or no listeners (request:", id, ")");
          processedRequests.add(id); // Mark as processed even if failed
          return false;
        }
        console.error("[WC] Failed to send response for request", id, ":", respondErr?.message || respondErr);
        // Don't mark as processed if it's an unexpected error (might retry)
        return false;
      }
    };

    const { getState } = useWalletStore as any;
    let state = getState();
    // IMPORTANT: Always use state.chainId, not chainId from params
    // chainId from params is the namespace chain (eip155:1), not the actual current chain
    let rpcChain = state.chainId;
    let activeAddress = state.getActiveWalletAddress();
    let activeType = state.activeWalletType as "burner" | "smart";
    let provider = getProviderForChain(rpcChain);

    try {
      console.log("[WC] session_request", { method, chainId, id, topic, requestParams: request.params });
      
      // Refresh state before handling requests (in case chain was switched)
      state = getState();
      // Always use state.chainId, not chainId from params
      rpcChain = state.chainId;
      activeAddress = state.getActiveWalletAddress();
      activeType = state.activeWalletType as "burner" | "smart";
      provider = getProviderForChain(rpcChain);
      
      console.log(`[WC] Request handler state: address=${activeAddress}, chain=${rpcChain} (${state.chainName}), type=${activeType}`);
      
      if (method === "eth_requestAccounts") {
        if (!activeAddress) {
          console.error(`[WC] eth_requestAccounts: No active wallet address found! State:`, {
            address: state.address,
            activeWalletType: state.activeWalletType,
            activeSmartWalletAddress: state.activeSmartWalletAddress,
            isConnected: state.isConnected,
          });
          await safeRespond({
            id,
            jsonrpc: "2.0",
            error: { code: 4100, message: "No active wallet. Please connect your wallet first." },
          });
          return;
        }
        console.log(`[WC] eth_requestAccounts: walletType=${activeType}, returning address ${activeAddress}`);
        if (activeType === "smart" && state.activeSmartWalletAddress) {
          console.log(`[WC] eth_requestAccounts: Smart Wallet detected, owner=${state.address}, smartWallet=${state.activeSmartWalletAddress}`);
        }
        await safeRespond({ id, jsonrpc: "2.0", result: [activeAddress] });
        return;
      }

      if (method === "eth_chainId") {
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: "0x" + rpcChain.toString(16) } });
        return;
      }

      if (method === "eth_accounts") {
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: [activeAddress] } });
        return;
      }

      if (method === "wallet_switchEthereumChain") {
        const target = request.params?.[0]?.chainId;
        console.log(`[WC] wallet_switchEthereumChain: raw target="${target}", type=${typeof target}, full params:`, JSON.stringify(request.params));
        
        // Handle different formats: "0x1", "1", "eip155:1", or number
        let targetDec = 0;
        if (typeof target === 'number') {
          targetDec = target;
        } else if (typeof target === 'string') {
          if (target.startsWith('0x')) {
            targetDec = parseInt(target, 16);
          } else if (target.startsWith('eip155:')) {
            targetDec = parseInt(target.split(':')[1], 10);
          } else {
            const parsed = parseInt(target, 10);
            if (!isNaN(parsed)) {
              targetDec = parsed;
            } else {
              console.error(`[WC] Failed to parse chainId: "${target}"`);
            }
          }
        }
        
        console.log(`[WC] wallet_switchEthereumChain: parsed=${targetDec}, current=${rpcChain}`);
        
        if (targetDec === rpcChain) {
          console.log(`[WC] Chain already active, responding with success`);
          await safeRespond({ id, jsonrpc: "2.0", result: null });
        } else {
          // Try to auto-switch if chain is supported
          const switched = autoSwitchChain(targetDec);
          if (switched) {
            console.log(`[WC] Auto-switched to chain ${targetDec}, updating state and provider`);
            // Wait a bit longer for state to fully update and persist
            await new Promise(resolve => setTimeout(resolve, 200));
            // Force multiple refreshes to ensure state is updated
            for (let i = 0; i < 3; i++) {
              state = getState();
              if (state.chainId === targetDec) break;
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            // Update state and provider after switch
            state = getState();
            rpcChain = targetDec;
            activeAddress = state.getActiveWalletAddress();
            activeType = state.activeWalletType as "burner" | "smart";
            provider = getProviderForChain(rpcChain);
            console.log(`[WC] State and provider updated for chain ${targetDec} (${state.chainName})`);
            console.log(`[WC] Verification: chainId=${state.chainId}, address=${activeAddress}, connected=${state.isConnected}`);
            await safeRespond({ id, jsonrpc: "2.0", result: null });
          } else {
            console.log(`[WC] Chain ${targetDec} not supported, returning error`);
            await safeRespond({ 
              id, 
              jsonrpc: "2.0", 
              error: { 
                code: 4902, 
                message: `Chain ${targetDec} not supported. Please switch network manually in the app or use a custom RPC.` 
              } 
            });
          }
        }
        return;
      }

      if (method === "eth_gasPrice") {
        const fee = await provider.getFeeData();
        const gasPrice = (fee.gasPrice ?? fee.maxFeePerGas ?? 0n).toString(16);
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: "0x" + gasPrice } });
        return;
      }

      if (method === "eth_estimateGas") {
        const tx = (request.params && request.params[0]) || {};
        const estimate = await provider.estimateGas({
          from: activeAddress || undefined,
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
        });
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: "0x" + estimate.toString(16) } });
        return;
      }

      if (method === "eth_call") {
        const [callReq, blockTag] = request.params || [];
        const result = await provider.call({
          to: callReq?.to,
          data: callReq?.data,
          value: callReq?.value ? BigInt(callReq.value) : undefined,
          from: activeAddress || undefined,
          blockTag: blockTag || "latest",
        });
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result } });
        return;
      }

      if (method === "eth_getBalance") {
        const [addr, blockTag] = request.params || [];
        const bal = await provider.getBalance(addr || activeAddress, blockTag);
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: "0x" + bal.toString(16) } });
        return;
      }

      if (method === "eth_getTransactionCount") {
        const [addr, blockTag] = request.params || [];
        const count = await provider.getTransactionCount(addr || activeAddress, blockTag);
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: "0x" + count.toString(16) } });
        return;
      }

      if (method === "eth_getTransactionByHash") {
        const [txHash] = request.params || [];
        if (!txHash) throw new Error("eth_getTransactionByHash requires transaction hash");
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
          await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: null } });
          return;
        }
        await client!.respond({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result: {
              hash: tx.hash,
              blockHash: tx.blockHash || null,
              blockNumber: tx.blockNumber ? "0x" + tx.blockNumber.toString(16) : null,
              transactionIndex: tx.index !== null ? "0x" + tx.index.toString(16) : null,
              from: tx.from,
              to: tx.to || null,
              value: "0x" + tx.value.toString(16),
              gas: "0x" + tx.gasLimit.toString(16),
              gasPrice: tx.gasPrice ? "0x" + tx.gasPrice.toString(16) : null,
              maxFeePerGas: tx.maxFeePerGas ? "0x" + tx.maxFeePerGas.toString(16) : null,
              maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? "0x" + tx.maxPriorityFeePerGas.toString(16) : null,
              input: tx.data || "0x",
              nonce: "0x" + tx.nonce.toString(16),
              chainId: tx.chainId ? "0x" + tx.chainId.toString(16) : null,
            },
          },
        });
        return;
      }

      if (method === "eth_getTransactionReceipt") {
        const [txHash] = request.params || [];
        if (!txHash) throw new Error("eth_getTransactionReceipt requires transaction hash");
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) {
          await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: null } });
          return;
        }
        await client!.respond({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result: {
              transactionHash: receipt.hash,
              transactionIndex: "0x" + receipt.index.toString(16),
              blockHash: receipt.blockHash,
              blockNumber: "0x" + receipt.blockNumber.toString(16),
              from: receipt.from,
              to: receipt.to || null,
              gasUsed: "0x" + receipt.gasUsed.toString(16),
              cumulativeGasUsed: "0x" + receipt.gasUsed.toString(16),
              contractAddress: receipt.contractAddress || null,
              logs: receipt.logs.map((log) => ({
                address: log.address,
                topics: log.topics,
                data: log.data,
                logIndex: "0x" + (log.index !== null ? log.index.toString(16) : "0"),
                blockNumber: "0x" + log.blockNumber.toString(16),
                blockHash: log.blockHash,
                transactionHash: log.transactionHash,
                transactionIndex: "0x" + (log.transactionIndex !== null ? log.transactionIndex.toString(16) : "0"),
              })),
              status: receipt.status ? "0x1" : "0x0",
              logsBloom: receipt.logsBloom || "0x",
            },
          },
        });
        return;
      }

      if (method === "eth_blockNumber") {
        const blockNumber = await provider.getBlockNumber();
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: "0x" + blockNumber.toString(16) } });
        return;
      }

      if (method === "eth_getCode") {
        const [addr, blockTag] = request.params || [];
        if (!addr) throw new Error("eth_getCode requires address");
        const code = await provider.getCode(addr, blockTag);
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: code || "0x" } });
        return;
      }

      if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash") {
        const [blockTagOrHash, fullTxs] = request.params || [];
        if (!blockTagOrHash) throw new Error(`${method} requires block number or hash`);
        
        let block: any;
        if (method === "eth_getBlockByNumber") {
          block = await provider.getBlock(blockTagOrHash, fullTxs === true);
        } else {
          block = await provider.getBlock(blockTagOrHash, fullTxs === true);
        }
        
        if (!block) {
          await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: null } });
          return;
        }
        
        await client!.respond({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result: {
              number: block.number ? "0x" + block.number.toString(16) : null,
              hash: block.hash || null,
              parentHash: block.parentHash || "0x",
              nonce: block.nonce || "0x",
              sha3Uncles: block.extraData || "0x",
              logsBloom: block.logsBloom || "0x",
              transactionsRoot: block.transactionsRoot || "0x",
              stateRoot: block.stateRoot || "0x",
              miner: block.miner || "0x",
              difficulty: block.difficulty ? "0x" + block.difficulty.toString(16) : "0x0",
              totalDifficulty: block.difficulty ? "0x" + block.difficulty.toString(16) : "0x0",
              extraData: block.extraData || "0x",
              size: block.gasLimit ? "0x" + block.gasLimit.toString(16) : "0x0",
              gasLimit: block.gasLimit ? "0x" + block.gasLimit.toString(16) : "0x0",
              gasUsed: block.gasUsed ? "0x" + block.gasUsed.toString(16) : "0x0",
              timestamp: block.timestamp ? "0x" + block.timestamp.toString(16) : "0x0",
              transactions: fullTxs === true && block.transactions
                ? block.transactions.map((tx: any) => typeof tx === "string" ? tx : {
                    hash: tx.hash,
                    blockHash: tx.blockHash || null,
                    blockNumber: tx.blockNumber ? "0x" + tx.blockNumber.toString(16) : null,
                    transactionIndex: tx.index !== null ? "0x" + tx.index.toString(16) : null,
                    from: tx.from,
                    to: tx.to || null,
                    value: "0x" + tx.value.toString(16),
                    gas: "0x" + tx.gasLimit.toString(16),
                    gasPrice: tx.gasPrice ? "0x" + tx.gasPrice.toString(16) : null,
                    input: tx.data || "0x",
                    nonce: "0x" + tx.nonce.toString(16),
                  })
                : block.transactions || [],
              uncles: [],
            },
          },
        });
        return;
      }

      if (method === "eth_getLogs") {
        const [filter] = request.params || [];
        if (!filter) throw new Error("eth_getLogs requires filter object");
        
        const logs = await provider.getLogs({
          fromBlock: filter.fromBlock,
          toBlock: filter.toBlock,
          address: filter.address,
          topics: filter.topics,
        });
        
        await client!.respond({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result: logs.map((log) => ({
              address: log.address,
              topics: log.topics,
              data: log.data,
              blockNumber: "0x" + log.blockNumber.toString(16),
              blockHash: log.blockHash,
              transactionHash: log.transactionHash,
              transactionIndex: "0x" + (log.index !== null ? log.index.toString(16) : "0"),
              logIndex: "0x" + (log.index !== null ? log.index.toString(16) : "0"),
              removed: false,
            })),
          },
        });
        return;
      }

      if (method === "wallet_addEthereumChain") {
        // Most dApps expect this to succeed or return an error
        // Since we can't dynamically add chains, we'll return success if chainId matches current chain
        const params = request.params?.[0] || {};
        const chainIdParam = params.chainId;
        console.log(`[WC] wallet_addEthereumChain: raw chainId="${chainIdParam}", type=${typeof chainIdParam}, full params:`, JSON.stringify(request.params));
        
        // Handle different formats: "0x1", "1", "eip155:1", or number
        let chainIdDec = 0;
        if (typeof chainIdParam === 'number') {
          chainIdDec = chainIdParam;
        } else if (typeof chainIdParam === 'string') {
          if (chainIdParam.startsWith('0x')) {
            chainIdDec = parseInt(chainIdParam, 16);
          } else if (chainIdParam.startsWith('eip155:')) {
            chainIdDec = parseInt(chainIdParam.split(':')[1], 10);
          } else {
            const parsed = parseInt(chainIdParam, 10);
            if (!isNaN(parsed)) {
              chainIdDec = parsed;
            } else {
              console.error(`[WC] Failed to parse chainId: "${chainIdParam}"`);
            }
          }
        }
        
        console.log(`[WC] wallet_addEthereumChain: parsed=${chainIdDec}, current=${rpcChain}`);
        
        // If the chain matches current chain, accept it (chain already added)
        if (chainIdDec === rpcChain) {
          console.log(`[WC] Chain already added/supported, responding with success`);
          await safeRespond({ id, jsonrpc: "2.0", result: null });
        } else {
          // Try to auto-switch if chain is supported
          const switched = autoSwitchChain(chainIdDec);
          if (switched) {
            console.log(`[WC] Auto-switched to chain ${chainIdDec}, updating state and provider`);
            // Wait a bit longer for state to fully update and persist
            await new Promise(resolve => setTimeout(resolve, 200));
            // Force multiple refreshes to ensure state is updated
            for (let i = 0; i < 3; i++) {
              state = getState();
              if (state.chainId === chainIdDec) break;
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            // Update state and provider after switch
            state = getState();
            rpcChain = chainIdDec;
            activeAddress = state.getActiveWalletAddress();
            activeType = state.activeWalletType as "burner" | "smart";
            provider = getProviderForChain(rpcChain);
            console.log(`[WC] State and provider updated for chain ${chainIdDec} (${state.chainName})`);
            console.log(`[WC] Verification: chainId=${state.chainId}, address=${activeAddress}, connected=${state.isConnected}`);
            await safeRespond({ id, jsonrpc: "2.0", result: null });
          } else {
            // For unsupported chains, try to use custom RPC from params if provided
            const customRpcUrl = params.rpcUrls?.[0];
            if (customRpcUrl && typeof customRpcUrl === 'string') {
              try {
                console.log(`[WC] Attempting to add chain ${chainIdDec} with custom RPC: ${customRpcUrl}`);
                const chainName = params.chainName || `Chain ${chainIdDec}`;
                state.setChain(chainIdDec, customRpcUrl, chainName);
                console.log(`[WC] Successfully added chain ${chainIdDec} with custom RPC, updating state and provider`);
                // Wait a bit for state to update
                await new Promise(resolve => setTimeout(resolve, 100));
                // Update state and provider after adding custom chain
                state = getState();
                rpcChain = chainIdDec;
                activeAddress = state.getActiveWalletAddress();
                activeType = state.activeWalletType as "burner" | "smart";
                provider = getProviderForChain(rpcChain);
                console.log(`[WC] State and provider updated for chain ${chainIdDec} (${chainName}), responding with success`);
                await safeRespond({ id, jsonrpc: "2.0", result: null });
              } catch (e) {
                console.error(`[WC] Failed to add chain with custom RPC:`, e);
                await safeRespond({
                  id,
                  jsonrpc: "2.0",
                  error: { 
                    code: 4902, 
                    message: `Failed to add chain ${chainIdDec}. Please add it manually in the app.` 
                  },
                });
              }
            } else {
              // Chain not supported and no custom RPC provided
              console.log(`[WC] Chain ${chainIdDec} not supported, returning error`);
              await safeRespond({
                id,
                jsonrpc: "2.0",
                error: { 
                  code: 4902, 
                  message: `Chain ${chainIdDec} not supported. Please switch network manually in the app or add a custom RPC.` 
                },
              });
            }
          }
        }
        return;
      }

      if (method === "eth_sign") {
        // Deprecated method: signs a hash directly (dangerous, but some dApps still use it)
        const params = request.params || [];
        const address = params[0];
        const hash = params[1];
        
        if (!hash || hash.length !== 66) {
          throw new Error("eth_sign requires a 32-byte hash (0x followed by 64 hex chars)");
        }
        
        // Verify address matches active address
        if (address && address.toLowerCase() !== activeAddress.toLowerCase()) {
          throw new Error("eth_sign: address does not match active account");
        }
        
        let sig: string;
        if (isGatewayAvailable() || (state.connectionMode as string) === 'gateway') {
          console.log('[WC][Gateway] eth_sign: signing hash directly via Gateway');
          const gate = getGlobalGateway();
          const pin = await requestPin();
          sig = await signDigestWithGateway(gate as any, hash, state.keySlot || 1, pin);
        } else {
          console.log('[WC][Bridge] eth_sign: signing hash directly via Bridge');
          const pin = await requestPin();
          sig = await signDigestWithBurner(hash, state.keySlot || 1, pin);
        }
        
        await client!.respond({ topic, response: { id, jsonrpc: "2.0", result: sig } });
        return;
      }

      if (method === "personal_sign") {
        const params = request.params || [];
        // per EIP-1193, params order can be [data, address] or [address, data] depending on dApp
        const maybeData = params[0];
        const maybeAddr = params[1];
        const data = typeof maybeData === "string" && maybeData.length > 0 ? maybeData : (typeof maybeAddr === "string" ? maybeAddr : "");
        if (!data) throw new Error("personal_sign requires a message to sign");
        
        // For Smart Wallets, check if EIP-1271 is supported
        if (activeType === "smart" && state.activeSmartWalletAddress) {
          console.log(`[WC] 🔐 Smart Wallet detected for personal_sign: ${state.activeSmartWalletAddress}`);
          console.log(`[WC] 🔐 Owner (signing): ${state.address}`);
          
          // Check if Smart Wallet supports EIP-1271
          try {
            const eip1271Supported = await supportsEIP1271(provider, state.activeSmartWalletAddress);
            if (eip1271Supported) {
              console.log(`[WC] ✅ Smart Wallet supports EIP-1271! Signature will be valid via isValidSignature()`);
            } else {
              console.warn(`[WC] ⚠️ Smart Wallet does not support EIP-1271. Signature may not validate against Smart Wallet address.`);
              console.warn(`[WC] ⚠️ Some dApps may reject this signature. Consider using Burner Card directly for message signing.`);
            }
          } catch (e: any) {
            console.warn(`[WC] ⚠️ Could not check EIP-1271 support:`, e?.message || e);
          }
        }
        let sig: string;
        if (isGatewayAvailable() || (state.connectionMode as string) === 'gateway') {
          console.log('[WC][Gateway] personal_sign: hashing and sending to Gateway');
          const gate = getGlobalGateway();
          const digest = ethers.hashMessage(data);
          const pin = await requestPin();
          sig = await signDigestWithGateway(gate as any, digest, state.keySlot || 1, pin);
          console.log('[WC][Gateway] personal_sign: signature received');
        } else {
          const pin = await requestPin();
          sig = await signPersonalMessageWithBurner(data, state.keySlot || 1, pin);
        }
        await safeRespond({ id, jsonrpc: "2.0", result: sig });
        return;
      }

      if (method === "eth_signTypedData" || method === "eth_signTypedData_v3" || method === "eth_signTypedData_v4") {
        // Expect params: [address, typedData] or [typedData, address]
        const params = request.params || [];
        let typed: any = null;
        for (const p of params) {
          if (typeof p === "object") { typed = p; break; }
          if (typeof p === "string") {
            try { const o = JSON.parse(p); if (typeof o === "object") { typed = o; break; } } catch {}
          }
        }
        if (!typed) throw new Error("eth_signTypedData requires typed data payload");
        const { domain, types, message } = typed;
        if (!domain || !types || !message) throw new Error("Invalid EIP-712 payload: missing domain/types/message");
        
        // For Smart Wallets, check if EIP-1271 is supported
        if (activeType === "smart" && state.activeSmartWalletAddress) {
          console.log(`[WC] 🔐 Smart Wallet detected for eth_signTypedData: ${state.activeSmartWalletAddress}`);
          console.log(`[WC] 🔐 Owner (signing): ${state.address}`);
          
          // Check if Smart Wallet supports EIP-1271
          try {
            const eip1271Supported = await supportsEIP1271(provider, state.activeSmartWalletAddress);
            if (eip1271Supported) {
              console.log(`[WC] ✅ Smart Wallet supports EIP-1271! Signature will be valid via isValidSignature()`);
            } else {
              console.warn(`[WC] ⚠️ Smart Wallet does not support EIP-1271. Signature may not validate against Smart Wallet address.`);
              console.warn(`[WC] ⚠️ Some dApps may reject this signature. Consider using Burner Card directly for message signing.`);
            }
          } catch (e: any) {
            console.warn(`[WC] ⚠️ Could not check EIP-1271 support:`, e?.message || e);
          }
        }
        
        // Remove EIP712Domain from types per ethers expectation
        const { EIP712Domain, ...restTypes } = types || {};
        let sig: string;
        if (isGatewayAvailable() || (state.connectionMode as string) === 'gateway') {
          console.log('[WC][Gateway] eth_signTypedData: hashing typed data and sending to Gateway');
          const digest = ethers.TypedDataEncoder.hash(domain, restTypes as any, message);
          const gate = getGlobalGateway();
          const pin = await requestPin();
          sig = await signDigestWithGateway(gate as any, digest, state.keySlot || 1, pin);
          console.log('[WC][Gateway] eth_signTypedData: signature received');
        } else {
          const pin = await requestPin();
          sig = await signTypedDataWithBurner(domain, restTypes, message, state.keySlot || 1, pin);
        }
        await safeRespond({ id, jsonrpc: "2.0", result: sig });
        return;
      }

      if (method === "eth_sendTransaction") {
        const tx = (request.params && request.params[0]) || {};

        let ownerModeTransaction: ethers.TransactionRequest | null = null;
        const isSmart = activeType === "smart" && state.activeSmartWalletAddress;
        const smartAddr = state.activeSmartWalletAddress as string | null;
        const ownerBurnerAddress = (state.address as string) || (activeAddress as string);
        const toAddr = (tx.to || "").toLowerCase();
        // If Smart Wallet is active and dApp tx is NOT directed to the smart wallet, wrap it automatically
        if (isSmart && smartAddr && toAddr !== smartAddr.toLowerCase()) {
          const call = {
            target: tx.to as string,
            value: tx.value ? BigInt(tx.value) : 0n,
            data: tx.data as string,
          };
          ownerModeTransaction = await createSmartWalletTransaction(
            provider,
            smartAddr,
            ownerBurnerAddress,
            call as any,
            rpcChain
          );
        }

        // Complete transaction fields
        const nonce = await provider.getTransactionCount(activeAddress);
        const fee = await provider.getFeeData();
        const filled: ethers.TransactionRequest = ownerModeTransaction || {
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          chainId: rpcChain,
          type: 2,
          nonce,
          maxFeePerGas: fee.maxFeePerGas || 0n,
          maxPriorityFeePerGas: fee.maxPriorityFeePerGas || 0n,
          gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
        };

        // Sign with Burner card (owner signer).
        // Use Gateway if connectionMode is 'gateway', else Bridge.
        let signed: string;
        if (isGatewayAvailable() || (state.connectionMode as string) === 'gateway') {
          try {
            console.log('[WC][Gateway] eth_sendTransaction: sending to Gateway');
            const gate = getGlobalGateway();
            const pin = await requestPin();
            signed = await signTransactionWithGateway(gate as any, filled, state.keySlot || 1, pin);
            console.log('[WC][Gateway] eth_sendTransaction: signature received');
          } catch (e: any) {
            throw new Error(e?.message || 'Failed to sign via Gateway');
          }
        } else {
          const pin = await requestPin();
          signed = await signTransactionWithBurner(filled, state.keySlot || 1, pin);
        }
        console.log('[WC] Broadcasting transaction...');
        const sent = await provider.broadcastTransaction(signed);
        const txHash = sent.hash;
        console.log('[WC] Transaction broadcasted successfully, hash:', txHash);

        // CRITICAL: Send response to dApp FIRST, before any UI callbacks
        // This ensures the dApp receives the txHash even if UI callbacks fail
        const responseSent = await safeRespond({ id, jsonrpc: "2.0", result: txHash });
        if (!responseSent) {
          console.error('[WC] CRITICAL: Failed to send response to dApp (session may have expired)');
          // Don't throw - transaction was successful, just couldn't notify dApp
          // The dApp may reconnect and query the transaction
        } else {
          console.log('[WC] Response sent successfully to dApp');
        }

        // After successful response, notify UI callback (non-blocking)
        // Get dApp info from session
        try {
          const session = client!.session.get(topic);
          const dAppName = session?.peer?.metadata?.name || "dApp";

          // Notify confirmation callback if registered (non-blocking)
          if (txConfirmationProvider) {
            try {
              txConfirmationProvider({
                txHash,
                chainId: rpcChain,
                method: "eth_sendTransaction",
                from: activeAddress,
                to: (filled.to as string) || null,
                value: filled.value ? filled.value.toString() : "0",
                data: (filled.data as string) || "0x",
                dAppName,
              });
              console.log('[WC] UI confirmation callback notified');
            } catch (e) {
              console.warn("[WC] Error in tx confirmation callback (non-critical):", e);
              // Don't throw - UI callback errors shouldn't affect the transaction
            }
          }
        } catch (sessionError) {
          console.warn("[WC] Error getting session info for callback (non-critical):", sessionError);
          // Don't throw - session lookup errors shouldn't affect the transaction
        }

        return;
      }

      throw new Error(`Unsupported method: ${method}`);
    } catch (err: any) {
      console.error("[WC] Error handling", method, err);
      
      // Check if session still exists before responding
      let sessionExists = false;
      try {
        const session = client!.session.get(topic);
        sessionExists = !!session;
      } catch (e) {
        console.warn("[WC] Could not verify session existence:", e);
      }

      if (!sessionExists) {
        console.warn("[WC] Session no longer exists, cannot respond to request");
        return;
      }

      // Map common errors to standard JSON-RPC error codes
      let errorCode = 5000; // Internal error
      let errorMessage = err.message || "WalletConnect error";
      
      if (err.message?.includes("No matching key") || err.message?.includes("session") || err.message?.includes("history")) {
        errorCode = 4100; // Session error
        errorMessage = "Session expired or not found. Please reconnect to the dApp.";
      } else if (err.message?.includes("User rejected") || err.message?.includes("User cancelled")) {
        errorCode = 4001; // User rejected
      } else if (err.message?.includes("Unauthorized") || err.message?.includes("Not authorized")) {
        errorCode = 4100; // Unauthorized
      } else if (err.message?.includes("Unsupported method")) {
        errorCode = 4200; // Unsupported method
      } else if (err.message?.includes("Not supported") || err.message?.includes("not supported")) {
        errorCode = 4200; // Method not supported
      } else if (err.message?.includes("Invalid") || err.message?.includes("invalid")) {
        errorCode = -32602; // Invalid params
      } else if (err.message?.includes("Chain") || err.message?.includes("network")) {
        errorCode = 4902; // Chain not added
      }
      
      // Only try to respond if we verified the session exists earlier
      try {
        // Double-check session still exists before responding
        try {
          const verifySession = client!.session.get(topic);
          if (!verifySession) {
            console.debug("[WC] Session no longer exists, cannot send error response");
            return;
          }
        } catch (verifyErr: any) {
          if (verifyErr.message?.includes("No matching key")) {
            console.debug("[WC] Session verification failed, cannot send error response");
            return;
          }
        }
        
        await client!.respond({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            error: { code: errorCode, message: errorMessage },
          },
        });
      } catch (respondErr: any) {
        // Handle "No matching key" and "without any listeners" errors silently
        if (respondErr.message?.includes("No matching key") || 
            respondErr.message?.includes("without any listeners") ||
            respondErr.message?.includes("proposal") ||
            respondErr.message?.includes("session")) {
          console.debug("[WC] Cannot send error response - session/proposal expired or no listeners");
          return;
        }
        console.error("[WC] Failed to send error response:", respondErr?.message || respondErr);
        // Don't throw - we've already logged the error
      }
    }
  });
  handlersBound = true;
}

export function openWalletConnectQr(uri: string) {
  if (!uri) return;
  try {
    QRCodeModal.open(uri, () => QRCodeModal.close());
  } catch (e) {
    // fallback: no-op
  }
}

// Permette di collegarsi incollando direttamente un URI WalletConnect (wc:...)
export async function pairFromUri(projectId: string, uri: string): Promise<void> {
  if (!uri || !uri.startsWith("wc:")) {
    throw new Error("URI WalletConnect non valido");
  }
  const c = await initWalletConnect(projectId);
  // Assicura che gli handler siano attivi prima del pairing
  // Nota: gli handler vanno sottoscritti dal chiamante passando il resolver provider
  await c.core.pairing.pair({ uri });
}


