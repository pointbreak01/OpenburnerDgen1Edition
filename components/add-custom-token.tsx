"use client";

import { useState } from "react";
import { useWalletStore } from "@/store/wallet-store";
import { ethers } from "ethers";
import { Plus, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

interface CustomToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
}

export function AddCustomToken() {
  const { rpcUrl, chainId, smartWalletAddress, isSmartWallet } = useWalletStore();
  const [isOpen, setIsOpen] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<CustomToken | null>(null);
  const [customTokens, setCustomTokens] = useState<CustomToken[]>([]);

  // Load saved custom tokens from localStorage
  useState(() => {
    try {
      const saved = localStorage.getItem(`customTokens_${chainId}`);
      if (saved) {
        setCustomTokens(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Error loading custom tokens:", error);
    }
  });

  async function validateToken() {
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      setError("Indirizzo token non valido");
      return;
    }

    setIsValidating(true);
    setError(null);
    setTokenInfo(null);

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
      ]);

      // Check if token has balance in smart wallet
      if (isSmartWallet && smartWalletAddress) {
        const balance = await contract.balanceOf(smartWalletAddress);
        console.log(`💰 Token balance in Smart Wallet: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
      }

      const token: CustomToken = {
        address: tokenAddress,
        symbol,
        name,
        decimals: Number(decimals),
        chainId,
      };

      setTokenInfo(token);
    } catch (err: any) {
      console.error("Error validating token:", err);
      setError("Unable to read contract. Verify that it is a valid ERC-20 token.");
    } finally {
      setIsValidating(false);
    }
  }

  function addToken() {
    if (!tokenInfo) return;

    // Check if already added
    const exists = customTokens.find(
      (t) => t.address.toLowerCase() === tokenInfo.address.toLowerCase()
    );

    if (exists) {
      setError("Token già aggiunto");
      return;
    }

    const updated = [...customTokens, tokenInfo];
    setCustomTokens(updated);

    // Save to localStorage
    try {
      localStorage.setItem(`customTokens_${chainId}`, JSON.stringify(updated));
      console.log("✅ Custom token saved:", tokenInfo.symbol);
    } catch (error) {
      console.error("Error saving token:", error);
    }

    // Reset form
    setTokenAddress("");
    setTokenInfo(null);
    setError(null);
    setIsOpen(false);
  }

  function removeToken(address: string) {
    const updated = customTokens.filter(
      (t) => t.address.toLowerCase() !== address.toLowerCase()
    );
    setCustomTokens(updated);

    try {
      localStorage.setItem(`customTokens_${chainId}`, JSON.stringify(updated));
      console.log("🗑️ Custom token removed");
    } catch (error) {
      console.error("Error removing token:", error);
    }
  }

  if (!isOpen) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium">Add Custom Token</span>
        </button>

        {customTokens.length > 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 px-2">
            {customTokens.length} token personalizzat{customTokens.length === 1 ? 'o' : 'i'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Add Custom Token
        </h3>
        <button
          onClick={() => {
            setIsOpen(false);
            setTokenAddress("");
            setTokenInfo(null);
            setError(null);
          }}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Inserisci l'indirizzo del contratto ERC-20. Se hai configurato uno Smart Wallet,
            i token verranno cercati lì.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
          Token Contract Address
        </label>
        <input
          type="text"
          value={tokenAddress}
          onChange={(e) => {
            setTokenAddress(e.target.value);
            setTokenInfo(null);
            setError(null);
          }}
          placeholder="0x..."
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {tokenInfo && (
        <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-green-900 dark:text-green-100">
              Token trovato!
            </p>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              <strong>{tokenInfo.name}</strong> ({tokenInfo.symbol})
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 font-mono mt-1">
              Decimals: {tokenInfo.decimals}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!tokenInfo ? (
          <button
            onClick={validateToken}
            disabled={!tokenAddress || isValidating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Verify Token</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={addToken}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            <span>Add Token</span>
          </button>
        )}
      </div>

      {/* List of added custom tokens */}
      {customTokens.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Token Aggiunti
          </h4>
          <div className="space-y-2">
            {customTokens.map((token) => (
              <div
                key={token.address}
                className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {token.symbol}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                    {token.address.slice(0, 10)}...{token.address.slice(-8)}
                  </p>
                </div>
                <button
                  onClick={() => removeToken(token.address)}
                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

