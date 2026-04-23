#!/usr/bin/env node

/**
 * Migration CLI for Wata-Board
 * Command-line interface for running database migrations
 */

import { MigrationService } from './MigrationService';

const migrationService = new MigrationService();

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'run':
      case 'migrate':
        await runMigrations();
        break;
      
      case 'status':
        showStatus();
        break;
      
      case 'log':
        showLog();
        break;
      
      case 'rollback':
        if (args.length === 0) {
          console.error('Error: Please specify a version to rollback');
          process.exit(1);
        }
        await rollbackMigration(args[0]);
        break;
      
      case 'reset':
        await resetMigrations();
        break;
      
      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('Command failed:', error);
    process.exit(1);
  }
}

async function runMigrations() {
  console.log('🚀 Running migrations...');
  
  const results = await migrationService.runMigrations();
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  console.log(`\n✅ Migration completed:`);
  console.log(`   Total: ${results.length}`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${failureCount}`);
  
  if (failureCount > 0) {
    console.log('\n❌ Failed migrations:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   ${r.version}: ${r.error}`);
    });
    process.exit(1);
  }
}

function showStatus() {
  const status = migrationService.getStatus();
  
  console.log('📊 Migration Status:');
  console.log(`   Total migrations: ${status.total}`);
  console.log(`   Completed: ${status.completed}`);
  console.log(`   Pending: ${status.pending.length}`);
  
  if (status.pending.length > 0) {
    console.log('\n⏳ Pending migrations:');
    status.pending.forEach(version => {
      console.log(`   - ${version}`);
    });
  }
  
  if (status.executed.length > 0) {
    console.log('\n✅ Executed migrations:');
    status.executed.forEach(version => {
      console.log(`   - ${version}`);
    });
  }
}

function showLog() {
  const log = migrationService.getLog();
  
  if (log.length === 0) {
    console.log('📝 No migration history found');
    return;
  }
  
  console.log('📝 Migration Log:');
  log.forEach(entry => {
    const status = entry.success ? '✅' : '❌';
    const duration = entry.duration ? `${entry.duration}ms` : 'N/A';
    console.log(`   ${status} ${entry.version} (${duration})`);
    if (entry.error) {
      console.log(`      Error: ${entry.error}`);
    }
  });
}

async function rollbackMigration(version: string) {
  console.log(`🔄 Rolling back migration ${version}...`);
  
  const result = await migrationService.rollback(version);
  
  if (result.success) {
    console.log(`✅ Rollback ${version} completed successfully`);
  } else {
    console.error(`❌ Rollback ${version} failed: ${result.error}`);
    process.exit(1);
  }
}

async function resetMigrations() {
  console.log('🔄 Resetting all migrations...');
  
  await migrationService.reset();
  
  console.log('✅ Migration history reset completed');
}

function showHelp() {
  console.log(`
🚀 Wata-Board Migration CLI

Usage: npm run migrate <command> [options]

Commands:
  run, migrate    Run all pending migrations
  status          Show migration status
  log             Show migration execution log
  rollback <ver>  Rollback a specific migration
  reset           Reset all migration history (development only)
  help            Show this help message

Examples:
  npm run migrate run
  npm run migrate status
  npm run migrate rollback 1.1.0
  npm run migrate log
`);
}

if (require.main === module) {
  main();
}
