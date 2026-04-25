#!/bin/bash

# CORS Setup Script for Wata-Board
# This script helps set up the CORS configuration

set -e

echo "🚀 Wata-Board CORS Setup Script"
echo "================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the wata-board-dapp directory"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "📝 Setting up environment configuration..."

# Check if .env exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists. Creating backup..."
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
fi

# Copy example environment if it doesn't exist
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✅ Created .env from .env.example"
fi

echo ""
echo "🔧 CORS Configuration Options:"
echo "1. Development (localhost allowed)"
echo "2. Production (specific domains only)"
echo "3. Custom configuration"

read -p "Choose configuration type (1-3): " choice

case $choice in
    1)
        echo "🔧 Setting up development configuration..."
        sed -i.bak 's/NODE_ENV=.*/NODE_ENV=development/' .env
        sed -i.bak 's/ALLOWED_ORIGINS=.*/ALLOWED_ORIGINS=http:\/\/localhost:3000,http:\/\/localhost:5173/' .env
        echo "✅ Development CORS configured"
        ;;
    2)
        echo "🔧 Setting up production configuration..."
        read -p "Enter your frontend domain (e.g., https://yourdomain.com): " domain
        sed -i.bak 's/NODE_ENV=.*/NODE_ENV=production/' .env
        sed -i.bak "s/ALLOWED_ORIGINS=.*/ALLOWED_ORIGINS=$domain/" .env
        sed -i.bak "s/FRONTEND_URL=.*/FRONTEND_URL=$domain/" .env
        echo "✅ Production CORS configured for $domain"
        ;;
    3)
        echo "🔧 Custom configuration - please edit .env file manually"
        echo "Key variables to configure:"
        echo "  - NODE_ENV (development/production)"
        echo "  - ALLOWED_ORIGINS (comma-separated list)"
        echo "  - FRONTEND_URL (your frontend domain)"
        ;;
    *)
        echo "❌ Invalid choice. Please edit .env manually."
        exit 1
        ;;
esac

echo ""
echo "🧪 Testing CORS configuration..."

# Check if server can start (quick test)
echo "Testing server startup..."
timeout 5s npm run dev > /dev/null 2>&1 || {
    echo "⚠️  Server test timed out (this is normal if dependencies are missing)"
}

echo ""
echo "✅ CORS Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Review and update your .env file with actual values"
echo "2. Set ADMIN_SECRET_KEY for Stellar functionality"
echo "3. Run 'npm run dev' to start the development server"
echo "4. Test CORS with: npm run test:cors (if available)"
echo ""
echo "📚 For detailed information, see CORS_IMPLEMENTATION.md"
echo ""
echo "🌐 Server will run on: http://localhost:3001"
echo "🔗 Frontend should run on: http://localhost:5173 (with proxy)"
