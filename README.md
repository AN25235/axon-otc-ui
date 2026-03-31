# Axon OTC — Decentralized OTC Trading Platform

> On-chain peer-to-peer OTC trading for AXON token with automated Keeper settlement

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Overview

Axon OTC is a fully decentralized OTC (over-the-counter) trading platform built on **Axon Chain (Chain ID 8210)**. Sellers lock AXON into a smart contract, buyers pay USDT on BSC/Arbitrum, and an automated Keeper handles cross-chain settlement.

**Live:** [ai-colony.top/otc](https://ai-colony.top/otc)

## Features

- **On-chain order book** — Sell orders stored in smart contract, fully transparent
- **Cross-chain settlement** — AXON on Axon Chain ↔ USDT on BSC/Arbitrum
- **Automated Keeper (V7)** — Matches and settles trades in ~30 seconds
- **Dual-RPC racing** — `Promise.any` parallel requests to official RPC + Nginx proxy for maximum reliability
- **Event sourcing** — Collector V10 scans 5 on-chain events to build complete order timelines
- **Real-time data** — Layered refresh: orders every 15s, config every 60s
- **Price charts** — Smooth Catmull-Rom price curve + depth chart (pure Canvas, no dependencies)
- **Wallet connect** — OKX Web3 Wallet + MetaMask support with chain auto-switch
- **Full order lifecycle** — Create → Buy → Fulfill, or Create → Cancel Request (15min cooldown) → Finalize Cancel
- **Browser notifications** — Price alerts + trade notifications
- **Dark/Light theme** — Cyberpunk-inspired dark mode default
- **Mobile responsive** — Adaptive grid layout with column prioritization

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend    │────▶│  Keeper V7   │────▶│ Axon Chain  │
│  (Static JS) │     │ (axonotc.com)│     │  (8210)     │
└──────┬───────┘     └──────────────┘     └─────────────┘
       │                                         │
       │  ┌──────────────┐                       │
       └─▶│ Collector V10│──── scans events ─────┘
          │ (Python cron) │
          └──────────────┘
```

- **Frontend** — Pure vanilla JS (no framework), 3 files: `otc.js` (core/wallet), `otc2.js` (render/charts), `otc3.js` (buy/sell/orders)
- **Collector** — Python script runs via cron, scans chain events, outputs `otc.json`
- **Keeper** — External service at axonotc.com handles order matching and USDT settlement

## Smart Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| OTC Trading | `0x10063340374db851e2628D06F4732d5FF814eB34` | Order book, escrow, settlement |
| Registry | `0x98e40D7D867E4E8e185d216bab13b79f5283F656` | Seller registration |

## On-Chain Events

The collector tracks 5 event types for complete order lifecycle:

| Event | Description |
|-------|-------------|
| `OrderCreated` | Seller lists AXON for sale |
| `BuyerAssigned` | Buyer initiates purchase |
| `OrderFulfilled` | Keeper completes settlement |
| `CancelRequested` | Seller requests cancellation (15min cooldown) |
| `OrderCancelled` | Cancellation finalized, AXON returned |

## Security

- Payment addresses re-fetched from Keeper before every transaction (never cached)
- Token contract addresses hardcoded locally (never trust remote)
- Self-buy prevention
- Chain switch verification with timeout
- Large amount warnings (>10,000 USDT)
- XSS protection via HTML entity escaping
- Stuck transaction detection (60s timeout auto-unlock)

## Stats

- **TVL:** ~12,000 AXON locked in contract
- **Trades:** 117+ completed
- **Volume:** $1,139+ total
- **Fee:** 0.3% (deducted from AXON)

## Deploy

```bash
bash deploy.sh  # Syntax check → bump version.json → bust cache → done
```

Users auto-reload within 30 seconds via version polling.

## License

[MIT](LICENSE) — Free to use, attribution appreciated.
