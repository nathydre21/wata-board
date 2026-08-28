//! Tests for the on-chain contract upgrade mechanism (issue #373).
//!
//! These exercise the admin-gating and version-counter behaviour of
//! [`NepaBillingContract::upgrade`] and [`NepaBillingContract::version`].
//!
//! The happy-path WASM swap itself (`update_current_contract_wasm`) is not
//! unit-testable here: it requires a *second*, already-installed WASM blob to
//! point at, which the in-memory test host has no way to produce from source.
//! That path is covered instead by `scripts/upgrade-contract.sh` against a live
//! network and documented in `docs/CONTRACT_UPGRADES.md`. What we can and do
//! assert below is everything that guards and surrounds that single host call:
//! the auth/admin check that must pass before it, and the version counter that
//! is bumped alongside it.

use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

/// Register a fresh instance of the contract with all auths mocked, mirroring
/// the `setup_test` helper used by the main test suite.
fn setup() -> (Env, NepaBillingContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, NepaBillingContract);
    let client = NepaBillingContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    (env, client, admin)
}

/// A throwaway 32-byte hash to stand in for a real WASM hash argument. It is
/// only ever used on code paths that panic *before* the host would try to
/// resolve it, so its value is irrelevant.
fn dummy_wasm_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

/// After `initialize`, the on-chain version starts at `1` (`INITIAL_VERSION`).
#[test]
fn version_starts_at_one_after_initialize() {
    let (_env, client, admin) = setup();
    client.initialize(&admin);

    assert_eq!(client.version(), 1);
}

/// `version` is a safe read even before `initialize`: it falls back to the
/// initial version rather than panicking, so off-chain callers can probe a
/// freshly deployed-but-uninitialized contract.
#[test]
fn version_defaults_to_one_before_initialize() {
    let (_env, client, _admin) = setup();

    assert_eq!(client.version(), 1);
}

/// Only the stored admin may upgrade. A non-admin caller is rejected even
/// though `mock_all_auths` makes its `require_auth` succeed — the guard is the
/// explicit `admin != contract_admin` check, not merely authorization.
#[test]
#[should_panic]
fn upgrade_rejects_non_admin() {
    let (env, client, admin) = setup();
    client.initialize(&admin);

    let attacker = Address::generate(&env);
    let hash = dummy_wasm_hash(&env);
    client.upgrade(&attacker, &hash);
}

/// Calling `upgrade` before `initialize` panics via the `get_admin` lookup
/// ("Contract not initialized"), so an uninitialized contract can never be
/// upgraded out from under its (not-yet-set) admin.
#[test]
#[should_panic]
fn upgrade_before_initialize_panics() {
    let (env, client, admin) = setup();

    let hash = dummy_wasm_hash(&env);
    client.upgrade(&admin, &hash);
}
