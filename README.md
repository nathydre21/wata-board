# Wata Board - Blockchain-Powered Utility Payment Platform

![Wata Board](https://img.shields.io/badge/Wata-Board-blue?style=flat-square)
![Stellar Blockchain](https://img.shields.io/badge/Stellar-Blockchain-lightblue?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-20-green?style=flat-square)

## 🌍 Overview

**Wata Board** is a cutting-edge blockchain-based utility payment platform that enables users to pay electricity, water, and gas bills using cryptocurrency, specifically leveraging the **Stellar blockchain** for secure, transparent, and efficient transactions. The platform provides comprehensive meter management, payment processing, scheduled payments, and real-time analytics for both utility consumers and providers.

### Core Vision
Democratize access to utility payment services by eliminating geographical barriers and providing a secure, trustless payment infrastructure powered by blockchain technology.

---

## ✨ Key Features

### For Consumers
- 🔗 **Cryptocurrency Payments**: Pay utility bills directly using Stellar XLM or other digital assets
- 📊 **Real-time Meter Management**: Monitor consumption across multiple meters and properties
- 📅 **Scheduled Payments**: Set up recurring automatic payments for consistent billing cycles
- 💳 **Multiple Payment Options**: Direct wallet payments with Freighter integration
- 📱 **Offline Support**: Progressive Web App with service worker for offline functionality
- 🌐 **Multi-Language Support**: Internationalization support for global accessibility
- 📈 **Usage Analytics**: Detailed consumption reports and trends with PDF export
- 🔐 **Security**: KYC verification, AML checks, and secure wallet integration
- 🔔 **Notifications**: Email and push notifications for payment confirmations and alerts

### For Providers
- 💰 **Multi-Provider Support**: Manage multiple utility providers from a single platform
- 📋 **KYC/AML Integration**: Compliance-ready identity verification
- 💹 **Rate Limiting**: Tiered user restrictions for fraud prevention
- 📊 **Analytics Dashboard**: Monitor payments, user activity, and platform health
- 🔄 **Webhook Integration**: Real-time event notifications for payment confirmations
- 🛡️ **Security Audit Logging**: Comprehensive audit trails for all transactions
- ⚡ **WebSocket Real-time Updates**: Live transaction status tracking

---

## 🏗️ Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React 19)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Meter Management │ Payment UI │ Analytics Dashboard │   │
│  │ Offline Support  │ Wallet Sync │ Real-time Updates  │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │  Nginx Proxy       │
        │  (SSL/HTTPS)       │
        └────────────────────┘
                 │
    ┌────────────┴───────────┐
    ▼                         ▼
┌─────────────────┐    ┌──────────────┐
│  Backend API    │    │  WebSocket   │
│  (Express.js)   │    │  Server      │
│                 │    │              │
│ • Payment Svc   │    │ • Real-time  │
│ • KYC/AML       │    │   Updates    │
│ • Rate Limits   │    │ • Status     │
│ • Migrations    │    │   Tracking   │
└────────┬────────┘    └──────────────┘
         │
    ┌────┴──────────────────┬──────────────┐
    ▼                       ▼              ▼
┌──────────────┐  ┌──────────────┐  ┌──────────┐
│ PostgreSQL   │  │ Redis Cache  │  │ Stellar  │
│ (Maindb)     │  │ (Rate Limit) │  │ Testnet  │
└──────────────┘  └──────────────┘  │ Mainnet  │
                                     └──────────┘
                                         │
                                         ▼
                                  ┌─────────────────┐
                                  │ Soroban Smart   │
                                  │ Contract (Rust) │
                                  └─────────────────┘
```

### Component Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | React 19 + TypeScript + Vite | User interface, wallet integration, meter management |
| **Backend API** | Express.js + TypeScript | Payment processing, user management, KYC/AML, analytics |
| **Real-time Layer** | WebSocket + Socket.io | Live transaction updates and status tracking |
| **Database** | PostgreSQL 16 | User data, meters, payments, transaction history |
| **Cache Layer** | Redis | Rate limiting, session caching, performance optimization |
| **Blockchain** | Stellar SDK + Soroban Contracts | Payment verification, on-chain settlement |
| **Infrastructure** | Docker + Docker Compose | Container orchestration and deployment |
| **Reverse Proxy** | Nginx | SSL termination, load balancing, security headers |

---

## 🛠️ Technology Stack

### Frontend Stack
```
React 19 + TypeScript + Vite
├── UI Framework: Tailwind CSS
├── State Management: Context API
├── Forms: React Hook Form
├── Data Fetching: Axios + React Query
├── Blockchain: Stellar SDK + Freighter Wallet
├── Testing: 
│   ├── Unit: Vitest
│   ├── E2E: Playwright
├── Build: Vite
├── Internationalization: i18next
└── Offline: Service Workers (PWA)
```

### Backend Stack
```
Node.js 20 + Express.js + TypeScript
├── Payment Processing: Payment Service + Accounting Service
├── Authentication: JWT + Wallet Verification
├── Database: PostgreSQL 16 + Knex.js Migrations
├── Caching: Redis (Rate Limiting)
├── Logging: Winston
├── Documentation: Swagger/OpenAPI
├── Testing: Jest + Supertest
├── Security: 
│   ├── Helmet.js
│   ├── CORS Management
│   ├── Rate Limiting (Tiered)
│   ├── KYC/AML Verification
│   └── Audit Logging
└── Real-time: WebSocket Support
```

### Blockchain Stack
```
Stellar Ecosystem
├── Network: Testnet + Mainnet
├── SDK: @stellar/stellar-sdk
├── Smart Contracts: Soroban (Rust/WASM)
├── Wallet Integration: Freighter
└── Type Generation: Stellar TypeScript SDK
```

### Infrastructure Stack
```
Docker + Docker Compose
├── Containers:
│   ├── Frontend (Node + Nginx)
│   ├── Backend (Node.js + Express)
│   ├── PostgreSQL (Database)
│   ├── Redis (Cache)
│   └── Nginx (Reverse Proxy)
├── Orchestration: Docker Compose
├── Monitoring: Health Checks
├── Backup: Automated PostgreSQL Backup
└── SSL/HTTPS: Certbot Integration
```

---

## 📋 Prerequisites

Before setting up Wata Board, ensure you have the following installed:

- **Node.js**: v20 or higher
- **npm**: v10 or higher
- **Docker**: v24 or higher
- **Docker Compose**: v2.20 or higher
- **PostgreSQL**: v15 or higher (for local development)
- **Redis**: v7 or higher (for local development, optional)
- **Rust**: Latest stable (for contract development)
- **Git**: Latest version

### Optional for Blockchain Development
- **Stellar CLI**: For contract deployment
- **Freighter Wallet Extension**: For testing blockchain features

---

## 🚀 Getting Started

### Quick Start (Docker Compose)

The fastest way to get started is using Docker Compose:

```bash
# Clone the repository
git clone https://github.com/nathydre21/wata-board.git
cd wata-board

# Copy environment file
cp .env.example .env

# Start all services
docker-compose up -d

# Run database migrations
docker-compose exec backend npm run migrate:latest

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
# Swagger Docs: http://localhost:3001/api-docs
```

### Local Development Setup

#### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm ci

# Create and configure environment file
cp .env.example .env

# Required environment variables:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=wata_board
# DB_USER=postgres
# DB_PASSWORD=your_password
# NODE_ENV=development
# STELLAR_NETWORK=testnet
# STELLAR_SECRET_KEY=your_secret_key
# RATE_LIMIT_ENABLED=true
# KYC_ENABLED=true
# REDIS_HOST=localhost
# REDIS_PORT=6379

# Start PostgreSQL (using Docker)
docker run -d \
  --name wata-postgres \
  -e POSTGRES_DB=wata_board \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16

# Run migrations
npm run migrate:latest

# Start Redis (optional, for caching)
docker run -d --name wata-redis -p 6379:6379 redis:7

# Build TypeScript
npm run build

# Start development server
npm run dev

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage
```

#### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm ci

# Create and configure environment file
cp .env.example .env

# Required environment variables:
# VITE_API_URL=http://localhost:3001
# VITE_STELLAR_NETWORK=testnet
# VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
# VITE_APP_NAME=Wata Board

# Start development server with hot reload
npm run dev

# Run unit tests
npm run test

# Run E2E tests
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Preview production build
npm run preview
```

#### 3. Smart Contract Setup

```bash
# Navigate to contract directory
cd contract

# Build contract (requires Rust)
stellar contract build

# Run contract tests
cargo test --verbose

# Check formatting
cargo fmt -- --check

# Run linter
cargo clippy -- -D warnings

# Deploy to testnet
stellar contract deploy \
  --wasm ./target/wasm32-unknown-unknown/release/wata_contract.wasm \
  --source your_testnet_account_secret
```

---

## 📁 Project Structure

```
wata-board/
│
├── frontend/                    # React SPA
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── context/            # Context providers
│   │   ├── services/           # API clients and blockchain services
│   │   ├── utils/              # Utility functions
│   │   ├── types/              # TypeScript type definitions
│   │   ├── i18n/               # Internationalization
│   │   └── assets/             # Images, icons, fonts
│   ├── tests/                  # E2E tests (Playwright)
│   ├── public/                 # Static files and manifest
│   ├── vite.config.ts          # Vite configuration
│   ├── tailwind.config.js       # Tailwind CSS configuration
│   ├── playwright.config.ts     # E2E test configuration
│   ├── vitest.config.ts         # Unit test configuration
│   └── package.json
│
├── backend/                     # Express.js API
│   ├── src/
│   │   ├── routes/             # API route handlers
│   │   ├── services/           # Business logic services
│   │   ├── middleware/         # Express middleware
│   │   ├── config/             # Configuration files
│   │   ├── types/              # TypeScript types
│   │   ├── utils/              # Utility functions
│   │   ├── migrations/         # Database migrations
│   │   ├── server.ts           # Express app initialization
│   │   └── index.ts            # Entry point
│   ├── __tests__/              # Test files
│   ├── jest.config.js          # Jest configuration
│   ├── tsconfig.json           # TypeScript configuration
│   └── package.json
│
├── contract/                    # Stellar Soroban Smart Contract
│   ├── src/
│   │   ├── lib.rs              # Main contract implementation
│   │   ├── test.rs             # Contract unit tests
│   │   └── multi_provider.rs    # Multi-provider logic
│   ├── Cargo.toml              # Rust dependencies
│   └── target/                 # Build artifacts
│
├── database/                    # Database schema and migrations
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_add_indexes_and_constraints.sql
│       ├── 003_add_scheduled_payments.sql
│       ├── 003_blockchain_integration.sql
│       └── 003_multi_provider_support.sql
│
├── shared/                      # Shared types and utilities
│   ├── network-config.ts        # Network configuration
│   ├── types.ts                 # Shared TypeScript types
│   └── src/                     # Shared utilities
│
├── scripts/                     # Deployment and utility scripts
│   ├── backup-postgres.sh       # Database backup script
│   ├── restore-postgres.sh      # Database restore script
│   ├── deploy-ssl.sh            # SSL certificate setup
│   ├── ssl-setup.sh             # SSL configuration
│   └── deploy-cdn.sh            # CDN deployment
│
├── security-tests/              # Security testing suite
│   ├── tests/
│   │   ├── owasp/               # OWASP security tests
│   │   └── penetration/         # Penetration testing scripts
│   └── scripts/                 # Security scanning scripts
│
├── .github/
│   └── workflows/               # GitHub Actions CI/CD
│       ├── backend-tests.yml    # Backend test workflow (DISABLED)
│       ├── comprehensive-tests.yml
│       ├── coverage-report.yml  # Coverage generation (DISABLED)
│       └── test.yml             # Contract tests (DISABLED)
│
├── docker-compose.prod.yml      # Production compose file
├── docker-compose.yml           # Development compose file (if exists)
├── nginx.conf                   # Nginx reverse proxy configuration
├── .gitignore                   # Git ignore rules
├── .env.example                 # Example environment variables
└── README.md                    # This file
```

---

## 🔧 Configuration

### Environment Variables

#### Backend Environment Variables

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wata_board
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_SSL=false

# Server Configuration
NODE_ENV=development|production
PORT=3001
LOG_LEVEL=debug|info|warn|error

# Blockchain Configuration
STELLAR_NETWORK=testnet|mainnet
STELLAR_SECRET_KEY=your_secret_key
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_CONTRACT_ID=your_contract_id

# Security Configuration
KYC_ENABLED=true
AML_CHECKS_ENABLED=true
RATE_LIMIT_ENABLED=true
CORS_ORIGIN=http://localhost:3000

# Redis Configuration (Optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=noreply@wataboard.com

# External APIs
PAYMENT_WEBHOOK_URL=https://your-domain.com/webhooks/payments
KYC_PROVIDER_API_KEY=your_kyc_api_key
```

#### Frontend Environment Variables

```bash
# API Configuration
VITE_API_URL=http://localhost:3001
VITE_API_TIMEOUT=30000

# Blockchain Configuration
VITE_STELLAR_NETWORK=testnet|mainnet
VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_STELLAR_CONTRACT_ID=your_contract_id

# Application Configuration
VITE_APP_NAME=Wata Board
VITE_APP_VERSION=1.0.0
VITE_LOG_LEVEL=debug|info|warn|error

# Feature Flags
VITE_ENABLE_OFFLINE_MODE=true
VITE_ENABLE_SCHEDULED_PAYMENTS=true
VITE_ENABLE_ANALYTICS=true

# Wallet Configuration
VITE_FREIGHTER_ENABLED=true
```

---

## 📊 Database Schema

### Key Tables

```sql
-- Users and Authentication
users (id, wallet_address, email, kyc_status, tier_level)
user_sessions (id, user_id, token, expires_at)

-- Meters and Properties
meters (id, user_id, meter_code, property_address, meter_type)
meter_readings (id, meter_id, reading_date, reading_value, cost)

-- Payments
payments (id, user_id, meter_id, amount, status, tx_hash)
payment_cache (id, payment_id, cached_at, expires_at)
scheduled_payments (id, user_id, amount, frequency, next_payment_date)

-- Rate Limiting
rate_limits (id, user_id, tier_level, requests_per_minute, requests_per_hour)

-- Audit Logging
audit_logs (id, user_id, action, resource, timestamp, ip_address)

-- Analytics
payment_analytics (id, date, total_payments, total_amount, user_count)
```

---

## 🔐 Security Features

### Built-in Security Measures

- **Wallet Verification**: Cryptographic signature verification using Stellar SDK
- **KYC/AML Integration**: Know Your Customer and Anti-Money Laundering checks
- **Rate Limiting**: Tiered rate limits based on user tier level
- **CORS Configuration**: Strict cross-origin resource sharing policies
- **Helmet.js**: HTTP security headers for production
- **Input Validation**: Zod schema validation on all API endpoints
- **JWT Authentication**: Secure token-based authentication
- **Audit Logging**: Comprehensive logging of all critical operations
- **Password Security**: Bcrypt hashing with salt rounds
- **SQL Injection Prevention**: Parameterized queries and ORM usage
- **HTTPS/SSL**: Enforced in production environment
- **Replay Attack Prevention**: Nonce-based transaction signing

### Security Checklist

- [ ] Change default database credentials
- [ ] Generate strong JWT secret
- [ ] Enable KYC/AML verification in production
- [ ] Configure CORS for your domain
- [ ] Set up SSL certificates
- [ ] Enable HTTPS redirect
- [ ] Configure rate limiting tiers
- [ ] Implement Web Application Firewall (WAF)
- [ ] Set up monitoring and alerting
- [ ] Regular security audits
- [ ] Keep dependencies updated
- [ ] Enable audit logging

---

## 🧪 Testing

### Running Tests

#### Backend Tests
```bash
cd backend

# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm run test -- payment-service.test.ts

# Run migration tests
npm run test -- --config jest.config.migrations.js
```

#### Frontend Tests
```bash
cd frontend

# Run unit tests with Vitest
npm run test

# Run unit tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run E2E tests with Playwright
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run specific test
npx vitest run meter-management.test.ts
```

#### Smart Contract Tests
```bash
cd contract

# Run contract tests
cargo test --verbose

# Run specific test
cargo test test_payment_execution -- --nocapture

# Run with logging
RUST_LOG=debug cargo test
```

### Test Coverage

The project maintains comprehensive test coverage:
- **Backend**: Minimum 70% code coverage (enforced in CI)
- **Frontend**: Minimum 60% code coverage
- **Contract**: 100% function coverage for critical paths

### CI/CD Testing Note

⚠️ **All CI/CD tests are currently DISABLED** via `if: false` conditions in GitHub Actions workflows. To re-enable them, remove the `if: false` lines from:
- `.github/workflows/backend-tests.yml`
- `.github/workflows/comprehensive-tests.yml`
- `.github/workflows/coverage-report.yml`
- `.github/workflows/test.yml`

---

## 🚀 Deployment

### Docker Compose Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start services with production config
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Run migrations
docker-compose -f docker-compose.prod.yml exec backend npm run migrate:latest

# Stop services
docker-compose -f docker-compose.prod.yml down
```

### SSL/HTTPS Setup

```bash
# Run SSL setup script
./scripts/ssl-setup.sh --domain yourdomain.com --email admin@yourdomain.com

# This will:
# - Generate Let's Encrypt certificates
# - Configure Nginx for HTTPS
# - Set up automatic renewal
```

### Database Backup and Restore

```bash
# Backup PostgreSQL database
./scripts/backup-postgres.sh

# Restore from backup
./scripts/restore-postgres.sh backup-file-path.sql.gz

# Automated backups are configured in Docker Compose
```

### Horizontal Scaling

For production deployments handling high traffic:

```yaml
# docker-compose.prod.yml adjustments
services:
  backend:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

---

## 📈 Monitoring and Logging

### Application Logs

Logs are managed by Winston logger:
- **Location**: Docker logs via `docker-compose logs`
- **Format**: JSON structured logging
- **Levels**: debug, info, warn, error

### Health Checks

All services include health check endpoints:

```bash
# Backend API health
curl http://localhost:3001/health

# Database health
curl http://localhost:3001/health/db

# Redis health
curl http://localhost:3001/health/redis

# Blockchain network
curl http://localhost:3001/health/blockchain
```

### Monitoring Endpoints

- **Swagger API Docs**: `http://localhost:3001/api-docs`
- **Health Dashboard**: Built into backend
- **PostgreSQL Logs**: Docker logs
- **Nginx Access Logs**: Docker logs

---

## 🤝 Contributing

### Getting Started with Development

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and commit: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

### Code Style and Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Configuration in backend and frontend
- **Prettier**: Code formatting
- **Husky**: Git hooks for pre-commit linting
- **Conventional Commits**: Follow commit message convention

### Development Workflow

See [WORKFLOW.md](./WORKFLOW.md) for detailed development guidelines, branching strategy, and deployment procedures.

---

## 🐛 Troubleshooting

### Common Issues

#### PostgreSQL Connection Error
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs wata-postgres

# Verify credentials in .env
# Recreate container if needed
docker rm wata-postgres && docker run -d ...
```

#### Port Already in Use
```bash
# Find process using port
lsof -i :3001  # Backend
lsof -i :3000  # Frontend
lsof -i :5432  # PostgreSQL

# Kill process
kill -9 <PID>
```

#### Redis Connection Error
```bash
# Start Redis if not running
docker run -d --name wata-redis -p 6379:6379 redis:7

# Test connection
redis-cli ping
```

#### Stellar Network Issues
```bash
# Check network availability
curl https://horizon-testnet.stellar.org

# Verify contract ID in .env
# Check testnet faucet balance
stellar account info <YOUR_ACCOUNT_ID> --network testnet
```

### Debug Mode

Enable detailed logging:
```bash
# Backend
NODE_ENV=development LOG_LEVEL=debug npm run dev

# Frontend
VITE_LOG_LEVEL=debug npm run dev
```

---

## 📚 Additional Resources

### Documentation
- [Stellar Documentation](https://developers.stellar.org)
- [Soroban Smart Contracts Guide](https://developers.stellar.org/learn/fundamentals/soroban)
- [PostgreSQL 16 Docs](https://www.postgresql.org/docs/16/)
- [Express.js Guide](https://expressjs.com/)
- [React 19 Documentation](https://react.dev)

### Useful Links
- [Freighter Wallet](https://www.freighter.app/)
- [Stellar Testnet Faucet](https://laboratory.stellar.org)
- [Stellar Account Viewer](https://stellar.expert)
- [Docker Documentation](https://docs.docker.com/)

### Community
- [Stellar Developers Slack](https://stellar-public.slack.com)
- [Stellar Community Discord](https://discord.gg/stellar)
- [GitHub Issues](https://github.com/nathydre21/wata-board/issues)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📞 Support

For issues, questions, or suggestions:

1. **GitHub Issues**: [Report a bug or request a feature](https://github.com/nathydre21/wata-board/issues)
2. **Email**: support@wataboard.com
3. **Discord**: [Join our community](https://discord.gg/your-discord-link)

---

## 🙏 Acknowledgments

- **Stellar Foundation**: For the amazing blockchain infrastructure
- **Contributors**: All developers who have contributed to this project
- **Community**: For feedback and support

---

## 🗺️ Roadmap

### Upcoming Features
- [ ] Multi-currency support (USDC, EUR, etc.)
- [ ] Mobile native app (iOS/Android)
- [ ] Advanced analytics dashboard
- [ ] Integration with traditional payment gateways
- [ ] Automated bill aggregation
- [ ] AI-powered consumption prediction
- [ ] Community features and forums
- [ ] Governance token (DAO)

### Version 2.0 Goals
- Expanded blockchain network support (Polygon, Ethereum)
- Enhanced security with multi-signature wallets
- Advanced DeFi integrations
- Decentralized governance

---

**Made with ❤️ for sustainable utility access worldwide**

Last Updated: June 2026
