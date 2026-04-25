# Configuration Documentation

This document outlines all available configuration options for the Wata-Board application. Configuration is primarily managed through environment variables (`.env` files) for both the frontend and backend services.

## Frontend Configuration (`frontend/.env`)

The frontend application uses Vite and requires variables to be prefixed with `VITE_` to be exposed to the client.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_NETWORK` | Yes | `testnet` | The Stellar network to connect to. Options: `testnet`, `mainnet`. |
| `VITE_API_URL` | No | - | Backend API URL for production. In development, it relies on Vite's proxy. Example: `https://api.yourdomain.com` |
| `VITE_FRONTEND_URL` | No | - | Frontend URL for CORS. Example: `https://yourdomain.com` |
| `VITE_CONTRACT_ID_TESTNET` | Yes | `CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA` | The Wata-Board smart contract ID on the Stellar Testnet. |
| `VITE_CONTRACT_ID_MAINNET` | No | `MAINNET_CONTRACT_ID_HERE` | The Wata-Board smart contract ID on the Stellar Mainnet. |
| `VITE_RPC_URL_TESTNET` | Yes | `https://soroban-testnet.stellar.org` | RPC endpoint for the Stellar Testnet. |
| `VITE_RPC_URL_MAINNET` | No | `https://soroban.stellar.org` | RPC endpoint for the Stellar Mainnet. |
| `VITE_NETWORK_PASSPHRASE_TESTNET` | Yes | `Test SDF Network ; September 2015` | Passphrase for the Stellar Testnet. |
| `VITE_NETWORK_PASSPHRASE_MAINNET` | No | `Public Global Stellar Network ; September 2015` | Passphrase for the Stellar Mainnet. |
| `VITE_APP_NAME` | No | - | Optional application name for display purposes. |
| `VITE_APP_VERSION` | No | - | Optional application version string. |

## Backend Configuration (`backend/.env`)

The backend API server (Node.js/Express) uses environment variables for server settings, security, and Stellar network connections.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | The port the backend server will listen on. |
| `NODE_ENV` | No | `development` | The environment the server runs in (`development`, `production`). |
| `HTTPS_ENABLED` | No | `false` | Set to `true` to enable HTTPS in production. Requires SSL variables. |
| `SSL_KEY_PATH` | If `HTTPS` | - | Path to the SSL private key (e.g., `/etc/letsencrypt/live/.../privkey.pem`). |
| `SSL_CERT_PATH` | If `HTTPS` | - | Path to the SSL certificate (e.g., `/etc/letsencrypt/live/.../fullchain.pem`). |
| `SSL_CA_PATH` | If `HTTPS` | - | Path to the SSL CA chain (e.g., `/etc/letsencrypt/live/.../chain.pem`). |
| `ALLOWED_ORIGINS` | No | - | Comma-separated list of allowed CORS origins (e.g., `http://localhost:3000`). |
| `FRONTEND_URL` | No | - | Frontend URL for production deployment references. |
| `NETWORK` | Yes | `testnet` | The Stellar network to use (`testnet`, `mainnet`). |
| `ADMIN_SECRET_KEY` | Yes | - | The Stellar secret key for the admin account (controls the contract). **KEEP SECRET**. |
| `CONTRACT_ID_TESTNET` | Yes | `CDRRJ7...` | The smart contract ID for the Testnet. |
| `CONTRACT_ID_MAINNET` | No | `MAINNET_...` | The smart contract ID for the Mainnet. |
| `RPC_URL_TESTNET` | Yes | `https://soroban-testnet.stellar.org` | RPC endpoint for the Stellar Testnet. |
| `RPC_URL_MAINNET` | No | `https://soroban.stellar.org` | RPC endpoint for the Stellar Mainnet. |
| `NETWORK_PASSPHRASE_TESTNET` | Yes | `Test SDF Network ; September 2015` | Passphrase for the Stellar Testnet. |
| `NETWORK_PASSPHRASE_MAINNET` | No | `Public Global Stellar Network ; September 2015` | Passphrase for the Stellar Mainnet. |

## Docker Compose Configuration (`docker-compose.prod.yml`)

When deploying using Docker Compose, the following additional environment variables can be provided:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GRAFANA_PASSWORD` | No | - | Sets the admin password for the optional Grafana monitoring dashboard. |

Most other Docker compose variables map directly to the backend/frontend variables listed above, and can be overridden by placing them in an `.env` file at the root of the project where `docker-compose.prod.yml` is run, or passing them via the shell.

## Network Switching Logic

Both frontend and backend are designed to seamlessly switch between networks (Testnet and Mainnet). 
- In the frontend, setting `VITE_NETWORK` dictates which variables are actively used (e.g., if `VITE_NETWORK=testnet`, it will use `VITE_CONTRACT_ID_TESTNET`).
- In the backend, setting `NETWORK` behaves the same way for `CONTRACT_ID`, `RPC_URL`, and `NETWORK_PASSPHRASE`.
