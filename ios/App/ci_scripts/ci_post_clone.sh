#!/bin/zsh

# Fail on error
set -e

# The CI working directory is usually /Volumes/workspace/repository
# We are starting in the root of the repository

echo "--- 🛠️ Starting Xcode Cloud post-clone setup ---"

# 1. Install Node dependencies (includes @capacitor/cli etc.)
echo "--- 📦 Installing Node dependencies ---"
npm install

# 2. Build the web app (Vite build)
echo "--- 🏗️ Building Web App ---"
npm run build

# 3. Sync Capacitor (copies web assets and prepares native projects)
echo "--- ⚡ Capacitor Syncing ---"
npx cap sync ios

# 4. Explicitly run pod install in the iOS directory
# Capacitor sync usually does this, but being explicit prevents the xcconfig error
echo "--- 🍎 Installing CocoaPods ---"
cd ios/App && pod install

echo "--- ✅ CI Setup Complete ---"
