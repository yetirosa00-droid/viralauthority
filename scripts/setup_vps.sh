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

# Update system only if needed (commented out to avoid slow VPS timeouts on every deploy)
echo "📦 [2/8] Checking system packages..."
# sudo apt-get update
# sudo apt-get install -y curl wget git build-essential python3 python3-pip python-is-python3 ffmpeg

# Install Node.js
if ! command -v node &> /dev/null; then
    echo "🟢 [3/8] Installing Node.js LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "🟢 [3/8] Node.js already installed."
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "⚙️ [4/8] Installing PM2 Global..."
    sudo npm install -g pm2
else
    echo "⚙️ [4/8] PM2 already installed."
fi

# Install yt-dlp
if ! command -v yt-dlp &> /dev/null; then
    echo "📥 [5/8] Installing yt-dlp..."
    sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
    sudo chmod a+rx /usr/local/bin/yt-dlp
else
    echo "📥 [5/8] yt-dlp already installed."
fi

# Install Nginx & Certbot
if ! command -v nginx &> /dev/null; then
    echo "🌐 [6/8] Installing Nginx & Certbot..."
    sudo apt-get install -y nginx certbot python3-certbot-nginx
else
    echo "🌐 [6/8] Nginx already installed."
fi

# Configure Tools & Security
echo "🛡️ [7/8] Configuring Security (Fail2Ban & UFW)..."
sudo apt-get install -y fail2ban certbot python3-certbot-nginx

# Configure UFW
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose

# Configure PM2 to start on boot
echo "🚀 [8/8] Finalizing PM2..."
pm2 startup | grep "sudo" | bash || true
pm2 save

# Final Status
echo "✅ [SUCCESS] Base environment ready for Production!"
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
