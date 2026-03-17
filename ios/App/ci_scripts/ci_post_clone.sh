#!/bin/bash

# Fail on error
set -e

# The CI working directory can vary, so we move to the root of the repo
# Script is at: <root>/ios/App/ci_scripts/ci_post_clone.sh
PROJECT_DIR="$( cd "$( dirname "$0" )/../../.." && pwd )"
cd "$PROJECT_DIR"

export CI=true
SECONDS=0

echo "=== Xcode Cloud post-clone setup ==="
echo "Working directory: $(pwd)"

# 1. Install Node.js if not available
if ! command -v node > /dev/null 2>&1; then
    echo "--- Installing Node.js via Homebrew ---"

    export HOMEBREW_NO_INSTALL_CLEANUP=1
    export HOMEBREW_NO_AUTO_UPDATE=1

    if command -v brew > /dev/null 2>&1; then
        brew install node
    elif [ -x /opt/homebrew/bin/brew ]; then
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

# Ensure brew-installed binaries are on PATH
if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi

echo "Node $(node --version) | npm $(npm --version)"

# 2. Install npm dependencies
echo "--- Installing npm dependencies ---"
npm ci --prefer-offline --no-audit --no-fund

# 3. Build the web app (Vite)
echo "--- Building web app ---"
npm run build

# 4. Sync Capacitor (copies web assets + updates native plugins + pod install)
echo "--- Capacitor sync ---"
npx cap sync ios

echo "=== CI Setup Complete in ${SECONDS}s ==="
