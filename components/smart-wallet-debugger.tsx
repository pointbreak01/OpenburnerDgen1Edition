"use client";

import { useState } from "react";
import { useWalletStore } from "@/store/wallet-store";
import { ethers } from "ethers";
import { AlertTriangle, CheckCircle, XCircle, Code, Loader2 } from "lucide-react";

const SMART_WALLET_ABI = [
  "function isOwnerAddress(address account) external view returns (bool)",
  "function ownerAtIndex(uint256 index) external view returns (bytes memory)",
  "function execute(address target, uint256 value, bytes calldata data) external payable",
];

export function SmartWalletDebugger() {
  const { address, rpcUrl, smartWalletAddress, isSmartWallet } = useWalletStore();
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<any>(null);

  async function runDiagnostics() {
    if (!smartWalletAddress || !address || !rpcUrl) {
      return;
    }

    setIsChecking(true);
    const diagnostics: any = {
      contractExists: false,
      isOwner: false,
      ownerAddress: null,
      bytecodeSize: 0,
      error: null,
    };

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // 1. Check if contract exists
      console.log("🔍 Checking if contract exists...");
      const code = await provider.getCode(smartWalletAddress);
      diagnostics.contractExists = code !== '0x';
      diagnostics.bytecodeSize = code.length;
      console.log(`   Contract exists: ${diagnostics.contractExists}`);
      console.log(`   Bytecode size: ${diagnostics.bytecodeSize} bytes`);

      if (!diagnostics.contractExists) {
        diagnostics.error = "Nessun contratto trovato a questo indirizzo";
        setResults(diagnostics);
        return;
      }

      // 2. Try to call isOwnerAddress
      console.log("🔐 Checking ownership...");
      const wallet = new ethers.Contract(smartWalletAddress, SMART_WALLET_ABI, provider);
      
      try {
        diagnostics.isOwner = await wallet.isOwnerAddress(address);
        console.log(`   Is owner: ${diagnostics.isOwner}`);
      } catch (error: any) {
        console.error("   Error checking ownership:", error);
        diagnostics.error = `Errore chiamando isOwnerAddress: ${error.message}`;
      }

      // 3. Try to get all owners
      try {
        console.log("👤 Getting owners...");
        const owners = [];
        
        for (let i = 0; i < 5; i++) {
          try {
            const ownerBytes = await wallet.ownerAtIndex(i);
            
            // Try to decode as address (first 20 bytes)
            if (ownerBytes && ownerBytes.length >= 40) {
              // Remove 0x prefix if present
              const cleanBytes = ownerBytes.startsWith('0x') ? ownerBytes.slice(2) : ownerBytes;
              
              // Take last 40 characters (20 bytes = address)
              const addressHex = cleanBytes.slice(-40);
              const ownerAddr = '0x' + addressHex;
              owners.push({ index: i, address: ownerAddr });
              console.log(`   Owner ${i}: ${ownerAddr}`);
            }
          } catch (e) {
            // No more owners at this index
            break;
          }
        }
        
        diagnostics.owners = owners;
        diagnostics.ownerAddress = owners[0]?.address || null;
      } catch (error: any) {
        console.error("   Error getting owners:", error);
        diagnostics.ownerAddressError = error.message;
      }

      // 4. Get balance
      try {
        const balance = await provider.getBalance(smartWalletAddress);
        diagnostics.balance = ethers.formatEther(balance);
        console.log(`   Balance: ${diagnostics.balance} ETH`);
      } catch (error: any) {
        console.error("   Error getting balance:", error);
      }

      // 5. Test execute call (simulate)
      try {
        console.log("🧪 Testing execute call (simulation)...");
        
        // Create a test call to transfer 0 ETH to self (should not revert if permissions are ok)
        const testCallData = wallet.interface.encodeFunctionData('execute', [
          address, // to: send to self
          0, // value: 0 ETH
          '0x', // data: empty
        ]);
        
        // Simulate the call
        const simulationResult = await provider.call({
          from: address,
          to: smartWalletAddress,
          data: testCallData,
        });
        
        diagnostics.executeCallWorks = true;
        console.log(`   Execute call simulation: SUCCESS`);
      } catch (error: any) {
        console.error("   Execute call simulation failed:", error);
        diagnostics.executeCallWorks = false;
        diagnostics.executeCallError = error.message || error.toString();
        
        // Try to extract revert reason
        if (error.data) {
          try {
            const reason = ethers.toUtf8String('0x' + error.data.slice(138));
            diagnostics.executeCallRevertReason = reason;
            console.error(`   Revert reason: ${reason}`);
          } catch (e) {
            console.error("   Could not decode revert reason");
          }
        }
      }

      setResults(diagnostics);
    } catch (error: any) {
      console.error("❌ Diagnostics failed:", error);
      diagnostics.error = error.message;
      setResults(diagnostics);
    } finally {
      setIsChecking(false);
    }
  }

  if (!isSmartWallet || !smartWalletAddress) {
    return null;
  }

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
            Debug Smart Wallet
          </h3>
          <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-3">
            Usa questo tool per diagnosticare problemi con lo Smart Wallet
          </p>
          
          <button
            onClick={runDiagnostics}
            disabled={isChecking}
            className="flex items-center gap-2 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
          >
            {isChecking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analisi in corso...</span>
              </>
            ) : (
              <>
                <Code className="w-4 h-4" />
                <span>Esegui Diagnostica</span>
              </>
            )}
          </button>
        </div>
      </div>

      {results && (
        <div className="mt-4 space-y-2 border-t border-yellow-200 dark:border-yellow-800 pt-3">
          <div className="space-y-2">
            {/* Contract Exists */}
            <div className="flex items-center gap-2 text-xs">
              {results.contractExists ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600" />
              )}
              <span className={results.contractExists ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}>
                Contratto trovato: {results.contractExists ? 'Sì' : 'No'}
              </span>
            </div>

            {/* Bytecode Size */}
            {results.bytecodeSize > 0 && (
              <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-300">
                <Code className="w-4 h-4" />
                <span>Bytecode: {results.bytecodeSize} bytes</span>
              </div>
            )}

            {/* Is Owner */}
            <div className="flex items-center gap-2 text-xs">
              {results.isOwner ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600" />
              )}
              <span className={results.isOwner ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}>
                Burner card è owner: {results.isOwner ? 'Sì' : 'No'}
              </span>
            </div>

            {/* All Owners */}
            {results.owners && results.owners.length > 0 && (
              <div className="text-xs">
                <p className="text-yellow-700 dark:text-yellow-300 font-medium mb-1">
                  Owner registrati ({results.owners.length}):
                </p>
                <div className="space-y-1">
                  {results.owners.map((owner: any) => (
                    <div key={owner.index} className="flex items-start gap-2">
                      <span className="text-yellow-600 dark:text-yellow-400 font-medium">#{owner.index}:</span>
                      <p className={`font-mono flex-1 p-2 rounded break-all ${
                        owner.address.toLowerCase() === address?.toLowerCase()
                          ? 'text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-900/30 font-semibold'
                          : 'text-yellow-800 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-900/30'
                      }`}>
                        {owner.address}
                        {owner.address.toLowerCase() === address?.toLowerCase() && (
                          <span className="ml-2 text-green-600">← TU</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Balance */}
            {results.balance && (
              <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-300">
                <span>Balance Smart Wallet: <strong>{results.balance} ETH</strong></span>
              </div>
            )}

            {/* Execute Call Test */}
            {results.executeCallWorks !== undefined && (
              <div className="flex items-center gap-2 text-xs">
                {results.executeCallWorks ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-green-700 dark:text-green-300">
                      Test execute(): SUCCESS
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span className="text-red-700 dark:text-red-300">
                      Test execute(): FAILED
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Execute Error Details */}
            {results.executeCallError && (
              <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs text-red-700 dark:text-red-300 font-semibold mb-1">
                  ❌ Errore test execute():
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                  {results.executeCallError}
                </p>
                {results.executeCallRevertReason && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    <strong>Motivo:</strong> {results.executeCallRevertReason}
                  </p>
                )}
              </div>
            )}

            {/* Error */}
            {results.error && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs text-red-700 dark:text-red-300">
                  <strong>Errore:</strong> {results.error}
                </p>
              </div>
            )}

            {/* Diagnosis */}
            {!results.isOwner && results.contractExists && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs text-red-700 dark:text-red-300 font-semibold mb-2">
                  ❌ Problema identificato:
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  La tua Burner card <strong>NON è owner</strong> di questo Smart Wallet.
                  Controlla che l'indirizzo dello Smart Wallet sia corretto nella configurazione.
                </p>
              </div>
            )}
            
            {/* Multi-owner info */}
            {results.isOwner && results.owners && results.owners.length > 1 && (
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-semibold mb-2">
                  ℹ️ Multi-Owner Setup:
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Questo Smart Wallet ha <strong>{results.owners.length} owner</strong>. La tua Burner card è uno di essi.
                  {!results.executeCallWorks && (
                    <span className="block mt-2 text-red-600 dark:text-red-400">
                      <strong>⚠️ Attenzione:</strong> La chiamata execute() fallisce. Potrebbe essere richiesta una firma multipla o ci potrebbero essere altre restrizioni.
                    </span>
                  )}
                </p>
              </div>
            )}
            
            {/* Success case */}
            {results.isOwner && results.executeCallWorks && (
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-xs text-green-700 dark:text-green-300 font-semibold mb-2">
                  ✅ Tutto OK!
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  La tua Burner card è owner e la funzione execute() funziona correttamente.
                  Dovresti essere in grado di inviare transazioni.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

