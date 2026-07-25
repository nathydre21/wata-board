/**
 * Translation Key Validation Script
 * 
 * Compares all locale JSON files against the English (en) master locale
 * to ensure all translation keys are present across all languages.
 * 
 * Usage: npx tsx scripts/validate-translations.ts
 * Exit code: 0 if all keys match, 1 if keys are missing or extra
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.resolve(__dirname, '../src/i18n/locales');
const MASTER_LOCALE = 'en';

interface ValidationError {
  locale: string;
  type: 'missing_key' | 'extra_key' | 'type_mismatch';
  key: string;
  expectedType?: string;
  actualType?: string;
}

function getType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const keys = new Map<string, string>();
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse for nested objects
      const nested = flattenKeys(value as Record<string, unknown>, fullKey);
      nested.forEach((type, k) => keys.set(k, type));
    } else {
      keys.set(fullKey, getType(value));
    }
  }
  
  return keys;
}

function validateLocale(masterKeys: Map<string, string>, localeFile: string, localeName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  
  let localeData: Record<string, unknown>;
  try {
    localeData = JSON.parse(fs.readFileSync(localeFile, 'utf-8'));
  } catch (e) {
    console.error(`  ❌ Failed to parse ${localeName}:`, (e as Error).message);
    return [{ locale: localeName, type: 'missing_key', key: 'FILE_PARSE_ERROR' }];
  }
  
  const localeKeys = flattenKeys(localeData);
  
  // Check for missing keys (in master but not in locale)
  for (const [key, expectedType] of masterKeys) {
    if (!localeKeys.has(key)) {
      errors.push({ locale: localeName, type: 'missing_key', key });
    } else {
      const actualType = localeKeys.get(key)!;
      if (expectedType !== actualType) {
        errors.push({ 
          locale: localeName, 
          type: 'type_mismatch', 
          key, 
          expectedType, 
          actualType 
        });
      }
    }
  }
  
  // Check for extra keys (in locale but not in master)
  for (const [key] of localeKeys) {
    if (!masterKeys.has(key)) {
      errors.push({ locale: localeName, type: 'extra_key', key });
    }
  }
  
  return errors;
}

function main(): number {
  console.log('🔍 Validating translation keys across all locales...\n');
  
  // Read master locale (English)
  const masterPath = path.join(LOCALES_DIR, `${MASTER_LOCALE}.json`);
  if (!fs.existsSync(masterPath)) {
    console.error(`❌ Master locale file not found: ${masterPath}`);
    return 1;
  }
  
  const masterData = JSON.parse(fs.readFileSync(masterPath, 'utf-8'));
  const masterKeys = flattenKeys(masterData);
  console.log(`📋 Master locale (${MASTER_LOCALE}): ${masterKeys.size} keys\n`);
  
  // Get all locale files
  const localeFiles = fs.readdirSync(LOCALES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f.replace('.json', ''),
      path: path.join(LOCALES_DIR, f)
    }));
  
  let totalErrors = 0;
  let hasParseErrors = false;
  
  for (const locale of localeFiles) {
    if (locale.name === MASTER_LOCALE) continue;
    
    const errors = validateLocale(masterKeys, locale.path, locale.name);
    
    if (errors.length === 0) {
      console.log(`  ✅ ${locale.name}: All keys match`);
    } else {
      // Check if file parse error
      const parseErrors = errors.filter(e => e.key === 'FILE_PARSE_ERROR');
      if (parseErrors.length > 0) {
        hasParseErrors = true;
        continue;
      }
      
      console.log(`  ❌ ${locale.name}: ${errors.length} issue(s) found`);
      
      const missingKeys = errors.filter(e => e.type === 'missing_key');
      const extraKeys = errors.filter(e => e.type === 'extra_key');
      const typeMismatches = errors.filter(e => e.type === 'type_mismatch');
      
      if (missingKeys.length > 0) {
        console.log(`     Missing keys (${missingKeys.length}):`);
        missingKeys.forEach(e => console.log(`       - ${e.key}`));
      }
      
      if (extraKeys.length > 0) {
        console.log(`     Extra keys (${extraKeys.length}):`);
        extraKeys.forEach(e => console.log(`       + ${e.key}`));
      }
      
      if (typeMismatches.length > 0) {
        console.log(`     Type mismatches (${typeMismatches.length}):`);
        typeMismatches.forEach(e => 
          console.log(`       ~ ${e.key}: expected ${e.expectedType}, got ${e.actualType}`)
        );
      }
      
      totalErrors += errors.length;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  
  if (hasParseErrors) {
    console.log('❌ VALIDATION FAILED: Some locale files could not be parsed');
    return 1;
  }
  
  if (totalErrors > 0) {
    console.log(`❌ VALIDATION FAILED: ${totalErrors} total issue(s) across all locales`);
    console.log('   Run the validation script for details and update locale files.\n');
    return 1;
  }
  
  console.log('✅ VALIDATION PASSED: All locale files have matching keys');
  console.log(`   ${localeFiles.length - 1} locale(s) validated successfully\n`);
  return 0;
}

process.exit(main());
