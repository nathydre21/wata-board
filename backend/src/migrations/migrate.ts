#!/usr/bin/env node

import { runCLI } from './MigrationCLI';

// Get command line arguments (excluding node and script name)
const args = process.argv.slice(2);

// Run the CLI
runCLI(args).catch(error => {
  console.error('Migration CLI failed:', error);
  process.exit(1);
});
