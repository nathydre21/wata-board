# Configuration Changelog

All configuration changes across the project are documented here.
Format: `[version] YYYY-MM-DD – component – description`

---

## [1.0.0] 2026-04-23 – all

Initial versioned configuration baseline.

### Backend (`backend/src/config/configVersion.ts`)
- Introduced `CONFIG_VERSION` constant and `CONFIG_CHANGELOG` registry
- Captured baseline keys: `PORT`, `NODE_ENV`, `HTTPS_ENABLED`, `NETWORK`,
  `CONTRACT_ID_TESTNET/MAINNET`, `RPC_URL_TESTNET/MAINNET`,
  `NETWORK_PASSPHRASE_TESTNET/MAINNET`, `ALLOWED_ORIGINS`, `FRONTEND_URL`,
  `ADMIN_SECRET_KEY` (presence-only), `API_KEY` (presence-only), `TIER_RATE_LIMITS`

### Backend (`backend/src/utils/configSnapshot.ts`)
- Added startup config snapshot capture with SHA-256 hash
- Diffs logged via Winston when hash changes between restarts
- Snapshot persisted to `logs/config-snapshot.json` (gitignored)
- Secrets are never written to the snapshot (replaced with `[SET]`/`[MISSING]`)

### Backend (`backend/src/routes/config.ts`)
- `GET /api/config/version` – public endpoint returning version + changelog
- `GET /api/config/snapshot` – API-key-protected endpoint returning live sanitised snapshot

### Frontend (`frontend/src/utils/configVersion.ts`)
- Introduced `FRONTEND_CONFIG_VERSION` constant
- `initFrontendConfigTracking()` called at app startup; warns in console on config drift
- Snapshot stored in `sessionStorage` for cross-reload comparison

---

## How to bump the version

1. Make your configuration change (add/remove/rename env var, change a default).
2. Increment `CONFIG_VERSION` in `backend/src/config/configVersion.ts`
   and `FRONTEND_CONFIG_VERSION` in `frontend/src/utils/configVersion.ts` as appropriate.
3. Add a new entry at the **top** of `CONFIG_CHANGELOG` in `configVersion.ts`.
4. Add a section to this file describing what changed and why.
5. Update `.env.example` files to reflect the new keys/defaults.
