"use client";

import { useState } from "react";
import { useWalletStore, WalletType } from "@/store/wallet-store";
import { Wallet, CreditCard, ChevronDown } from "lucide-react";

interface WalletSelectorProps {
  compact?: boolean;
  showLabel?: boolean;
}

export function WalletSelector({ compact = false, showLabel = true }: WalletSelectorProps) {
  const {
    address,
    availableSmartWallets,
    activeWalletType,
    activeSmartWalletAddress,
    setActiveWallet,
  } = useWalletStore();

  const [isOpen, setIsOpen] = useState(false);

  // Build wallet options
  const walletOptions: Array<{ type: WalletType; address: string | null; label: string }> = [
    {
      type: 'burner',
      address: address,
      label: 'Burner Card',
    },
    ...availableSmartWallets.map((smartWallet: string, index: number) => ({
      type: 'smart' as WalletType,
      address: smartWallet,
      label: availableSmartWallets.length > 1 ? `Smart Wallet ${index + 1}` : 'Smart Wallet',
    })),
  ];

  const currentWallet = walletOptions.find(
    (w) => w.type === activeWalletType && (activeWalletType === 'burner' || w.address === activeSmartWalletAddress)
  );

  const handleWalletChange = (type: WalletType, address: string | null) => {
    setActiveWallet(type, address || undefined);
    setIsOpen(false);
  };

  const formatAddress = (addr: string | null) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // If only burner card is available, don't show selector
  if (availableSmartWallets.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors text-xs"
        >
          {currentWallet?.type === 'burner' ? (
            <CreditCard className="w-3.5 h-3.5" />
          ) : (
            <Wallet className="w-3.5 h-3.5" />
          )}
          <span className="font-medium">{currentWallet?.label}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute top-full mt-1 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 min-w-[200px]">
              {walletOptions.map((wallet) => (
                <button
                  key={`${wallet.type}-${wallet.address}`}
                  onClick={() => handleWalletChange(wallet.type, wallet.address)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    wallet.type === activeWalletType &&
                    (activeWalletType === 'burner' || wallet.address === activeSmartWalletAddress)
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {wallet.type === 'burner' ? (
                    <CreditCard className="w-4 h-4" />
                  ) : (
                    <Wallet className="w-4 h-4" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{wallet.label}</div>
                    <div className="text-xs opacity-60">{formatAddress(wallet.address)}</div>
                  </div>
                  {wallet.type === activeWalletType &&
                    (activeWalletType === 'burner' || wallet.address === activeSmartWalletAddress) && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4">
      {showLabel && (
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
          💳 Select Wallet
        </label>
      )}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            {currentWallet?.type === 'burner' ? (
              <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            ) : (
              <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            )}
            <div className="text-left">
              <div className="font-medium text-slate-900 dark:text-white">{currentWallet?.label}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{formatAddress(currentWallet?.address || null)}</div>
            </div>
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
              {walletOptions.map((wallet) => (
                <button
                  key={`${wallet.type}-${wallet.address}`}
                  onClick={() => handleWalletChange(wallet.type, wallet.address)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    wallet.type === activeWalletType &&
                    (activeWalletType === 'burner' || wallet.address === activeSmartWalletAddress)
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : ''
                  }`}
                >
                  {wallet.type === 'burner' ? (
                    <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  ) : (
                    <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  )}
                  <div className="flex-1">
                    <div className={`font-medium ${
                      wallet.type === activeWalletType &&
                      (activeWalletType === 'burner' || wallet.address === activeSmartWalletAddress)
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-slate-900 dark:text-white'
                    }`}>
                      {wallet.label}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{formatAddress(wallet.address)}</div>
                  </div>
                  {wallet.type === activeWalletType &&
                    (activeWalletType === 'burner' || wallet.address === activeSmartWalletAddress) && (
                      <div className="w-3 h-3 bg-blue-500 rounded-full" />
                    )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      
      {/* Info box */}
      <div className="mt-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-xs text-blue-900 dark:text-blue-100">
          {activeWalletType === 'burner' ? (
            <>
              <strong>Burner Card:</strong> Direct transactions from your card. Gas fees paid by the card itself.
            </>
          ) : (
            <>
              <strong>Smart Wallet:</strong> Transactions via Smart Wallet. Gas fees paid by the Burner Card (owner).
            </>
          )}
        </p>
      </div>
    </div>
  );
}

