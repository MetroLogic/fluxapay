#!/bin/bash

# FluxaPay i18n Setup Script
# This script sets up the internationalization system

echo "🌍 FluxaPay i18n Setup"
echo "====================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the fluxapay_frontend directory."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"
echo ""

# Verify file structure
echo "🔍 Verifying file structure..."

files=(
    "src/i18n/routing.ts"
    "src/i18n/request.ts"
    "src/middleware.ts"
    "messages/en.json"
    "messages/fr.json"
    "messages/pt.json"
    "src/components/LocaleSwitcher.tsx"
    "src/lib/i18n-utils.ts"
    "src/types/i18n.d.ts"
)

all_files_exist=true

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (missing)"
        all_files_exist=false
    fi
done

echo ""

if [ "$all_files_exist" = false ]; then
    echo "⚠️  Warning: Some files are missing. The setup may not work correctly."
    echo ""
fi

# Check documentation
echo "📚 Documentation files:"
docs=(
    "I18N_README.md"
    "I18N_QUICKSTART.md"
    "I18N_SETUP.md"
    "I18N_MIGRATION_GUIDE.md"
    "EXAMPLE_MIGRATION.md"
    "I18N_CHECKLIST.md"
    "I18N_IMPLEMENTATION_SUMMARY.md"
)

for doc in "${docs[@]}"; do
    if [ -f "$doc" ]; then
        echo "  ✅ $doc"
    else
        echo "  ❌ $doc (missing)"
    fi
done

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 Next steps:"
echo "  1. Start the development server: npm run dev"
echo "  2. Visit http://localhost:3075 (English)"
echo "  3. Visit http://localhost:3075/fr (French)"
echo "  4. Visit http://localhost:3075/pt (Portuguese)"
echo "  5. Read I18N_QUICKSTART.md to get started"
echo ""
echo "📖 Documentation:"
echo "  - Quick Start: I18N_QUICKSTART.md"
echo "  - Full Guide: I18N_SETUP.md"
echo "  - Migration: I18N_MIGRATION_GUIDE.md"
echo "  - Examples: EXAMPLE_MIGRATION.md"
echo ""
echo "Happy translating! 🎉"
