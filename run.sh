#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
if [ ! -d "dist" ]; then
  npm run build
fi
python3 python_app/server.py
