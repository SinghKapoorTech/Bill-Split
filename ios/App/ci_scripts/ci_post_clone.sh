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

    if command -v brew > /dev/null 2>&1; then
        brew install node
    else
        # Try common Homebrew paths on Apple Silicon and Intel Macs
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

# 2. Install npm dependencies
npm install

# 3. Build the web app (Vite build)
echo "--- Building Web App ---"
npm run build

# 4. Sync Capacitor
echo "--- Capacitor Syncing ---"
npx cap sync ios

# 5. Explicitly run pod install
echo "--- Installing CocoaPods ---"
cd ios/App && pod install

echo "--- CI Setup Complete ---"
