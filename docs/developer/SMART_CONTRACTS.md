# Smart Contract Development Guide

## Overview

Wata Board includes smart contract integration for NFT and token transactions. This guide covers developing, deploying, and interacting with smart contracts.

## Smart Contract Architecture

### NEPA Token Contract

The NEPA contract provides tokenized payment processes with the following features:
- Standard ERC-20 functionality
- Custom transfer hooks
- Rate limiting capabilities
- Blockchain event logging

### Contract Location

```
wata-board-dapp/nepa_contract/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   └── contract.rs
└── target/
```

## Development Setup

### Prerequisites

- Rust 1.56+ with `wasm32-unknown-unknown` target
- Cargo build system
- Solana CLI (if using Solana blockchain)

### Installation

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Navigate to contract directory
cd wata-board-dapp/nepa_contract
```

## Contract Development

### Basic Contract Structure

```rust
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::{near_bindgen, PanicOnDefault, PublicKey, env};

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct NEPAToken {
    pub owner_id: AccountId,
    pub total_supply: u128,
    pub balances: LookupMap<AccountId, u128>,
    pub allowances: LookupMap<(AccountId, AccountId), u128>,
}

#[near_bindgen]
impl NEPAToken {
    #[init]
    pub fn new(owner_id: AccountId, total_supply: u128) -> Self {
        Self {
            owner_id: owner_id.clone(),
            total_supply,
            balances: LookupMap::new(b"b"),
            allowances: LookupMap::new(b"a"),
        }
    }
}
```

### Implementing Token Functions

#### Balance Check
```rust
pub fn balance_of(&self, account_id: &AccountId) -> u128 {
    self.balances.get(account_id).unwrap_or(0)
}
```

#### Transfer
```rust
pub fn transfer(&mut self, receiver_id: AccountId, amount: u128) -> bool {
    let sender_id = env::predecessor_account_id();
    let sender_balance = self.balance_of(&sender_id);
    
    assert!(sender_balance >= amount, "Not enough balance");
    
    self.balances.insert(&sender_id, sender_balance - amount);
    let receiver_balance = self.balance_of(&receiver_id);
    self.balances.insert(&receiver_id, receiver_balance + amount);
    
    true
}
```

## Building & Testing

### Build Contract

```bash
cargo build --release --target wasm32-unknown-unknown

# Output: target/wasm32-unknown-unknown/release/nepa_contract.wasm
```

### Running Tests

```bash
cargo test

# With output
cargo test -- --nocapture
```

### Test Example

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn get_context(is_view: bool) -> VMContext {
        VMContextBuilder::new()
            .current_account_id("nepa.testnet".parse().unwrap())
            .signer_account_id("user.testnet".parse().unwrap())
            .is_view(is_view)
            .build()
    }

    #[test]
    fn test_new() {
        let context = get_context(false);
        testing_env!(context);
        
        let contract = NEPAToken::new(
            "owner.testnet".parse().unwrap(),
            1_000_000_000u128
        );
        
        assert_eq!(contract.total_supply, 1_000_000_000u128);
    }

    #[test]
    fn test_transfer() {
        let mut context = get_context(false);
        testing_env!(context);
        
        let mut contract = NEPAToken::new(
            "owner.testnet".parse().unwrap(),
            1_000_000_000u128
        );
        
        contract.transfer(
            "recipient.testnet".parse().unwrap(),
            100_000_000u128
        );
        
        assert_eq!(
            contract.balance_of(&"recipient.testnet".parse().unwrap()),
            100_000_000u128
        );
    }
}
```

## Deployment

### Testnet Deployment

```bash
# Create testnet account (if needed)
near create-account nepa.testnet --masterAccount myaccount.testnet

# Deploy contract
near deploy \
  --accountId nepa.testnet \
  --wasmFile target/wasm32-unknown-unknown/release/nepa_contract.wasm
```

### Mainnet Deployment

```bash
# Initialize on mainnet
near deploy \
  --accountId nepa.mainnet \
  --wasmFile target/wasm32-unknown-unknown/release/nepa_contract.wasm
```

## Interacting with Contracts

### Using NEAR CLI

```bash
# Get balance
near view nepa.testnet balance_of \
  '{"account_id":"user.testnet"}'

# Transfer tokens
near call nepa.testnet transfer \
  '{"receiver_id":"recipient.testnet","amount":"1000000"}' \
  --accountId user.testnet
```

### Using JavaScript SDK

```typescript
import { connect, Contract, Account } from 'near-api-js';

const config = {
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.near.org',
  walletUrl: 'https://wallet.testnet.near.org',
  helperUrl: 'https://helper.testnet.near.org',
  explorerUrl: 'https://explorer.testnet.near.org'
};

async function interactWithContract() {
  const near = await connect(config);
  const account = await near.account('user.testnet');
  
  const contract = new Contract(
    account,
    'nepa.testnet',
    {
      viewMethods: ['balance_of'],
      changeMethods: ['transfer']
    }
  );
  
  // Get balance
  const balance = await contract.balance_of({
    account_id: 'user.testnet'
  });
  console.log('Balance:', balance);
  
  // Transfer
  const tx = await contract.transfer({
    receiver_id: 'recipient.testnet',
    amount: '1000000'
  }, 300000000000000, '1'); // gas and deposit
}
```

## Advanced Topics

### Custom Hooks

```rust
pub fn transfer_with_hook(&mut self, receiver_id: AccountId, amount: u128) -> bool {
    self.transfer(&receiver_id, amount)?;
    self.notify_transfer_hook(&receiver_id, amount);
    true
}

fn notify_transfer_hook(&self, receiver_id: &AccountId, amount: u128) {
    // Emit custom event
    emit_log(&format!("Transfer: {} received {}", receiver_id, amount));
}
```

### Rate Limiting

```rust
pub struct RateLimitConfig {
    pub max_transfers_per_block: u32,
    pub daily_limit: u128,
}

pub fn is_rate_limited(&self, account_id: &AccountId) -> bool {
    // Check rate limits
    let daily_total = self.get_daily_total(account_id);
    daily_total >= self.rate_limit_config.daily_limit
}
```

## Security Considerations

1. **Input Validation**
   - Always validate amounts and addresses
   - Check for overflow/underflow
   - Verify sender authorization

2. **Reentrancy Protection**
   ```rust
   #[near_bindgen]
   impl NEPAToken {
       pub fn transfer_with_callback(&mut self, receiver: AccountId, amount: u128) {
           // State changes first
           self.update_balances(&receiver, amount);
           
           // External calls last
           self.execute_callback(&receiver);
       }
   }
   ```

3. **Audit Recommendations**
   - Regular security audits
   - Formal verification
   - Penetration testing

## Debugging

### Using Logs

```rust
env::log_str(&format!("Transfer from {} to {}", sender_id, receiver_id));
```

### Testing with Logs

```bash
RUST_LOG=nepa_contract=debug cargo test -- --nocapture
```

## Resources

- [NEAR Documentation](https://docs.near.org)
- [Rust Smart Contracts](https://docs.near.org/develop/contracts/anatomy)
- [Contract Testing](https://docs.near.org/develop/testing/unit-tests)
- [Deployment Guide](https://docs.near.org/develop/deploy)
