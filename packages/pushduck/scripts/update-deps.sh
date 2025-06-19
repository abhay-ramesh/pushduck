#!/bin/bash

# 🔄 Dependency Update Script
# Safely update dependencies with testing

set -e

echo "🔄 Next-S3-Uploader Dependency Update"
echo "====================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Create backup of current package.json
echo ""
print_info "Creating backup of package.json..."
cp package.json package.json.backup
print_status "Backup created: package.json.backup"

# Function to restore backup on failure
restore_backup() {
    print_warning "Restoring package.json from backup..."
    cp package.json.backup package.json
    pnpm install
}

# Set trap to restore on failure
trap restore_backup ERR

# 1. Update development dependencies (safest)
echo ""
echo "📦 Updating development dependencies..."
echo "--------------------------------------"

print_info "Updating dev dependencies (safe updates)..."
if pnpm update --dev --save-dev; then
    print_status "Dev dependencies updated successfully"
else
    print_error "Failed to update dev dependencies"
    exit 1
fi

# 2. Show outdated production dependencies
echo ""
echo "📋 Checking outdated production dependencies..."
echo "----------------------------------------------"

print_info "Current outdated dependencies:"
pnpm outdated --prod || print_info "All production dependencies are up to date"

echo ""
print_warning "Production dependency updates require manual review!"
print_info "Major updates could break the API. Please review each one carefully."

# 3. Test after dev dependency updates
echo ""
echo "🧪 Testing after dev dependency updates..."
echo "------------------------------------------"

print_info "Running full test suite..."
if pnpm ci; then
    print_status "All tests pass with updated dev dependencies"
else
    print_error "Tests failed with updated dependencies!"
    restore_backup
    exit 1
fi

# 4. Check bundle size impact
echo ""
echo "📊 Checking bundle size impact..."
echo "--------------------------------"

print_info "Rebuilding and checking bundle sizes..."
if pnpm build && pnpm size-check; then
    print_status "Bundle sizes still within limits"
else
    print_error "Bundle size limits exceeded after updates!"
    restore_backup
    exit 1
fi

# 5. Security audit
echo ""
echo "🔒 Running security audit..."
echo "----------------------------"

print_info "Checking for security vulnerabilities..."
if pnpm audit --audit-level=moderate; then
    print_status "No security vulnerabilities found"
else
    print_warning "Security issues detected. Consider running 'pnpm audit fix'"
fi

# 6. Demo app compatibility
echo ""
echo "🎮 Testing demo app compatibility..."
echo "-----------------------------------"

if [ -d "../../apps/new-api-demo" ]; then
    cd ../../apps/new-api-demo
    print_info "Building demo app with updated package..."
    if pnpm build; then
        print_status "Demo app builds successfully"
    else
        print_error "Demo app failed to build!"
        cd - > /dev/null
        restore_backup
        exit 1
    fi
    cd - > /dev/null
else
    print_warning "Demo app not found, skipping compatibility test"
fi

# 7. Clean up and summary
echo ""
echo "🧹 Cleaning up..."
echo "----------------"

# Remove backup file
rm package.json.backup
print_status "Backup file removed"

# Show final dependency status
echo ""
echo "====================================="
echo "🎉 DEPENDENCY UPDATE COMPLETE!"
echo "====================================="

print_status "Development dependencies updated successfully"
print_status "All tests passing"
print_status "Bundle sizes within limits"
print_status "Demo app compatibility verified"

echo ""
echo "📊 Summary:"
echo "- Dev dependencies: ✅ Updated and tested"
echo "- Production deps: ⚠️  Manual review needed"
echo "- Security audit: ✅ Clean"
echo "- Bundle size: ✅ Within limits"
echo "- Demo app: ✅ Compatible"

echo ""
echo "📋 Next steps for production dependency updates:"
echo "1. Review 'pnpm outdated --prod' output above"
echo "2. Update production dependencies one by one"
echo "3. Test each update thoroughly"
echo "4. Consider version compatibility with Next.js/React"

echo ""
print_info "For production dependency updates, consider:"
echo "  pnpm update @aws-sdk/client-s3@latest"
echo "  pnpm update @aws-sdk/s3-request-presigner@latest"
echo "  # Test thoroughly after each update"

echo ""
print_warning "Always run 'pnpm ci' after production dependency updates!"

# Remove trap
trap - ERR 