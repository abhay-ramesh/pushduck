#!/bin/bash

# Reserve @pushduck namespace packages
# Run this after creating the NPM organization

set -e

echo "🦆 Reserving @pushduck namespace packages..."

# Create temporary directory
TEMP_DIR="/tmp/pushduck-reservations"
mkdir -p $TEMP_DIR
cd $TEMP_DIR

# Function to create and publish a reservation package
reserve_package() {
    local package_name=$1
    local description=$2
    
    echo "📦 Reserving @pushduck/$package_name..."
    
    # Create package directory
    mkdir -p $package_name
    cd $package_name
    
    # Create package.json
    cat > package.json << EOF
{
  "name": "@pushduck/$package_name",
  "version": "0.0.1-reserved",
  "description": "Reserved: $description",
  "main": "reserved.js",
  "repository": {
    "type": "git",
    "url": "https://github.com/abhay-ramesh/pushduck.git"
  },
  "homepage": "https://pushduck.dev",
  "keywords": ["pushduck", "reserved", "placeholder"],
  "author": "Abhay Ramesh",
  "license": "MIT"
}
EOF

    # Create reserved.js
    cat > reserved.js << 'EOF'
console.log(`
🦆 This package name is reserved for the pushduck ecosystem.

The main package is currently available as: pushduck
Visit: https://pushduck.dev

This scoped package will be available in a future release.
`);

module.exports = {
  reserved: true,
  message: "This package name is reserved for pushduck ecosystem",
  mainPackage: "pushduck",
  website: "https://pushduck.dev"
};
EOF

    # Create README.md
    cat > README.md << EOF
# @pushduck/$package_name

🚧 **This package name is reserved for the pushduck ecosystem.**

## Current Status

This is a placeholder package to reserve the name for future development.

## Main Package

The main pushduck package is currently available as:

\`\`\`bash
npm install pushduck
\`\`\`

## Future Plans

This scoped package will contain: $description

## Links

- 🌐 **Website**: [pushduck.dev](https://pushduck.dev)
- 📦 **Main Package**: [pushduck on NPM](https://www.npmjs.com/package/pushduck)
- 🐙 **Repository**: [abhay-ramesh/pushduck](https://github.com/abhay-ramesh/pushduck)

---

*This package is maintained as part of the pushduck ecosystem.*
EOF

    # Publish package
    echo "Publishing @pushduck/$package_name..."
    npm publish --access public
    
    # Go back to temp directory
    cd ..
    
    echo "✅ @pushduck/$package_name reserved successfully!"
}

# Core packages (reserve immediately)
reserve_package "core" "Main pushduck library for S3 uploads"
reserve_package "cli" "CLI tools for pushduck setup and management"
reserve_package "types" "TypeScript type definitions for pushduck"

# Framework packages
reserve_package "react" "React components and hooks for pushduck"
reserve_package "vue" "Vue.js components for pushduck"
reserve_package "svelte" "Svelte components for pushduck"

# Integration packages
reserve_package "next" "Next.js specific features and optimizations"
reserve_package "providers" "Cloud provider integrations (AWS, Cloudflare, etc.)"
reserve_package "integrations" "Third-party service integrations"

echo ""
echo "🎉 All @pushduck packages reserved successfully!"
echo ""
echo "📋 Reserved packages:"
echo "  - @pushduck/core"
echo "  - @pushduck/cli"  
echo "  - @pushduck/types"
echo "  - @pushduck/react"
echo "  - @pushduck/vue"
echo "  - @pushduck/svelte"
echo "  - @pushduck/next"
echo "  - @pushduck/providers"
echo "  - @pushduck/integrations"
echo ""
echo "🔗 Next steps:"
echo "  1. Publish main 'pushduck' package"
echo "  2. Update documentation with roadmap"
echo "  3. Plan transition to scoped packages"
echo ""
echo "🦆 Happy coding!"

# Cleanup
cd /
rm -rf $TEMP_DIR 