"use client";

import { useState } from "react";
import { useWalletStore } from "@/store/wallet-store";
import { ethers } from "ethers";
import { Image as ImageIcon, Send, Loader2, CheckCircle, AlertCircle, X, Plus, ExternalLink } from "lucide-react";
import { 
  checkNFTOwnership, 
  getNFTMetadata, 
  createNFTTransferTransaction,
  isENSContract,
  getENSNameFromTokenId,
  NFT 
} from "@/lib/nft-manager";
import { signTransactionSmart } from "@/lib/smart-signer";
import { useEnvironment } from "@/hooks/use-environment";
import { PinInput } from "./pin-input";
import { WalletSelector } from "./wallet-selector";

export function NFTManager() {
  const environment = useEnvironment();
  const { 
    address, 
    rpcUrl, 
    chainId, 
    keySlot, 
    chainName,
    activeWalletType,
    activeSmartWalletAddress 
  } = useWalletStore();
  
  // Backward compatibility
  const isSmartWallet = activeWalletType === 'smart';
  const smartWalletAddress = activeSmartWalletAddress;
  
  const [isOpen, setIsOpen] = useState(false);
  const [nftContractAddress, setNftContractAddress] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nftInfo, setNftInfo] = useState<NFT | null>(null);
  const [savedNFTs, setSavedNFTs] = useState<NFT[]>([]);
  
  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [recipient, setRecipient] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showPinInput, setShowPinInput] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Load saved NFTs
  useState(() => {
    try {
      const saved = localStorage.getItem(`nfts_${chainId}_${smartWalletAddress || address}`);
      if (saved) {
        setSavedNFTs(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Error loading NFTs:", error);
    }
  });

  async function checkNFT() {
    if (!nftContractAddress || !tokenId || !ethers.isAddress(nftContractAddress)) {
      setError("Invalid contract address or Token ID");
      return;
    }

    const ownerAddress = isSmartWallet && smartWalletAddress ? smartWalletAddress : address;
    if (!ownerAddress) return;

    setIsChecking(true);
    setError(null);
    setNftInfo(null);

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Check ownership
      const isOwner = await checkNFTOwnership(provider, nftContractAddress, tokenId, ownerAddress);
      
      if (!isOwner) {
        setError("This NFT is not owned by your wallet/smart wallet");
        return;
      }

      // Get metadata
      const metadata = await getNFTMetadata(provider, nftContractAddress, tokenId);
      
      // Check if it's ENS
      const isENS = isENSContract(nftContractAddress, chainId);
      const displayName = isENS ? getENSNameFromTokenId(tokenId) : `${metadata.name} #${tokenId}`;

      const nft: NFT = {
        contractAddress: nftContractAddress,
        tokenId,
        name: displayName,
        symbol: metadata.symbol,
        tokenURI: metadata.tokenURI,
        type: 'ERC721',
      };

      setNftInfo(nft);
    } catch (err: any) {
      console.error("Error checking NFT:", err);
      setError(err.message || "Errore durante la verifica del NFT");
    } finally {
      setIsChecking(false);
    }
  }

  function saveNFT() {
    if (!nftInfo) return;

    // Check if already saved
    const exists = savedNFTs.find(
      (n) => 
        n.contractAddress.toLowerCase() === nftInfo.contractAddress.toLowerCase() &&
        n.tokenId === nftInfo.tokenId
    );

    if (exists) {
      setError("NFT già aggiunto");
      return;
    }

    const updated = [...savedNFTs, nftInfo];
    setSavedNFTs(updated);

    try {
      localStorage.setItem(
        `nfts_${chainId}_${smartWalletAddress || address}`,
        JSON.stringify(updated)
      );
      console.log("✅ NFT saved");
    } catch (error) {
      console.error("Error saving NFT:", error);
    }

    // Reset form
    setNftContractAddress("");
    setTokenId("");
    setNftInfo(null);
    setError(null);
  }

  function removeNFT(contractAddress: string, tokenId: string) {
    const updated = savedNFTs.filter(
      (n) => !(
        n.contractAddress.toLowerCase() === contractAddress.toLowerCase() &&
        n.tokenId === tokenId
      )
    );
    setSavedNFTs(updated);

    try {
      localStorage.setItem(
        `nfts_${chainId}_${smartWalletAddress || address}`,
        JSON.stringify(updated)
      );
    } catch (error) {
      console.error("Error removing NFT:", error);
    }
  }

  function openTransferModal(nft: NFT) {
    setSelectedNFT(nft);
    setShowTransferModal(true);
    setRecipient("");
    setError(null);
    setTxHash(null);
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

  function handleReturnToNFTManager() {
    setIsConfirmed(false);
    setTxHash(null);
    setShowTransferModal(false);
    setSelectedNFT(null);
    setRecipient("");
  }

  async function handlePinSubmit(enteredPin: string) {
    if (!selectedNFT || !recipient || !address) return;

    setPinError(null);
    setIsSending(true);

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      let transaction: ethers.TransactionRequest;

      if (isSmartWallet && smartWalletAddress) {
        // Smart Wallet mode
        console.log("💼 [NFT Transfer] Using Smart Wallet mode");
        transaction = await createNFTTransferTransaction(
          provider,
          smartWalletAddress,
          address,
          selectedNFT.contractAddress,
          recipient,
          selectedNFT.tokenId,
          chainId
        );
      } else {
        // Direct transfer (not implemented for now, needs direct burner card usage)
        throw new Error("Direct NFT transfer requires a Smart Wallet to be configured");
      }

      // Sign transaction
      console.log("🔐 Signing NFT transfer...");
      const signedTx = await signTransactionSmart(transaction, keySlot || 1, enteredPin, environment);

      setShowPinInput(false);

      // Broadcast
      const txResponse = await provider.broadcastTransaction(signedTx);
      setTxHash(txResponse.hash);

      console.log("✅ NFT transfer sent:", txResponse.hash);
      await txResponse.wait();
      console.log("✅ NFT transfer confirmed!");

      // Show success dialog
      setIsConfirmed(true);

      // Remove from saved list after successful transfer
      removeNFT(selectedNFT.contractAddress, selectedNFT.tokenId);

    } catch (err: any) {
      console.error("Error transferring NFT:", err);
      
      if (err.message?.includes("WRONG_PWD") || err.message?.includes("password")) {
        setPinError("Wrong PIN. Please try again.");
      } else {
        setError(err.message || "Error during transfer");
        setShowPinInput(false);
      }
    } finally {
      setIsSending(false);
    }
  }

  if (!isOpen) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all duration-200"
        >
          <ImageIcon className="w-4 h-4" />
          <span className="font-medium">Manage NFTs</span>
        </button>

        {savedNFTs.length > 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 px-2">
            {savedNFTs.length} saved NFT{savedNFTs.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-purple-500" />
            NFT Manager
          </h3>
          <button
            onClick={() => {
              setIsOpen(false);
              setNftContractAddress("");
              setTokenId("");
              setNftInfo(null);
              setError(null);
            }}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wallet Selector */}
        <WalletSelector />

        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-purple-700 dark:text-purple-300">
              Add ERC-721 NFTs (including ENS domains). If you have a Smart Wallet configured,
              you can transfer them from there.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              NFT Contract Address
            </label>
            <input
              type="text"
              value={nftContractAddress}
              onChange={(e) => {
                setNftContractAddress(e.target.value);
                setNftInfo(null);
                setError(null);
              }}
              placeholder="0x..."
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Token ID
            </label>
            <input
              type="text"
              value={tokenId}
              onChange={(e) => {
                setTokenId(e.target.value);
                setNftInfo(null);
                setError(null);
              }}
              placeholder="123"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {nftInfo && (
          <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-green-900 dark:text-green-100">
                NFT verified!
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                {nftInfo.name}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                {nftInfo.symbol}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {!nftInfo ? (
            <button
              onClick={checkNFT}
              disabled={!nftContractAddress || !tokenId || isChecking}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isChecking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Verify NFT</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={saveNFT}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span>Save NFT</span>
            </button>
          )}
        </div>

        {/* List of saved NFTs */}
        {savedNFTs.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Saved NFTs
            </h4>
            <div className="space-y-2">
              {savedNFTs.map((nft) => (
                <div
                  key={`${nft.contractAddress}-${nft.tokenId}`}
                  className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {nft.name}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {nft.symbol} • ID: {nft.tokenId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openTransferModal(nft)}
                      className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg transition-colors"
                      title="Transfer NFT"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeNFT(nft.contractAddress, nft.tokenId)}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transfer Modal */}
      {showTransferModal && selectedNFT && (
        <div className="modal-overlay bg-black/60 flex items-center justify-center p-3 z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card-lg p-4 sm:p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Transfer NFT
              </h3>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                {selectedNFT.name}
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                {selectedNFT.symbol} • Token ID: {selectedNFT.tokenId}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Recipient Address
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {txHash && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-xs text-green-700 dark:text-green-300">
                  ✅ NFT trasferito! TX: {txHash.slice(0, 10)}...
                </p>
              </div>
            )}

            <button
              onClick={() => {
                if (!recipient || !ethers.isAddress(recipient)) {
                  setError("Invalid recipient address");
                  return;
                }
                setShowPinInput(true);
                setError(null);
              }}
              disabled={!recipient || isSending}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send NFT</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Success Dialog */}
      {isConfirmed && txHash && selectedNFT && (
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
              Your <span className="font-semibold text-slate-900 dark:text-white">{selectedNFT.name}</span> has been transferred successfully
            </p>

            {/* Transaction Details */}
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
              <div className="space-y-2 sm:space-y-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">NFT</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedNFT.name} #{selectedNFT.tokenId}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Recipient</p>
                  <p className="text-xs sm:text-sm font-mono text-slate-900 dark:text-white break-all">
                    {recipient}
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
                onClick={handleReturnToNFTManager}
                className="w-full px-4 sm:px-6 py-2.5 sm:py-3 border-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-brand-orange/30 transition-all duration-150 font-semibold active:scale-95 text-sm sm:text-base"
              >
                Return to NFT Manager
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Input */}
      <PinInput
        isVisible={showPinInput}
        onSubmit={handlePinSubmit}
        onCancel={() => {
          setShowPinInput(false);
          setPinError(null);
        }}
        error={pinError}
      />
    </>
  );
}

