# AXON /U — OTC Trading Platform

A browser-based OTC trading platform for AXON tokens, built on the Axon V7 OTC contract with Keeper auto-fulfillment.

## Features

- **One-click Buy/Sell** — Connect OKX Wallet or MetaMask, trade directly from browser
- **Real-time Order Book** — Live orders from Keeper API, 30s auto-refresh
- **Price & Depth Charts** — Canvas-rendered, HiDPI, dark/light theme adaptive
- **Smart Safety** — Self-buy detection, amount validation, chain switch verification, stuck-lock auto-recovery
- **Auto Update** — `version.json` polling triggers seamless page reload on deploy
- **Dual Theme** — Professional dark mode + soft light mode
- **Cross-chain** — BSC and Arbitrum payment support (USDT/USDC)
- **My Orders** — Track sells, buys, cancellations with localStorage persistence

## Architecture

```
index.html    — Structure & layout
otc.css       — Styles (dark/light themes, responsive)
otc.js        — Core: theme, wallet, data loading, chain switch, auto-update
otc2.js       — Rendering: order list, trades, charts, detail modal
otc3.js       — Transactions: buy, sell, my orders, notifications
deploy.sh     — One-command deploy with version bump
version.json  — Auto-update trigger file
```

## Contract

- **OTC Contract**: `0x10063340374db851e2628D06F4732d5FF814eB34` (Axon Mainnet, Chain ID 8210)
- **Keeper**: `https://axonotc.com` (auto-fulfillment, ~30s)
- **Fee**: 0.3% deducted from AXON on trade

## Deploy

```bash
# Serve files with any static server (nginx, caddy, python, etc.)
# After editing, run deploy script to bump versions:
bash deploy.sh /path/to/otc/

# All connected users auto-reload within 30 seconds
```

## Wallet Support

- OKX Web3 Wallet (priority)
- MetaMask (fallback)
- Any EIP-1193 compatible wallet

## License

MIT

---

## ⚠️ Original Work Notice

This project is the **original work** of [AN25235](https://github.com/AN25235), independently designed and developed from scratch.

- **Author**: AN25235
- **Repository**: [github.com/AN25235/axon-otc-ui](https://github.com/AN25235/axon-otc-ui)
- **First Published**: March 2026

If you fork, modify, or redistribute this code, please retain this attribution and link back to the original repository. Unauthorized removal of authorship credit is a violation of good faith, even under MIT license.
