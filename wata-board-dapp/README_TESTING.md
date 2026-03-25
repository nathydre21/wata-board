# Wata-Board DApp Testing Infrastructure

## Load Testing

We use **Artillery** for load, performance, and stress testing.

### Prerequisites

```bash
cd wata-board-dapp
npm install
```

### Running Load Tests

To run the standard load test:

```bash
npm run test:load
```

### Configuration

The load test configuration is located in `tests/load/load-test.yml`. It defines:
-   **Warm-up**: 60s at 5-20 users/sec.
-   **Sustained load**: 120s at 20 users/sec.
-   **Stress test**: 60s ramping up to 50 users/sec.

### Tested Scenarios

1.  **Standard User Flow**: Checks health, rate limit status, and past payments.
2.  **Payment Stress**: Simulates concurrent payments to test the internal rate limiter and queuing system.

### Data

The tests use `tests/load/users.csv` for dynamic user and meter IDs.
