#!/bin/zsh

# Fail on error
set -e

# The CI working directory can vary, so we move to the root of the repo
# Script is at: <root>/ios/App/ci_scripts/ci_post_clone.sh
PROJECT_DIR="$( cd "$( dirname "$0" )/../../.." && pwd )"
cd "$PROJECT_DIR"

echo "--- 🛠️ Starting Xcode Cloud post-clone setup ---"
echo "--- 📍 Working Directory: $(pwd) ---"

# 1. Install Node dependencies
echo "--- 📦 Installing Node dependencies ---"
# Check if npm exists
if ! command -v npm &> /dev/null; then
    echo "❌ npm command not found. Make sure Node.js is installed in CI environment."
    exit 127
fi
npm install

# 2. Build the web app (Vite build)
echo "--- 🏗️ Building Web App ---"
npm run build

# 3. Sync Capacitor
echo "--- ⚡ Capacitor Syncing ---"
npx cap sync ios

# 4. Explicitly run pod install
echo "--- 🍎 Installing CocoaPods ---"
cd ios/App && pod install

echo "--- ✅ CI Setup Complete ---"

echo "--- ✅ CI Setup Complete ---"
