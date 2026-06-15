#!/usr/bin/env node
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  // Pass control to the existing npm start script, preserving colors and exact behavior.
  execSync('npm run start', { cwd: __dirname, stdio: 'inherit' });
} catch (e) {
  // Ignore. Errors will be printed by the child process.
  process.exit(1);
}
