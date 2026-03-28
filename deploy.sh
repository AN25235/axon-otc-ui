#!/bin/bash
# OTC deploy script — bump versions and trigger auto-update
# Usage: bash deploy.sh [dir]

DIR=${1:-.}

# Syntax check all JS
for f in otc.js otc2.js otc3.js; do
  if ! node -c "$DIR/$f" 2>/dev/null; then
    echo "❌ Syntax error in $f"
    node -c "$DIR/$f"
    exit 1
  fi
done
echo "✅ JS syntax OK"

# Generate new version string
VER=$(date +%Y%m%d-%H%M%S)
TS=$(date +%s)
echo "{\"v\":\"$VER\",\"ts\":$TS}" > "$DIR/version.json"
echo "✅ version.json → $VER"

# Bump cache-busting params in index.html
for f in otc.js otc2.js otc3.js otc.css; do
  BASE=$(echo "$f" | sed 's/\./\\./g')
  OLD_V=$(grep -oP "${BASE}\?v=\K[0-9]+" "$DIR/index.html" | head -1)
  if [ -n "$OLD_V" ]; then
    NEW_V=$((OLD_V + 1))
    sed -i "s/${BASE}?v=${OLD_V}/${BASE}?v=${NEW_V}/" "$DIR/index.html"
    echo "   $f v=$OLD_V → v=$NEW_V"
  fi
done

echo "✅ Deploy complete — users will auto-reload within 30s"
