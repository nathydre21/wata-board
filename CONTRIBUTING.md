# Contributing to Wata-Board

First off, thank you for considering contributing to Wata-Board! It's people like you that make this decentralized utility payment platform a reality.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. We expect all contributors to maintain a welcoming, inclusive, and harassment-free environment.

## How to Contribute

### Reporting Bugs
- Check the issue tracker to see if the bug has already been reported.
- Use the "Bug Report" issue template.
- Include clear reproduction steps, expected behavior, and actual behavior.
- Provide your environment details (OS, Node version, Browser).

### Suggesting Enhancements
- Use the "Feature Request" issue template.
- Clearly describe the problem the enhancement solves.
- Propose a solution or implementation approach if you have one.

## Development Process

1. **Fork the repository** to your own GitHub account.
2. **Clone the project** to your local machine.
3. **Create a branch** for your feature or bug fix:
   - Format: `feature/your-feature-name` or `fix/issue-number-description`
   - Example: `feature/add-payment-history` or `fix/42-cors-error`
4. **Develop your changes** locally, ensuring you follow the code standards below.
5. **Write tests** to cover your changes (we require 95%+ coverage).
6. **Run the test suite** locally before committing.

## Code Standards & Conventions

### General
- Write meaningful, descriptive commit messages.
- Keep your commits small and focused on a single logical change.
- Ensure there are no unused variables or console logs in production code.

### Frontend (React/TypeScript)
- Use functional components and React Hooks.
- Enforce strict typing with TypeScript (avoid `any`).
- Use standard ESLint and Prettier configurations provided in the project.
- Follow the existing folder structure (`components/`, `hooks/`, `services/`, etc.).

### Backend (Node.js/Express)
- Use asynchronous programming (`async/await`) instead of raw promises or callbacks.
- Implement proper error handling and logging for API routes.
- Ensure all new endpoints are covered by rate limiting and CORS policies.

### Smart Contracts (Soroban/Rust)
- Follow Rust formatting standard (`cargo fmt`).
- Ensure deterministic execution and optimal fee sizing.
- Document all contract interface methods clearly.

## Pull Request Process

1. **Update Documentation**: If your PR changes API endpoints, database schemas, or deployment steps, update the corresponding markdown documentation.
2. **Draft PR**: Feel free to open a Draft PR to get early feedback on your approach.
3. **Open the PR**: Fill out the Pull Request template completely, linking to any relevant issues (e.g., `Closes #123`).
4. **CI Checks**: Ensure all Continuous Integration checks (linting, tests, build) pass. If they fail, fix the issues and push the updates.
5. **Wait for Review**: A maintainer will review your PR. Be responsive to feedback and discussions.

## Code Review Procedures

### For Contributors
- Be open to constructive criticism. The goal is to ensure high code quality.
- When making requested changes, push them as new commits to your branch rather than force-pushing (to make reviewing updates easier).
- Once you've addressed all comments, request a re-review.

### For Reviewers
- Review PRs promptly to respect the contributor's time.
- Focus on the logic, security, and performance. Let automated tools handle formatting.
- Ensure tests exist and adequately cover the new code.
- Verify that the PR does not go beyond the scope of the linked issue.

Thank you for your contributions!