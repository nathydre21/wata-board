#!/bin/bash

# Comprehensive Test Execution Script for Wata-Board
# This script runs all tests and generates coverage reports

echo "🚀 Starting Wata-Board Comprehensive Test Suite"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

# Frontend Tests
print_status "Running Frontend Tests..."
cd wata-board-frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing frontend dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        print_error "Failed to install frontend dependencies"
        exit 1
    fi
fi

# Run frontend unit tests with coverage
print_status "Running frontend unit tests with coverage..."
npm run test:coverage
if [ $? -eq 0 ]; then
    print_success "Frontend unit tests passed"
else
    print_error "Frontend unit tests failed"
    exit 1
fi

# Run frontend E2E and Mobile tests
print_status "Running frontend E2E and Mobile tests (Playwright)..."
npm run test
if [ $? -eq 0 ]; then
    print_success "Frontend E2E/Mobile tests passed"
else
    print_error "Frontend E2E/Mobile tests failed"
    exit 1
fi

# Backend Tests
print_status "Running Backend Tests..."
cd backend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing backend dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        print_error "Failed to install backend dependencies"
        exit 1
    fi
fi

# Run backend tests with coverage
print_status "Running backend unit tests with coverage..."
npm run test:coverage
if [ $? -eq 0 ]; then
    print_success "Backend tests passed"
else
    print_error "Backend tests failed"
    exit 1
fi

# Run migration tests
print_status "Running migration tests..."
npm run test -- --config jest.config.migrations.js
if [ $? -eq 0 ]; then
    print_success "Migration tests passed"
else
    print_error "Migration tests failed"
    exit 1
fi

# Generate combined coverage report
print_status "Generating combined coverage report..."
cd ..

# Create coverage summary
echo "# Test Coverage Summary" > COVERAGE_SUMMARY.md
echo "" >> COVERAGE_SUMMARY.md
echo "## Frontend Coverage" >> COVERAGE_SUMMARY.md
if [ -f "wata-board-frontend/coverage/coverage-summary.json" ]; then
    cat wata-board-frontend/coverage/coverage-summary.json >> COVERAGE_SUMMARY.md
else
    echo "Frontend coverage report not found" >> COVERAGE_SUMMARY.md
fi

echo "" >> COVERAGE_SUMMARY.md
echo "## Backend Coverage" >> COVERAGE_SUMMARY.md
if [ -f "backend/coverage/coverage-summary.json" ]; then
    cat backend/coverage/coverage-summary.json >> COVERAGE_SUMMARY.md
else
    echo "Backend coverage report not found" >> COVERAGE_SUMMARY.md
fi

print_success "Combined coverage report generated: COVERAGE_SUMMARY.md"

# Test Results Summary
print_status "Generating test results summary..."
echo "# Test Results Summary" > TEST_RESULTS.md
echo "" >> TEST_RESULTS.md
echo "## Execution Time: $(date)" >> TEST_RESULTS.md
echo "" >> TEST_RESULTS.md
echo "## Test Suites" >> TEST_RESULTS.md
echo "- ✅ Frontend Unit Tests" >> TEST_RESULTS.md
echo "- ✅ Backend Unit Tests" >> TEST_RESULTS.md
echo "- ✅ Integration Tests" >> TEST_RESULTS.md
echo "- ✅ Mobile & Responsive Tests" >> TEST_RESULTS.md
echo "- ✅ Error Scenario Tests" >> TEST_RESULTS.md
echo "" >> TEST_RESULTS.md
echo "## Coverage Reports" >> TEST_RESULTS.md
echo "- Frontend: [wata-board-frontend/coverage/index.html](wata-board-frontend/coverage/index.html)" >> TEST_RESULTS.md
echo "- Backend: [wata-board-dapp/coverage/lcov-report/index.html](wata-board-dapp/coverage/lcov-report/index.html)" >> TEST_RESULTS.md

print_success "Test results summary generated: TEST_RESULTS.md"

# Final Summary
echo ""
echo "=================================================="
print_success "🎉 All tests completed successfully!"
echo ""
echo "📊 Coverage Reports:"
echo "   Frontend: wata-board-frontend/coverage/index.html"
echo "   Backend:  backend/coverage/lcov-report/index.html"
echo ""
echo "📄 Summary Files:"
echo "   Coverage: COVERAGE_SUMMARY.md"
echo "   Results:  TEST_RESULTS.md"
echo ""
print_status "To view detailed coverage reports, open the HTML files in your browser."
echo "=================================================="
