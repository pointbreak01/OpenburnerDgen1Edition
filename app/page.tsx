"use client";

import { WalletConnect } from "@/components/local/wallet-connect";
import { HostedMobileConnect } from "@/components/hosted/mobile/mobile-connect";
import { HostedDesktopConnect } from "@/components/hosted/desktop/hosted-desktop-connect";
import { WalletDashboard } from "@/components/shared/wallet-dashboard";
import { useWalletStore } from "@/store/wallet-store";
import { useEnvironment } from "@/hooks/use-environment";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { isConnected } = useWalletStore();
  const config = useEnvironment();
  const { isHosted, isMobile, isClient } = config;

  // Show loading state until hydration is complete
  if (!isClient) {
    return (
      <main className="min-h-screen p-4 transition-colors duration-700 bg-connected bg-bg-base dark:bg-slate-900">
        <div className="max-w-2xl mx-auto pt-6 pb-12 relative z-10">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading...</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 transition-colors duration-700 bg-connected bg-bg-base dark:bg-slate-900">
      <div className="max-w-2xl mx-auto pt-6 pb-12 relative z-10">
        {/* dGEN1 Branding Header */}
        <div className="flex items-center justify-between px-1 py-3 mb-4 border-b border-slate-200 dark:border-dgen1-border">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-primary/10 via-brand-secondary/10 to-brand-accent/10 dark:from-brand-primary/20 dark:via-brand-secondary/20 dark:to-brand-accent/20 border border-brand-primary/20 dark:border-brand-primary/30">
              <span className="text-xs font-bold tracking-wider text-brand-primary dark:text-brand-primary">
                dGEN1
              </span>
              <span className="text-[10px] font-medium text-slate-600 dark:text-dgen1-text-muted tracking-tight">
                EDITION
              </span>
            </div>
            <div className="h-4 w-px bg-slate-300 dark:bg-dgen1-border"></div>
            <span className="text-[10px] font-medium text-slate-500 dark:text-dgen1-text-muted uppercase tracking-wider">
              Forked by pointbreak
            </span>
          </div>
        </div>

        {!isConnected ? (
          // Environment-aware rendering - only after hydration
          isHosted && isMobile ? (
            <HostedMobileConnect />
          ) : isHosted && !isMobile ? (
            <HostedDesktopConnect />
          ) : (
            <WalletConnect />
          )
        ) : (
          <WalletDashboard />
        )}
      </div>
      
      {/* Removed OfflineIndicator and OnlineIndicator as requested */}
    </main>
  );
}
