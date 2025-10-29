"use client";

import { useState, useEffect } from "react";
import { useWalletStore } from "@/store/wallet-store";
import { ethers } from "ethers";
import { isOwner, getPrimarySmartWallet, findSmartWallets } from "@/lib/coinbase-smart-wallet";
import { Wallet, CheckCircle, XCircle, Loader2, AlertCircle, Search } from "lucide-react";

export function SmartWalletConfig() {
  const { 
    address, 
    activeWalletType,
    activeSmartWalletAddress,
    setSmartWallet, 
    clearSmartWallet,
    setAvailableSmartWallets,
    setActiveWallet,
    rpcUrl 
  } = useWalletStore();
  
  // Backward compatibility
  const smartWalletAddress = activeSmartWalletAddress;
  const isSmartWallet = activeWalletType === 'smart';
  
  const [inputAddress, setInputAddress] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [checkResult, setCheckResult] = useState<'success' | 'error' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [foundWallets, setFoundWallets] = useState<Array<{address: string, version: string, nonce: number}>>([]);
  const [showWalletsList, setShowWalletsList] = useState(false);

  // Load saved smart wallet address
  useEffect(() => {
    if (smartWalletAddress) {
      setInputAddress(smartWalletAddress);
      setCheckResult('success');
    }
  }, [smartWalletAddress]);

  async function handleAutoDetect() {
    if (!address) {
      setError("No wallet connected");
      return;
    }

    setIsAutoDetecting(true);
    setError(null);
    setCheckResult(null);

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallets = await findSmartWallets(provider, address, 3);

      if (wallets.length === 0) {
        setCheckResult('error');
        setError("No Smart Wallet found for this Burner card. You can enter it manually.");
        setAvailableSmartWallets([]);
      } else if (wallets.length === 1) {
        // Only one wallet: auto-select it
        setInputAddress(wallets[0].address);
        setAvailableSmartWallets([wallets[0].address]);
        setActiveWallet('smart', wallets[0].address);
        setSmartWallet(wallets[0].address); // Backward compatibility
        setCheckResult('success');
        setError(null);
      } else {
        // Multiple wallets: show list
        setFoundWallets(wallets);
        setAvailableSmartWallets(wallets.map(w => w.address));
        setShowWalletsList(true);
        setError(null);
      }
    } catch (err: any) {
      console.error("Auto-detect error:", err);
      setCheckResult('error');
      setError(err.message || "Error during search");
    } finally {
      setIsAutoDetecting(false);
    }
  }

  async function handleCheckOwnership() {
    if (!address || !inputAddress || !ethers.isAddress(inputAddress)) {
      setError("Invalid Smart Wallet address");
      return;
    }

    setIsChecking(true);
    setError(null);
    setCheckResult(null);

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const isOwnerResult = await isOwner(provider, inputAddress, address);

      if (isOwnerResult) {
        setAvailableSmartWallets([inputAddress]);
        setActiveWallet('smart', inputAddress);
        setSmartWallet(inputAddress); // Backward compatibility
        setCheckResult('success');
        setError(null);
      } else {
        setCheckResult('error');
        setError("Your Burner card is not the owner of this Smart Wallet");
      }
    } catch (err: any) {
      console.error("Ownership check error:", err);
      setCheckResult('error');
      setError(err.message || "Error during verification");
    } finally {
      setIsChecking(false);
    }
  }

  function handleClearSmartWallet() {
    clearSmartWallet();
    setActiveWallet('burner');
    setAvailableSmartWallets([]);
    setInputAddress("");
    setCheckResult(null);
    setError(null);
    setFoundWallets([]);
    setShowWalletsList(false);
  }

  function handleSelectWallet(walletAddress: string) {
    setInputAddress(walletAddress);
    setActiveWallet('smart', walletAddress);
    setSmartWallet(walletAddress); // Backward compatibility
    setCheckResult('success');
    setError(null);
    setShowWalletsList(false);
    setShowConfig(false);
  }

  if (!showConfig && !isSmartWallet) {
    return (
      <button
        onClick={() => setShowConfig(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all duration-200"
      >
        <Wallet className="w-5 h-5" />
        <span className="font-medium">Configure Coinbase Smart Wallet</span>
      </button>
    );
  }

  if (!showConfig && isSmartWallet) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                Coinbase Smart Wallet Active
              </h3>
              <p className="text-xs font-mono text-blue-700 dark:text-blue-300 break-all">
                {smartWalletAddress}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                Transactions will be executed through this Smart Wallet
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConfig(true)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline whitespace-nowrap"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  // Show wallet selection modal if multiple wallets found
  if (showWalletsList && foundWallets.length > 0) {
   return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-500" />
            Select Smart Wallet
          </h3>
          <button
            onClick={() => setShowWalletsList(false)}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            📱 Found <strong>{foundWallets.length} Smart Wallet{foundWallets.length > 1 ? 's' : ''}</strong> associated with your Burner card. Choose which one to use:
          </p>
        </div>

        <div className="space-y-2">
          {foundWallets.map((wallet, index) => (
            <button
              key={wallet.address}
              onClick={() => handleSelectWallet(wallet.address)}
              className="w-full text-left p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Smart Wallet {index + 1}</p>
                  <p className="text-sm font-mono text-slate-900 dark:text-white break-all">
                    {wallet.address}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowWalletsList(false)}
          className="w-full px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
        >
          Enter manually instead
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet className="w-5 h-5 text-blue-500" />
          Coinbase Smart Wallet
        </h3>
        <button
          onClick={() => setShowConfig(false)}
          className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Close
        </button>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 dark:text-blue-300 space-y-2">
            <p>
              ✨ <strong>New!</strong> You can now automatically find the Smart Wallet associated with your Burner card.
            </p>
            <p>
              Use the "🔍 Auto-Detect" button to search automatically, or enter the address manually.
            </p>
          </div>
        </div>
      </div>

      {/* Auto-Detect Button */}
      <button
        onClick={handleAutoDetect}
        disabled={!address || isAutoDetecting}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
      >
        {isAutoDetecting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Searching...</span>
          </>
        ) : (
          <>
            <Search className="w-5 h-5" />
            <span>🔍 Auto-Detect Smart Wallet</span>
          </>
        )}
      </button>

      <div className="relative flex items-center">
        <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
        <span className="flex-shrink mx-4 text-xs text-slate-500 dark:text-slate-400">or enter manually</span>
        <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
          Smart Wallet Address (manual)
        </label>
        <input
          type="text"
          value={inputAddress}
          onChange={(e) => {
            setInputAddress(e.target.value);
            setCheckResult(null);
            setError(null);
          }}
          placeholder="0x..."
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:outline-none focusoutline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {checkResult === 'success' && inputAddress && (
        <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-green-700 dark:text-green-300">
            <p className="font-semibold">✅ Smart Wallet found and verified!</p>
            <p className="mt-1">Your Burner card is the owner of this Smart Wallet.</p>
            <p className="mt-1 font-mono text-[10px] opacity-75">{inputAddress}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleCheckOwnership}
          disabled={!inputAddress || !ethers.isAddress(inputAddress) || isChecking}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isChecking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              <span>Verify Ownership</span>
            </>
          )}
        </button>

        {isSmartWallet && (
          <button
            onClick={handleClearSmartWallet}
            className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200"
          >
            Remove
          </button>
        )}
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        <p className="font-medium mb-1">Your Burner card (Owner):</p>
        <p className="font-mono break-all text-slate-600 dark:text-slate-400">{address}</p>
      </div>
    </div>
  );
}
