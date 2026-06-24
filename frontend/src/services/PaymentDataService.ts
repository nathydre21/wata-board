/**
 * Payment Data Service
 * 
 * Handles retrieval and filtering of payment history data.
 * Supports both online and offline modes with local caching.
 */

import type { PaymentDataService, PaymentTransaction, PaymentFilters } from '../types/export';

/**
 * Implementation of PaymentDataService for retrieving payment history
 */
export class PaymentDataServiceImpl implements PaymentDataService {
  private readonly API_ENDPOINT = '/api/payment/history';
  private readonly CACHE_KEY = 'payment_history_cache';
  
  /**
   * Retrieves payment history with optional date range filtering
   * 
   * @param filters Optional date range filters
   * @returns List of payment transactions sorted chronologically
   */
  async getPaymentHistory(filters?: PaymentFilters): Promise<PaymentTransaction[]> {
    let transactions: PaymentTransaction[];
    
    try {
      if (this.isOffline()) {
        // Fetch from cache when offline
        transactions = this.getFromCache();
      } else {
        // Fetch from API when online
        const response = await fetch(this.API_ENDPOINT);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch payment history: ${response.statusText}`);
        }
        
        const data = await response.json();
        transactions = this.normalizeTransactions(data);
        
        // Cache the data for offline use
        this.saveToCache(transactions);
      }
      
      // Apply date range filtering if provided
      if (filters?.startDate || filters?.endDate) {
        transactions = this.filterByDateRange(transactions, filters);
      }
      
      // Ensure chronological order
      return this.sortByDate(transactions);
      
    } catch (error) {
      console.error('Error fetching payment history:', error);
      
      // Fallback to cache on error
      transactions = this.getFromCache();
      
      if (filters?.startDate || filters?.endDate) {
        transactions = this.filterByDateRange(transactions, filters);
      }
      
      return this.sortByDate(transactions);
    }
  }
  
  /**
   * Checks if the application is currently offline
   * 
   * @returns true if offline, false otherwise
   */
  isOffline(): boolean {
    return !navigator.onLine;
  }
  
  /**
   * Normalizes API response data to PaymentTransaction format
   */
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
  
  /**
   * Filters transactions by date range
   */
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
  
  /**
   * Sorts transactions by date in chronological order
   */
  private sortByDate(transactions: PaymentTransaction[]): PaymentTransaction[] {
    return [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  
  /**
   * Retrieves cached payment history from localStorage
   */
  private getFromCache(): PaymentTransaction[] {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) {
        return [];
      }
      
      const data = JSON.parse(cached);
      // Reconstruct Date objects
      return data.map((item: any) => ({
        ...item,
        date: new Date(item.date),
      }));
    } catch (error) {
      console.error('Error reading from cache:', error);
      return [];
    }
  }
  
  /**
   * Saves payment history to localStorage cache
   */
  private saveToCache(transactions: PaymentTransaction[]): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(transactions));
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }
}

/**
 * Singleton instance of PaymentDataService
 */
export const paymentDataService = new PaymentDataServiceImpl();
