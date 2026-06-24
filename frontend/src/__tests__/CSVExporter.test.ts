/**
 * Unit tests for CSVExporter
 * 
 * Tests specific examples and edge cases for CSV export functionality
 */

import { CSVExporter } from '../services/CSVExporter';
import type { PaymentTransaction, ExportMetadata } from '../types/export';

describe('CSVExporter', () => {
  let exporter: CSVExporter;

  beforeEach(() => {
    exporter = new CSVExporter();
  });

  describe('generate', () => {
    it('should generate CSV with header row for empty transaction list', () => {
      const transactions: PaymentTransaction[] = [];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 0,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');

      // Should have UTF-8 BOM
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
      
      // Remove BOM for easier testing
      const csvWithoutBOM = csv.substring(1);
      
      // Should have header row
      expect(csvWithoutBOM).toContain('Transaction ID,Date,Amount,Currency,Status,Description,Merchant,Category,Payment Method,Reference');
      
      // Should only have header row (no data rows)
      const lines = csvWithoutBOM.split('\n');
      expect(lines.length).toBe(1);
    });

    it('should generate CSV with single transaction', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN001',
          date: new Date('2024-01-15'),
          amount: 150.00,
          currency: 'USD',
          status: 'completed',
          description: 'Office supplies',
          merchant: 'Office Depot',
          category: 'Business',
          paymentMethod: 'credit_card',
          reference: 'REF001'
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 1,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');
      const csvWithoutBOM = csv.substring(1);
      const lines = csvWithoutBOM.split('\n');

      // Should have header + 1 data row
      expect(lines.length).toBe(2);
      
      // Check data row
      expect(lines[1]).toBe('TXN001,2024-01-15,150.00,USD,completed,Office supplies,Office Depot,Business,credit_card,REF001');
    });

    it('should handle transactions with missing optional fields', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN002',
          date: new Date('2024-01-16'),
          amount: 45.50,
          currency: 'USD',
          status: 'completed',
          description: 'Lunch',
          merchant: 'Restaurant ABC'
          // category, paymentMethod, reference are undefined
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 1,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');
      const csvWithoutBOM = csv.substring(1);
      const lines = csvWithoutBOM.split('\n');

      // Should have empty strings for missing optional fields
      expect(lines[1]).toBe('TXN002,2024-01-16,45.50,USD,completed,Lunch,Restaurant ABC,,,');
    });

    it('should format dates as ISO 8601 (YYYY-MM-DD)', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN003',
          date: new Date('2024-03-05'),
          amount: 100.00,
          currency: 'USD',
          status: 'completed',
          description: 'Test',
          merchant: 'Test Merchant'
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 1,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');
      const csvWithoutBOM = csv.substring(1);
      const lines = csvWithoutBOM.split('\n');

      // Date should be in ISO 8601 format
      expect(lines[1]).toContain('2024-03-05');
    });

    it('should format currency amounts as decimal numbers', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN004',
          date: new Date('2024-01-15'),
          amount: 1234.56,
          currency: 'USD',
          status: 'completed',
          description: 'Test',
          merchant: 'Test Merchant'
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 1,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');
      const csvWithoutBOM = csv.substring(1);
      const lines = csvWithoutBOM.split('\n');

      // Amount should be formatted as decimal with 2 decimal places
      expect(lines[1]).toContain('1234.56');
    });

    it('should escape commas in field values', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN005',
          date: new Date('2024-01-15'),
          amount: 100.00,
          currency: 'USD',
          status: 'completed',
          description: 'Lunch, dinner, and snacks',
          merchant: 'Restaurant, Inc.'
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 1,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');
      const csvWithoutBOM = csv.substring(1);
      const lines = csvWithoutBOM.split('\n');

      // Fields with commas should be wrapped in quotes
      expect(lines[1]).toContain('"Lunch, dinner, and snacks"');
      expect(lines[1]).toContain('"Restaurant, Inc."');
    });

    it('should escape double quotes in field values', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN006',
          date: new Date('2024-01-15'),
          amount: 100.00,
          currency: 'USD',
          status: 'completed',
          description: 'Product "Premium" Edition',
          merchant: 'Store "Best" Deals'
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 1,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');
      const csvWithoutBOM = csv.substring(1);
      const lines = csvWithoutBOM.split('\n');

      // Double quotes should be escaped by doubling them and field wrapped in quotes
      expect(lines[1]).toContain('"Product ""Premium"" Edition"');
      expect(lines[1]).toContain('"Store ""Best"" Deals"');
    });

    it('should escape newlines in field values', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN007',
          date: new Date('2024-01-15'),
          amount: 100.00,
          currency: 'USD',
          status: 'completed',
          description: 'Line 1\nLine 2\rLine 3',
          merchant: 'Test Merchant'
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 1,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');
      const csvWithoutBOM = csv.substring(1);
      const lines = csvWithoutBOM.split('\n');

      // Field with newlines should be wrapped in quotes
      expect(lines[1]).toContain('"Line 1\nLine 2\rLine 3"');
    });

    it('should handle international characters with UTF-8 encoding', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN008',
          date: new Date('2024-01-15'),
          amount: 100.00,
          currency: 'EUR',
          status: 'completed',
          description: 'Café français 日本語 中文 🎉',
          merchant: 'Émojis & International'
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 1,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');

      // Should have UTF-8 BOM
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
      
      // Should preserve international characters
      expect(csv).toContain('Café français 日本語 中文 🎉');
      expect(csv).toContain('Émojis & International');
    });

    it('should handle multiple transactions', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN001',
          date: new Date('2024-01-15'),
          amount: 150.00,
          currency: 'USD',
          status: 'completed',
          description: 'Office supplies',
          merchant: 'Office Depot'
        },
        {
          id: 'TXN002',
          date: new Date('2024-01-16'),
          amount: 45.50,
          currency: 'USD',
          status: 'completed',
          description: 'Lunch',
          merchant: 'Restaurant ABC'
        },
        {
          id: 'TXN003',
          date: new Date('2024-01-17'),
          amount: 200.00,
          currency: 'USD',
          status: 'pending',
          description: 'Software subscription',
          merchant: 'SaaS Company'
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 3,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');
      const csvWithoutBOM = csv.substring(1);
      const lines = csvWithoutBOM.split('\n');

      // Should have header + 3 data rows
      expect(lines.length).toBe(4);
      
      // Check all transactions are present
      expect(lines[1]).toContain('TXN001');
      expect(lines[2]).toContain('TXN002');
      expect(lines[3]).toContain('TXN003');
    });

    it('should format amounts with exactly 2 decimal places', () => {
      const transactions: PaymentTransaction[] = [
        {
          id: 'TXN009',
          date: new Date('2024-01-15'),
          amount: 100,
          currency: 'USD',
          status: 'completed',
          description: 'Test',
          merchant: 'Test Merchant'
        },
        {
          id: 'TXN010',
          date: new Date('2024-01-15'),
          amount: 100.5,
          currency: 'USD',
          status: 'completed',
          description: 'Test',
          merchant: 'Test Merchant'
        }
      ];
      const metadata: ExportMetadata = {
        exportDate: new Date('2024-01-20'),
        totalTransactions: 2,
        isOffline: false,
        language: 'en'
      };

      const csv = exporter.generate(transactions, metadata, 'en');
      const csvWithoutBOM = csv.substring(1);
      const lines = csvWithoutBOM.split('\n');

      // Should format 100 as 100.00
      expect(lines[1]).toContain('100.00');
      
      // Should format 100.5 as 100.50
      expect(lines[2]).toContain('100.50');
    });
  });
});
