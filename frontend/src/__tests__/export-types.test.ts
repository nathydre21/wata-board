/**
 * Tests for payment history export types and test infrastructure
 * 
 * Validates that the core types are properly defined and the test
 * infrastructure (fast-check arbitraries) works correctly.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { PaymentTransaction, ExportOptions, ExportMetadata } from '../types/export';

// Inline arbitraries for testing
const arbitraryPaymentTransaction = (): fc.Arbitrary<PaymentTransaction> => {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    date: fc.date(),
    amount: fc.double({ min: 0.01, max: 1000000, noNaN: true }),
    currency: fc.constantFrom('USD', 'EUR', 'GBP', 'JPY', 'CAD'),
    status: fc.constantFrom('completed', 'pending', 'failed', 'refunded'),
    description: fc.string({ minLength: 1, maxLength: 200 }),
    merchant: fc.string({ minLength: 1, maxLength: 100 }),
    category: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
    paymentMethod: fc.option(fc.constantFrom('credit_card', 'debit_card', 'bank_transfer', 'crypto')),
    reference: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  });
};

const arbitraryDateRange = (): fc.Arbitrary<{ startDate: Date; endDate: Date }> => {
  return fc.date().chain(startDate => 
    fc.date({ min: startDate }).map(endDate => ({ startDate, endDate }))
  );
};

const arbitraryExportOptions = (): fc.Arbitrary<ExportOptions> => {
  return fc.record({
    format: fc.constantFrom('csv', 'pdf'),
    dateRange: fc.option(arbitraryDateRange()),
  });
};

const arbitraryExportMetadata = (): fc.Arbitrary<ExportMetadata> => {
  return fc.record({
    exportDate: fc.date(),
    totalTransactions: fc.nat({ max: 10000 }),
    dateRange: fc.option(arbitraryDateRange()),
    isOffline: fc.boolean(),
    language: fc.constantFrom('en', 'es', 'fr', 'de', 'ja', 'zh'),
  });
};

describe('Export Types', () => {
  describe('PaymentTransaction', () => {
    it('should generate valid PaymentTransaction objects', () => {
      fc.assert(
        fc.property(arbitraryPaymentTransaction(), (transaction) => {
          // Verify required fields are present
          expect(transaction.id).toBeDefined();
          expect(transaction.date).toBeInstanceOf(Date);
          expect(transaction.amount).toBeGreaterThan(0);
          expect(transaction.currency).toBeDefined();
          expect(transaction.status).toBeDefined();
          expect(transaction.description).toBeDefined();
          expect(transaction.merchant).toBeDefined();
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('ExportOptions', () => {
    it('should generate valid ExportOptions objects', () => {
      fc.assert(
        fc.property(arbitraryExportOptions(), (options) => {
          // Verify format is valid
          expect(['csv', 'pdf']).toContain(options.format);
          
          // If dateRange is present, verify it's valid
          if (options.dateRange) {
            expect(options.dateRange.startDate).toBeInstanceOf(Date);
            expect(options.dateRange.endDate).toBeInstanceOf(Date);
            expect(options.dateRange.endDate.getTime()).toBeGreaterThanOrEqual(
              options.dateRange.startDate.getTime()
            );
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('ExportMetadata', () => {
    it('should generate valid ExportMetadata objects', () => {
      fc.assert(
        fc.property(arbitraryExportMetadata(), (metadata) => {
          // Verify required fields
          expect(metadata.exportDate).toBeInstanceOf(Date);
          expect(metadata.totalTransactions).toBeGreaterThanOrEqual(0);
          expect(typeof metadata.isOffline).toBe('boolean');
          expect(metadata.language).toBeDefined();
          
          // If dateRange is present, verify it's valid
          if (metadata.dateRange) {
            expect(metadata.dateRange.startDate).toBeInstanceOf(Date);
            expect(metadata.dateRange.endDate).toBeInstanceOf(Date);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Date Range Arbitrary', () => {
    it('should generate valid date ranges where endDate >= startDate', () => {
      fc.assert(
        fc.property(arbitraryDateRange(), (dateRange) => {
          expect(dateRange.endDate.getTime()).toBeGreaterThanOrEqual(
            dateRange.startDate.getTime()
          );
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
