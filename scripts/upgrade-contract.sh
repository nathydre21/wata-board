#!/bin/bash

# Contract Upgrade Script for Wata-Board (issue #373)
#
# Builds the current contract, uploads its WASM to the network, and invokes the
# admin-only `upgrade` entry point so the deployed contract swaps to the new
# bytecode *in place* — same contract id, same stored state (payments, refunds,
# reviews, admin, config), new code. Finally it reads back `version` to confirm
# the on-chain version counter advanced.
#
# Prerequisites:
#   - Stellar CLI installed          (https://developers.stellar.org/docs/tools/cli)
#   - An identity configured for the *current admin* of the target contract,
#     e.g.  `stellar keys generate admin`  or  `stellar keys add admin`
#
# Example:
#   scripts/upgrade-contract.sh \
#     --network testnet \
#     --contract-id CID... \
#     --source admin

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status()  { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_header()  { echo -e "${BLUE}[UPGRADE]${NC} $1"; }

# Configuration (defaults)
NETWORK="testnet"
CONTRACT_ID=""
SOURCE=""
WASM=""
CONTRACT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../contract" && pwd)"

usage() {
    cat <<'EOF'
Usage: upgrade-contract.sh --contract-id <id> --source <identity> [options]

Required:
  -c, --contract-id <id>    Contract id (C...) of the deployed contract to upgrade
  -s, --source <identity>   Stellar CLI identity of the contract's current admin
                            (this identity signs the upgrade transaction)

Options:
  -n, --network <name>      Network to target (default: testnet)
  -w, --wasm <path>         Use a prebuilt .wasm instead of building from source
  -h, --help                Show this help and exit

The admin *address* is derived from --source via `stellar keys address`, so the
signing identity must be the same account stored as the contract admin.
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -n|--network)     NETWORK="$2"; shift 2 ;;
        -c|--contract-id) CONTRACT_ID="$2"; shift 2 ;;
        -s|--source)      SOURCE="$2"; shift 2 ;;
        -w|--wasm)        WASM="$2"; shift 2 ;;
        -h|--help)        usage; exit 0 ;;
        *) print_error "Unknown argument: $1"; echo; usage; exit 1 ;;
    esac
done

# Validate
if ! command -v stellar >/dev/null 2>&1; then
    print_error "The 'stellar' CLI is not installed or not on PATH."
    print_error "Install it: https://developers.stellar.org/docs/tools/cli"
    exit 1
fi
if [[ -z "$CONTRACT_ID" ]]; then print_error "--contract-id is required"; echo; usage; exit 1; fi
if [[ -z "$SOURCE" ]];      then print_error "--source is required";      echo; usage; exit 1; fi

# Resolve the admin address from the signing identity.
print_header "Resolving admin address for identity '$SOURCE'..."
ADMIN_ADDRESS="$(stellar keys address "$SOURCE")"
print_status "Admin address: $ADMIN_ADDRESS"

# Build the contract unless a prebuilt WASM was supplied.
if [[ -z "$WASM" ]]; then
    print_header "Building contract in $CONTRACT_DIR ..."
    (cd "$CONTRACT_DIR" && stellar contract build)
    WASM="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/nepa_contract.wasm"
fi
if [[ ! -f "$WASM" ]]; then
    print_error "WASM not found at: $WASM"
    exit 1
fi
print_status "Using WASM: $WASM"

# Upload the new WASM; capture the returned 32-byte hash (hex).
print_header "Uploading WASM to '$NETWORK'..."
NEW_WASM_HASH="$(stellar contract upload \
    --wasm "$WASM" \
    --source "$SOURCE" \
    --network "$NETWORK")"
print_status "Uploaded. New WASM hash: $NEW_WASM_HASH"

# Read the current on-chain version (best-effort; non-fatal on failure).
print_header "Current on-chain version:"
if OLD_VERSION="$(stellar contract invoke \
        --id "$CONTRACT_ID" --source "$SOURCE" --network "$NETWORK" \
        -- version 2>/dev/null)"; then
    print_status "version() = $OLD_VERSION"
else
    print_warning "Could not read current version (continuing)."
fi

# Invoke the admin-only upgrade. This is the in-place code swap.
print_header "Invoking upgrade()..."
NEW_VERSION="$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- \
    upgrade \
    --admin "$ADMIN_ADDRESS" \
    --new_wasm_hash "$NEW_WASM_HASH")"
print_status "upgrade() returned new version: $NEW_VERSION"

# Confirm the swap took effect by reading version back.
print_header "Verifying new on-chain version..."
CONFIRM_VERSION="$(stellar contract invoke \
    --id "$CONTRACT_ID" --source "$SOURCE" --network "$NETWORK" \
    -- version)"
print_status "version() = $CONFIRM_VERSION"

if [[ "$CONFIRM_VERSION" == "$NEW_VERSION" ]]; then
    print_header "Upgrade complete. Contract $CONTRACT_ID is now at version $CONFIRM_VERSION."
else
    print_error "Version mismatch: upgrade returned $NEW_VERSION but version() reads $CONFIRM_VERSION."
    exit 1
fi
