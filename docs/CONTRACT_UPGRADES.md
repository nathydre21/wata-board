# Contract Upgrades

How the `NepaBillingContract` Soroban contract is upgraded in place, and how the
on-chain mechanism (issue #373) connects to the off-chain orchestration that
already lives in the backend.

## Overview

Soroban contracts are upgraded **in place**: a contract can replace its own
executable WASM while keeping its address and *all* persistent storage. There is
no EVM-style delegatecall proxy and no new address per version — the same
contract id keeps serving requests, only the bytecode behind it changes, from
the next invocation onward.

Two layers cooperate:

| Layer | Where | Responsibility |
| --- | --- | --- |
| **On-chain upgrade** | `contract/src/lib.rs` | The actual code swap (`upgrade`), a monotonic `version()` counter, and an `upgraded` event. Admin-gated. |
| **Off-chain orchestration** | `backend/src/services/contractUpgradeService.ts`, `contractProxy.ts` | Semver labelling, data snapshots, per-version migration steps, version history in the DB, and rollback bookkeeping. |

The on-chain layer is the source of truth for *what code is deployed*; the
off-chain layer adds process, auditing, and human-readable semver around it.

## On-chain API

Added to `NepaBillingContract` in `contract/src/lib.rs`:

### `upgrade(admin: Address, new_wasm_hash: BytesN<32>) -> u32`

Admin-only. Replaces the contract's WASM with the code identified by
`new_wasm_hash` (the 32-byte SHA-256 of a WASM blob that has already been
uploaded to the network), bumps the on-chain version counter, emits an event,
and returns the new version number.

Guarantees and guards, in order:

1. `admin.require_auth()` — the call must be authorized by `admin`.
2. `admin` must equal the stored contract admin, or it panics
   `"Only admin can upgrade"`. (Authorization alone is not enough; the identity
   must be *the* admin.)
3. The version counter is incremented and persisted **before** the swap, so it
   survives the code change.
4. A `("contract", "upgraded")` event is published with
   `(admin, old_version, new_version, new_wasm_hash)`.
5. `env.deployer().update_current_contract_wasm(new_wasm_hash)` performs the
   in-place swap.

Everything in persistent storage — payments, refunds, reviews, admin, refund
config, nonces — is preserved across the upgrade.

### `version() -> u32`

Read-only. Returns the current on-chain version, starting at `1` after
`initialize` and incremented by one on every successful `upgrade`. Safe to call
before initialization (returns the initial version `1` rather than panicking),
so a deployer can probe a freshly installed contract.

### The `upgraded` event

```
topics: ("contract", "upgraded")
data:   (admin: Address, old_version: u32, new_version: u32, new_wasm_hash: BytesN<32>)
```

The event is emitted *before* the code swap so an indexer observes it under the
still-known old code. Off-chain services (see below) subscribe to this to keep
their version history in sync with the chain.

## Upgrading with the helper script

`scripts/upgrade-contract.sh` performs the full flow: build → upload → invoke
`upgrade` → verify `version`.

```bash
scripts/upgrade-contract.sh \
  --network testnet \
  --contract-id C... \
  --source admin        # a `stellar keys` identity that IS the contract admin
```

Options:

- `--wasm <path>` — skip the build and upload a prebuilt `.wasm`.
- `--network <name>` — defaults to `testnet`.

The script derives the admin *address* from the signing identity with
`stellar keys address`, so the identity passed to `--source` must be the same
account stored as the contract admin — otherwise the on-chain guard rejects the
upgrade.

### Equivalent manual steps

```bash
# 1. Build the new WASM
cd contract && stellar contract build

# 2. Upload it and capture the returned hash
HASH=$(stellar contract upload \
  --wasm target/wasm32-unknown-unknown/release/nepa_contract.wasm \
  --source admin --network testnet)

# 3. Invoke the admin-only upgrade (in-place swap)
stellar contract invoke --id C... --source admin --network testnet -- \
  upgrade --admin $(stellar keys address admin) --new_wasm_hash "$HASH"

# 4. Confirm the new version
stellar contract invoke --id C... --source admin --network testnet -- version
```

## Off-chain integration

`ContractUpgradeService.upgradeContract()` runs a guarded pipeline: validate →
snapshot data → run migrations → `deployNewWasm()` → activate the new version in
`contractProxy` (with rollback on failure). The on-chain `upgrade` entry point is
what `deployNewWasm()` ultimately calls to make the swap real.

Reconciling the two version schemes:

- **On-chain** `version()` is a monotonic `u32` (1, 2, 3, …) — a simple, tamper-
  evident counter tied to the actual code swaps.
- **Off-chain** the service tracks human-readable **semver** (`1.0.0`, `1.1.0`)
  plus snapshots, migrations, and history in the DB.

Because the native upgrade keeps the **same contract id**, the proxy's
`newContractId` for an in-place upgrade is simply the existing id; the proxy
layer remains valuable for semver labelling, data snapshots, migration steps,
and rollback records even though the address does not change. An indexer maps
each on-chain `upgraded` event (with its `new_version` u32 and `new_wasm_hash`)
onto the corresponding off-chain semver entry.

## Rollback

The native mechanism has no implicit rollback — "rolling back" is just another
`upgrade` call whose `new_wasm_hash` points at a **previous** WASM. Keep the
hashes of known-good releases so a prior version can be re-applied quickly:

```bash
stellar contract invoke --id C... --source admin --network testnet -- \
  upgrade --admin $(stellar keys address admin) --new_wasm_hash "$PREVIOUS_HASH"
```

Note the on-chain `version()` counter still moves **forward** on a rollback (a
rollback to the code of v2 while at v5 produces v6 with v2's bytecode); the
counter records *how many upgrades happened*, not which code is live. The
off-chain history/semver layer is where the "this is a rollback to 1.1.0" intent
is recorded.

## Testing

Unit tests live in `contract/src/upgrade_test.rs`:

- `version_starts_at_one_after_initialize`
- `version_defaults_to_one_before_initialize`
- `upgrade_rejects_non_admin` (admin-gating)
- `upgrade_before_initialize_panics`

The happy-path WASM swap itself is **not** unit-testable in the in-memory host:
`update_current_contract_wasm` needs a second, already-installed WASM to point
at, which cannot be produced from source inside a unit test. That path is
exercised by `scripts/upgrade-contract.sh` against a live network instead.

> **Build note.** The committed `contract/Cargo.lock` currently pins
> `base64ct 1.8.3` (requires the unstable `edition2024` cargo feature) and
> `ethnum 1.5.0`, which do not build under the repository's pinned Rust
> toolchains. This is a pre-existing lockfile issue independent of this change
> (CI builds the contract with `continue-on-error`). The upgrade code was
> verified against the `soroban-sdk` 20.5.0 API by source inspection; once the
> lockfile is refreshed, `cargo test` will run the tests above.
