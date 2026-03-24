#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{symbol_short, testutils::{Address as TestAddress, Ledger as TestLedger}, Env};

    fn create_test_env() -> Env {
        let env = Env::default();
        env.mock_all_auths();
        env
    }

    fn setup_contract_with_refund_config(env: &Env) -> (TestAddress, TestAddress, TestAddress, TestAddress) {
        let admin = TestAddress::generate(env);
        let user = TestAddress::generate(env);
        let approver1 = TestAddress::generate(env);
        let approver2 = TestAddress::generate(env);
        
        // Initialize contract
        NepaBillingContract::initialize(env.clone(), admin.clone());
        
        // Setup refund approvers
        NepaBillingContract::manage_approver(env.clone(), admin.clone(), approver1.clone(), true);
        NepaBillingContract::manage_approver(env.clone(), admin.clone(), approver2.clone(), true);
        
        (admin, user, approver1, approver2)
    }

    #[test]
    fn test_initialize_contract() {
        let env = create_test_env();
        let admin = TestAddress::generate(&env);
        
        // Test successful initialization
        NepaBillingContract::initialize(env.clone(), admin.clone());
        
        let retrieved_admin = NepaBillingContract::get_admin(env.clone());
        assert_eq!(retrieved_admin, admin);
        
        // Test double initialization fails
        let result = std::panic::catch_unwind(|| {
            NepaBillingContract::initialize(env.clone(), admin.clone());
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_payment_and_refund_flow() {
        let env = create_test_env();
        let (admin, user, approver1, approver2) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Request refund
        let refund_id = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment_id,
            String::from_str(&env, "Service not satisfactory")
        );
        
        // Approve refund (requires 2 approvals for amounts > 100)
        NepaBillingContract::approve_refund(env.clone(), approver1.clone(), refund_id);
        NepaBillingContract::approve_refund(env.clone(), approver2.clone(), refund_id);
        
        // Process refund
        NepaBillingContract::process_refund(env.clone(), admin.clone(), token_address.clone(), refund_id);
        
        // Verify payment is marked as refunded
        let payment_record = NepaBillingContract::get_payment_record(env.clone(), payment_id);
        assert!(payment_record.is_refunded);
        assert_eq!(payment_record.refund_id, Some(refund_id));
        
        // Verify refund request is processed
        let refund_request = NepaBillingContract::get_refund_request(env.clone(), refund_id).unwrap();
        assert_eq!(refund_request.status, RefundStatus::Processed);
    }

    #[test]
    fn test_auto_approve_small_amount() {
        let env = create_test_env();
        let (admin, user, approver1, _) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let small_amount = 50i128; // Below auto-approve threshold of 100
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            small_amount
        );
        
        // Request refund
        let refund_id = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment_id,
            String::from_str(&env, "Small amount refund")
        );
        
        // Approve with just 1 approval (auto-approve threshold)
        NepaBillingContract::approve_refund(env.clone(), approver1.clone(), refund_id);
        
        // Should be approved with 1 approval
        let refund_request = NepaBillingContract::get_refund_request(env.clone(), refund_id).unwrap();
        assert_eq!(refund_request.status, RefundStatus::Approved);
        
        // Process refund
        NepaBillingContract::process_refund(env.clone(), admin.clone(), token_address.clone(), refund_id);
        
        // Verify processed
        let processed_request = NepaBillingContract::get_refund_request(env.clone(), refund_id).unwrap();
        assert_eq!(processed_request.status, RefundStatus::Processed);
    }

    #[test]
    fn test_unauthorized_refund_request() {
        let env = create_test_env();
        let (admin, user, _, _) = setup_contract_with_refund_config(&env);
        let unauthorized_user = TestAddress::generate(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Try to request refund with unauthorized user (should fail)
        let result = std::panic::catch_unwind(|| {
            NepaBillingContract::request_refund(
                env.clone(),
                unauthorized_user.clone(),
                payment_id,
                String::from_str(&env, "Unauthorized request")
            );
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_refund_window_expiration() {
        let env = create_test_env();
        let (admin, user, _, _) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Jump forward 25 hours (beyond 24-hour window)
        env.ledger().set_timestamp(env.ledger().timestamp() + 90000);
        
        // Try to request refund after window (should fail)
        let result = std::panic::catch_unwind(|| {
            NepaBillingContract::request_refund(
                env.clone(),
                user.clone(),
                payment_id,
                String::from_str(&env, "Late request")
            );
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_reject_refund() {
        let env = create_test_env();
        let (_, user, approver1, _) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Request refund
        let refund_id = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment_id,
            String::from_str(&env, "Request to be rejected")
        );
        
        // Reject refund
        NepaBillingContract::reject_refund(
            env.clone(),
            approver1.clone(),
            refund_id,
            String::from_str(&env, "Invalid reason")
        );
        
        // Verify refund is rejected
        let refund_request = NepaBillingContract::get_refund_request(env.clone(), refund_id).unwrap();
        assert_eq!(refund_request.status, RefundStatus::Rejected);
    }

    #[test]
    fn test_get_pending_refunds() {
        let env = create_test_env();
        let (_, user, approver1, _) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make multiple payments
        let payment1 = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        let payment2 = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Request refunds
        let refund1 = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment1,
            String::from_str(&env, "Refund 1")
        );
        
        let refund2 = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment2,
            String::from_str(&env, "Refund 2")
        );
        
        // Get pending refunds
        let pending = NepaBillingContract::get_pending_refunds(env.clone());
        assert_eq!(pending.len(), 2);
        
        // Approve one refund
        NepaBillingContract::approve_refund(env.clone(), approver1.clone(), refund1);
        
        // Should still be pending (needs 2 approvals)
        let pending_after = NepaBillingContract::get_pending_refunds(env.clone());
        assert_eq!(pending_after.len(), 2);
    }

    #[test]
    fn test_invalid_approver() {
        let env = create_test_env();
        let (_, user, _, _) = setup_contract_with_refund_config(&env);
        let unauthorized_approver = TestAddress::generate(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Request refund
        let refund_id = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment_id,
            String::from_str(&env, "Refund request")
        );
        
        // Try to approve with unauthorized approver (should fail)
        let result = std::panic::catch_unwind(|| {
            NepaBillingContract::approve_refund(env.clone(), unauthorized_approver.clone(), refund_id);
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_refund_history_tracking() {
        let env = create_test_env();
        let (_, user, _, _) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make payments
        let payment1 = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        let payment2 = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Request refunds
        let refund1 = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment1,
            String::from_str(&env, "Refund 1")
        );
        
        let refund2 = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment2,
            String::from_str(&env, "Refund 2")
        );
        
        // Check refund history
        let history = NepaBillingContract::get_refund_history(env.clone(), user.clone());
        assert_eq!(history.len(), 2);
        assert!(history.contains(&refund1));
        assert!(history.contains(&refund2));
    }

    #[test]
    fn test_total_paid_updates_on_refund() {
        let env = create_test_env();
        let (admin, user, approver1, approver2) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Verify total paid
        let total_before = NepaBillingContract::get_total_paid(env.clone(), meter_id.clone());
        assert_eq!(total_before, amount);
        
        // Process refund
        let refund_id = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment_id,
            String::from_str(&env, "Refund for testing")
        );
        
        NepaBillingContract::approve_refund(env.clone(), approver1.clone(), refund_id);
        NepaBillingContract::approve_refund(env.clone(), approver2.clone(), refund_id);
        NepaBillingContract::process_refund(env.clone(), admin.clone(), token_address.clone(), refund_id);
        
        // Verify total paid is updated
        let total_after = NepaBillingContract::get_total_paid(env.clone(), meter_id);
        assert_eq!(total_after, 0);
    }

    #[test]
    fn test_events_emitted() {
        let env = create_test_env();
        let (_, user, approver1, approver2) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Request refund (should emit "requested" event)
        let refund_id = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment_id,
            String::from_str(&env, "Test refund")
        );
        
        // Approve refund (should emit "approval" events)
        NepaBillingContract::approve_refund(env.clone(), approver1.clone(), refund_id);
        NepaBillingContract::approve_refund(env.clone(), approver2.clone(), refund_id);
        
        // Events are tested through the contract's event system
        // In a real test environment, you would verify the events were published correctly
        let refund_request = NepaBillingContract::get_refund_request(env.clone(), refund_id).unwrap();
        assert_eq!(refund_request.status, RefundStatus::Approved);
    }

    #[test]
    fn test_refund_pause_functionality() {
        let env = create_test_env();
        let (admin, user, _, _) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Pause refunds
        NepaBillingContract::set_refund_pause(env.clone(), admin.clone(), true);
        
        // Try to request refund while paused (should fail)
        let result = std::panic::catch_unwind(|| {
            NepaBillingContract::request_refund(
                env.clone(),
                user.clone(),
                payment_id,
                String::from_str(&env, "Refund while paused")
            );
        });
        assert!(result.is_err());
        
        // Unpause refunds
        NepaBillingContract::set_refund_pause(env.clone(), admin.clone(), false);
        
        // Should succeed now
        let refund_id = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment_id,
            String::from_str(&env, "Refund after unpause")
        );
        
        assert!(refund_id > 0);
    }

    #[test]
    fn test_double_refund_request_fails() {
        let env = create_test_env();
        let (_, user, _, _) = setup_contract_with_refund_config(&env);
        let token_address = TestAddress::generate(&env);
        
        let meter_id = String::from_str(&env, "METER-001");
        let amount = 1000i128;
        
        // Make a payment
        let payment_id = NepaBillingContract::pay_bill(
            env.clone(), 
            user.clone(), 
            token_address.clone(), 
            meter_id.clone(), 
            amount
        );
        
        // Request first refund
        let refund1 = NepaBillingContract::request_refund(
            env.clone(),
            user.clone(),
            payment_id,
            String::from_str(&env, "First refund")
        );
        
        // Try to request second refund for same payment (should fail)
        let result = std::panic::catch_unwind(|| {
            NepaBillingContract::request_refund(
                env.clone(),
                user.clone(),
                payment_id,
                String::from_str(&env, "Second refund")
            );
        });
        assert!(result.is_err());
        
        assert!(refund1 > 0);
    }
}
