"use client";

import { useState, useEffect } from "react";
import { useWalletStore } from "@/store/wallet-store";
import { ethers } from "ethers";
import { 
  getSmartWalletOwners,
  createAddOwnerTransaction,
  createRemoveOwnerTransaction,
  createSmartWalletTransaction,
  OwnerInfo
} from "@/lib/coinbase-smart-wallet";
import { signTransactionSmart } from "@/lib/smart-signer";
import { useEnvironment } from "@/hooks/use-environment";
import { PinInput } from "./pin-input";
import { UserPlus, UserMinus, Users, Loader2, AlertCircle, X, Copy, ExternalLink, CheckCircle } from "lucide-react";
import { WalletSelector } from "./wallet-selector";

export function SmartWalletOwnerManager() {
  const environment = useEnvironment();
  const { 
    address, 
    rpcUrl, 
    chainId, 
    keySlot, 
    activeSmartWalletAddress 
  } = useWalletStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [owners, setOwners] = useState<OwnerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newOwnerAddress, setNewOwnerAddress] = useState("");
  const [showAddOwnerModal, setShowAddOwnerModal] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [operationType, setOperationType] = useState<'add' | 'remove'>('add');
  const [targetOwner, setTargetOwner] = useState<string>("");
  const [targetOwnerIndex, setTargetOwnerIndex] = useState<number>(-1);
  const [targetOwnerBytes, setTargetOwnerBytes] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [lastOperation, setLastOperation] = useState<string>("");

  // Load owners when modal opens
  useEffect(() => {
    if (isOpen && activeSmartWalletAddress && rpcUrl) {
      loadOwners();
    }
  }, [isOpen, activeSmartWalletAddress, rpcUrl]);

  async function loadOwners() {
    if (!activeSmartWalletAddress || !rpcUrl) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const ownerList = await getSmartWalletOwners(provider, activeSmartWalletAddress);
      setOwners(ownerList);
      console.log(`✅ Loaded ${ownerList.length} owner(s)`);
    } catch (err: any) {
      console.error("Error loading owners:", err);
      setError(err.message || "Failed to load owners");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddOwner() {
    if (!newOwnerAddress || !ethers.isAddress(newOwnerAddress)) {
      setError("Invalid address");
      return;
    }

    if (!activeSmartWalletAddress || !address || !rpcUrl || !keySlot) {
      setError("Missing configuration");
      return;
    }

    setError(null);
    setOperationType('add');
    setTargetOwner(newOwnerAddress);
    setShowAddOwnerModal(false);
    setShowPinInput(true);
  }

  async function handleRemoveOwner(ownerAddress: string, ownerIndex: number, ownerBytes: string) {
    if (!activeSmartWalletAddress || !address || !rpcUrl || !keySlot) {
      setError("Missing configuration");
      return;
    }

    setError(null);
    setOperationType('remove');
    setTargetOwner(ownerAddress);
    setTargetOwnerIndex(ownerIndex);
    setTargetOwnerBytes(ownerBytes);
    setShowPinInput(true);
  }

  async function handlePinSubmit(enteredPin: string) {
    if (!activeSmartWalletAddress || !address || !rpcUrl || !keySlot) {
      setError("Missing configuration");
      setShowPinInput(false);
      return;
    }

    setShowPinInput(false);
    setIsSending(true);
    setError(null);

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // Create the appropriate transaction
      let call;
      if (operationType === 'add') {
        call = createAddOwnerTransaction(
          provider,
          activeSmartWalletAddress,
          address,
          targetOwner,
          chainId
        );
        setLastOperation(`Added owner ${targetOwner}`);
      } else {
        call = createRemoveOwnerTransaction(
          provider,
          activeSmartWalletAddress,
          address,
          targetOwnerIndex,
          targetOwnerBytes,
          chainId
        );
        setLastOperation(`Removed owner ${targetOwner}`);
      }

      // Create Smart Wallet transaction
      const transaction = await createSmartWalletTransaction(
        provider,
        activeSmartWalletAddress,
        address,
        call,
        chainId
      );

      // Sign and send
      const signedTx = await signTransactionSmart(transaction, keySlot, enteredPin, environment);
      const txResponse = await provider.broadcastTransaction(signedTx);
      
      console.log(`Transaction sent: ${txResponse.hash}`);
      setTxHash(txResponse.hash);

      // Wait for confirmation
      const receipt = await txResponse.wait();
      console.log(`Transaction confirmed in block ${receipt?.blockNumber}`);

      // Show success dialog
      setIsConfirmed(true);
      
      // Reset form
      setNewOwnerAddress("");
      
    } catch (err: any) {
      console.error("Error managing owner:", err);
      setError(err.message || "Failed to manage owner");
    } finally {
      setIsSending(false);
    }
  }

  function formatAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr);
  }

  function getChainName(chainId: number): string {
    const chains: Record<number, string> = {
      1: 'Ethereum Mainnet',
      8453: 'Base',
      10: 'Optimism',
      137: 'Polygon',
      42161: 'Arbitrum One',
      11155111: 'Sepolia Testnet',
      84532: 'Base Sepolia',
    };
    return chains[chainId] || `Chain ${chainId}`;
  }

  function getExplorerTxUrl(chainId: number, txHash: string): string {
    const explorers: Record<number, string> = {
      1: 'https://etherscan.io/tx/',
      8453: 'https://basescan.org/tx/',
      10: 'https://optimistic.etherscan.io/tx/',
      137: 'https://polygonscan.com/tx/',
      42161: 'https://arbiscan.io/tx/',
      11155111: 'https://sepolia.etherscan.io/tx/',
      84532: 'https://sepolia.basescan.org/tx/',
    };
    return (explorers[chainId] || `https://etherscan.io/tx/`) + txHash;
  }

  function handleReturnToManager() {
    setIsConfirmed(false);
    setTxHash(null);
    setLastOperation("");
    loadOwners();
  }

  if (!activeSmartWalletAddress) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all duration-200"
      >
        <Users className="w-4 h-4" />
        <span className="font-medium">Manage Owners</span>
        {owners.length > 0 && (
          <span className="text-xs bg-indigo-200 dark:bg-indigo-800 px-2 py-0.5 rounded-full">
            {owners.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="modal-overlay bg-black/60 flex items-center justify-center p-3 z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card-lg p-4 sm:p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-500" />
                Smart Wallet Owners
              </h3>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowAddOwnerModal(false);
                  setError(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Wallet Selector */}
            <div className="mb-4">
              <WalletSelector compact={false} showLabel={true} />
            </div>

            {isLoading && !owners.length && (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Loading owners...</p>
              </div>
            )}

            {!isLoading && owners.length === 0 && (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No owners found</p>
              </div>
            )}

            {owners.length > 0 && (
              <div className="space-y-2 mb-4">
                {owners.map((owner, index) => (
                  <div
                    key={owner.address}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-sm font-semibold flex-shrink-0">
                        {owner.index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-mono text-slate-900 dark:text-white break-all flex-1">
                            {owner.address}
                          </p>
                          <button
                            onClick={() => copyAddress(owner.address)}
                            className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                            title="Copy address"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Index: {owner.index}
                        </p>
                      </div>
                    </div>
                    {owner.address.toLowerCase() !== address?.toLowerCase() && owners.length > 1 && (
                      <button
                        onClick={() => handleRemoveOwner(owner.address, owner.index, owner.publicKey)}
                        disabled={isLoading || isSending}
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                        title="Remove owner"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowAddOwnerModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              disabled={isLoading || isSending}
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Add Owner
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {showAddOwnerModal && (
        <div className="modal-overlay bg-black/60 flex items-center justify-center p-3 z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card-lg p-4 sm:p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add Owner</h3>
              <button
                onClick={() => {
                  setShowAddOwnerModal(false);
                  setNewOwnerAddress("");
                  setError(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Owner Address
              </label>
              <input
                type="text"
                value={newOwnerAddress}
                onChange={(e) => setNewOwnerAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowAddOwnerModal(false);
                  setNewOwnerAddress("");
                }}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddOwner}
                className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                disabled={!ethers.isAddress(newOwnerAddress)}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Dialog */}
      {isConfirmed && txHash && (
        <div className="modal-overlay bg-black/60 flex items-center justify-center p-3 z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card-lg p-4 sm:p-6 max-w-sm sm:max-w-md w-full mx-2">
            {/* Success Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-green-600 dark:text-green-400" />
              </div>
            </div>

            {/* Success Message */}
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white text-center mb-2">
              Transaction <span className="text-brand-orange">Confirmed!</span>
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 text-center mb-4 sm:mb-6">
              {lastOperation} successfully
            </p>

            {/* Transaction Details */}
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
              <div className="space-y-2 sm:space-y-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Operation</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {operationType === 'add' ? 'Add Owner' : 'Remove Owner'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Owner Address</p>
                  <p className="text-xs sm:text-sm font-mono text-slate-900 dark:text-white break-all">
                    {targetOwner}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Network</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {getChainName(chainId)}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 sm:space-y-3">
              <a
                href={getExplorerTxUrl(chainId, txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl transition-all duration-150 font-semibold shadow-md hover:shadow-glow-orange active:scale-95 text-sm sm:text-base"
              >
                View on Block Explorer
                <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
              </a>
              
              <button
                onClick={handleReturnToManager}
                className="w-full px-4 sm:px-6 py-2.5 sm:py-3 border-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-brand-orange/30 transition-all duration-150 font-semibold active:scale-95 text-sm sm:text-base"
              >
                Return to Manager
              </button>
            </div>
          </div>
        </div>
      )}

      <PinInput
        isVisible={showPinInput}
        onSubmit={handlePinSubmit}
        onCancel={() => setShowPinInput(false)}
      />
    </>
  );
}

