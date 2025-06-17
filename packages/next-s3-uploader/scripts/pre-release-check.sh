#!/bin/bash

# 🛡️ Pre-Release Safety Check
# Catches common mistakes before they cause problems

set -e  # Exit on any error

echo "🛡️  Starting Pre-Release Safety Check..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Error tracking
ERRORS=0
WARNINGS=0

error() {
    echo -e "${RED}❌ ERROR: $1${NC}"
    ERRORS=$((ERRORS + 1))
}

warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 1. Check if we're in the right directory
if [[ ! -f "package.json" ]] || [[ ! -d "src" ]]; then
    error "Must be run from packages/next-s3-uploader directory"
    exit 1
fi

success "Correct directory confirmed"

# 2. Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    warning "Uncommitted changes detected. Consider committing before release."
    git status --short
fi

# 3. Check branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]] && [[ "$CURRENT_BRANCH" != "master" ]]; then
    warning "Not on main/master branch (current: $CURRENT_BRANCH)"
fi

# 4. Run health check
info "Running comprehensive health check..."
if ! pnpm maintenance:health; then
    error "Health check failed. Fix issues before releasing."
fi

# 5. Check for pending changesets
CHANGESET_COUNT=$(find ../../.changeset -name "*.md" -not -name "README.md" | wc -l)
if [[ $CHANGESET_COUNT -eq 0 ]]; then
    error "No pending changesets found. Run 'pnpm changeset' first."
fi

success "Found $CHANGESET_COUNT pending changeset(s)"

# 6. Validate changeset quality
info "Validating changeset quality..."
for changeset in ../../.changeset/*.md; do
    if [[ "$changeset" == "../../.changeset/README.md" ]]; then
        continue
    fi
    
    # Check length
    WORD_COUNT=$(wc -w < "$changeset")
    if [[ $WORD_COUNT -lt 10 ]]; then
        warning "Changeset $(basename "$changeset") is very short ($WORD_COUNT words). Consider adding more detail."
    fi
    
    # Check for generic phrases
    if grep -q "fix\|update\|change" "$changeset" && [[ $WORD_COUNT -lt 15 ]]; then
        warning "Changeset $(basename "$changeset") appears generic. Add specific details about the change."
    fi
done

# 7. Check version synchronization
MAIN_VERSION=$(node -p "require('./package.json').version")
CLI_VERSION=$(node -p "require('../cli/package.json').version")

if [[ "$MAIN_VERSION" != "$CLI_VERSION" ]]; then
    warning "Version mismatch detected:"
    warning "  next-s3-uploader: $MAIN_VERSION"
    warning "  create-next-s3-uploader: $CLI_VERSION"
    warning "Linked packages should have matching versions"
fi

# 8. Check bundle size (estimate)
info "Checking bundle sizes..."
if [[ -f "dist/client.js" ]]; then
    CLIENT_SIZE=$(stat -f%z "dist/client.js" 2>/dev/null || stat -c%s "dist/client.js" 2>/dev/null || echo "0")
    if [[ $CLIENT_SIZE -gt 10240 ]]; then  # 10KB limit
        warning "Client bundle is large: ${CLIENT_SIZE} bytes. Consider optimization."
    fi
fi

# 9. Check for TODO/FIXME comments
info "Scanning for unfinished work..."
TODO_COUNT=$(find src -name "*.ts" -o -name "*.tsx" | xargs grep -l "TODO\|FIXME\|XXX" | wc -l)
if [[ $TODO_COUNT -gt 0 ]]; then
    warning "Found $TODO_COUNT files with TODO/FIXME comments"
    find src -name "*.ts" -o -name "*.tsx" | xargs grep -n "TODO\|FIXME\|XXX" | head -5
fi

# 10. Check npm registry connectivity
info "Testing NPM registry connection..."
if ! npm ping > /dev/null 2>&1; then
    error "Cannot connect to NPM registry. Check internet connection."
fi

# 11. Check if versions already exist on NPM
NEXT_VERSION=$(node -p "
const fs = require('fs');
const changesets = fs.readdirSync('../../.changeset').filter(f => f.endsWith('.md') && f !== 'README.md');
if (changesets.length === 0) process.exit(1);
const content = fs.readFileSync('../../.changeset/' + changesets[0], 'utf8');
const currentVersion = require('./package.json').version;
const [major, minor, patch] = currentVersion.split('.').map(Number);
if (content.includes('major')) console.log(major + 1 + '.0.0');
else if (content.includes('minor')) console.log(major + '.' + (minor + 1) + '.0');
else console.log(major + '.' + minor + '.' + (patch + 1));
")

if [[ -n "$NEXT_VERSION" ]]; then
    if npm view "next-s3-uploader@$NEXT_VERSION" version > /dev/null 2>&1; then
        error "Version $NEXT_VERSION already exists on NPM!"
    else
        success "Version $NEXT_VERSION is available"
    fi
fi

# 12. Check release timing (avoid peak hours)
HOUR=$(date +"%H")
if [[ $HOUR -ge 14 ]] && [[ $HOUR -le 18 ]]; then
    warning "Releasing during peak hours (2-6 PM UTC). Consider waiting for lower traffic."
fi

# 13. Final summary
echo ""
echo "=================================================="
echo "🛡️  Pre-Release Safety Check Complete"
echo "=================================================="

if [[ $ERRORS -gt 0 ]]; then
    error "Found $ERRORS error(s). Release blocked! ⛔"
    echo ""
    echo "❌ DO NOT PROCEED WITH RELEASE"
    echo "Fix the errors above and run this check again."
    exit 1
fi

if [[ $WARNINGS -gt 0 ]]; then
    warning "Found $WARNINGS warning(s). Proceed with caution. ⚠️"
    echo ""
    echo "🤔 WARNINGS DETECTED"
    echo "Review warnings above. You can proceed but should address them."
    echo ""
    read -p "Do you want to continue despite warnings? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Release cancelled by user."
        exit 1
    fi
fi

success "All checks passed! Safe to proceed with release. 🚀"
echo ""
echo "Next steps:"
echo "1. pnpm version-packages"
echo "2. Review generated CHANGELOG.md"
echo "3. pnpm release"
echo "" 