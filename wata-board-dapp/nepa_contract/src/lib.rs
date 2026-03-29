#![no_std]
<<<<<<< HEAD
use soroban_sdk::{contract, contractimpl, Address, Env, String, token, Symbol, Vec, Map, i64, TryInto, TryFrom};
use soroban_sdk::{contract, contractimpl, Address, Env, String, token, Symbol, Vec, Map};
=======
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, token, Map, Vec, Symbol};
>>>>>>> 7c6957b887aad2d7d8e9ecedd6292ce5fc776e6f

// Refund Status Enum
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracttype]
pub enum RefundStatus {
    Pending,
    Approved,
    Rejected,
    Processed,
    Expired,
}

// Refund Request Structure
#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct RefundRequest {
    pub refund_id: u32,
    pub original_payment_id: u64,
    pub meter_id: String,
    pub amount: i128,
    pub requester: Address,
    pub reason: String,
    pub timestamp: u64,
    pub status: RefundStatus,
    pub approvers: Vec<Address>,
    pub required_approvals: u32,
    pub expiration: u64,
}

// Refund Configuration Structure
#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct RefundConfig {
    pub enabled: bool,
    pub refund_window_seconds: u64,
    pub required_approvals: u32,
    pub approvers: Vec<Address>,
    pub max_refund_amount: i128,
    pub auto_approve_threshold: i128,
    pub paused: bool,
}

#[contract]
pub struct NepaBillingContract;

#[derive(Clone)]
#[contracttype]
pub struct Review {
    pub reviewer: Address,
    pub rating: i64,          // 1-5 stars
    pub comment: String,     // Review text
    pub timestamp: i64,      // Block timestamp
    pub transaction_hash: String, // For verification
}

#[derive(Clone)]
#[contracttype]
pub struct RatingStats {
    pub total_reviews: i64,
    pub average_rating: i64, // Stored as integer (e.g., 45 for 4.5 stars)
    pub rating_counts: Vec<i64>, // [1-star, 2-star, 3-star, 4-star, 5-star] counts
}
// Payment record structure to track all payment details
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct PaymentRecord {
    pub payer: Address,
    pub amount: i128,
    pub meter_id: String,
    pub timestamp: u64,
    pub refunded: bool,
    pub is_refunded: bool,
    pub refund_id: Option<u32>,
}

// Refund request structure with reason and timestamps
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct RefundRequest {
    pub request_id: u64,
    pub payment_id: u64,
    pub payer: Address,
    pub amount: i128,
    pub reason: String,                    // "wrong_meter_id", "incorrect_amount", "duplicate_payment", "user_error"
    pub status: String,                    // "pending", "approved", "rejected", "completed"
    pub requested_at: u64,
    pub approved_at: u64,                  // 0 if not approved
    pub completed_at: u64,                 // 0 if not completed
    pub approvers: Vec<Address>,           // List of addresses that approved
    pub rejection_reason: String,          // Reason if rejected
}

// Refund approval structure for multi-signature support
#[derive(Clone)]
#[contracttype]
pub struct RefundApproval {
    pub request_id: u64,
    pub approver: Address,
    pub approved_at: u64,
    pub approval_signature: String,        // For audit trail
}

// Storage keys
const ADMIN_KEY: Symbol = Symbol::short("ADMIN");
const PAYMENT_COUNTER: Symbol = Symbol::short("PAY_CNT");
const PAYMENT_RECORDS: Symbol = Symbol::short("PAY_REC");
const REFUND_REQUEST_COUNTER: Symbol = Symbol::short("REF_CNT");
const REFUND_APPROVERS: Symbol = Symbol::short("REF_APR");      // List of authorized approvers
const REFUND_APPROVAL_THRESHOLD: Symbol = Symbol::short("REF_THR"); // Number of approvals needed

// Refund storage keys
const REFUND_REQUESTS: Symbol = Symbol::short("REF_REQ");
const REFUND_ID_COUNTER: Symbol = Symbol::short("REF_CNT");
const REFUND_CONFIG: Symbol = Symbol::short("REF_CFG");
const REFUND_HISTORY: Symbol = Symbol::short("REF_HIST");
const APPROVER_STATUS: Symbol = Symbol::short("APP_STAT");

// Error codes
const REFUND_NOT_FOUND: &str = "Refund request not found";
const REFUND_ALREADY_PROCESSED: &str = "Refund already processed";
const REFUND_EXPIRED: &str = "Refund request has expired";
const INVALID_REFUND_AMOUNT: &str = "Invalid refund amount";
const PAYMENT_NOT_FOUND: &str = "Payment record not found";
const REFUND_WINDOW_EXPIRED: &str = "Refund window has expired";
const INVALID_REFUND_REASON: &str = "Invalid refund reason";
const INVALID_APPROVER: &str = "Invalid approver";
const INSUFFICIENT_SIGNATURES: &str = "Insufficient signatures";
const REFUNDS_PAUSED: &str = "Refund system is paused";

#[contractimpl]
impl NepaBillingContract {
    
    /// Initialize the contract with an admin address and refund approvers
    pub fn initialize(env: Env, admin: Address) {
        // Only allow initialization once
        if env.storage().persistent().has(&ADMIN_KEY) {
            panic!("Contract already initialized");
        }
        
        env.storage().persistent().set(&ADMIN_KEY, &admin);
        env.storage().persistent().set(&PAYMENT_COUNTER, &0u64);
<<<<<<< HEAD
        env.storage().persistent().set(&REFUND_ID_COUNTER, &0u32);
        
        // Initialize default refund configuration
        let default_config = RefundConfig {
            enabled: true,
            refund_window_seconds: 86400, // 24 hours
            required_approvals: 2,
            approvers: Vec::new(&env),
            max_refund_amount: 1000000, // Default max amount
            auto_approve_threshold: 100, // Auto-approve small amounts
            paused: false,
        };
        env.storage().persistent().set(&REFUND_CONFIG, &default_config);
=======
        env.storage().persistent().set(&REFUND_REQUEST_COUNTER, &0u64);
        
        // Initialize refund approvers list with admin
        let mut approvers = Vec::new(&env);
        approvers.push_back(admin);
        env.storage().persistent().set(&REFUND_APPROVERS, &approvers);
        
        // Set approval threshold to 1 (admin approval required)
        env.storage().persistent().set(&REFUND_APPROVAL_THRESHOLD, &1u32);
    }
    
    /// Set authorized refund approvers (admin only)
    pub fn set_refund_approvers(env: Env, admin: Address, approvers: Vec<Address>, threshold: u32) {
        admin.require_auth();
        
        let contract_admin = Self::get_admin(env.clone());
        if admin != contract_admin {
            panic!("Only admin can set refund approvers");
        }
        
        if threshold == 0 || threshold as usize > approvers.len() {
            panic!("Invalid approval threshold");
        }
        
        env.storage().persistent().set(&REFUND_APPROVERS, &approvers);
        env.storage().persistent().set(&REFUND_APPROVAL_THRESHOLD, &threshold);
>>>>>>> 7c6957b887aad2d7d8e9ecedd6292ce5fc776e6f
    }
    
    /// Get the contract admin
    pub fn get_admin(env: Env) -> Address {
        env.storage().persistent().get(&ADMIN_KEY)
            .unwrap_or_else(|| panic!("Contract not initialized"))
    }
    
    pub fn pay_bill(env: Env, from: Address, token_address: Address, meter_id: String, amount: i128) -> u64 {
        // 1. Verify the user authorized this payment
        from.require_auth();

        // 2. Initialize the Token client
        let token_client = token::Client::new(&env, &token_address);

        // 3. Move the tokens from the User to the Contract
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        // 4. Create payment record
        let payment_id = Self::_generate_payment_id(&env);
        let timestamp = env.ledger().timestamp();
        
        let payment_record = PaymentRecord {
            payer: from.clone(),
            amount,
            meter_id: meter_id.clone(),
            timestamp,
            refunded: false,
            is_refunded: false,
            refund_id: None,
        };

        // 5. Store payment record
        env.storage().persistent().set(&payment_id, &payment_record);

        // 6. Update the meter total (backward compatibility)
        let current_total: i128 = env.storage().persistent().get(&meter_id).unwrap_or(0);
        env.storage().persistent().set(&meter_id, &(current_total + amount));

        payment_id
    }

    pub fn get_total_paid(env: Env, meter_id: String) -> i128 {
        env.storage().persistent().get(&meter_id).unwrap_or(0)
    }

    // New rating and review functions
    pub fn submit_review(
        env: Env, 
        reviewer: Address, 
        rating: i64, 
        comment: String,
        transaction_hash: String
    ) {
        // 1. Verify the reviewer authorized this review
        reviewer.require_auth();

        // 2. Validate rating (1-5)
        if rating < 1 || rating > 5 {
            panic!("Rating must be between 1 and 5");
        }

        // 3. Validate comment length (max 500 characters)
        let comment_len = comment.len();
        if comment_len > 500 {
            panic!("Review comment too long (max 500 characters)");
        }

        // 4. Check if user has already submitted a review
        let reviews_key = String::from_str(&env, "reviews");
        let reviews: Map<Address, Review> = env.storage().persistent().get(&reviews_key).unwrap_or(Map::new(&env));
        
        if reviews.contains_key(reviewer.clone()) {
            panic!("User has already submitted a review");
        }

        // 5. Create the review
        let new_review = Review {
            reviewer: reviewer.clone(),
            rating,
            comment,
            timestamp: env.ledger().timestamp(),
            transaction_hash,
        };

        // 6. Store the review
        let mut updated_reviews = reviews;
        updated_reviews.set(reviewer.clone(), new_review);
        env.storage().persistent().set(&reviews_key, &updated_reviews);

        // 7. Update rating statistics
        Self::_update_rating_stats(&env, rating);
    }

    pub fn get_user_review(env: Env, reviewer: Address) -> Option<Review> {
        let reviews_key = String::from_str(&env, "reviews");
        let reviews: Map<Address, Review> = env.storage().persistent().get(&reviews_key).unwrap_or(Map::new(&env));
        reviews.get(reviewer)
    }

    pub fn get_all_reviews(env: Env) -> Vec<Review> {
        let reviews_key = String::from_str(&env, "reviews");
        let reviews: Map<Address, Review> = env.storage().persistent().get(&reviews_key).unwrap_or(Map::new(&env));
        
        let mut review_list = Vec::new(&env);
        for (_, review) in reviews.iter() {
            review_list.push_back(review);
        }
        
        review_list
    }

    pub fn get_rating_stats(env: Env) -> RatingStats {
        let stats_key = String::from_str(&env, "rating_stats");
        env.storage().persistent().get(&stats_key).unwrap_or(RatingStats {
            total_reviews: 0,
            average_rating: 0,
            rating_counts: Vec::from_array(&env, &[0, 0, 0, 0, 0]),
        })
    }

    pub fn verify_review(env: Env, reviewer: Address, transaction_hash: String) -> bool {
        if let Some(review) = Self::get_user_review(env.clone(), reviewer) {
            review.transaction_hash == transaction_hash
        } else {
            false
        }
    }

    fn _update_rating_stats(env: &Env, new_rating: i64) {
        let stats_key = String::from_str(&env, "rating_stats");
        let mut stats: RatingStats = env.storage().persistent().get(&stats_key).unwrap_or(RatingStats {
            total_reviews: 0,
            average_rating: 0,
            rating_counts: Vec::from_array(&env, &[0, 0, 0, 0, 0]),
        });

        // Update total reviews
        stats.total_reviews += 1;

        // Update rating counts (convert 1-5 to 0-4 index)
        let rating_index = (new_rating - 1) as usize;
        let mut counts = stats.rating_counts;
        let current_count = counts.get(rating_index as u32).unwrap_or(0);
        counts.set(rating_index as u32, current_count + 1);
        stats.rating_counts = counts;

        // Calculate new average rating (stored as integer, e.g., 45 for 4.5)
        let mut total_rating = 0;
        let mut total_count = 0;
        for i in 0..5 {
            let count = stats.rating_counts.get(i as u32).unwrap_or(0);
            total_rating += (i as i64 + 1) * count;
            total_count += count;
        }

        if total_count > 0 {
            stats.average_rating = (total_rating * 10) / total_count; // Store as *10 for decimal precision
        }

        env.storage().persistent().set(&stats_key, &stats);
    }

    // ===== REFUND SYSTEM FUNCTIONS =====

    /// Request a refund for a payment
    pub fn request_refund(env: Env, requester: Address, payment_id: u64, reason: String) -> u32 {
        requester.require_auth();

        // Check if refund system is enabled and not paused
        let config: RefundConfig = env.storage().persistent().get(&REFUND_CONFIG)
            .unwrap_or_else(|| panic!("Refund config not found"));
        
        if !config.enabled || config.paused {
            panic!(REFUNDS_PAUSED);
        }

        // Get payment record
        let payment_record: PaymentRecord = env.storage().persistent().get(&payment_id)
            .unwrap_or_else(|| panic!(PAYMENT_NOT_FOUND));

        // Validation: Only original payer can request refund
        if payment_record.payer != requester {
            panic!("Only original payer can request refund");
        }

        // Validation: Check if already refunded
        if payment_record.is_refunded {
            panic!("Payment already refunded");
        }

        // Validation: Check refund window (24 hours)
        let current_time = env.ledger().timestamp();
        if current_time > payment_record.timestamp + config.refund_window_seconds {
            panic!(REFUND_WINDOW_EXPIRED);
        }

        // Validation: Check amount limits
        if payment_record.amount > config.max_refund_amount {
            panic!(INVALID_REFUND_AMOUNT);
        }

        // Validation: Check reason length
        if reason.len() == 0 || reason.len() > 500 {
            panic!(INVALID_REFUND_REASON);
        }

        // Generate refund ID
        let refund_id = Self::_generate_refund_id(&env);

        // Determine required approvals (auto-approve for small amounts)
        let required_approvals = if payment_record.amount <= config.auto_approve_threshold {
            1
        } else {
            config.required_approvals
        };

        // Create refund request
        let refund_request = RefundRequest {
            refund_id,
            original_payment_id: payment_id,
            meter_id: payment_record.meter_id.clone(),
            amount: payment_record.amount,
            requester: requester.clone(),
            reason: reason.clone(),
            timestamp: current_time,
            status: RefundStatus::Pending,
            approvers: Vec::new(&env),
            required_approvals,
            expiration: current_time + config.refund_window_seconds,
        };

        // Store refund request
        let refund_key = (REFUND_REQUESTS, refund_id);
        env.storage().persistent().set(&refund_key, &refund_request);

        // Update refund history for user
        Self::_add_to_refund_history(&env, requester.clone(), refund_id);

        // Emit event
        env.events().publish(
            (Symbol::short("refund"), Symbol::short("requested")),
            (refund_id, payment_id, requester)
        );

        refund_id
    }

    /// Approve a refund request (multi-sig)
    pub fn approve_refund(env: Env, approver: Address, refund_id: u32) {
        approver.require_auth();

        // Check if approver is authorized
        let config: RefundConfig = env.storage().persistent().get(&REFUND_CONFIG)
            .unwrap_or_else(|| panic!("Refund config not found"));
        
        if !config.approvers.contains(&approver) {
            panic!(INVALID_APPROVER);
        }

        // Get refund request
        let refund_key = (REFUND_REQUESTS, refund_id);
        let mut refund_request: RefundRequest = env.storage().persistent().get(&refund_key)
            .unwrap_or_else(|| panic!(REFUND_NOT_FOUND));

        // Check if refund is still pending
        if refund_request.status != RefundStatus::Pending {
            panic!(REFUND_ALREADY_PROCESSED);
        }

        // Check expiration
        let current_time = env.ledger().timestamp();
        if current_time > refund_request.expiration {
            refund_request.status = RefundStatus::Expired;
            env.storage().persistent().set(&refund_key, &refund_request);
            panic!(REFUND_EXPIRED);
        }

        // Check if approver already approved
        if refund_request.approvers.contains(&approver) {
            panic!("Approver already approved this refund");
        }

        // Add approver
        refund_request.approvers.push_back(approver.clone());

        // Check if enough approvals
        if refund_request.approvers.len() >= refund_request.required_approvals as u32 {
            refund_request.status = RefundStatus::Approved;
            
            // Emit approved event
            env.events().publish(
                (Symbol::short("refund"), Symbol::short("approved")),
                (refund_id, refund_request.approvers.clone())
            );
        } else {
            // Emit approval event
            env.events().publish(
                (Symbol::short("refund"), Symbol::short("approval")),
                (refund_id, approver)
            );
        }

        // Update refund request
        env.storage().persistent().set(&refund_key, &refund_request);
    }

    /// Reject a refund request
    pub fn reject_refund(env: Env, approver: Address, refund_id: u32, rejection_reason: String) {
        approver.require_auth();

        // Check if approver is authorized
        let config: RefundConfig = env.storage().persistent().get(&REFUND_CONFIG)
            .unwrap_or_else(|| panic!("Refund config not found"));
        
        if !config.approvers.contains(&approver) {
            panic!(INVALID_APPROVER);
        }

        // Get refund request
        let refund_key = (REFUND_REQUESTS, refund_id);
        let mut refund_request: RefundRequest = env.storage().persistent().get(&refund_key)
            .unwrap_or_else(|| panic!(REFUND_NOT_FOUND));

        // Check if refund is still pending
        if refund_request.status != RefundStatus::Pending {
            panic!(REFUND_ALREADY_PROCESSED);
        }

        // Mark as rejected
        refund_request.status = RefundStatus::Rejected;
        env.storage().persistent().set(&refund_key, &refund_request);

        // Emit rejection event
        env.events().publish(
            (Symbol::short("refund"), Symbol::short("rejected")),
            (refund_id, approver, rejection_reason)
        );
    }

    /// Process an approved refund (admin only)
    pub fn process_refund(env: Env, admin: Address, token_address: Address, refund_id: u32) {
        admin.require_auth();

        // Verify admin
        let contract_admin = Self::get_admin(env.clone());
        if admin != contract_admin {
            panic!("Only admin can process refunds");
        }

        // Get refund request
        let refund_key = (REFUND_REQUESTS, refund_id);
        let refund_request: RefundRequest = env.storage().persistent().get(&refund_key)
            .unwrap_or_else(|| panic!(REFUND_NOT_FOUND));

        // Check if refund is approved
        if refund_request.status != RefundStatus::Approved {
            panic!("Refund must be approved before processing");
        }

        // Get payment record
        let mut payment_record: PaymentRecord = env.storage().persistent().get(&refund_request.original_payment_id)
            .unwrap_or_else(|| panic!(PAYMENT_NOT_FOUND));

        // Check if payment is already refunded
        if payment_record.is_refunded {
            panic!("Payment already refunded");
        }

        // Mark payment as refunded
        payment_record.is_refunded = true;
        payment_record.refund_id = Some(refund_id);
        payment_record.refunded = true; // Backward compatibility
        env.storage().persistent().set(&refund_request.original_payment_id, &payment_record);

        // Update refund request status
        let mut updated_request = refund_request;
        updated_request.status = RefundStatus::Processed;
        env.storage().persistent().set(&refund_key, &updated_request);

        // Update meter total (subtract refunded amount)
        let current_total: i128 = env.storage().persistent().get(&payment_record.meter_id).unwrap_or(0);
        let new_total = current_total - payment_record.amount;
        env.storage().persistent().set(&payment_record.meter_id, &new_total);

        // Transfer tokens back to payer
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &payment_record.payer, &payment_record.amount);

        // Emit processed event
        env.events().publish(
            (Symbol::short("refund"), Symbol::short("processed")),
            (refund_id, payment_record.payer, payment_record.amount)
        );
    }

    /// Get refund request by ID
    pub fn get_refund_request(env: Env, refund_id: u32) -> Option<RefundRequest> {
        let refund_key = (REFUND_REQUESTS, refund_id);
        env.storage().persistent().get(&refund_key)
    }

    /// Get refund history for an address
    pub fn get_refund_history(env: Env, address: Address) -> Vec<u32> {
        let history_key = (REFUND_HISTORY, address);
        env.storage().persistent().get(&history_key).unwrap_or(Vec::new(&env))
    }

    /// Get all pending refunds
    pub fn get_pending_refunds(env: Env) -> Vec<RefundRequest> {
        let counter: u32 = env.storage().persistent().get(&REFUND_ID_COUNTER).unwrap_or(0);
        let mut pending_refunds = Vec::new(&env);
        
        for i in 1..=counter {
            let refund_key = (REFUND_REQUESTS, i);
            if let Some(refund_request) = env.storage().persistent().get::<(Symbol, u32), RefundRequest>(&refund_key) {
                if refund_request.status == RefundStatus::Pending {
                    pending_refunds.push_back(refund_request);
                }
            }
        }
        
        pending_refunds
    }

    /// Update refund configuration (admin only)
    pub fn update_refund_config(
        env: Env, 
        admin: Address,
        enabled: Option<bool>,
        window_seconds: Option<u64>,
        approvals: Option<u32>,
        max_amount: Option<i128>,
        auto_threshold: Option<i128>
    ) {
        admin.require_auth();
        
        // Verify admin
        let contract_admin = Self::get_admin(env.clone());
        if admin != contract_admin {
            panic!("Only admin can update refund config");
        }

        // Get current config
        let mut config: RefundConfig = env.storage().persistent().get(&REFUND_CONFIG)
            .unwrap_or_else(|| panic!("Refund config not found"));

        // Update provided fields
        if let Some(e) = enabled { config.enabled = e; }
        if let Some(w) = window_seconds { config.refund_window_seconds = w; }
        if let Some(a) = approvals { config.required_approvals = a; }
        if let Some(m) = max_amount { config.max_refund_amount = m; }
        if let Some(t) = auto_threshold { config.auto_approve_threshold = t; }

        // Save updated config
        env.storage().persistent().set(&REFUND_CONFIG, &config);
    }

    /// Manage approvers (admin only)
    pub fn manage_approver(env: Env, admin: Address, approver: Address, is_add: bool) {
        admin.require_auth();
        
        // Verify admin
        let contract_admin = Self::get_admin(env.clone());
        if admin != contract_admin {
            panic!("Only admin can manage approvers");
        }

        // Get current config
        let mut config: RefundConfig = env.storage().persistent().get(&REFUND_CONFIG)
            .unwrap_or_else(|| panic!("Refund config not found"));

        if is_add {
            // Add approver if not already present
            if !config.approvers.contains(&approver) {
                config.approvers.push_back(approver);
                env.storage().persistent().set((APPROVER_STATUS, approver), &true);
            }
        } else {
            // Remove approver
            let mut new_approvers = Vec::new(&env);
            for existing_approver in config.approvers.iter() {
                if existing_approver != approver {
                    new_approvers.push_back(existing_approver);
                }
            }
            config.approvers = new_approvers;
            env.storage().persistent().set((APPROVER_STATUS, approver), &false);
        }

        // Save updated config
        env.storage().persistent().set(&REFUND_CONFIG, &config);
    }

    /// Pause/unpause refund system (admin only)
    pub fn set_refund_pause(env: Env, admin: Address, paused: bool) {
        admin.require_auth();
        
        // Verify admin
        let contract_admin = Self::get_admin(env.clone());
        if admin != contract_admin {
            panic!("Only admin can pause refunds");
        }

        // Get current config
        let mut config: RefundConfig = env.storage().persistent().get(&REFUND_CONFIG)
            .unwrap_or_else(|| panic!("Refund config not found"));

        config.paused = paused;
        env.storage().persistent().set(&REFUND_CONFIG, &config);
    }

    // ===== HELPER FUNCTIONS =====

    /// Generate unique refund ID
    fn _generate_refund_id(env: &Env) -> u32 {
        let counter: u32 = env.storage().persistent().get(&REFUND_ID_COUNTER).unwrap_or(0);
        let new_id = counter + 1;
        env.storage().persistent().set(&REFUND_ID_COUNTER, &new_id);
        new_id
    }

    /// Add refund ID to user's history
    fn _add_to_refund_history(env: &Env, user: Address, refund_id: u32) {
        let history_key = (REFUND_HISTORY, user.clone());
        let mut history: Vec<u32> = env.storage().persistent().get(&history_key).unwrap_or(Vec::new(env));
        history.push_back(refund_id);
        env.storage().persistent().set(&history_key, &history);
    }
}
    
    /// Get payment record by ID
    pub fn get_payment_record(env: Env, payment_id: u64) -> PaymentRecord {
        env.storage().persistent().get(&payment_id)
            .unwrap_or_else(|| panic!("Payment record not found"))
    }
    
    /// Get all payment records for a specific payer
    pub fn get_payer_payments(env: Env, payer: Address) -> Vec<u64> {
        let counter: u64 = env.storage().persistent().get(&PAYMENT_COUNTER).unwrap_or(0);
        let mut payment_ids = Vec::new(&env);
        
        for i in 0..counter {
            let payment_id = i + 1; // Payment IDs start from 1
            if let Some(record) = env.storage().persistent().get::<u64, PaymentRecord>(&payment_id) {
                if record.payer == payer {
                    payment_ids.push_back(payment_id);
                }
            }
        }
        
        payment_ids
    }
    
    /// Admin-only refund function with security protections
    pub fn admin_refund(env: Env, admin: Address, token_address: Address, payment_id: u64) {
        // 1. Verify admin authorization
        admin.require_auth();
        
        // 2. Verify caller is the contract admin
        let contract_admin = Self::get_admin(env.clone());
        if admin != contract_admin {
            panic!("Only admin can initiate refunds");
        }
        
        // 3. Get payment record
        let mut payment_record = Self::get_payment_record(env.clone(), payment_id);
        
        // 4. Check if already refunded (prevent double-spending)
        if payment_record.refunded {
            panic!("Payment already refunded");
        }
        
        // 5. Mark as refunded BEFORE transferring (re-entrancy protection)
        payment_record.refunded = true;
        env.storage().persistent().set(&payment_id, &payment_record);
        
        // 6. Update meter total (subtract refunded amount)
        let current_total: i128 = env.storage().persistent().get(&payment_record.meter_id).unwrap_or(0);
        let new_total = current_total - payment_record.amount;
        env.storage().persistent().set(&payment_record.meter_id, &new_total);
        
        // 7. Transfer tokens back to payer
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &payment_record.payer, &payment_record.amount);
    }
    
    /// User requests a refund with reason
    pub fn request_refund(env: Env, payer: Address, payment_id: u64, reason: String) -> u64 {
        payer.require_auth();
        
        // Get the payment record
        let payment_record = Self::get_payment_record(env.clone(), payment_id);
        
        // Verify the payer is the original payer
        if payment_record.payer != payer {
            panic!("Only original payer can request refund");
        }
        
        // Check if already refunded
        if payment_record.refunded {
            panic!("Payment already refunded");
        }
        
        // Validate reason (acceptable reasons)
        let valid_reasons = vec![
            String::from_str(&env, "wrong_meter_id"),
            String::from_str(&env, "incorrect_amount"),
            String::from_str(&env, "duplicate_payment"),
            String::from_str(&env, "user_error"),
            String::from_str(&env, "other"),
        ];
        
        let mut is_valid_reason = false;
        for valid in valid_reasons.iter() {
            if reason == valid {
                is_valid_reason = true;
                break;
            }
        }
        
        if !is_valid_reason {
            panic!("Invalid refund reason");
        }
        
        // Generate refund request ID
        let request_id = Self::_generate_refund_request_id(&env);
        
        // Create refund request
        let refund_request = RefundRequest {
            request_id,
            payment_id,
            payer: payer.clone(),
            amount: payment_record.amount,
            reason,
            status: String::from_str(&env, "pending"),
            requested_at: env.ledger().timestamp(),
            approved_at: 0,
            completed_at: 0,
            approvers: Vec::new(&env),
            rejection_reason: String::from_str(&env, ""),
        };
        
        // Store refund request
        let request_key = Symbol::short("REFUND_REQ");
        let mut request_key_full = String::from_str(&env, "refund_request_");
        request_key_full.append(&request_id.to_string());
        env.storage().persistent().set(&request_id, &refund_request);
        
        request_id
    }
    
    /// Get refund request details
    pub fn get_refund_request(env: Env, request_id: u64) -> RefundRequest {
        env.storage().persistent().get(&request_id)
            .unwrap_or_else(|| panic!("Refund request not found"))
    }
    
    /// Get refund requests for a specific payer
    pub fn get_payer_refund_requests(env: Env, payer: Address) -> Vec<u64> {
        let counter: u64 = env.storage().persistent().get(&REFUND_REQUEST_COUNTER).unwrap_or(0);
        let mut request_ids = Vec::new(&env);
        
        for i in 0..counter {
            let request_id = i + 1;
            if let Some(request) = env.storage().persistent().get::<u64, RefundRequest>(&request_id) {
                if request.payer == payer {
                    request_ids.push_back(request_id);
                }
            }
        }
        
        request_ids
    }
    
    /// Approve a refund request (multi-signature support)
    pub fn approve_refund(env: Env, approver: Address, request_id: u64) {
        approver.require_auth();
        
        // Get authorized approvers
        let approvers: Vec<Address> = env.storage().persistent().get(&REFUND_APPROVERS)
            .unwrap_or_else(|| panic!("No refund approvers configured"));
        
        // Verify approver is authorized
        let mut is_authorized = false;
        for auth in approvers.iter() {
            if auth == approver {
                is_authorized = true;
                break;
            }
        }
        
        if !is_authorized {
            panic!("Not authorized to approve refunds");
        }
        
        // Get refund request
        let mut request = Self::get_refund_request(env.clone(), request_id);
        
        // Check if already completed or rejected
        if request.status != String::from_str(&env, "pending") {
            panic!("Request is not pending");
        }
        
        // Add approver if not already approved by this address
        let mut already_approved = false;
        for existing_approver in request.approvers.iter() {
            if existing_approver == approver {
                already_approved = true;
                break;
            }
        }
        
        if already_approved {
            panic!("Already approved by this address");
        }
        
        request.approvers.push_back(approver);
        
        // Check if threshold is met
        let threshold: u32 = env.storage().persistent().get(&REFUND_APPROVAL_THRESHOLD).unwrap_or(1);
        
        if request.approvers.len() >= threshold as usize {
            request.status = String::from_str(&env, "approved");
            request.approved_at = env.ledger().timestamp();
        }
        
        // Update request
        env.storage().persistent().set(&request_id, &request);
    }
    
    /// Reject a refund request with reason (admin/approver only)
    pub fn reject_refund(env: Env, approver: Address, request_id: u64, rejection_reason: String) {
        approver.require_auth();
        
        // Get authorized approvers
        let approvers: Vec<Address> = env.storage().persistent().get(&REFUND_APPROVERS)
            .unwrap_or_else(|| panic!("No refund approvers configured"));
        
        // Verify approver is authorized
        let mut is_authorized = false;
        for auth in approvers.iter() {
            if auth == approver {
                is_authorized = true;
                break;
            }
        }
        
        if !is_authorized {
            panic!("Not authorized to reject refunds");
        }
        
        // Get refund request
        let mut request = Self::get_refund_request(env.clone(), request_id);
        
        // Check if still pending
        if request.status != String::from_str(&env, "pending") {
            panic!("Request is not pending");
        }
        
        request.status = String::from_str(&env, "rejected");
        request.rejection_reason = rejection_reason;
        
        // Update request
        env.storage().persistent().set(&request_id, &request);
    }
    
    /// Complete a refund (process approved refund request)
    pub fn complete_refund(env: Env, approver: Address, token_address: Address, request_id: u64) {
        approver.require_auth();
        
        // Verify approver is authorized
        let approvers: Vec<Address> = env.storage().persistent().get(&REFUND_APPROVERS)
            .unwrap_or_else(|| panic!("No refund approvers configured"));
        
        let mut is_authorized = false;
        for auth in approvers.iter() {
            if auth == approver {
                is_authorized = true;
                break;
            }
        }
        
        if !is_authorized {
            panic!("Not authorized to complete refunds");
        }
        
        // Get refund request
        let mut request = Self::get_refund_request(env.clone(), request_id);
        
        // Check if approved
        if request.status != String::from_str(&env, "approved") {
            panic!("Refund request not approved");
        }
        
        // Get payment record
        let mut payment_record = Self::get_payment_record(env.clone(), request.payment_id);
        
        // Mark payment as refunded
        payment_record.refunded = true;
        env.storage().persistent().set(&request.payment_id, &payment_record);
        
        // Update meter total
        let current_total: i128 = env.storage().persistent().get(&payment_record.meter_id).unwrap_or(0);
        let new_total = current_total - payment_record.amount;
        env.storage().persistent().set(&payment_record.meter_id, &new_total);
        
        // Mark request as completed
        request.status = String::from_str(&env, "completed");
        request.completed_at = env.ledger().timestamp();
        env.storage().persistent().set(&request_id, &request);
        
        // Transfer tokens back to payer
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &request.payer, &request.amount);
    }
    
    /// Helper function to generate unique refund request IDs
    fn _generate_refund_request_id(env: &Env) -> u64 {
        let counter: u64 = env.storage().persistent().get(&REFUND_REQUEST_COUNTER).unwrap_or(0);
        let new_id = counter + 1;
        env.storage().persistent().set(&REFUND_REQUEST_COUNTER, &new_id);
        new_id
    }
    
    /// Helper function to generate unique payment IDs
    fn _generate_payment_id(env: &Env) -> u64 {
        let counter: u64 = env.storage().persistent().get(&PAYMENT_COUNTER).unwrap_or(0);
        let new_id = counter + 1;
        env.storage().persistent().set(&PAYMENT_COUNTER, &new_id);
        new_id
    }
}

// Mock token contract for testing
#[cfg(test)]
pub mod token {
    use super::*;
    use soroban_sdk::contractimpl;

    pub struct MockTokenContract;

    #[contractimpl]
    impl MockTokenContract {
        pub fn mint(env: Env, to: Address, amount: i128) {
            // Simple mock implementation - in real tests this would be handled by testutils
        }
        
        pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
            // Simple mock implementation
        }
    }
}

#[cfg(test)]
mod tests;
