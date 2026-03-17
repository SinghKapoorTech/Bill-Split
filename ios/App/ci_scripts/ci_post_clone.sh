#!/bin/sh

# Fail on error
set -e

# The CI working directory can vary, so we move to the root of the repo
# Script is at: <root>/ios/App/ci_scripts/ci_post_clone.sh
PROJECT_DIR="$( cd "$( dirname "$0" )/../../.." && pwd )"
cd "$PROJECT_DIR"

export CI=true

SECONDS=0
step_start() { STEP_START=$SECONDS; echo "--- $1 ---"; }
step_end() { echo "--- $1 completed in $(( SECONDS - STEP_START ))s ---"; }

echo "=== Xcode Cloud post-clone setup ==="
echo "Working directory: $(pwd)"

# 1. Install Node.js if not available
if ! command -v node > /dev/null 2>&1; then
    step_start "Installing Node.js via Homebrew"

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

    step_end "Node.js install"
fi

# Ensure brew-installed binaries are on PATH
if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi

echo "Node $(node --version) | npm $(npm --version)"

# 2. Install npm dependencies
step_start "Installing npm dependencies"
npm ci --prefer-offline --no-audit --no-fund --no-optional
step_end "npm ci"

# 3. Build the web app (Vite)
step_start "Building web app"
npm run build
step_end "Vite build"

# 4. Copy web assets to iOS project
# Use 'cap copy' (fast) instead of 'cap sync' (runs pod install every time).
step_start "Copying web assets to iOS"
npx cap copy ios
step_end "Capacitor copy"

# 5. Run pod install only if Pods are missing or Podfile changed
PODS_DIR="$PROJECT_DIR/ios/App/Pods"
PODFILE_LOCK="$PROJECT_DIR/ios/App/Podfile.lock"
PODS_MANIFEST="$PODS_DIR/Manifest.lock"

if [ ! -d "$PODS_DIR" ] || [ ! -f "$PODS_MANIFEST" ] || ! diff -q "$PODFILE_LOCK" "$PODS_MANIFEST" > /dev/null 2>&1; then
    step_start "Running pod install (Pods missing or Podfile changed)"
    cd "$PROJECT_DIR/ios/App"
    pod install
    cd "$PROJECT_DIR"
    step_end "pod install"
else
    echo "--- Skipping pod install (Pods up to date) ---"
fi

echo "=== CI Setup Complete in ${SECONDS}s ==="
