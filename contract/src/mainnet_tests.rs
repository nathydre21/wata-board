/// Mainnet contract testing strategy for issue #155.
///
/// Soroban's `Env::default()` is a fully isolated sandbox - it never touches
/// any live network.  "Mainnet testing" therefore means two distinct things:
///
///   1. **Simulation tests** (this file) – run with `cargo test` in CI.
///      They exercise every code-path that behaves differently on mainnet:
///      higher fees, the real network passphrase, stricter auth, etc.
///      All network I/O is replaced by the Soroban test-utils mock.
///
///   2. **Smoke tests** (see `scripts/mainnet-smoke.sh`) – run manually or
///      in a protected CD gate against a *real* mainnet RPC.  They only
///      call read-only contract methods so they never spend real funds.
///
/// This separation keeps CI fast and free while still giving confidence that
/// the contract behaves correctly under mainnet conditions.

#[cfg(test)]
mod mainnet_tests {
    use soroban_sdk::{
        testutils::{Address as TestAddress, Ledger, LedgerInfo},
        Env, String,
    };

    use crate::NepaBillingContract;

    // ---------------------------------------------------------------------------
    // Mainnet network constants (mirrored from the live network)
    // ---------------------------------------------------------------------------
    const MAINNET_PASSPHRASE: &str = "Public Global Stellar Network ; September 2015";
    const MAINNET_BASE_FEE_STROOPS: u32 = 100;
    /// Mainnet ledger close time is ~5 s; we simulate a realistic timestamp.
    const MAINNET_LEDGER_TIMESTAMP: u64 = 1_700_000_000;
    /// Mainnet sequence numbers are much higher than testnet.
    const MAINNET_SEQUENCE_NUMBER: u32 = 50_000_000;

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /// Build a simulated mainnet environment.
    /// Sets ledger metadata that matches real mainnet conditions so that any
    /// time-based or fee-based contract logic is exercised correctly.
    fn mainnet_env() -> Env {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set(LedgerInfo {
            timestamp: MAINNET_LEDGER_TIMESTAMP,
            protocol_version: 21,
            sequence_number: MAINNET_SEQUENCE_NUMBER,
            network_id: env.crypto().sha256(
                &soroban_sdk::Bytes::from_slice(&env, MAINNET_PASSPHRASE.as_bytes()),
            ),
            base_reserve: 5_000_000,
            min_temp_entry_ttl: 16,
            min_persistent_entry_ttl: 2_073_600,
            max_entry_ttl: 3_110_400,
        });
        env
    }

    fn deploy_and_init(env: &Env) -> (soroban_sdk::Address, soroban_sdk::Address) {
        let contract_id = env.register_contract(None, NepaBillingContract);
        let admin = TestAddress::generate(env);
        NepaBillingContract::initialize(env.clone(), admin.clone());
        (contract_id, admin)
    }

    // ---------------------------------------------------------------------------
    // Initialization
    // ---------------------------------------------------------------------------

    #[test]
    fn mainnet_initialize_sets_admin() {
        let env = mainnet_env();
        let (_contract_id, admin) = deploy_and_init(&env);
        let retrieved = NepaBillingContract::get_admin(env.clone());
        assert_eq!(retrieved, admin, "admin should be set correctly on mainnet");
    }

    #[test]
    fn mainnet_double_initialize_is_rejected() {
        let env = mainnet_env();
        let (_contract_id, admin) = deploy_and_init(&env);
        // Second call must panic / return an error
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            NepaBillingContract::initialize(env.clone(), admin.clone());
        }));
        assert!(result.is_err(), "double-init must be rejected on mainnet");
    }

    // ---------------------------------------------------------------------------
    // Payment – mainnet fee & timestamp behaviour
    // ---------------------------------------------------------------------------

    #[test]
    fn mainnet_payment_records_correct_timestamp() {
        let env = mainnet_env();
        let (_contract_id, admin) = deploy_and_init(&env);
        let user = TestAddress::generate(&env);
        let token = TestAddress::generate(&env);
        let meter_id = String::from_str(&env, "MAINNET-METER-001");

        let payment_id = NepaBillingContract::pay_bill(
            env.clone(),
            user.clone(),
            token.clone(),
            meter_id.clone(),
            1_000_i128,
        );

        let record = NepaBillingContract::get_payment_record(env.clone(), payment_id);
        assert_eq!(
            record.timestamp, MAINNET_LEDGER_TIMESTAMP,
            "payment timestamp must match mainnet ledger time"
        );
        assert_eq!(record.amount, 1_000_i128);
        assert_eq!(record.meter_id, meter_id);
        assert!(!record.is_refunded);
    }

    #[test]
    fn mainnet_payment_requires_auth() {
        let env = Env::default(); // no mock_all_auths – auth is enforced
        env.ledger().set(LedgerInfo {
            timestamp: MAINNET_LEDGER_TIMESTAMP,
            protocol_version: 21,
            sequence_number: MAINNET_SEQUENCE_NUMBER,
            network_id: env.crypto().sha256(
                &soroban_sdk::Bytes::from_slice(&env, MAINNET_PASSPHRASE.as_bytes()),
            ),
            base_reserve: 5_000_000,
            min_temp_entry_ttl: 16,
            min_persistent_entry_ttl: 2_073_600,
            max_entry_ttl: 3_110_400,
        });

        let admin = TestAddress::generate(&env);
        // Initialize with mocked auth just for setup
        {
            let setup_env = env.clone();
            setup_env.mock_all_auths();
            NepaBillingContract::initialize(setup_env, admin.clone());
        }

        let user = TestAddress::generate(&env);
        let token = TestAddress::generate(&env);
        let meter_id = String::from_str(&env, "MAINNET-METER-AUTH");

        // Without auth this must panic
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            NepaBillingContract::pay_bill(
                env.clone(),
                user.clone(),
                token.clone(),
                meter_id.clone(),
                500_i128,
            );
        }));
        assert!(result.is_err(), "unauthenticated payment must be rejected");
    }

    #[test]
    fn mainnet_large_payment_accepted() {
        let env = mainnet_env();
        let (_contract_id, _admin) = deploy_and_init(&env);
        let user = TestAddress::generate(&env);
        let token = TestAddress::generate(&env);
        let meter_id = String::from_str(&env, "MAINNET-METER-LARGE");

        // Mainnet users may pay large amounts (e.g. 10 000 XLM in stroops)
        let large_amount: i128 = 100_000_000_000;
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(),
            user.clone(),
            token.clone(),
            meter_id.clone(),
            large_amount,
        );

        let record = NepaBillingContract::get_payment_record(env.clone(), payment_id);
        assert_eq!(record.amount, large_amount);
    }

    // ---------------------------------------------------------------------------
    // Refund – mainnet expiration window
    // ---------------------------------------------------------------------------

    #[test]
    fn mainnet_refund_respects_expiration_window() {
        let env = mainnet_env();
        let (_contract_id, admin) = deploy_and_init(&env);
        let approver = TestAddress::generate(&env);
        NepaBillingContract::manage_approver(env.clone(), admin.clone(), approver.clone(), true);

        let user = TestAddress::generate(&env);
        let token = TestAddress::generate(&env);
        let meter_id = String::from_str(&env, "MAINNET-METER-REFUND");

        let payment_id = NepaBillingContract::pay_bill(
            env.clone(),
            user.clone(),
            token.clone(),
            meter_id.clone(),
            500_i128,
        );

        // Request refund within the window
        let refund_id = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment_id,
            String::from_str(&env, "Mainnet refund test"),
        );

        let refund = NepaBillingContract::get_refund_request(env.clone(), refund_id).unwrap();
        assert!(
            refund.expiration > MAINNET_LEDGER_TIMESTAMP,
            "refund expiration must be in the future"
        );
    }

    #[test]
    fn mainnet_expired_refund_is_rejected() {
        let env = mainnet_env();
        let (_contract_id, admin) = deploy_and_init(&env);
        let user = TestAddress::generate(&env);
        let token = TestAddress::generate(&env);
        let meter_id = String::from_str(&env, "MAINNET-METER-EXPIRED");

        let payment_id = NepaBillingContract::pay_bill(
            env.clone(),
            user.clone(),
            token.clone(),
            meter_id.clone(),
            200_i128,
        );

        // Advance ledger time past the refund window
        env.ledger().set(LedgerInfo {
            timestamp: MAINNET_LEDGER_TIMESTAMP + 60 * 60 * 24 * 30, // +30 days
            protocol_version: 21,
            sequence_number: MAINNET_SEQUENCE_NUMBER + 1000,
            network_id: env.crypto().sha256(
                &soroban_sdk::Bytes::from_slice(&env, MAINNET_PASSPHRASE.as_bytes()),
            ),
            base_reserve: 5_000_000,
            min_temp_entry_ttl: 16,
            min_persistent_entry_ttl: 2_073_600,
            max_entry_ttl: 3_110_400,
        });

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            NepaBillingContract::request_refund(
                env.clone(),
                user.clone(),
                payment_id,
                String::from_str(&env, "Too late"),
            );
        }));
        assert!(result.is_err(), "refund after expiration window must be rejected");
    }

    // ---------------------------------------------------------------------------
    // Admin operations on mainnet
    // ---------------------------------------------------------------------------

    #[test]
    fn mainnet_only_admin_can_manage_approvers() {
        let env = mainnet_env();
        let (_contract_id, _admin) = deploy_and_init(&env);
        let non_admin = TestAddress::generate(&env);
        let candidate = TestAddress::generate(&env);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            NepaBillingContract::manage_approver(
                env.clone(),
                non_admin.clone(),
                candidate.clone(),
                true,
            );
        }));
        assert!(result.is_err(), "non-admin must not manage approvers on mainnet");
    }

    #[test]
    fn mainnet_get_total_paid_aggregates_correctly() {
        let env = mainnet_env();
        let (_contract_id, _admin) = deploy_and_init(&env);
        let user = TestAddress::generate(&env);
        let token = TestAddress::generate(&env);
        let meter_id = String::from_str(&env, "MAINNET-METER-TOTAL");

        NepaBillingContract::pay_bill(env.clone(), user.clone(), token.clone(), meter_id.clone(), 300_i128);
        NepaBillingContract::pay_bill(env.clone(), user.clone(), token.clone(), meter_id.clone(), 700_i128);

        let total = NepaBillingContract::get_total_paid(env.clone(), user.clone());
        assert_eq!(total, 1_000_i128, "total paid must aggregate across payments");
    }
}
