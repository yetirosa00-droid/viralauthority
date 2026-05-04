#!/bin/bash

# ==============================================================================
# ViralAuthorityPro Production VPS Setup Script
# ==============================================================================
# OS: Ubuntu 22.04+ (Recommended)
# Purpose: Full automation of Node.js, PM2, Nginx, SSL, and yt-dlp.
# ==============================================================================

set -e

LOG_FILE="/var/log/viralauthoritypro_setup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "🚀 [1/8] Starting ViralAuthorityPro Production Setup..."

# Ensure non-interactive installs
export DEBIAN_FRONTEND=noninteractive

# Update system
echo "📦 [2/8] Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl wget git build-essential python3 python3-pip python-is-python3 ffmpeg

# Install Node.js (Latest LTS - 20.x or 22.x)
echo "🟢 [3/8] Installing Node.js LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
echo "⚙️ [4/8] Installing PM2 Global..."
sudo npm install -g pm2

# Install yt-dlp (Latest Binary for max compatibility)
echo "📥 [5/8] Installing yt-dlp..."
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Install Nginx & Certbot
echo "🌐 [6/8] Installing Nginx & Certbot..."
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Configure Firewall
echo "🛡️ [7/8] Configuring Firewall (UFW)..."
sudo ufw allow 'Nginx Full'
sudo ufw allow 22
sudo ufw allow 3001
sudo ufw --force enable

# Final Status
echo "✅ [8/8] Base environment ready!"
echo "----------------------------------------------------"
echo "Node: $(node -v)"
echo "NPM: $(npm -v)"
echo "yt-dlp: $(yt-dlp --version)"
echo "PM2: $(pm2 -v)"
echo "----------------------------------------------------"

echo "NEXT STEPS (Execute manually from project root):"
echo "1. Upload files: rsync -av . root@167.86.74.3:/var/www/viralauthoritypro"
echo "2. Install deps: cd /var/www/viralauthoritypro && npm install && cd backend && npm install"
echo "3. Start Backend: pm2 start backend/index.js --name 'viralauthoritypro-api'"
echo "4. Start Frontend: npm run build && pm2 start npm --name 'viralauthoritypro-app' -- start"
echo "5. Link SSL: sudo certbot --nginx -d viralauthoritypro.com -d api.viralauthoritypro.com"
echo "----------------------------------------------------"
