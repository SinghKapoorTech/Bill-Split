import { execSync } from 'child_process';

function isEmulatorRunning(): boolean {
  try {
    execSync('curl -s http://localhost:8081', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function globalSetup() {
  if (isEmulatorRunning()) {
    console.log('Firebase emulators already running, reusing...');
    return;
  }

  console.log('Starting Firebase emulators...');

  // Start emulators in background with Java PATH
  const env = { ...process.env, PATH: `/opt/homebrew/opt/openjdk/bin:${process.env.PATH}` };
  execSync(
    'firebase emulators:start --only auth,firestore &',
    { cwd: process.cwd(), env, stdio: 'ignore', shell: '/bin/zsh' }
  );

  // Wait for emulators to be ready (max 30s)
  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    if (isEmulatorRunning()) {
      console.log('Firebase emulators ready!');
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error('Firebase emulators failed to start within 30 seconds');
}

export default globalSetup;
