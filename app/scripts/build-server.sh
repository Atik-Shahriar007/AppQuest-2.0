#!/usr/bin/env bash
# Bundle the API into deploy/dist (one file, no node_modules needed at runtime).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=deploy/dist
rm -rf "$OUT" && mkdir -p "$OUT"
BANNER="import{createRequire}from'module';const require=createRequire(import.meta.url);"
npx esbuild server/index.ts --bundle --platform=node --format=esm --target=node22 --outfile="$OUT/server.mjs" --banner:js="$BANNER" --log-level=warning
npx esbuild server/db/migrate.ts --bundle --platform=node --format=esm --target=node22 --outfile="$OUT/migrate.mjs" --banner:js="$BANNER" --log-level=warning
cp -r server/db/migrations "$OUT/migrations"
echo "built $OUT"
