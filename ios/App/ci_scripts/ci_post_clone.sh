#!/bin/sh

# Fail on error
set -e

# The CI working directory can vary, so we move to the root of the repo
# Script is at: <root>/ios/App/ci_scripts/ci_post_clone.sh
PROJECT_DIR="$( cd "$( dirname "$0" )/../../.." && pwd )"
cd "$PROJECT_DIR"

echo "--- Starting Xcode Cloud post-clone setup ---"
echo "--- Working Directory: $(pwd) ---"

# 1. Install Node.js if not available
echo "--- Installing Node dependencies ---"

if ! command -v node > /dev/null 2>&1; then
    echo "Node.js not found. Installing via Homebrew..."

    # Xcode Cloud may have brew in a non-standard location
    export HOMEBREW_NO_INSTALL_CLEANUP=1
    export HOMEBREW_NO_AUTO_UPDATE=1

    if command -v brew > /dev/null 2>&1; then
        brew install node
    else
        if [ -x /opt/homebrew/bin/brew ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
            brew install node
        elif [ -x /usr/local/bin/brew ]; then
            eval "$(/usr/local/bin/brew shellenv)"
            brew install node
        else
            echo "ERROR: Neither Node.js nor Homebrew found. Cannot proceed."
            exit 1
        fi
    fi
fi

# Ensure brew-installed binaries are on PATH
if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi

echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

# 2. Install npm dependencies (skip optional deps, prefer offline cache)
npm ci --prefer-offline --no-audit --no-fund

# 3. Build the web app (Vite build)
echo "--- Building Web App ---"
npm run build

# 4. Sync Capacitor (skip pod install here, we do it explicitly below)
echo "--- Capacitor Syncing ---"
npx cap sync ios --no-build

# 5. Install CocoaPods
echo "--- Installing CocoaPods ---"
cd ios/App && pod install --repo-update

echo "--- CI Setup Complete ---"
