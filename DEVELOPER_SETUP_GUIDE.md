# Developer Setup Guide

This comprehensive guide will help you set up the Wata-Board development environment from scratch. Wata-Board is a decentralized utility payment platform built on Stellar/Soroban blockchain that enables users to pay utility bills using cryptocurrency.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Overview](#project-overview)
3. [Installation](#installation)
4. [Environment Configuration](#environment-configuration)
5. [Running the Application](#running-the-application)
6. [Development Workflow](#development-workflow)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Setup](#advanced-setup)

## Prerequisites

### Required Software

- **Node.js** (LTS recommended, v18+)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version` (should show v18+)
- **npm** (comes with Node.js, v8+ recommended)
  - Verify: `npm --version`
  - Note: yarn is not recommended due to dependency resolution issues
- **Git**
  - Download from [git-scm.com](https://git-scm.com/)
  - Verify: `git --version`

### Blockchain Requirements

- **Freighter Wallet** browser extension
  - Install from [Chrome Web Store](https://chrome.google.com/webstore/detail/freighter/lnibgjofphfkmjmdchdmpbgcbdepbano) or [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/freighter/)
  - Required for frontend blockchain interactions
- **Stellar Account** with testnet XLM
  - Create account using Freighter or [Stellar Laboratory](https://laboratory.stellar.org/)
  - Get testnet XLM from [Stellar Testnet Faucet](https://faucet.stellar.org/)

### Optional Tools

- **Docker** and **Docker Compose** (for containerized development)
- **PostgreSQL** client tools (for database management)
- **VS Code** with recommended extensions

## Project Overview

### Architecture

```
wata-board/
├── frontend/          # React + TypeScript + Vite frontend
├── backend/           # Node.js + Express backend API
├── contract/          # Smart contract and client libraries
├── database/          # Database schema and migrations
├── scripts/           # Deployment and utility scripts
└── docs/             # Documentation
```

### Technology Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **Backend**: Node.js, Express, TypeScript, PostgreSQL
- **Blockchain**: Stellar Soroban Smart Contracts
- **Testing**: Playwright (E2E), Vitest (Unit), Jest (Backend)
- **Development**: ESLint, TypeScript, Docker

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Kami-no-san/wata-board.git
cd wata-board
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install --legacy-peer-deps
```

**Note**: The project uses React 19 which may have peer dependency conflicts with some testing libraries. The `--legacy-peer-deps` flag resolves these issues.

### 3. Install Backend Dependencies

```bash
cd ../backend
npm install
```

### 4. Verify Installation

```bash
# Frontend
cd frontend
npm run --version  # Should show package scripts

# Backend  
cd ../backend
npm run --version  # Should show package scripts
```

## Environment Configuration

### Frontend Environment Setup

1. **Create environment file**:
```bash
cd frontend
cp .env.example .env
```

2. **Configure frontend variables**:
```bash
# Network Configuration (testnet is recommended for development)
VITE_NETWORK=testnet

# API Configuration (optional for development)
VITE_API_URL=http://localhost:3001
VITE_FRONTEND_URL=http://localhost:5173

# Stellar Contract Configuration
VITE_CONTRACT_ID_TESTNET=CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA
VITE_RPC_URL_TESTNET=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE_TESTNET="Test SDF Network ; September 2015"
```

### Backend Environment Setup

1. **Create environment file**:
```bash
cd backend
cp .env.example .env
```

2. **Configure backend variables**:
```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# Network Configuration
NETWORK=testnet

# Stellar Configuration (IMPORTANT: Use your actual secret key)
ADMIN_SECRET_KEY=your_stellar_secret_key_here
CONTRACT_ID_TESTNET=CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA
RPC_URL_TESTNET=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE_TESTNET="Test SDF Network ; September 2015"

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Database Setup (Optional)

The application can run without a database for basic functionality. For full features:

1. **Install PostgreSQL** (if not already installed)
2. **Create database**:
```sql
CREATE DATABASE wataboard;
CREATE USER wataboard WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE wataboard TO wataboard;
```

3. **Add database variables to backend/.env**:
```bash
DATABASE_URL=postgresql://wataboard:your_password@localhost:5432/wataboard
```

## Running the Application

### Option 1: Development Mode (Recommended)

1. **Start the backend**:
```bash
cd backend
npm run dev
```
Backend will run on `http://localhost:3001`

2. **Start the frontend** (in a new terminal):
```bash
cd frontend
npm run dev
```
Frontend will run on `http://localhost:5173`

3. **Verify setup**:
- Open `http://localhost:5173` in your browser
- Ensure Freighter wallet is installed and unlocked
- Check that the backend API is accessible at `http://localhost:3001`

### Option 2: Docker Development

1. **Build and run with Docker Compose**:
```bash
docker-compose -f docker-compose.prod.yml up --build
```

2. **Access the application**:
- Frontend: `http://localhost:80` (via Nginx)
- Backend: `http://localhost:3001`

## Development Workflow

### Code Quality Tools

1. **Linting**:
```bash
# Frontend
cd frontend
npm run lint

# Backend
cd backend
npm run lint  # if configured
```

2. **Type Checking**:
```bash
# Frontend
cd frontend
npx tsc --noEmit

# Backend
cd backend
npx tsc --noEmit
```

### Making Changes

1. **Frontend Changes**:
- Edit files in `frontend/src/`
- Hot reload is enabled - changes appear automatically
- Use React DevTools for debugging

2. **Backend Changes**:
- Edit files in `backend/src/`
- Server auto-restarts with `npm run dev`
- Check backend logs for API requests

3. **Smart Contract Changes**:
- Contract files are in `contract/`
- Requires redeployment for changes
- Test on testnet before mainnet

### Git Workflow

1. **Create feature branch**:
```bash
git checkout -b feature/your-feature-name
```

2. **Commit changes**:
```bash
git add .
git commit -m "feat: add your feature description"
```

3. **Push and create PR**:
```bash
git push origin feature/your-feature-name
```

## Testing

### Frontend Testing

1. **Unit Tests**:
```bash
cd frontend
npm run test:unit
```

2. **E2E Tests**:
```bash
cd frontend
npm run test
```

3. **Test Coverage**:
```bash
cd frontend
npm run test:coverage
```

### Backend Testing

1. **Unit Tests**:
```bash
cd backend
npm test
```

2. **Integration Tests**:
```bash
cd backend
npm run test:integration  # if configured
```

3. **Load Testing**:
```bash
cd backend
npm run test:load
```

### Manual Testing Checklist

- [ ] Frontend loads without errors
- [ ] Backend API responds correctly
- [ ] Freighter wallet connects
- [ ] Testnet transactions work
- [ ] Environment variables are properly loaded
- [ ] CORS configuration works
- [ ] Database operations (if configured)

## Troubleshooting

### Common Issues

#### 1. "Cannot find module" errors
```bash
# Solution: Clean and reinstall dependencies
# On Unix/Linux/macOS
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps

# On Windows
rmdir /s node_modules
del package-lock.json
npm install --legacy-peer-deps
```

#### 2. Freighter not connecting
- Ensure Freighter extension is installed and enabled
- Set Freighter network to "Testnet"
- Refresh the page after connecting
- Check browser console for errors

#### 3. Transaction failures
- Verify you have testnet XLM in your account
- Check contract ID is correct in environment variables
- Ensure meter_id is a valid string format
- Check network connectivity to Stellar

#### 4. CORS errors
- Verify `ALLOWED_ORIGINS` in backend/.env includes your frontend URL
- Check that both frontend and backend are running
- Ensure environment variables are loaded correctly

#### 5. Port conflicts
```bash
# Check what's using port 3001
# On Unix/Linux/macOS
netstat -an | grep 3001
lsof -i :3001

# On Windows
netstat -ano | findstr 3001

# Kill process if needed (replace PID)
# On Unix/Linux/macOS
kill -9 PID

# On Windows
taskkill /PID PID /F
```

#### 6. Environment variable issues
```bash
# Verify variables are loaded
cd backend
npx ts-node -e "console.log(process.env)"

cd frontend  
npx vite --debug
```

#### 7. Dependency Resolution Issues
```bash
# If you encounter peer dependency conflicts with React 19
npm install --legacy-peer-deps

# If installation fails due to network issues
npm cache clean --force
npm install --legacy-peer-deps

# If specific packages cause issues
npm install package-name --legacy-peer-deps
```

### Getting Help

1. **Check logs**:
   - Frontend: Browser console and terminal output
   - Backend: Terminal output and log files

2. **Verify configuration**:
   - Environment variables in both frontend and backend
   - Network settings in Freighter
   - Contract IDs and RPC URLs

3. **Community resources**:
   - GitHub Issues: [Create new issue](https://github.com/Kami-no-san/wata-board/issues)
   - Stellar Documentation: [stellar.org](https://stellar.org/developers)
   - Soroban Documentation: [soroban.stellar.org](https://soroban.stellar.org/)

## Advanced Setup

### SSL/HTTPS Configuration

For production deployments with SSL:

1. **Generate SSL certificates**:
```bash
sudo chmod +x scripts/ssl-setup.sh
sudo ./scripts/ssl-setup.sh
```

2. **Update environment variables**:
```bash
# Backend (.env)
HTTPS_ENABLED=true
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem

# Frontend (.env)
VITE_API_URL=https://api.yourdomain.com
VITE_FRONTEND_URL=https://yourdomain.com
```

### Production Deployment

1. **Build frontend**:
```bash
cd frontend
npm run build
```

2. **Build backend**:
```bash
cd backend
npm run build
```

3. **Deploy with Docker**:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Database Migrations

If using PostgreSQL:

1. **Run migrations**:
```bash
cd backend
npm run migrate
```

2. **Check migration status**:
```bash
npm run migrate:status
```

### Monitoring and Logging

The application includes comprehensive logging:

- **Frontend**: Browser console and error tracking
- **Backend**: Winston logging with file rotation
- **Database**: Query logging and performance metrics

## Security Best Practices

### Environment Security

- Never commit `.env` files with real secrets
- Use different keys for development and production
- Rotate secret keys regularly
- Use secure key management for production

### Blockchain Security

- Test thoroughly on testnet before mainnet
- Use separate admin keys for different networks
- Verify contract addresses before transactions
- Monitor for suspicious activity

### Application Security

- Keep dependencies updated
- Use HTTPS in production
- Implement proper CORS policies
- Validate all user inputs

## Next Steps

Once your development environment is set up:

1. **Explore the codebase**:
   - Read `frontend/src/App.tsx` for main UI logic
   - Check `backend/src/server.ts` for API structure
   - Review `contract/` for smart contract code

2. **Make your first changes**:
   - Try modifying the UI
   - Add a new API endpoint
   - Test a smart contract interaction

3. **Contribute back**:
   - Fix any issues you find
   - Improve documentation
   - Submit pull requests

## Support

If you encounter issues during setup:

1. Check this guide first
2. Search existing GitHub issues
3. Create a new issue with details about your setup
4. Include error messages and environment details

Happy coding! 🚀
