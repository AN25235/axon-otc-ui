# AXON /U — OTC Trading Platform

A decentralized OTC (Over-The-Counter) trading frontend for [Axon Chain](https://axonchain.ai), powered by the [Axon OTC V7 Keeper](https://axonotc.com).

## Features

- **One-click Buy** — Connect wallet, switch chain, send USDT/USDC in one flow
- **One-click Sell** — Create sell orders directly from browser via MetaMask/OKX Wallet
- **Multi-chain** — Supports BSC and Arbitrum for payment
- **Real-time Orders** — Auto-refreshes every 30s from Keeper API
- **Price Charts** — Canvas-based price trend and depth charts (no external libs)
- **My Orders** — Track your sells, buys, cancellations with local storage backup
- **Price Alerts** — Browser notifications when price drops below threshold
- **Trade Alerts** — Get notified when your sell order is filled
- **Dark/Light Theme** — Smooth animated theme toggle
- **Mobile Responsive** — Full responsive layout down to 400px
- **Safety Hardened** — Double-click guards, chain verification, amount validation, balance checks

## Security Features

- `_buying` / `_selling` / `_switchingChain` mutex locks prevent double-submit
- Chain switch verification via `eth_chainId` after `wallet_switchEthereumChain`
- Payment address regex validation (`0x` + 40 hex chars)
- Token contract address validation
- BigInt amount calculation via string split (no floating-point precision loss)
- Zero-amount transaction blocked
- Large amount confirmation dialogs ($10,000+ buy, 5,000+ AXON sell)
- Self-buy detection
- All fetch requests have AbortController timeouts
- User cancel (code 4001) handled gracefully

## Architecture

```
index.html    — Layout & structure
otc.css       — Styles, themes (CSS variables), responsive, animations
otc.js        — Core: wallet, theme, data loading, Keeper health check
otc2.js       — Rendering: order list, trade list, canvas charts, detail modal
otc3.js       — Interactions: buy, sell, my orders, cancel, notifications
```

No build tools. No frameworks. No dependencies. Pure HTML/CSS/JS.

## Configuration

Edit the constants at the top of `otc.js`:

```javascript
var KEEPER = 'https://axonotc.com';          // Keeper API endpoint
var AXON_RPC = 'https://mainnet-rpc.axonchain.ai/'; // Axon RPC
```

The OTC contract address is in `otc3.js`:
```javascript
var OTC = '0x10063340374db851e2628D06F4732d5FF814eB34';
```

### Optional: Local data endpoint

The platform optionally fetches `/explorer/otc.json` for historical trade data and stats. If not available, it gracefully falls back to Keeper-only data.

`otc.json` schema:
```json
{
  "otc_active_orders": [],
  "otc_recent_trades": [],
  "otc_last_price": 0.123,
  "otc_completed_volume_usd": 0,
  "otc_completed_count": 0
}
```

## Deployment

Just serve the files with any static web server:

```bash
# nginx
cp -r . /var/www/otc/

# or python
python3 -m http.server 8080

# or npx
npx serve .
```

## Wallet Support

- OKX Web3 Wallet (preferred)
- MetaMask
- Any EIP-1193 compatible wallet

## Supported Chains

| Chain | Chain ID | USDT | USDC |
|-------|----------|------|------|
| BSC | 56 | 18 decimals | 18 decimals |
| Arbitrum | 42161 | 6 decimals | 6 decimals |

## How It Works

1. **Sellers** create sell orders by sending AXON to the OTC escrow contract on Axon Chain
2. **Keeper** (backend service) monitors the contract and lists active orders via API
3. **Buyers** browse orders, connect wallet, and send USDT/USDC to the Keeper's payment address
4. **Keeper** verifies payment on BSC/Arbitrum and releases AXON to the buyer

## Related

- [Axon Chain](https://axonchain.ai) — The L1 blockchain
- [Axon OTC V7](https://github.com/playweta/axonchainv3) — Official OTC contract & Keeper
- [axonotc.com](https://axonotc.com) — Keeper API

## License

MIT
