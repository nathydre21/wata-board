# Wata-Board Project

A decentralized utility payment platform built on **Stellar/Soroban** blockchain. This project enables users to pay utility bills (water, electricity) using cryptocurrency.

## Project Structure

```
wata-board/
├── wata-board-dapp/          # Node.js backend dapp
│   ├── src/index.ts          # Main payment processing script
│   └── packages/             # Contract client libraries
│       ├── nepa_client/      # Original client
│       └── nepa_client_v2/   # Updated client (v2)
│
└── wata-board-frontend/      # React + TypeScript + Vite frontend
    ├── src/
    │   ├── App.tsx           # Main payment UI
    │   └── contracts/        # Frontend contract bindings
    └── ...
```

## Quick Start

### Prerequisites

- **Node.js** (LTS recommended, v18+)
- **npm** or **yarn**
- **Freighter Wallet** browser extension (for frontend)
- Stellar account with testnet XLM

### 1. Install Dependencies

```bash
# Install frontend dependencies
cd wata-board-frontend
npm install

# Install dapp dependencies  
cd ../wata-board-dapp
npm install
```

### 2. Configure Environment Variables

```bash
# Setup frontend environment
cd wata-board-frontend
cp .env.example .env

# Setup backend environment
cd ../wata-board-dapp
cp .env.example .env
```

Edit the `.env` files with your actual values. See the [Environment Variables](#environment-variables) section for detailed instructions.

### 3. Run Frontend (Development)

```bash
cd wata-board-frontend
npm run dev
```

Open the URL shown (usually `http://localhost:5173`)

### 4. Run Dapp (Backend)

```bash
cd wata-board-dapp
npx ts-node src/index.ts
```

## Smart Contract

- **Contract ID**: `CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA`
- **Network**: Stellar Testnet
- **RPC URL**: `https://soroban-testnet.stellar.org`

### Contract Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| `pay_bill` | Record a utility payment | `meter_id` (string), `amount` (u32) |
| `get_total_paid` | Get total paid for a meter | `meter_id` (string) |

## Environment Variables

The project uses environment variables to manage configuration. Template files are provided for both frontend and backend components.

### Setup Instructions

1. **Frontend Environment Setup**:
   ```bash
   cd wata-board-frontend
   cp .env.example .env
   ```
   Edit `.env` with your configuration:
   ```bash
   VITE_CONTRACT_ID=CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA
   VITE_RPC_URL=https://soroban-testnet.stellar.org
   ```

2. **Backend Environment Setup**:
   ```bash
   cd wata-board-dapp
   cp .env.example .env
   ```
   Edit `.env` with your configuration:
   ```bash
   ADMIN_SECRET_KEY=your_stellar_secret_key_here
   CONTRACT_ID=CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA
   RPC_URL=https://soroban-testnet.stellar.org
   ```

### Required Variables

#### Frontend (.env)
- `VITE_CONTRACT_ID`: Stellar contract ID for the Wata Board smart contract
- `VITE_RPC_URL`: RPC endpoint for Stellar Soroban network connection

#### Backend (.env)
- `ADMIN_SECRET_KEY`: Stellar secret key for admin account (controls contract access)
- `CONTRACT_ID`: Stellar contract ID for the Wata Board smart contract  
- `RPC_URL`: RPC endpoint for Stellar Soroban network connection

⚠️ **Security**: Never commit `.env` files with real keys to git! Use `.env.example` as a template and create your own `.env` file.

## Testing

```bash
# Frontend tests
cd wata-board-frontend
npm run test

# Dapp tests  
cd wata-board-dapp
npm test
```

## Build for Production

```bash
# Build frontend
cd wata-board-frontend
npm run build

# Output will be in dist/ folder
```

## Security

### Environment Variable Management

This project uses environment variables to manage sensitive configuration data like secret keys. The following security measures have been implemented:

- ✅ **No hardcoded secrets**: All secret keys are loaded from environment variables
- ✅ **Environment validation**: The application validates that required environment variables are set
- ✅ **Git protection**: `.env` files are excluded from version control via `.gitignore`
- ✅ **Template provided**: `.env.example` shows required variables without exposing actual secrets

### Setup Instructions

1. Copy the environment template:
   ```bash
   cp wata-board-dapp/.env.example wata-board-dapp/.env
   ```

2. Edit `.env` with your actual secret key:
   ```bash
   ADMIN_SECRET_KEY=your_actual_stellar_secret_key_here
   ```

3. Ensure `.env` is never committed to git (automatically handled by `.gitignore`)

⚠️ **Critical**: Never share your secret key or commit it to version control. Anyone with access to the secret key can control administrative functions of the smart contract.

## CI/CD Pipeline

The project includes GitHub Actions workflows for:
- **Lint & Type Check**: Validates code quality
- **Build**: Ensures production builds succeed
- **Test**: Runs test suite

See `.github/workflows/` for configuration.

## Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| Dev server | `npm run dev` | Start Vite dev server |
| Build | `npm run build` | Create production build |
| Lint | `npm run lint` | Run ESLint |
| Preview | `npm run preview` | Preview production build |

## Troubleshooting

### Common Issues

1. **"Cannot find module" errors**
   - Run `npm install` in the correct directory
   - Check that `packages/` symlink exists if needed

2. **Freighter not connecting**
   - Ensure Freighter extension is installed
   - Set Freighter network to "Testnet"
   - Refresh the page after connecting

3. **Transaction failures**
   - Verify you have testnet XLM in your account
   - Check contract ID is correct
   - Ensure meter_id is a valid string

## Network Configuration

The application supports both **Testnet** and **Mainnet** environments with flexible network switching capabilities.

### Supported Networks

| Network | Passphrase | RPC URL |
|---------|------------|---------|
| Testnet | Test SDF Network ; September 2015 | https://soroban-testnet.stellar.org |
| Mainnet | Public Global Stellar Network ; September 2015 | https://soroban.stellar.org |

### Network Switching Features

- **Environment-based configuration**: Set network via environment variables
- **Development UI switching**: Switch between networks in development mode
- **Automatic contract selection**: Different contract IDs for each network
- **Clear network indication**: Visual indicators show current network
- **Safe mainnet handling**: Warnings and protections for mainnet usage

### Frontend Network Configuration

#### Environment Variables

```bash
# Network selection (required)
VITE_NETWORK=testnet  # Options: testnet, mainnet

# Network-specific configurations (auto-selected based on VITE_NETWORK)
VITE_CONTRACT_ID_TESTNET=CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA
VITE_CONTRACT_ID_MAINNET=MAINNET_CONTRACT_ID_HERE

VITE_RPC_URL_TESTNET=https://soroban-testnet.stellar.org
VITE_RPC_URL_MAINNET=https://soroban.stellar.org

VITE_NETWORK_PASSPHRASE_TESTNET="Test SDF Network ; September 2015"
VITE_NETWORK_PASSPHRASE_MAINNET="Public Global Stellar Network ; September 2015"
```

#### Development Network Switching

In development mode, a network switcher is available in the navigation bar:

- **Testnet**: Blue indicator, safe for testing
- **Mainnet**: Orange indicator with warning, requires caution

**Note**: Network changes in development require restarting the dev server.

### Backend Network Configuration

#### Environment Variables

```bash
# Network selection (required)
NETWORK=testnet  # Options: testnet, mainnet

# Network-specific configurations (auto-selected based on NETWORK)
CONTRACT_ID_TESTNET=CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA
CONTRACT_ID_MAINNET=MAINNET_CONTRACT_ID_HERE

RPC_URL_TESTNET=https://soroban-testnet.stellar.org
RPC_URL_MAINNET=https://soroban.stellar.org

NETWORK_PASSPHRASE_TESTNET="Test SDF Network ; September 2015"
NETWORK_PASSPHRASE_MAINNET="Public Global Stellar Network ; September 2015"

# Admin credentials (required for both networks)
ADMIN_SECRET_KEY=your_stellar_secret_key_here
```

### Setup Instructions

#### 1. Frontend Setup

```bash
cd wata-board-frontend
cp .env.example .env
# Edit .env with your network preferences
npm install
npm run dev
```

#### 2. Backend Setup

```bash
cd wata-board-dapp
cp .env.example .env
# Edit .env with your network preferences and admin key
npm install
npx ts-node src/index.ts
```

### Network Switching Workflow

#### For Testing Across Networks

1. **Testnet Development** (Default):
   ```bash
   VITE_NETWORK=testnet  # Frontend
   NETWORK=testnet        # Backend
   ```

2. **Mainnet Testing** (Caution):
   ```bash
   VITE_NETWORK=mainnet  # Frontend
   NETWORK=mainnet        # Backend
   ```

#### Deployment Considerations

- **Testnet Deployment**: Safe for testing and staging
- **Mainnet Deployment**: Requires:
  - Mainnet contract deployment
  - Updated `MAINNET_CONTRACT_ID_HERE` placeholder
  - Thorough testing on testnet first
  - Proper admin key management

### Contract IDs by Network

- **Testnet**: `CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA`
- **Mainnet**: `MAINNET_CONTRACT_ID_HERE` (Replace with actual mainnet contract ID)

### Security Notes

⚠️ **Mainnet Safety**:
- Always test thoroughly on testnet first
- Use separate admin keys for mainnet
- Double-check network configuration before mainnet operations
- Mainnet transactions involve real XLM

✅ **Testnet Benefits**:
- Free test XLM from faucets
- Safe environment for testing
- No financial risk
- Full feature parity with mainnet

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Submit a pull request

## License

ISC
