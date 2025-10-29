# 🔥 OpenBurner Dgen1 Edition

> **Fork of OpenBurner** - Enhanced version specifically designed for dgen1 devices with advanced Smart Wallet management and multi-wallet support.

An open source Web3 wallet for Burner Ethereum hardware wallets. Built with Next.js, TypeScript, and ethers.js.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is Burner?

[Burner](https://burner.pro) is an affordable, credit-card-sized hardware wallet built for gifting and everyday crypto use. It uses the same secure chip technology found in traditional hardware wallets like Ledger or Trezor, but reimagines the hardware wallet experience with a seedless design, web-based interface, and NFC connectivity. Burner combines the security of cold storage with the convenience of a software wallet, offering an accessible self-custody solution for spending, saving, and gifting crypto securely.

## What is OpenBurner?

OpenBurner is a wallet application for Burner Ethereum hardware wallets. It runs locally on your machine. Private keys remain in the card's secure element.

**This Edition** is a fork of the original OpenBurner, enhanced with advanced features for Coinbase Smart Wallet integration and improved wallet management, specifically optimized for dgen1 devices.

## ✨ Features

### Core Functionality
- 🔐 **Hardware-Secured Keys** - Private keys never leave the secure element chip
- 🌐 **Multi-Chain Support** - Extends Burner use across Ethereum, Base, Arbitrum, Optimism, BNB Chain, Avalanche, Blast, Linea, Mantle, Mode, Polygon, Scroll, Unichain, and any custom EVM chain
- 💰 **Token Management** - View balances for ETH and ERC-20 tokens
- 💸 **Send Transactions** - Native and ERC-20 transfers with hardware signing
- 📊 **Real-Time Prices** - CoinGecko integration with intelligent caching
- 🚀 **Custom RPCs** - Connect to any EVM-compatible chain
- 🎨 **NFT Management** - View, manage, and transfer NFTs with full support for ENS domains

### ✨ New Features (Dgen1 Edition)

#### 🏦 Smart Wallet Integration
- **Auto-Discovery** - Automatically detects Coinbase Smart Wallets associated with your Burner card via recovery API
- **Multi-Wallet Support** - Seamlessly switch between your Burner card and multiple Smart Wallets
- **Smart Wallet Owner Management** - Add and remove owners from your Smart Wallets with a user-friendly interface
- **Dynamic Balance Display** - View balances for the currently selected wallet (Burner or Smart Wallet)
- **Transaction Routing** - Smart Wallet transactions use the Burner card as the signing owner

#### 💼 Enhanced Wallet Management
- **Wallet Selector** - Easy switching between Burner card and Smart Wallets from the main UI
- **Owner Information Display** - View all Smart Wallet owners with full addresses and copy functionality
- **Owner Index Management** - Proper handling of owner indices for removal operations
- **Backward Compatibility** - Maintains compatibility with single Smart Wallet configurations

#### 🔄 Improved Transaction Experience
- **Loading States** - Visual feedback during transaction processing for all operations
- **Success Confirmation Dialogs** - Clear confirmation messages after successful transactions (tokens, NFTs, owner management)
- **Transaction Hash Display** - View and copy transaction hashes after completion
- **Explorer Links** - Direct links to block explorers for all transaction types

#### 🎯 User Interface Enhancements
- **Full English Interface** - Complete translation from Italian to English
- **PIN Dialog Layering** - PIN input dialog always appears on top of other modals
- **Wallet-Aware Components** - Token list, send dialog, and NFT manager automatically update based on selected wallet
- **Address Display** - Full address display with clipboard copy buttons throughout the interface

#### 🔧 Technical Improvements
- **API Integration** - Smart Wallet discovery via Markushaas recovery API with on-chain fallback
- **Factory Contract Support** - Support for both v1 and v1.1 Coinbase Smart Wallet factory contracts
- **Type Safety** - Full TypeScript compliance for production builds
- **Error Handling** - Enhanced error messages with chain context and user-friendly descriptions

### Technical Highlights
- **Multicall3 Integration** - Batch RPC calls for efficient balance queries
- **Advanced Caching** - Multi-tier price caching with stale-while-revalidate
- **Burner Card Integration** - NFC-based hardware wallet support
- **Modern Stack** - Next.js 14, TypeScript, Tailwind CSS, ethers.js v6
- **State Persistence** - localStorage-backed state management with Zustand
- **Smart Wallet Contracts** - Direct integration with Coinbase Smart Wallet contracts (v1 and v1.1)

## 🚀 Quick Start

### Prerequisites

1. **Burner Card (dgen1 compatible)** 
2. **Desktop NFC Reader** - ACR1252U or compatible USB NFC reader ([Get on Amazon](https://amzn.to/3ISNwd7))
3. **HaLo Bridge** - Local WebSocket bridge software ([HaLo Tools](https://github.com/arx-research/libhalo/releases))
4. **Node.js 18+** - [Download](https://nodejs.org)

### Installation

```bash
# Clone the repository
git clone https://github.com/pointbreak01/OpenburnerDgen1Edition.git
cd OpenburnerDgen1Edition

# Install dependencies
npm install

# Create environment file
cp env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### HaLo Bridge Setup

Install and run the HaLo Bridge to connect your NFC reader. The bridge runs on `ws://127.0.0.1:32868/ws` by default.

See **[DOCS.md](DOCS.md)** for complete setup instructions.

## 📖 Documentation

**[→ Read the full documentation](DOCS.md)**

Complete guide covering:
- Installation & setup
- Architecture
- HaLo Bridge configuration
- API reference
- Security model
- Smart Wallet setup and management
- Troubleshooting

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│       Web Application (Next.js)         │
│  • Wallet UI                            │
│  • Transaction Building                 │
│  • Token Management                     │
│  • Smart Wallet Management              │
│  • Owner Management                     │
│  • Price Oracle Integration             │
└─────────────┬───────────────────────────┘
              │
              │ WebSocket (127.0.0.1:32868)
              ↓
┌─────────────────────────────────────────┐
│          HaLo Bridge (Local)            │
│  • NFC Communication                    │
│  • Command Routing                      │
│  • PC/SC Interface                      │
└─────────────┬───────────────────────────┘
              │
              │ NFC (13.56 MHz)
              ↓
┌─────────────────────────────────────────┐
│       Burner NFC Chip (Secure Element)  │
│  • Private Key Storage                  │
│  • Transaction Signing                  │
│  • ECDSA Operations                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│     Coinbase Smart Wallet (On-Chain)    │
│  • Account Abstraction                  │
│  • Owner Management                     │
│  • Transaction Execution                 │
└─────────────────────────────────────────┘
```

## 🔒 Security

Your private keys never leave the Burner card's secure element (EAL6+ certified). All signing happens on-chip. The app only handles public keys and coordinates transactions via the local bridge.

Smart Wallet transactions are executed on-chain, with the Burner card serving as the signing owner. Gas fees are paid by the Burner card owner address.

## 📊 Supported Networks

**Everything BurnerOS supports:**
- Ethereum, Base, Arbitrum, Optimism

**Plus additional chains:**
- BNB Chain
- Avalanche  
- Blast
- Linea
- Mantle
- Mode
- Polygon
- Scroll
- Unichain

**Plus any custom EVM-compatible chain via Custom RPC configuration**

## 🎯 Smart Wallet Features

### Auto-Discovery
The application automatically detects Smart Wallets associated with your Burner card by:
1. Querying the Markushaas recovery API for registered Smart Wallets
2. Falling back to on-chain factory contract lookup if API is unavailable

### Owner Management
- **Add Owners**: Add new owners to your Smart Wallet (e.g., for multi-sig setups)
- **Remove Owners**: Remove owners by index (requires both index and owner bytes for security)
- **View Owners**: Display all current owners with full addresses and indices
- **Copy Functionality**: One-click copy for owner addresses

### Multi-Wallet Switching
- Easily switch between your Burner card and multiple Smart Wallets
- Balance and transaction context automatically updates based on selected wallet
- Visual indicators show which wallet is currently active

## 📝 License & Usage

This project is licensed under the MIT License. You can:

- Use it for personal or commercial purposes
- Modify and customize the code
- Fork and build your own version
- Distribute your modified versions

See the [LICENSE](LICENSE) file for full terms.

## 🎓 Fork Information

This is a fork of the original [OpenBurner](https://github.com/rdyplayerB/openburner) project, created specifically for dgen1 devices with the following enhancements:

- **Smart Wallet Integration**: Full support for Coinbase Smart Wallets
- **Multi-Wallet Management**: Seamless switching between Burner and Smart Wallets
- **Enhanced UX**: Improved transaction flows with loading states and confirmations
- **English Interface**: Complete translation for international users
- **Production Ready**: TypeScript strict mode compliance for Next.js production builds

Original OpenBurner created by [@rdyplayerB](https://github.com/rdyplayerB).

## Code Structure

- `app/` - Next.js pages and routing
- `components/` - React components for UI
  - `shared/` - Shared wallet components
  - `local/` - Local wallet connection components
  - `hosted/` - Hosted mode components
  - `common/` - Common UI components (modals, toggles)
- `lib/` - Core libraries
  - `burner-*.ts` - Burner card integration
  - `coinbase-smart-wallet.ts` - Smart Wallet contract interactions
  - `multicall.ts` - Batch RPC calls
  - `price-oracle.ts` - CoinGecko price fetching
  - `token-lists.ts` - Token definitions
  - `nft-manager.ts` - NFT handling
- `store/` - Zustand state management
  - `wallet-store.ts` - Global wallet state with multi-wallet support
  - `theme-store.ts` - Theme management
- `hooks/` - React hooks for environment detection, PWA, mobile support

## Links

- **GitHub Repository**: https://github.com/pointbreak01/OpenburnerDgen1Edition
- **Original OpenBurner**: https://github.com/rdyplayerB/openburner
- **Get a Burner Card**: [Order here](https://arx-burner.myshopify.com/OPENBURNER)
- **LibBurner Documentation**: https://github.com/arx-research/libburner
- **ethers.js Docs**: https://docs.ethers.org

---

## 🆘 Troubleshooting

### Smart Wallet Not Detected
- Ensure your Burner card is connected and unlocked
- Check that the recovery API is accessible
- Verify the Smart Wallet exists on the selected chain

### Transaction Failures
- Ensure the Burner card has sufficient ETH for gas fees
- Verify the selected chain matches the Smart Wallet deployment
- Check that you have the required permissions (e.g., owner status)

### PIN Dialog Not Appearing
- Check browser console for errors
- Ensure no browser extensions are blocking modal overlays
- Try refreshing the page

---

Built with ❤️ for the dgen1 community • Based on [OpenBurner](https://github.com/rdyplayerB/openburner) by [@rdyplayerB](https://github.com/rdyplayerB) • MIT License
