# Wata-Board Deployment Guide

This document provides a comprehensive, step-by-step guide for deploying the Wata-Board application to a production environment.

## 1. Infrastructure Requirements

To run the Wata-Board application reliably in production, ensure your infrastructure meets the following specifications:

### Minimum Hardware
- **CPU**: 2 Cores
- **RAM**: 4GB
- **Storage**: 40GB SSD

### Required Software
- **OS**: Ubuntu 22.04 LTS (recommended)
- **Node.js**: v18.x (LTS) or higher
- **Package Manager**: npm or yarn
- **Web Server / Reverse Proxy**: Nginx
- **Process Manager**: PM2
- **Database**: PostgreSQL 14+
- **Cache**: Redis 6+

## 2. Environment Setup Procedures

### Install System Dependencies
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx postgresql redis-server

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2
```

### Database Setup
Refer to the [Database Migration Scripts](database/migrations/README.md) for setting up your production schema.
```bash
sudo -u postgres psql -c "CREATE DATABASE wata_board_prod;"
sudo -u postgres psql -c "CREATE USER wata_board_app WITH PASSWORD 'secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE wata_board_prod TO wata_board_app;"
```

## 3. Step-by-Step Deployment Guide

### Clone the Repository
```bash
git clone https://github.com/nathydre21/wata-board.git /var/www/wata-board
cd /var/www/wata-board
```

### Backend Deployment
1. **Navigate to the dapp directory:**
   ```bash
   cd wata-board-dapp
   npm install
   ```
2. **Configure Environment:**
   ```bash
   cp .env.example .env
   nano .env
   ```
   *Ensure you set `NODE_ENV=production`, your `ALLOWED_ORIGINS`, database credentials, and production Stellar `RPC_URL`.*
3. **Build and Start:**
   ```bash
   npm run build
   pm2 start dist/server.js --name "wata-board-api"
   pm2 save
   pm2 startup
   ```

### Frontend Deployment
1. **Navigate to the frontend directory:**
   ```bash
   cd ../wata-board-frontend
   npm install
   ```
2. **Configure Environment:**
   ```bash
   cp .env.example .env
   nano .env
   ```
   *Ensure `VITE_API_URL` points to your production backend URL.*
3. **Build the Frontend:**
   ```bash
   npm run build
   ```
   *The optimized static files will be placed in the `dist/` folder.*

## 4. Security Configuration

### Nginx & SSL Setup
Please refer to the SSL Configuration Guide for automated SSL provisioning using Let's Encrypt.

To secure your application, configure Nginx to serve the built frontend files and proxy API requests to PM2:

1. Copy the provided Nginx configuration from the SSL guide.
2. Ensure HTTP to HTTPS redirection is active.
3. Enable Security Headers:
   - `Strict-Transport-Security` (HSTS)
   - `Content-Security-Policy` (CSP)
   - `X-Frame-Options`

### API Security
- **CORS Policies**: Set `ALLOWED_ORIGINS` strictly to your production frontend domain.
- **Rate Limiting**: Configured natively via the backend. Ensure Redis is secured and only accessible via localhost.
- **Secret Management**: Never commit your `.env` files. Ensure the `.env` permissions are locked down (`chmod 600 .env`).

## 5. Maintenance
- Monitor logs via `pm2 logs`.
- Implement database backups using `pg_dump` mapped to a daily cron job.