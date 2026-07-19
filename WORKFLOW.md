# Development Workflow Guide

This document outlines the development processes, branching strategies, deployment procedures, and best practices for the Wata Board project.

## Table of Contents

1. [Development Setup](#development-setup)
2. [Branching Strategy](#branching-strategy)
3. [Commit Conventions](#commit-conventions)
4. [Code Review Process](#code-review-process)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Procedures](#deployment-procedures)
8. [Git Workflow Examples](#git-workflow-examples)
9. [Troubleshooting Development Issues](#troubleshooting-development-issues)
10. [Performance and Optimization](#performance-and-optimization)

---

## Development Setup

### Initial Repository Setup

```bash
# Clone the repository
git clone https://github.com/nathydre21/wata-board.git
cd wata-board

# Create a new branch for your work
git checkout -b feature/your-feature-name

# Add upstream remote for synchronization
git remote add upstream https://github.com/nathydre21/wata-board.git

# Install dependencies
cd backend && npm ci && cd ..
cd frontend && npm ci && cd ..
cd contract && cargo build && cd ..
```

### Development Environment Configuration

#### 1. Create Local Environment Files

**Backend (.env)**
```bash
cd backend
cat > .env << EOF
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wata_board_dev
DB_USER=postgres
DB_PASSWORD=postgres_dev_password
DB_SSL=false

# Server
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug

# Stellar Blockchain
STELLAR_NETWORK=testnet
STELLAR_SECRET_KEY=your_test_key
STELLAR_CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4

# Security
KYC_ENABLED=false
RATE_LIMIT_ENABLED=false
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Email (Optional)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=dev@wataboard.local
EOF
```

**Frontend (.env)**
```bash
cd frontend
cat > .env << EOF
VITE_API_URL=http://localhost:3001
VITE_STELLAR_NETWORK=testnet
VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_APP_NAME=Wata Board Dev
VITE_LOG_LEVEL=debug
EOF
```

#### 2. Start Development Services

```bash
# Terminal 1: Start PostgreSQL
docker run -d \
  --name wata-postgres-dev \
  -e POSTGRES_DB=wata_board_dev \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres_dev_password \
  -p 5432:5432 \
  postgres:16

# Terminal 2: Start Redis
docker run -d \
  --name wata-redis-dev \
  -p 6379:6379 \
  redis:7

# Terminal 3: Backend development server
cd backend
npm run dev

# Terminal 4: Frontend development server
cd frontend
npm run dev

# Access:
# Frontend: http://localhost:5173
# Backend API: http://localhost:3001
# Swagger Docs: http://localhost:3001/api-docs
```

#### 3. Database Setup

```bash
# Run migrations in development
cd backend
npm run migrate:latest

# Seed database with test data (if available)
npm run seed:dev

# Check migration status
npm run migrate:status
```

---

## Branching Strategy

We use a **Git Flow** branching strategy with the following branch conventions:

### Branch Types

#### 1. Main Branches

| Branch | Purpose | Protections |
|--------|---------|-----------|
| `main` | Production-ready code | Require PR review, passes CI/CD |
| `develop` | Integration branch for next release | Require PR review, auto-deploy to staging |

#### 2. Feature Branches

```
feature/user-authentication        # New features
feature/payment-processing-v2
feature/meter-reading-import
```

**Naming Convention**: `feature/brief-description-kebab-case`

#### 3. Bugfix Branches

```
bugfix/fix-payment-calculation     # Bug fixes
bugfix/memory-leak-in-websocket
bugfix/kms-integration-error
```

**Naming Convention**: `bugfix/brief-description-kebab-case`

#### 4. Hotfix Branches

```
hotfix/critical-payment-issue      # Production fixes
hotfix/database-connection-timeout
```

**Naming Convention**: `hotfix/brief-description-kebab-case`

#### 5. Chore Branches

```
chore/update-dependencies          # Maintenance tasks
chore/refactor-payment-service
chore/improve-type-definitions
```

**Naming Convention**: `chore/brief-description-kebab-case`

### Branch Lifecycle

```
develop (integration)
    ↓
feature/user-story (development)
    ↓
Pull Request → Code Review → Merge to develop
    ↓
develop → Release Candidate Testing
    ↓
main (production release)
    ↓
Tag: v1.0.0
```

### Creating and Updating Branches

```bash
# Create feature branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/your-feature

# Keep feature branch updated with develop
git fetch origin
git rebase origin/develop

# Before merging, ensure branch is up-to-date
git fetch origin develop
git rebase origin/develop --interactive

# After squashing commits, force push
git push origin feature/your-feature --force-with-lease
```

---

## Commit Conventions

### Conventional Commits Format

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types

| Type | Usage | Examples |
|------|-------|----------|
| `feat` | New feature | `feat(payment): add scheduled payment support` |
| `fix` | Bug fix | `fix(auth): resolve JWT validation error` |
| `docs` | Documentation changes | `docs(readme): update setup instructions` |
| `style` | Code style changes | `style(code): format payment service` |
| `refactor` | Code refactoring | `refactor(api): optimize database queries` |
| `test` | Test additions/changes | `test(payment): add edge case tests` |
| `chore` | Dependency updates, maintenance | `chore(deps): update typescript to 5.2` |
| `ci` | CI/CD changes | `ci(workflows): enable github actions` |
| `perf` | Performance improvements | `perf(cache): reduce redis lookup time` |

### Commit Scopes

```
<scope> options for different areas:

Backend:
  - auth, payment, kms, rate-limiter, db, migration, logging

Frontend:
  - ui, forms, wallet, analytics, offline, i18n

Blockchain:
  - contract, stellar-sdk, soroban

DevOps:
  - docker, nginx, ssl, database, ci
```

### Good Commit Examples

```bash
# Feature with body and footer
git commit -m "feat(payment): add multi-provider payment support

- Add provider selection in payment flow
- Implement provider-specific validation
- Create provider configuration service
- Add comprehensive error handling

Resolves #123"

# Bug fix
git commit -m "fix(auth): prevent JWT validation bypass

Token signature verification was being skipped in certain edge cases.
Now properly validates all required claims."

# Documentation
git commit -m "docs(setup): clarify environment variables

Updated README with all required environment variables and examples
for both local development and production deployments."

# Dependency update
git commit -m "chore(deps): update @stellar/stellar-sdk to v11.2.0

Updates Stellar SDK for improved type safety and performance."
```

### Commit Message Guidelines

✅ **Do**:
- Use imperative mood ("add feature" not "added feature")
- Capitalize the subject line
- Use present tense
- Be specific and descriptive
- Reference issues and PRs in footer
- Keep subject line under 50 characters
- Wrap body at 72 characters

❌ **Don't**:
- Use vague messages ("fix stuff", "update files")
- Include issue numbers in subject
- Mix different concerns in one commit
- Use abbreviations without explanation

---

## Code Review Process

### Before Submitting a Pull Request

1. **Update your branch**
   ```bash
   git fetch origin
   git rebase origin/develop
   ```

2. **Run tests locally**
   ```bash
   # Backend
   cd backend && npm run test && npm run build
   
   # Frontend
   cd frontend && npm run test
   
   # Contract (if modified)
   cd contract && cargo test && cargo clippy -- -D warnings
   ```

3. **Check code quality**
   ```bash
   # Backend
   cd backend && npx eslint src --ext .ts
   
   # Frontend
   cd frontend && npx eslint src --ext .ts,.tsx
   ```

4. **Format code**
   ```bash
   # Use Prettier to format
   npx prettier --write "src/**/*.{ts,tsx,js,json,css,md}"
   ```

5. **Build for production**
   ```bash
   # Backend
   cd backend && npm run build
   
   # Frontend
   cd frontend && npm run build
   ```

### Creating a Pull Request

**PR Title Format**: Follow conventional commit format
```
feat(payment): add recurring payment scheduling
```

**PR Description Template**:
```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [x] New feature
- [ ] Bug fix
- [ ] Documentation update
- [ ] Refactor
- [ ] Dependency update

## Related Issues
Closes #123

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [x] Unit tests added/updated
- [x] Integration tests added/updated
- [x] Manual testing completed
- [x] No breaking changes

## Screenshots (if applicable)
Add screenshots or GIFs of the UI changes.

## Deployment Notes
Any special deployment considerations or database migrations needed.

## Checklist
- [x] Code follows project style guidelines
- [x] Self-reviewed the code
- [x] Comments added for complex logic
- [x] Documentation updated
- [x] No new warnings generated
- [x] Tests pass locally
```

### Code Review Checklist

Reviewers should verify:

- [ ] **Correctness**: Code does what it's supposed to do
- [ ] **Testing**: Adequate test coverage (min 70% backend, 60% frontend)
- [ ] **Performance**: No obvious performance bottlenecks
- [ ] **Security**: No security vulnerabilities or best practice violations
- [ ] **Style**: Follows project conventions
- [ ] **Documentation**: Inline comments and external docs updated
- [ ] **Breaking Changes**: Clearly documented if any
- [ ] **Dependencies**: No unnecessary or vulnerable dependencies added
- [ ] **Database Migrations**: Proper migration scripts if schema changes

### Approval and Merging

```bash
# After PR approval, merge with squash
git checkout develop
git pull origin develop
git merge --squash feature/your-feature
git commit -m "feat(scope): description of feature"
git push origin develop

# Delete feature branch
git branch -D feature/your-feature
git push origin --delete feature/your-feature
```

---

## CI/CD Pipeline

### Current Status

⚠️ **All CI/CD tests are currently DISABLED** via `if: false` conditions in workflows.

### Workflow Files

| Workflow | Status | Purpose |
|----------|--------|---------|
| [backend-tests.yml](.github/workflows/backend-tests.yml) | ⛔ DISABLED | Backend unit and migration tests |
| [comprehensive-tests.yml](.github/workflows/comprehensive-tests.yml) | ⛔ DISABLED | Full test suite with coverage |
| [coverage-report.yml](.github/workflows/coverage-report.yml) | ⛔ DISABLED | Coverage report generation |
| [test.yml](.github/workflows/test.yml) | ⛔ DISABLED | Contract tests |

### Re-enabling CI/CD

To re-enable automated testing:

```bash
# Edit each workflow file and remove "if: false" line
# Example:
git checkout -b chore/enable-ci-cd

# In .github/workflows/backend-tests.yml:
# OLD: jobs:
#        backend-test:
#          if: false
# NEW: jobs:
#        backend-test:

# Repeat for all workflow files
git add .github/workflows/
git commit -m "ci: re-enable ci/cd testing"
git push origin chore/enable-ci-cd
```

### Manual CI/CD Simulation

Run tests locally before pushing:

```bash
# Backend pipeline simulation
cd backend
npm ci
npm run build
npm run test:coverage
npm audit --audit-level moderate

# Frontend pipeline simulation
cd frontend
npm ci
npm run build
npm run test:coverage
npm run test:e2e

# Contract pipeline simulation
cd contract
cargo build
cargo test --verbose
cargo fmt -- --check
cargo clippy -- -D warnings
```

### GitHub Actions Features

When CI/CD is enabled, workflows provide:

- ✅ Automatic test execution on push and PR
- ✅ Code coverage tracking
- ✅ Security audits
- ✅ Dependency vulnerability scanning
- ✅ Automated coverage reports
- ✅ Status checks on PRs

---

## Testing Strategy

### Testing Pyramid

```
        /\
       /  \       E2E Tests (Playwright)
      /    \      - User workflows
     /------\     
    /        \    Integration Tests
   /          \   - API endpoints + DB
  /____________\  
     Unit Tests   - Functions, services
   (70% coverage)   - Isolated components
```

### Backend Testing

#### Unit Tests

```bash
# Run specific test file
npm run test -- payment-service.test.ts

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Update snapshots
npm run test -- -u
```

**Test Structure**:
```typescript
describe('PaymentService', () => {
  describe('processPayment', () => {
    it('should successfully process a valid payment', async () => {
      // Arrange
      const payment = { amount: 100, userId: 'user-1' };
      
      // Act
      const result = await paymentService.processPayment(payment);
      
      // Assert
      expect(result.status).toBe('success');
      expect(result.transactionHash).toBeDefined();
    });

    it('should reject payment with insufficient balance', async () => {
      // Test error handling
    });
  });
});
```

#### Integration Tests

```bash
# Run migration tests
npm run test -- --config jest.config.migrations.js

# Run integration tests with database
npm run test:integration
```

#### Test Coverage Targets

- **Overall**: Minimum 70%
- **Services**: 80%+
- **API Routes**: 75%+
- **Utilities**: 85%+
- **Excluded**: Node modules, migrations, config

### Frontend Testing

#### Unit Tests (Vitest)

```bash
# Run all tests
npm run test

# Run specific file
npm run test src/components/PaymentForm.test.tsx

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

**Component Test Example**:
```typescript
import { render, screen, userEvent } from '@testing-library/react';
import { PaymentForm } from './PaymentForm';

describe('PaymentForm', () => {
  it('should submit payment with valid data', async () => {
    const handleSubmit = vi.fn();
    render(<PaymentForm onSubmit={handleSubmit} />);
    
    const amountInput = screen.getByLabelText(/amount/i);
    await userEvent.type(amountInput, '100');
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    await userEvent.click(submitButton);
    
    expect(handleSubmit).toHaveBeenCalledWith({ amount: 100 });
  });
});
```

#### E2E Tests (Playwright)

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test
npm run test:e2e -- payment-flow.spec.ts

# Run with UI
npm run test:e2e:ui

# Debug mode
npx playwright test --debug

# Generate trace for failed tests
npx playwright show-trace trace.zip
```

**E2E Test Example**:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Payment Flow', () => {
  test('should complete payment from meter to confirmation', async ({ page }) => {
    // Navigate to application
    await page.goto('http://localhost:5173');
    
    // Select meter
    await page.click('button:has-text("Select Meter")');
    await page.click('text=Meter-001');
    
    // Enter payment amount
    await page.fill('input[name="amount"]', '50');
    
    // Confirm wallet
    await page.click('button:has-text("Connect Wallet")');
    
    // Complete payment
    await page.click('button:has-text("Pay Now")');
    
    // Verify success
    await expect(page).toHaveURL(/.*success/);
    await expect(page.locator('text=Payment Successful')).toBeVisible();
  });
});
```

### Smart Contract Testing

```bash
# Run all contract tests
cargo test --verbose

# Run specific test
cargo test test_payment_execution -- --nocapture

# With logging
RUST_LOG=debug cargo test

# Check code format
cargo fmt -- --check

# Run clippy linter
cargo clippy -- -D warnings
```

### Test Data and Fixtures

```typescript
// fixtures/payment.fixture.ts
export const mockPayment = {
  id: 'pay-123',
  userId: 'user-456',
  amount: 100,
  currency: 'XLM',
  status: 'pending',
  createdAt: new Date(),
};

export const mockUser = {
  id: 'user-456',
  email: 'test@example.com',
  walletAddress: 'GXXXXX...',
  tier: 'standard',
};
```

---

## Deployment Procedures

### Deployment Checklist

Before deploying to any environment, verify:

- [ ] All tests passing locally
- [ ] Code reviewed and approved
- [ ] Database migrations created and tested
- [ ] Environment variables configured
- [ ] Secrets properly managed
- [ ] Backup created
- [ ] Rollback plan documented
- [ ] Monitoring configured
- [ ] Notifications set up

### Staging Deployment

Automatically triggered when PRs are merged to `develop`:

```bash
# Manual trigger (if needed)
git checkout develop
git pull origin develop

# Deploy to staging
docker-compose -f docker-compose.staging.yml pull
docker-compose -f docker-compose.staging.yml up -d

# Run migrations
docker-compose -f docker-compose.staging.yml exec backend npm run migrate:latest

# Verify deployment
curl https://staging.wataboard.com/health
```

### Production Deployment

Manual controlled release to `main`:

```bash
# 1. Create release branch
git checkout develop
git pull origin develop
git checkout -b release/v1.2.0

# 2. Update version numbers
# frontend/package.json
# backend/package.json
# Update VERSION in backend/src/index.ts

# 3. Commit version bump
git add -A
git commit -m "chore(release): v1.2.0"
git push origin release/v1.2.0

# 4. Create PR to main, get approval
# Merge to main via PR

# 5. Tag release
git checkout main
git pull origin main
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0

# 6. Deploy to production
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

# 7. Run migrations
docker-compose -f docker-compose.prod.yml exec backend npm run migrate:latest

# 8. Verify deployment
curl https://wataboard.com/health
```

### Rollback Procedure

```bash
# Immediate rollback to previous version
git checkout main
git revert HEAD
git push origin main

# Or deploy previous tag
git checkout v1.1.5
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# Run migrations backward (if needed)
npm run migrate:rollback

# Verify
curl https://wataboard.com/health
```

### Database Migration Deployment

```bash
# Create migration
cd backend
npm run migrate:create -- add_new_table

# Test migration
npm run migrate:latest -- --test
npm run migrate:rollback

# Verify in production (before deploying app)
npm run migrate:status
npm run migrate:latest

# Monitor migration
npm run migrate:status
```

### Zero-Downtime Deployment

For critical updates:

```bash
# 1. Deploy new backend with backward compatibility
docker-compose -f docker-compose.prod.yml up -d --no-deps backend

# 2. Run database migrations
docker-compose -f docker-compose.prod.yml exec backend npm run migrate:latest

# 3. Deploy new frontend
docker-compose -f docker-compose.prod.yml up -d --no-deps frontend

# 4. Gradually shift traffic (if using load balancer)
# Update nginx configuration and reload

# 5. Verify no errors
docker-compose -f docker-compose.prod.yml logs -f backend
```

---

## Git Workflow Examples

### Feature Development Workflow

```bash
# 1. Start new feature from develop
git checkout develop
git pull origin develop
git checkout -b feature/user-dashboard

# 2. Make changes and commit
echo "export const UserDashboard = () => {...}" > src/pages/UserDashboard.tsx
git add src/pages/UserDashboard.tsx
git commit -m "feat(ui): add user dashboard page"

# 3. Keep branch updated
git fetch origin develop
git rebase origin/develop

# 4. Push to remote
git push origin feature/user-dashboard

# 5. Create PR on GitHub
# (Fill out PR template)

# 6. After approval, merge
git checkout develop
git pull origin develop
git merge --squash feature/user-dashboard
git commit -m "feat(dashboard): add comprehensive user dashboard

- Display payment history
- Show meter overview
- Add scheduled payments section
- Include usage analytics charts

Closes #456"
git push origin develop

# 7. Delete feature branch
git branch -D feature/user-dashboard
git push origin --delete feature/user-dashboard
```

### Hotfix Workflow

```bash
# 1. Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix/payment-processing-error

# 2. Fix the issue
# Edit payment-service.ts
git add src/services/payment-service.ts
git commit -m "fix(payment): resolve transaction verification failure

Was failing to properly verify Stellar transaction hashes.
Now correctly handles async verification."

# 3. Create PR to main
git push origin hotfix/payment-processing-error

# 4. After approval, merge to main and develop
git checkout main
git pull origin main
git merge hotfix/payment-processing-error
git push origin main

# Merge to develop too
git checkout develop
git pull origin develop
git merge main
git push origin develop

# 5. Tag the fix
git checkout main
git tag -a v1.0.1 -m "Hotfix v1.0.1"
git push origin v1.0.1

# 6. Delete hotfix branch
git branch -D hotfix/payment-processing-error
git push origin --delete hotfix/payment-processing-error
```

### Rebasing and Squashing Workflow

```bash
# Interactive rebase to clean up commits before merge
git rebase -i origin/develop

# In editor, mark commits as 'squash' or 'fixup'
# pick feaa123 feat: add payment service
# squash 1a2b3c4 fix: typo in payment service
# squash 5d6e7f8 test: add payment tests

# Force push cleaned history
git push origin feature/your-feature --force-with-lease
```

### Syncing Fork with Upstream

```bash
# Add upstream remote
git remote add upstream https://github.com/nathydre21/wata-board.git

# Fetch upstream changes
git fetch upstream

# Sync develop branch
git checkout develop
git rebase upstream/develop
git push origin develop

# Sync main branch
git checkout main
git rebase upstream/main
git push origin main
```

---

## Troubleshooting Development Issues

### Git Issues

#### Merge Conflict Resolution
```bash
# View conflicts
git status

# Edit conflicted files manually
# Look for <<<<<<, ======, >>>>>>

# After resolving
git add .
git commit -m "resolve: merge conflicts from develop"
git push origin feature/your-feature
```

#### Accidentally Committed to Wrong Branch
```bash
# Get the commit hash
git log --oneline | head -5

# Reset current branch
git reset --hard HEAD~1

# Switch to correct branch and cherry-pick
git checkout feature/correct-branch
git cherry-pick commit-hash
```

#### Need to Undo Published Commit
```bash
# Revert the commit (creates new commit)
git revert commit-hash
git push origin develop

# OR reset if not published yet
git reset --soft HEAD~1
git commit --amend
git push origin --force-with-lease
```

### Database Issues

#### Migration Failed
```bash
# Check migration status
npm run migrate:status

# Rollback last migration
npm run migrate:rollback

# Re-run migrations
npm run migrate:latest

# Verify schema
npm run migrate:status
```

#### Database Connection Error
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Verify credentials in .env
# Test connection
psql -h localhost -U postgres -d wata_board_dev -c "SELECT 1"

# Reset database if needed
docker exec wata-postgres-dev dropdb -U postgres wata_board_dev
docker exec wata-postgres-dev createdb -U postgres wata_board_dev
npm run migrate:latest
```

### Build Issues

#### Node Modules Corruption
```bash
# Clean install
rm -rf node_modules package-lock.json
npm cache clean --force
npm ci
```

#### TypeScript Compilation Error
```bash
# Check for type errors
npm run type-check

# Generate declaration files
npm run build:types

# Review tsconfig.json settings
```

#### Port Already in Use
```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3002 npm run dev
```

### Network/Blockchain Issues

#### Stellar Network Unreachable
```bash
# Check network status
curl -I https://horizon-testnet.stellar.org

# Use alternative Horizon server
STELLAR_HORIZON_URL=https://stellar-testnet.blockchainapi.com npm run dev

# Check testnet faucet
curl -I https://friendbot.stellar.org
```

#### Transaction Verification Failing
```bash
# Verify testnet account exists
curl https://horizon-testnet.stellar.org/accounts/YOUR_ACCOUNT_ID

# Check contract ID
stellar contract info XXXXXX --network testnet

# Reset account sequence number if needed
stellar account manage-data --source your_account \
  --network testnet --set
```

---

## Performance and Optimization

### Frontend Performance

#### Code Splitting

```typescript
// Use React.lazy for route-based code splitting
import { lazy, Suspense } from 'react';

const PaymentForm = lazy(() => import('./pages/PaymentForm'));
const Analytics = lazy(() => import('./pages/Analytics'));

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/payment" element={<PaymentForm />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  );
}
```

#### Bundle Analysis

```bash
# Analyze bundle size
npm run build
npm run analyze

# View interactive bundle visualization
npx vite-plugin-visualizer
```

#### Performance Monitoring

```bash
# Lighthouse CI
npm install -g @lhci/cli@
lhci autorun

# Monitor in browser
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

### Backend Performance

#### Database Query Optimization

```typescript
// Use indexes for frequently queried columns
// migrations/add_indexes.sql
CREATE INDEX idx_users_wallet_address ON users(wallet_address);
CREATE INDEX idx_payments_user_id_date ON payments(user_id, created_at);

// Use EXPLAIN to analyze queries
EXPLAIN ANALYZE
SELECT * FROM payments
WHERE user_id = $1 AND created_at > $2
ORDER BY created_at DESC;
```

#### Caching Strategy

```typescript
// Redis caching for expensive queries
async function getUserWithCache(userId: string) {
  const cacheKey = `user:${userId}`;
  
  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Query database if not cached
  const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
  
  // Store in cache for 1 hour
  await redis.set(cacheKey, JSON.stringify(user), 'EX', 3600);
  
  return user;
}
```

#### Connection Pooling

```typescript
// Optimize database connections
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### API Rate Limiting

```typescript
// Implement tiered rate limiting
const rateLimitMiddleware = async (req, res, next) => {
  const user = req.user;
  const tier = user?.tier || 'free';
  
  const limits = {
    free: { rpm: 10, rph: 100 },
    standard: { rpm: 100, rph: 1000 },
    premium: { rpm: 500, rph: 5000 },
  };
  
  const limit = limits[tier];
  const key = `rate:${user?.id}:${Math.floor(Date.now() / 60000)}`;
  
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  
  if (count > limit.rpm) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  
  next();
};
```

### Monitoring and Profiling

```bash
# Node.js profiling
node --prof backend/dist/index.js

# Generate profile report
node --prof-process isolate-*.log > profile.txt

# Memory leak detection
npm install clinic
clinic doctor -- node backend/dist/index.js

# View clinic report
clinic doctor --collect-only -- node backend/dist/index.js
```

---

## Best Practices Summary

### Code Quality
- ✅ Use TypeScript with strict mode
- ✅ Write tests for new features (70%+ coverage)
- ✅ Use ESLint and Prettier
- ✅ Add JSDoc comments for public APIs
- ✅ Keep functions small and focused

### Git Practices
- ✅ Use conventional commits
- ✅ Keep commits atomic and focused
- ✅ Write descriptive PR descriptions
- ✅ Review code before pushing
- ✅ Keep branches short-lived

### Security
- ✅ Never commit secrets or credentials
- ✅ Use environment variables for config
- ✅ Validate all user inputs
- ✅ Keep dependencies updated
- ✅ Run security audits regularly

### Documentation
- ✅ Update README for significant changes
- ✅ Document API endpoints in Swagger
- ✅ Add comments for complex logic
- ✅ Keep WORKFLOW.md updated
- ✅ Document breaking changes

### Performance
- ✅ Monitor bundle size
- ✅ Optimize database queries
- ✅ Use caching appropriately
- ✅ Implement lazy loading
- ✅ Profile before optimizing

---

## Additional Resources

### Tools and Commands Reference

```bash
# Quick development commands
npm run dev              # Start development server
npm run build            # Build for production
npm run test             # Run tests
npm run test:coverage    # Generate coverage report
npm run lint             # Run linter
npm run format           # Format code with Prettier

# Database commands
npm run migrate:latest   # Run pending migrations
npm run migrate:status   # Show migration status
npm run migrate:rollback # Undo last migration
npm run seed:dev         # Seed test data

# Docker commands
docker-compose up -d     # Start all services
docker-compose down      # Stop all services
docker-compose logs -f   # View logs
docker-compose exec backend npm run migrate:latest
```

### Useful Documentation Links
- [Git Documentation](https://git-scm.com/doc)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [React Best Practices](https://react.dev/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## Support and Questions

- **GitHub Issues**: Report bugs or request features
- **GitHub Discussions**: Ask questions and share ideas
- **Pull Request Feedback**: Get help with code review comments
- **Slack Community**: Join our dev channel for real-time help

---

**Last Updated**: June 2026
**Version**: 1.0.0
