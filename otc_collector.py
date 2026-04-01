#!/usr/bin/env python3
"""OTC市场数据采集模块 — V10 Keeper + 链上事件扫描 + 全订单时间线"""
import json, time, datetime, urllib.request, sys

def log(msg):
    print(msg, file=sys.stderr)

KEEPER = "https://axonotc.com"
RPC = "https://mainnet-rpc.axonchain.ai/"
OTC_ADDR = "0x10063340374db851e2628D06F4732d5FF814eB34"
DEPLOY_BLOCK = 172127
CACHE_PATH = "/var/www/ai-colony/explorer/otc.json"
STATS_PATH = "/var/www/ai-colony/explorer/otc_stats.json"

# Event topics
TOPIC_ORDER_CREATED    = "0x4230830dfe20a0ca4dea7c6539ec33d88b3ac7a4bb183602ec80cfb9728ac521"
TOPIC_ORDER_FULFILLED  = "0xc4bfc30eeb4d37af0bfe8327e0acfdc5e10da19745a4677dd5f4244993d7ca98"
TOPIC_BUYER_ASSIGNED   = "0x76c1dae30ee590a329686dcf590cff81c5bd27db97bdcb0d0bc0921929c169b9"
TOPIC_CANCEL_REQUESTED = "0xb88c15c6125137b9c4189e52e198791ebf39b71163dd4cf1a1be29b28cce4b63"
TOPIC_ORDER_CANCELLED  = "0x61b9399f2f0f32ca39ce8d7be32caed5ec22fe07a6daba3a467ed479ec606582"

def rpc_call(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, body, {"Content-Type": "application/json"})
    r = urllib.request.urlopen(req, timeout=15)
    result = json.loads(r.read())
    if "error" in result:
        raise Exception(f"RPC error: {result['error']}")
    return result["result"]

def block_timestamp(block_hex):
    """Get block timestamp, return formatted string"""
    try:
        block = rpc_call("eth_getBlockByNumber", [block_hex, False])
        ts = int(block["timestamp"], 16)
        return datetime.datetime.fromtimestamp(ts).strftime("%m-%d %H:%M")
    except:
        return ""

def load_stats():
    try:
        with open(STATS_PATH) as f:
            return json.load(f)
    except:
        return {"completed_count": 0, "completed_volume_usd": 0, "last_price": None,
                "last_scanned_block": DEPLOY_BLOCK, "trades": [], "order_times": {}}

def save_stats(stats):
    with open(STATS_PATH, "w") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

def scan_all_events(stats):
    """扫描链上所有OTC事件，增量更新trades和order_times"""
    try:
        latest = int(rpc_call("eth_blockNumber", []), 16)
    except Exception as e:
        log(f"RPC unavailable: {e}")
        return stats

    from_block = stats.get("last_scanned_block", DEPLOY_BLOCK)
    if from_block >= latest:
        return stats

    log(f"Scanning blocks {from_block} to {latest}...")

    order_times = stats.get("order_times", {})  # {orderId: {created, cancel_requested, cancelled, fulfilled, ...}}
    chunk = 10000
    new_trades = []
    # Block timestamp cache to avoid redundant RPC calls
    _block_ts_cache = {}

    def get_block_time(block_num):
        if block_num not in _block_ts_cache:
            _block_ts_cache[block_num] = block_timestamp(hex(block_num))
        return _block_ts_cache[block_num]

    for start in range(from_block, latest + 1, chunk):
        end = min(start + chunk - 1, latest)
        try:
            # Fetch ALL events from OTC contract in one call
            logs = rpc_call("eth_getLogs", [{
                "address": OTC_ADDR,
                "fromBlock": hex(start),
                "toBlock": hex(end)
            }])

            for entry in logs:
                topic0 = entry["topics"][0]
                block_num = int(entry["blockNumber"], 16)

                if topic0 == TOPIC_ORDER_CREATED:
                    order_id = str(int(entry["topics"][1], 16))
                    bt = get_block_time(block_num)
                    order_times.setdefault(order_id, {})
                    order_times[order_id]["created"] = bt
                    order_times[order_id]["created_block"] = block_num
                    # Extract seller from tx
                    try:
                        tx = rpc_call("eth_getTransactionByHash", [entry["transactionHash"]])
                        order_times[order_id]["creator"] = tx["from"]
                    except:
                        pass

                elif topic0 == TOPIC_BUYER_ASSIGNED:
                    order_id = str(int(entry["topics"][1], 16))
                    bt = get_block_time(block_num)
                    order_times.setdefault(order_id, {})
                    order_times[order_id]["bought"] = bt
                    order_times[order_id]["bought_block"] = block_num
                    # data contains buyer address
                    if len(entry.get("data", "")) >= 66:
                        order_times[order_id]["buyer"] = "0x" + entry["data"][26:66]

                elif topic0 == TOPIC_ORDER_FULFILLED:
                    order_id = str(int(entry["topics"][1], 16))
                    bt = get_block_time(block_num)
                    order_times.setdefault(order_id, {})
                    order_times[order_id]["fulfilled"] = bt
                    order_times[order_id]["fulfilled_block"] = block_num

                    # Build trade record (same as before)
                    existing_ids = [t["id"] for t in stats.get("trades", [])]
                    if int(order_id) in existing_ids:
                        for t in stats.get("trades", []):
                            if t["id"] == int(order_id):
                                # Always update time
                                if bt: t["time"] = bt
                                if "created" in order_times.get(order_id, {}):
                                    t["created_time"] = order_times[order_id]["created"]
                                # Fix price=0 from Keeper
                                if not t.get("price") or not t.get("seller"):
                                    try:
                                        import urllib.request as _ur
                                        _kr = _ur.urlopen(f"https://axonotc.com/order/{order_id}", timeout=5)
                                        _kd = json.loads(_kr.read())
                                        if _kd.get("price"): t["price"] = _kd["price"]
                                        if _kd.get("seller"): t["seller"] = _kd["seller"]
                                        if _kd.get("buyer"): t["buyer"] = _kd["buyer"]
                                        if _kd.get("chain_id"): t["chain_id"] = _kd["chain_id"]
                                        if _kd.get("amount"): t["amount"] = _kd["amount"]
                                        t["total"] = round(t["amount"] * t["price"], 2)
                                        t["chain"] = {56:"BSC",42161:"Arbitrum"}.get(t.get("chain_id",56),"BSC")
                                        log(f"    Keeper修复: #{order_id} ${t['price']}")
                                    except:
                                        pass
                        continue

                    data = entry["data"][2:]
                    amount_after_fee = int(data[:64], 16) / 1e18
                    fee = int(data[64:128], 16) / 1e18
                    amount_original = amount_after_fee + fee
                    tx_hash = entry["transactionHash"]

                    # Get order price from OrderCreated event
                    price = None; seller = None; chain_id = None
                    try:
                        search_end = block_num
                        for attempt in range(4):
                            search_start = max(DEPLOY_BLOCK, search_end - 5000)
                            create_logs = rpc_call("eth_getLogs", [{
                                "address": OTC_ADDR,
                                "topics": [TOPIC_ORDER_CREATED, entry["topics"][1]],
                                "fromBlock": hex(search_start),
                                "toBlock": hex(search_end)
                            }])
                            if create_logs:
                                cl = create_logs[0]
                                cdata = cl["data"][2:]
                                # Try event data first (new contract: amount, price, chain_id in data; seller in topics[2])
                                if len(cdata) >= 192 and len(cl.get("topics", [])) >= 3:
                                    price = int(cdata[64:128], 16) / 1e6
                                    chain_id = int(cdata[128:192], 16)
                                    seller = "0x" + cl["topics"][2][-40:]
                                else:
                                    # Fallback: parse from transaction input (old contract)
                                    create_tx = rpc_call("eth_getTransactionByHash", [cl["transactionHash"]])
                                    if create_tx:
                                        inp = create_tx["input"][10:]
                                        price = int(inp[:64], 16) / 1e6
                                        chain_id = int(inp[64:128], 16)
                                        seller = create_tx["from"]
                                break
                            search_end = search_start - 1
                            if search_end < DEPLOY_BLOCK:
                                break
                    except:
                        pass

                    # Fallback to Keeper if chain parsing failed
                    if not price or not seller:
                        try:
                            import urllib.request as _ur
                            _kr = _ur.urlopen(f"https://axonotc.com/order/{order_id}", timeout=5)
                            _kd = json.loads(_kr.read())
                            if _kd.get("price"):
                                price = _kd["price"]
                                seller = _kd.get("seller", seller or "")
                                chain_id = _kd.get("chain_id", chain_id or 56)
                                amount_original = _kd.get("amount", amount_original)
                                log(f"    Keeper补价: #{order_id} ${price}")
                        except:
                            pass

                    # Get buyer from fulfill TX
                    buyer = order_times.get(order_id, {}).get("buyer")
                    if not buyer:
                        try:
                            fulfill_tx = rpc_call("eth_getTransactionByHash", [tx_hash])
                            inp = fulfill_tx["input"][10:]
                            buyer = "0x" + inp[64:128][-40:]
                        except:
                            pass
                    # Also try Keeper for buyer
                    if not buyer or buyer == "0x" + "0"*40:
                        try:
                            import urllib.request as _ur
                            _kr = _ur.urlopen(f"https://axonotc.com/order/{order_id}", timeout=5)
                            _kd = json.loads(_kr.read())
                            if _kd.get("buyer"):
                                buyer = _kd["buyer"]
                        except:
                            pass

                    total_usd = round(amount_original * price, 2) if price else 0
                    chain_name = {56: "BSC", 42161: "Arbitrum"}.get(chain_id, "Unknown") if chain_id else "BSC"
                    created_time = order_times.get(order_id, {}).get("created", "")

                    trade = {
                        "id": int(order_id),
                        "amount": round(amount_original, 2),
                        "price": round(price, 4) if price else 0,
                        "total": total_usd,
                        "seller": seller or "",
                        "buyer": buyer or "",
                        "chain": chain_name,
                        "chain_id": chain_id or 56,
                        "status": "Completed",
                        "time": bt,
                        "created_time": created_time,
                        "block": block_num,
                        "tx": tx_hash
                    }
                    new_trades.append(trade)
                    log(f"  Trade: #{order_id} {amount_original:.2f} AXON @ ${(price or 0):.4f} = ${total_usd}")

                elif topic0 == TOPIC_CANCEL_REQUESTED:
                    order_id = str(int(entry["topics"][1], 16))
                    bt = get_block_time(block_num)
                    order_times.setdefault(order_id, {})
                    order_times[order_id]["cancel_requested"] = bt
                    order_times[order_id]["cancel_requested_block"] = block_num

                elif topic0 == TOPIC_ORDER_CANCELLED:
                    order_id = str(int(entry["topics"][1], 16))
                    bt = get_block_time(block_num)
                    order_times.setdefault(order_id, {})
                    order_times[order_id]["cancelled"] = bt
                    order_times[order_id]["cancelled_block"] = block_num

        except Exception as e:
            log(f"  Error scanning {start}-{end}: {e}")

    # Update stats
    if new_trades:
        stats.setdefault("trades", []).extend(new_trades)
        valid_stat_trades = [t for t in stats["trades"] if t.get("price", 0) > 0]
        stats["completed_count"] = len(valid_stat_trades)
        stats["completed_volume_usd"] = round(sum(t["total"] for t in valid_stat_trades), 2)
        valid_trades = [t for t in stats["trades"] if t.get("price", 0) > 0]
        if valid_trades:
            stats["last_price"] = valid_trades[-1]["price"]

    stats["order_times"] = order_times
    stats["last_scanned_block"] = latest
    return stats

def collect_otc():
    # 1. Keeper active orders
    try:
        data = json.loads(urllib.request.urlopen(KEEPER + "/orders", timeout=10).read())
        orders = data.get("orders", data) if isinstance(data, dict) else data
    except Exception as e:
        try:
            with open(CACHE_PATH) as f:
                cached = json.load(f)
            if "otc_error" not in cached:
                return cached
        except:
            pass
        return {"otc_error": f"keeper unavailable: {e}"}

    # 2. Chain scan
    stats = load_stats()
    stats = scan_all_events(stats)
    save_stats(stats)

    order_times = stats.get("order_times", {})

    # 3. Active orders with times
    active = []
    for o in orders:
        oid = str(o["id"])
        times = order_times.get(oid, {})
        active.append({
            "id": o["id"],
            "seller": o.get("seller", ""),
            "amount": round(float(o.get("amount", 0)), 2),
            "price": round(float(o.get("price", 0)), 4),
            "total": round(float(o.get("total", 0)), 2),
            "chain": o.get("chain", "BSC"),
            "chain_id": o.get("chain_id", 56),
            "token": o.get("token", "USDT"),
            "payment_address": o.get("payment_address", ""),
            "status": "Active",
            "created_time": times.get("created", ""),
        })
    active.sort(key=lambda x: x["price"])

    total_axon = sum(o["amount"] for o in active)
    floor_price = active[0]["price"] if active else None
    ceil_price = active[-1]["price"] if active else None
    max_id = max(o["id"] for o in active) if active else 0

    # Recent trades with times (sorted newest first)
    recent_trades = sorted(stats.get("trades", []), key=lambda t: t.get("id", 0), reverse=True)
    # Enrich trades with order_times + Keeper fix for price=0
    need_keeper_fix = []
    for t in recent_trades:
        oid = str(t["id"])
        times = order_times.get(oid, {})
        if "created_time" not in t or not t["created_time"]:
            t["created_time"] = times.get("created", "")
        if not t.get("price") or not t.get("seller"):
            need_keeper_fix.append(t)

    if need_keeper_fix:
        log(f"Keeper补全 {len(need_keeper_fix)} 笔缺失数据...")
        import urllib.request as _ur
        for t in need_keeper_fix:
            try:
                _kr = _ur.urlopen(f"https://axonotc.com/order/{t['id']}", timeout=5)
                _kd = json.loads(_kr.read())
                if _kd.get("status") == "Completed" and _kd.get("price"):
                    t["price"] = _kd["price"]
                    t["seller"] = _kd.get("seller", "")
                    t["buyer"] = _kd.get("buyer", "")
                    t["chain_id"] = _kd.get("chain_id", 56)
                    t["amount"] = _kd.get("amount", t["amount"])
                    t["total"] = round(t["amount"] * t["price"], 2)
                    t["chain"] = {56:"BSC",42161:"Arbitrum"}.get(t["chain_id"],"BSC")
                    log(f"  #{t['id']} → ${t['price']}")
            except:
                pass
            import time as _t; _t.sleep(0.05)
        # Update stats with fixed data
        save_stats(stats)

    # Cancelled orders (from order_times)
    cancelled_orders = []
    for oid, times in order_times.items():
        if "cancelled" in times:
            # Find created info
            cancelled_orders.append({
                "id": int(oid),
                "status": "Cancelled",
                "created_time": times.get("created", ""),
                "cancel_requested_time": times.get("cancel_requested", ""),
                "cancelled_time": times.get("cancelled", ""),
                "creator": times.get("creator", ""),
            })
    cancelled_orders.sort(key=lambda x: x["id"], reverse=True)

    # CancelPending orders (requested but not yet cancelled or fulfilled)
    fulfilled_ids = set(str(t["id"]) for t in stats.get("trades", []))
    cancelled_ids = set(oid for oid, t in order_times.items() if "cancelled" in t)
    cancel_pending = []
    for oid, times in order_times.items():
        if "cancel_requested" in times and oid not in fulfilled_ids and oid not in cancelled_ids:
            cancel_pending.append({
                "id": int(oid),
                "status": "CancelPending",
                "created_time": times.get("created", ""),
                "cancel_requested_time": times.get("cancel_requested", ""),
                "creator": times.get("creator", ""),
            })

    valid_trades = [t for t in recent_trades if t.get("price", 0) > 0]
    last_price = valid_trades[0]["price"] if valid_trades else stats.get("last_price")

    result = {
        "otc_total_orders": max_id + 1,
        "otc_active_count": len(active),
        "otc_completed_count": stats["completed_count"],
        "otc_completed_volume_usd": round(stats["completed_volume_usd"], 2),
        "otc_last_price": last_price,
        "otc_floor_price": floor_price,
        "otc_ceil_price": ceil_price,
        "otc_active_orders": active,
        "otc_depth_axon": round(total_axon, 2),
        "otc_recent_trades": recent_trades[:50],
        "otc_cancelled_orders": cancelled_orders[:30],
        "otc_cancel_pending": cancel_pending,
        "otc_order_times": order_times,
        "updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    return result

if __name__ == "__main__":
    t0 = time.time()
    data = collect_otc()

    with open(CACHE_PATH, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Full trades history for "my orders" tab persistence
    all_trades_path = CACHE_PATH.replace("otc.json", "otc_trades_all.json")
    try:
        all_stats = json.load(open(STATS_PATH))
        with open(all_trades_path, "w") as f:
            json.dump(all_stats.get("trades", []), f, ensure_ascii=False)
    except:
        pass

    t1 = time.time()
    log(json.dumps({k: v for k, v in data.items() if k not in ("otc_active_orders", "otc_recent_trades", "otc_order_times", "otc_cancelled_orders", "otc_cancel_pending")}, indent=2))
    if data.get("otc_recent_trades"):
        log(f"\n最近成交: {len(data['otc_recent_trades'])} 笔")
        for t in data["otc_recent_trades"][:3]:
            log(f"  #{t['id']} {t['amount']} AXON @ ${t['price']} = ${t['total']} ({t.get('time','')}) 挂单:{t.get('created_time','?')}")
    if data.get("otc_cancelled_orders"):
        log(f"\n已取消: {len(data['otc_cancelled_orders'])} 笔")
        for c in data["otc_cancelled_orders"][:3]:
            log(f"  #{c['id']} 挂单:{c.get('created_time','?')} 请求取消:{c.get('cancel_requested_time','?')} 完成:{c.get('cancelled_time','?')}")
    log(f"\n订单时间线: {len(data.get('otc_order_times',{}))} 个订单有时间记录")
    log(f"活跃: {data.get('otc_active_count', 0)} 单 | 耗时: {t1 - t0:.1f}s")
