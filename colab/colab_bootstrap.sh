#!/usr/bin/env bash
# ==============================================================================
# ORLITH AI - Colab L4 GPU Bootstrap Script
# ==============================================================================
set -e

echo "=== [1/5] Checking GPU & CUDA ==="
nvidia-smi

echo "=== [2/5] Installing System Tools & Cloudflare Tunnel ==="
apt-get update -qq && apt-get install -y -qq curl wget pciutils zstd
if ! command -v cloudflared &> /dev/null; then
    wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1
    rm -f cloudflared-linux-amd64.deb
fi

echo "=== [3/5] Installing Ollama Engine ==="
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi

echo "=== [4/5] Starting Ollama in Background ==="
pkill ollama || true
nohup ollama serve > /content/ollama.log 2>&1 &
sleep 4

echo "=== [5/5] Pulling Default Model (Qwen 2.5 7B) ==="
ollama pull qwen2.5:7b

echo "=== Bootstrap Completed Successfully! ==="
