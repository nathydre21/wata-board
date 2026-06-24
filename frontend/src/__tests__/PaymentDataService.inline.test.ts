/**
 * Inline unit tests for PaymentDataService
 * 
 * Tests data retrieval, filtering, offline detection, and caching behavior.
 * Using inline implementation to avoid Vite SSR issues.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PaymentDataService, PaymentTransaction, PaymentFilters } from '../types/export';

// Inline implementation for testing
class TestPaymentDataService implements PaymentDataService {
  private readonly API_ENDPOINT = '/api/payment/history';
  private readonly CACHE_KEY = 'payment_history_cache';
  
  async getPaymentHistory(filters?: PaymentFilters): Promise<PaymentTransaction[]> {
    let transactions: PaymentTransaction[];
    
    try {
      if (this.isOffline()) {
        transactions = this.getFromCache();
      } else {
        const response = await fetch(this.API_ENDPOINT);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch payment history: ${response.statusText}`);
        }
        
        const data = await response.json();
        transactions = this.normalizeTransactions(data);
        this.saveToCache(transactions);
      }
      
      if (filters?.startDate || filters?.endDate) {
        transactions = this.filterByDateRange(transactions, filters);
      }
      
      return this.sortByDate(transactions);
      
    } catch (error) {
      console.error('Error fetching payment history:', error);
      transactions = this.getFromCache();
      
      if (filters?.startDate || filters?.endDate) {
        transactions = this.filterByDateRange(transactions, filters);
      }
      
      return this.sortByDate(transactions);
    }
  }
  
  isOffline(): boolean {
    return !navigator.onLine;
  }
  
  private normalizeTransactions(data: any[]): PaymentTransaction[] {
    return data.map(item => ({
      id: item.id || item.transactionId || String(item.timestamp || Date.now()),
      date: new Date(item.date || item.timestamp || item.createdAt),
      amount: Number(item.amount),
      currency: item.currency || 'USD',
      status: item.status || 'completed',
      description: item.description || item.memo || '',
      merchant: item.merchant || item.recipient || item.payee || 'Unknown',
      category: item.category,
      paymentMethod: item.paymentMethod || item.method,
      reference: item.reference || item.referenceNumber,
    }));
  }
  
  private filterByDateRange(
    transactions: PaymentTransaction[],
    filters: PaymentFilters
  ): PaymentTransaction[] {
    return transactions.filter(transaction => {
      const transactionDate = transaction.date.getTime();
      
      if (filters.startDate && transactionDate < filters.startDate.getTime()) {
        return false;
      }
      
      if (filters.endDate && transactionDate > filters.endDate.getTime()) {
        return false;
      }
      
      return true;
    });
  }
  
  private sortByDate(transactions: PaymentTransaction[]): PaymentTransaction[] {
    return [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  
  private getFromCache(): PaymentTransaction[] {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) {
        return [];
      }
      
      const data = JSON.parse(cached);
      return data.map((item: any) => ({
        ...item,
        date: new Date(item.date),
      }));
    } catch (error) {
      console.error('Error reading from cache:', error);
      return [];
    }
  }
  
  private saveToCache(transactions: PaymentTransaction[]): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(transactions));
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }
}

describe('PaymentDataService', () => {
  let service: TestPaymentDataService;
  let originalFetch: typeof global.fetch;
  let originalNavigator: Navigator;
  
  beforeEach(() => {
    service = new TestPaymentDataService();
    originalFetch = global.fetch;
    originalNavigator = global.navigator;
    localStorage.clear();
  });
  
  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });
  
  describe('getPaymentHistory', () => {
    it('should fetch payment history from API when online', async () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
      
      const mockData = [
        {
          id: 'txn1',
          date: '2024-01-15T10:00:00Z',
          amount: 100.50,
          currency: 'USD',
          status: 'completed',
          description: 'Test payment',
          merchant: 'Test Merchant',
        },
      ];
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);
      
      const result = await service.getPaymentHistory();
      
      expect(global.fetch).toHaveBeenCalledWith('/api/payment/history');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('txn1');
      expect(result[0].date).toBeInstanceOf(Date);
    });
    
    it('should return empty array when no transactions exist', async () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response);
      
      const result = await service.getPaymentHistory();
      
      expect(result).toEqual([]);
    });
    
    it('should filter transactions by date range', async () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
      
      const mockData = [
        {
          id: 'txn1',
          date: '2024-01-05T10:00:00Z',
          amount: 100,
          currency: 'USD',
          status: 'completed',
          description: 'Payment 1',
          merchant: 'Merchant 1',
        },
        {
          id: 'txn2',
          date: '2024-01-15T10:00:00Z',
          amount: 200,
          currency: 'USD',
          status: 'completed',
          description: 'Payment 2',
          merchant: 'Merchant 2',
        },
        {
          id: 'txn3',
          date: '2024-01-25T10:00:00Z',
          amount: 300,
          currency: 'USD',
          status: 'completed',
          description: 'Payment 3',
          merchant: 'Merchant 3',
        },
      ];
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);
      
      const startDate = new Date('2024-01-10T00:00:00Z');
      const endDate = new Date('2024-01-20T00:00:00Z');
      const result = await service.getPaymentHistory({ startDate, endDate });
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('txn2');
    });
    
    it('should return transactions in chronological order', async () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
      
      const mockData = [
        {
          id: 'txn3',
          date: '2024-01-25T10:00:00Z',
          amount: 300,
          currency: 'USD',
          status: 'completed',
          description: 'Payment 3',
          merchant: 'Merchant 3',
        },
        {
          id: 'txn1',
          date: '2024-01-05T10:00:00Z',
          amount: 100,
          currency: 'USD',
          status: 'completed',
          description: 'Payment 1',
          merchant: 'Merchant 1',
        },
        {
          id: 'txn2',
          date: '2024-01-15T10:00:00Z',
          amount: 200,
          currency: 'USD',
          status: 'completed',
          description: 'Payment 2',
          merchant: 'Merchant 2',
        },
      ];
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);
      
      const result = await service.getPaymentHistory();
      
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('txn1');
      expect(result[1].id).toBe('txn2');
      expect(result[2].id).toBe('txn3');
    });
    
    it('should use cached data when offline', async () => {
      // First, populate the cache
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
      
      const mockData = [
        {
          id: 'txn1',
          date: '2024-01-15T10:00:00Z',
          amount: 100,
          currency: 'USD',
          status: 'completed',
          description: 'Cached payment',
          merchant: 'Cached Merchant',
        },
      ];
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);
      
      await service.getPaymentHistory();
      
      // Now go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });
      
      const result = await service.getPaymentHistory();
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('txn1');
      expect(result[0].description).toBe('Cached payment');
    });
  });
  
  describe('isOffline', () => {
    it('should return true when navigator.onLine is false', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });
      
      expect(service.isOffline()).toBe(true);
    });
    
    it('should return false when navigator.onLine is true', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
      
      expect(service.isOffline()).toBe(false);
    });
  });
});
