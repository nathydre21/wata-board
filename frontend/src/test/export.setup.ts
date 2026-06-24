/**
 * Test setup and utilities for payment history export feature
 * 
 * Provides fast-check arbitraries and helper functions for property-based testing
 */

import fc from 'fast-check';
import type { PaymentTransaction, ExportOptions, ExportMetadata } from '../types/export';

/**
 * Arbitrary for generating valid PaymentTransaction objects
 */
export const arbitraryPaymentTransaction = (): fc.Arbitrary<PaymentTransaction> => {
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

/**
 * Arbitrary for generating valid date ranges
 */
export const arbitraryDateRange = (): fc.Arbitrary<{ startDate: Date; endDate: Date }> => {
  return fc.date().chain(startDate => 
    fc.date({ min: startDate }).map(endDate => ({ startDate, endDate }))
  );
};

/**
 * Arbitrary for generating valid ExportOptions
 */
export const arbitraryExportOptions = (): fc.Arbitrary<ExportOptions> => {
  return fc.record({
    format: fc.constantFrom('csv', 'pdf'),
    dateRange: fc.option(arbitraryDateRange()),
  });
};

/**
 * Arbitrary for generating valid ExportMetadata
 */
export const arbitraryExportMetadata = (): fc.Arbitrary<ExportMetadata> => {
  return fc.record({
    exportDate: fc.date(),
    totalTransactions: fc.nat({ max: 10000 }),
    dateRange: fc.option(arbitraryDateRange()),
    isOffline: fc.boolean(),
    language: fc.constantFrom('en', 'es', 'fr', 'de', 'ja', 'zh'),
  });
};

/**
 * Arbitrary for generating strings with CSV special characters
 */
export const arbitraryCSVSpecialString = (): fc.Arbitrary<string> => {
  return fc.string().map(str => {
    // Inject CSV special characters randomly
    const specialChars = [',', '"', '\n', '\r'];
    const char = specialChars[Math.floor(Math.random() * specialChars.length)];
    const pos = Math.floor(Math.random() * (str.length + 1));
    return str.slice(0, pos) + char + str.slice(pos);
  });
};

/**
 * Arbitrary for generating strings with international characters
 */
export const arbitraryInternationalString = (): fc.Arbitrary<string> => {
  return fc.oneof(
    fc.string(),
    fc.fullUnicodeString(),
    fc.constant('日本語テキスト'),
    fc.constant('中文文本'),
    fc.constant('Текст на русском'),
    fc.constant('النص العربي'),
    fc.constant('Émojis: 🎉💰📊'),
  );
};

/**
 * Helper to create a sorted array of transactions by date
 */
export const sortTransactionsByDate = (transactions: PaymentTransaction[]): PaymentTransaction[] => {
  return [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
};

/**
 * Helper to filter transactions by date range
 */
export const filterTransactionsByDateRange = (
  transactions: PaymentTransaction[],
  startDate: Date,
  endDate: Date
): PaymentTransaction[] => {
  return transactions.filter(t => 
    t.date >= startDate && t.date <= endDate
  );
};

/**
 * Helper to check if dates are in chronological order
 */
export const isChronological = (dates: Date[]): boolean => {
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] < dates[i - 1]) {
      return false;
    }
  }
  return true;
};
