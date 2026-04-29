# Deployment Guide

This guide covers deploying Wata-Board to staging and production environments.
For local development setup see `DEVELOPER_SETUP_GUIDE.md`.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Overview](#2-environment-overview)
3. [Environment Variables](#3-environment-variables)
4. [Docker Compose Deployment](#4-docker-compose-deployment)
5. [SSL / TLS Setup](#5-ssl--tls-setup)
6. [Database Migrations](#6-database-migrations)
7. [Mainnet Deployment Checklist](#7-mainnet-deployment-checklist)
8. [CI/CD Pipeline](#8-cicd-pipeline)
9. [Monitoring & Alerting](#9-monitoring--alerting)
10. [Rollback Procedure](#10-rollback-procedure)
11. [Disaster Recovery](#11-disaster-recovery)

---

## 1. Prerequisites

| Tool | Minimum version | Purpose |
|------|----------------|---------|
| Docker | 24+ | Container runtime |
| Docker Compose | v2.20+ | Service orchestration |
| Node.js | 18 LTS | Build tooling |
| Rust + `cargo` | stable | Contract compilation |
| `stellar-cli` | latest | Contract deployment |
| PostgreSQL client | 16 | DB migrations / inspection |

---

## 2. Environment Overview

```
Internet
   │
   ▼
Nginx (443/80)  ──── Certbot (Let's Encrypt)
   │
   ├── Frontend (static files served by Nginx)
   │
   └── Backend API (:3001)
          │
          ├── PostgreSQL (:5432)
          ├── Redis (:6379)
          ├── Prometheus (:9090)
          └── Grafana (:3000)
```

Three deployment targets are supported:

| Target | Branch | Network | Notes |
|--------|--------|---------|-------|
| Development | any | testnet | `npm run dev` locally |
| Staging | `develop` | testnet | Docker Compose, no SSL required |
| Production | `main` | mainnet | Docker Compose + SSL + mainnet contract |

---

## 3. Environment Variables

### 3.1 Root `.env` (Docker Compose)

Create a `.env` file at the project root before running `docker-compose`:

```bash
# PostgreSQL
POSTGRES_DB=wataboard
POSTGRES_USER=wataboard
POSTGRES_PASSWORD=<strong-random-password>

# Redis
REDIS_PASSWORD=<strong-random-password>

# Grafana
GRAFANA_PASSWORD=<strong-random-password>

# Backup
BACKUP_ENCRYPTION_PASSPHRASE=<optional-gpg-passphrase>
BACKUP_S3_BUCKET=<optional-s3-bucket>
```

### 3.2 Backend `backend/.env`

Copy `backend/.env.example` and fill in:

```bash
NODE_ENV=production
PORT=3001
HTTPS_ENABLED=false          # Nginx handles TLS termination

# Stellar – choose testnet or mainnet
NETWORK=mainnet
CONTRACT_ID_MAINNET=<deployed-contract-id>
RPC_URL_MAINNET=https://soroban.stellar.org
NETWORK_PASSPHRASE_MAINNET=Public Global Stellar Network ; September 2015

ADMIN_SECRET_KEY=<stellar-secret-key>   # Never commit this

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=wataboard
DB_USER=wataboard
DB_PASSWORD=<same-as-POSTGRES_PASSWORD>
DB_SSL=false

# CORS
ALLOWED_ORIGINS=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

### 3.3 Frontend `frontend/.env`

```bash
VITE_NETWORK=mainnet
VITE_API_URL=https://api.yourdomain.com
VITE_FRONTEND_URL=https://yourdomain.com
VITE_CONTRACT_ID_MAINNET=<deployed-contract-id>
VITE_RPC_URL_MAINNET=https://soroban.stellar.org
VITE_NETWORK_PASSPHRASE_MAINNET=Public Global Stellar Network ; September 2015
```

---

## 4. Docker Compose Deployment

### 4.1 First-time setup

```bash
# 1. Clone and enter the repo
git clone https://github.com/nathydre21/wata-board.git
cd wata-board

# 2. Create environment files (see section 3)
cp backend/.env.example backend/.env
# Edit backend/.env with production values

# 3. Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# 4. Check all services are healthy
docker compose -f docker-compose.prod.yml ps
```

### 4.2 Updating a running deployment

```bash
# Pull latest code
git pull origin main

# Rebuild only changed services (zero-downtime for stateless services)
docker compose -f docker-compose.prod.yml up -d --build --no-deps backend frontend-build

# Verify
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 backend
```

### 4.3 Useful commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f backend

# Restart a single service
docker compose -f docker-compose.prod.yml restart backend

# Stop everything
docker compose -f docker-compose.prod.yml down

# Stop and remove volumes (destructive – deletes DB data)
docker compose -f docker-compose.prod.yml down -v
```

---

## 5. SSL / TLS Setup

SSL is handled by Certbot + Nginx inside the Docker Compose stack.

```bash
# 1. Point your domain's A record to the server IP

# 2. Start Nginx without SSL first (HTTP only) so Certbot can complete the challenge
docker compose -f docker-compose.prod.yml up -d nginx certbot

# 3. Obtain the certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d yourdomain.com -d www.yourdomain.com \
  --email admin@yourdomain.com --agree-tos --no-eff-email

# 4. Reload Nginx to pick up the certificate
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

Certificates auto-renew via the Certbot container's built-in cron. To force renewal:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

---

## 6. Database Migrations

Migrations run automatically on first start via the PostgreSQL `docker-entrypoint-initdb.d` hook.
For subsequent schema changes use the migration CLI:

```bash
# Check pending migrations
docker compose -f docker-compose.prod.yml exec backend npm run migrate:status

# Apply pending migrations
docker compose -f docker-compose.prod.yml exec backend npm run migrate:up

# Roll back the last migration (use with caution in production)
docker compose -f docker-compose.prod.yml exec backend npm run migrate:down
```

Always take a database backup before running migrations in production:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U wataboard wataboard > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## 7. Mainnet Deployment Checklist

Work through this list before every mainnet release.

### Contract

- [ ] Contract compiled with `cargo build --release --target wasm32-unknown-unknown`
- [ ] Contract tests pass: `cargo test` (includes `mainnet_tests` module)
- [ ] Contract deployed to mainnet via `stellar contract deploy`
- [ ] `CONTRACT_ID_MAINNET` updated in `backend/.env` and `frontend/.env`
- [ ] Admin key funded with sufficient XLM for contract invocations
- [ ] Read-only smoke test run against mainnet RPC (see `scripts/mainnet-smoke.sh`)

### Backend

- [ ] `NODE_ENV=production` set
- [ ] `NETWORK=mainnet` set
- [ ] `ADMIN_SECRET_KEY` is the mainnet key (not testnet)
- [ ] All secrets stored in a secrets manager or encrypted vault (not plain `.env` in repo)
- [ ] `npm audit` passes with no high/critical vulnerabilities
- [ ] Database migrations applied and verified
- [ ] Health endpoint returns `UP`: `curl https://api.yourdomain.com/health`

### Frontend

- [ ] `VITE_NETWORK=mainnet` set
- [ ] `VITE_CONTRACT_ID_MAINNET` matches deployed contract
- [ ] Production build succeeds: `npm run build`
- [ ] No `console.error` or unhandled promise rejections in browser console

### Infrastructure

- [ ] SSL certificate valid and auto-renewal configured
- [ ] Database backup running and last backup timestamp is recent
- [ ] Prometheus scraping backend metrics
- [ ] Grafana dashboards loading
- [ ] Alerting rules configured (see section 9)

---

## 8. CI/CD Pipeline

The GitHub Actions workflows in `.github/workflows/` run automatically:

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `comprehensive-tests.yml` | push to `main`/`develop`, PRs | Backend unit + integration tests, frontend build, contract tests |
| `backend-tests.yml` | push to `main`/`develop` | Backend tests with PostgreSQL service |
| `test.yml` | push | Contract-only Rust tests |
| `coverage-report.yml` | push to `main` | Coverage tracking via Codecov |

To deploy after CI passes:

```bash
# Staging (auto-deploys on merge to develop via CD step in comprehensive-tests.yml)
# Production (manual trigger or merge to main)
git checkout main
git merge develop
git push origin main
```

---

## 9. Monitoring & Alerting

### Prometheus

Prometheus scrapes the backend at `/metrics` every 15 seconds.
Access the Prometheus UI at `http://your-server:9090` (restrict access via firewall).

### Grafana

Grafana dashboards are available at `http://your-server:3000`.
Default credentials: `admin` / value of `GRAFANA_PASSWORD`.

Recommended dashboards to import (from grafana.com):
- Node.js / Express metrics: ID `11159`
- PostgreSQL: ID `9628`

### Key alerts to configure

| Alert | Condition | Severity |
|-------|-----------|----------|
| Backend down | `/health` returns non-200 for 2 min | Critical |
| High error rate | HTTP 5xx > 5% over 5 min | High |
| Slow responses | p95 latency > 2 s over 5 min | Medium |
| DB connection pool exhausted | pool usage > 90% | High |
| Disk space low | < 10 GB free | Medium |
| Backup stale | last backup > 25 h ago | High |

---

## 10. Rollback Procedure

### Application rollback

```bash
# Find the previous image tag or git SHA
git log --oneline -10

# Check out the previous release tag
git checkout v1.2.3

# Rebuild and redeploy
docker compose -f docker-compose.prod.yml up -d --build --no-deps backend frontend-build
```

### Database rollback

```bash
# Roll back the last migration
docker compose -f docker-compose.prod.yml exec backend npm run migrate:down

# Or restore from backup
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U wataboard wataboard < backup_20240101_120000.sql
```

---

## 11. Disaster Recovery

### Full server loss

1. Provision a new server with Docker and Docker Compose installed.
2. Restore the latest database backup:
   ```bash
   # Copy backup to new server, then:
   docker compose -f docker-compose.prod.yml up -d postgres
   docker compose -f docker-compose.prod.yml exec -T postgres \
     psql -U wataboard wataboard < latest_backup.sql
   ```
3. Restore environment files from your secrets manager.
4. Start all services: `docker compose -f docker-compose.prod.yml up -d --build`
5. Re-issue SSL certificate (section 5) if the IP/domain changed.
6. Verify health: `curl https://yourdomain.com/health`

### Corrupted database

1. Stop the backend to prevent further writes:
   ```bash
   docker compose -f docker-compose.prod.yml stop backend
   ```
2. Restore from the most recent clean backup (see above).
3. Replay any missed migrations if the backup predates the current schema.
4. Restart the backend and verify.

### Contract key compromise

1. Immediately pause the contract (if a pause function is available).
2. Generate a new Stellar keypair: `stellar keys generate new-admin`.
3. Transfer admin rights to the new key via the contract's `transfer_admin` function.
4. Update `ADMIN_SECRET_KEY` in the backend environment and redeploy.
5. Revoke the compromised key from all systems.
