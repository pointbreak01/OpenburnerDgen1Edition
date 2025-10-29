import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ConnectionMode = 'bridge' | 'gateway';
export type WalletType = 'burner' | 'smart';

interface WalletState {
  address: string | null;
  publicKey: string | null;
  keySlot: number | null;
  chainId: number;
  rpcUrl: string;
  chainName: string;
  isConnected: boolean;
  balance: string;
  connectionMode: ConnectionMode;
  // Smart Wallet configuration
  smartWalletAddress: string | null;
  isSmartWallet: boolean;
  // Multi-wallet support
  availableSmartWallets: string[];
  activeWalletType: WalletType;
  activeSmartWalletAddress: string | null;
  setWallet: (address: string, publicKey: string, keySlot?: number) => void;
  setChain: (chainId: number, rpcUrl: string, chainName: string) => void;
  setBalance: (balance: string) => void;
  setConnectionMode: (mode: ConnectionMode) => void;
  setSmartWallet: (smartWalletAddress: string) => void;
  clearSmartWallet: () => void;
  // Multi-wallet methods
  setAvailableSmartWallets: (wallets: string[]) => void;
  setActiveWallet: (type: WalletType, smartWalletAddress?: string) => void;
  getActiveWalletAddress: () => string | null;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      address: null,
      publicKey: null,
      keySlot: null,
      chainId: 1,
      rpcUrl: "https://eth.llamarpc.com",
      chainName: "Ethereum",
      isConnected: false,
      balance: "0",
      connectionMode: 'bridge' as ConnectionMode,
      smartWalletAddress: null,
      isSmartWallet: false,
      availableSmartWallets: [],
      activeWalletType: 'burner' as WalletType,
      activeSmartWalletAddress: null,
      setWallet: (address, publicKey, keySlot) => {
        console.log("🔐 [Wallet Store] setWallet called:");
        console.log(`  Address: ${address}`);
        console.log(`  Public Key: ${publicKey}`);
        console.log(`  Key Slot: ${keySlot || 1}`);
        set({ address, publicKey, keySlot: keySlot || 1, isConnected: true });
        console.log("✅ [Wallet Store] Wallet state updated and persisted to localStorage");
      },
      setChain: (chainId, rpcUrl, chainName) => {
        console.log(`🌐 [Wallet Store] Switching to chain: ${chainName} (ID: ${chainId})`);
        console.log(`  RPC URL: ${rpcUrl}`);
        set({ chainId, rpcUrl, chainName, balance: "0" });
      },
      setBalance: (balance) => {
        console.log(`💰 [Wallet Store] Setting balance: ${balance}`);
        set({ balance });
      },
      setConnectionMode: (mode) => {
        console.log(`🔄 [Wallet Store] Setting connection mode: ${mode}`);
        set({ connectionMode: mode });
      },
      setSmartWallet: (smartWalletAddress) => {
        console.log(`🏦 [Wallet Store] Setting Smart Wallet address: ${smartWalletAddress}`);
        set({ smartWalletAddress, isSmartWallet: true });
      },
      clearSmartWallet: () => {
        console.log(`🏦 [Wallet Store] Clearing Smart Wallet configuration`);
        set({ smartWalletAddress: null, isSmartWallet: false });
      },
      setAvailableSmartWallets: (wallets) => {
        console.log(`🏦 [Wallet Store] Setting available Smart Wallets:`, wallets);
        set({ availableSmartWallets: wallets });
      },
      setActiveWallet: (type, smartWalletAddress) => {
        console.log(`🔄 [Wallet Store] Switching to ${type} wallet`);
        if (type === 'smart' && smartWalletAddress) {
          console.log(`  Smart Wallet address: ${smartWalletAddress}`);
          set({ 
            activeWalletType: type, 
            activeSmartWalletAddress: smartWalletAddress,
            // Maintain backward compatibility
            smartWalletAddress: smartWalletAddress,
            isSmartWallet: true
          });
        } else {
          console.log(`  Using Burner card`);
          set({ 
            activeWalletType: 'burner', 
            activeSmartWalletAddress: null,
            // Maintain backward compatibility
            smartWalletAddress: null,
            isSmartWallet: false
          });
        }
      },
      getActiveWalletAddress: () => {
        const state = useWalletStore.getState();
        if (state.activeWalletType === 'smart' && state.activeSmartWalletAddress) {
          return state.activeSmartWalletAddress;
        }
        return state.address;
      },
      disconnect: () => {
        console.log("🔌 [Wallet Store] DISCONNECT called");
        console.log("  Current state before disconnect:");
        const currentState = useWalletStore.getState();
        console.log(`    Address: ${currentState.address}`);
        console.log(`    Public Key: ${currentState.publicKey}`);
        console.log(`    Key Slot: ${currentState.keySlot}`);
        console.log(`    Chain: ${currentState.chainName} (${currentState.chainId})`);
        console.log(`    Balance: ${currentState.balance}`);
        
        set({
          address: null,
          publicKey: null,
          keySlot: null,
          isConnected: false,
          balance: "0",
          smartWalletAddress: null,
          isSmartWallet: false,
          availableSmartWallets: [],
          activeWalletType: 'burner',
          activeSmartWalletAddress: null,
        });
        
        console.log("✅ [Wallet Store] Wallet disconnected and cleared from state");
        console.log("📦 [Wallet Store] localStorage should now contain null values for wallet data");
        
        // Verify localStorage was updated
        setTimeout(() => {
          const stored = localStorage.getItem("openburner-storage");
          console.log("🔍 [Wallet Store] Verifying localStorage after disconnect:");
          console.log(stored);
        }, 100);
      },
    }),
    {
      name: "openburner-storage",
    }
  )
);

