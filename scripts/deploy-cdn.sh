#!/bin/bash

# CDN Deployment Script for Wata-Board
# This script builds and deploys frontend assets to CDN

set -e

# Configuration
FRONTEND_DIR="frontend"
BUILD_DIR="$FRONTEND_DIR/dist"
CDN_BUCKET="wata-board-cdn"
CDN_DISTRIBUTION_ID="E123456789ABCDEF"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    log_info "All dependencies are installed"
}

# Build frontend assets
build_frontend() {
    log_info "Building frontend assets..."
    
    cd "$FRONTEND_DIR"
    
    # Install dependencies
    npm ci
    
    # Build for production with CDN base URL
    NODE_ENV=production CDN_BASE_URL="https://cdn.wata-board.com" npm run build
    
    cd ..
    
    log_info "Frontend build completed"
}

# Deploy to CDN
deploy_to_cdn() {
    log_info "Deploying assets to CDN..."
    
    # Sync to S3 bucket (if using AWS CloudFront)
    if command -v aws &> /dev/null; then
        aws s3 sync "$BUILD_DIR/" "s3://$CDN_BUCKET/" \
            --delete \
            --content-encoding gzip \
            --cache-control "max-age=31536000, immutable"
        
        # Invalidate CloudFront cache
        aws cloudfront create-invalidation \
            --distribution-id "$CDN_DISTRIBUTION_ID" \
            --paths "/*"
        
        log_info "Assets deployed to S3 and CloudFront cache invalidated"
    else
        log_warn "AWS CLI not found. Please deploy manually to your CDN provider"
    fi
}

# Health check
health_check() {
    log_info "Performing CDN health check..."
    
    CDN_URL="https://cdn.wata-board.com"
    
    if curl -f -s -o /dev/null "$CDN_URL"; then
        log_info "CDN is accessible"
    else
        log_warn "CDN health check failed"
    fi
}

# Cleanup
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -rf "$BUILD_DIR"
}

# Main deployment process
main() {
    log_info "Starting CDN deployment process..."
    
    check_dependencies
    build_frontend
    deploy_to_cdn
    health_check
    cleanup
    
    log_info "CDN deployment completed successfully!"
}

# Handle script interruption
trap cleanup EXIT

# Run main function
main "$@"
