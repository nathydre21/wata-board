import { logger } from '../utils/logger';

export class SearchService {
  /**
   * Performs full-text search across payment records (meter IDs, transaction IDs, or payers)
   */
  static async fullTextSearch(query: string, records: any[]) {
    const lowerQuery = query.toLowerCase();
    logger.info(`Backend: Performing full-text search for: ${query}`);
    
    return records.filter(record => 
      record.meterId.toLowerCase().includes(lowerQuery) ||
      record.id.toLowerCase().includes(lowerQuery) ||
      (record.payer && record.payer.toLowerCase().includes(lowerQuery))
    );
  }

  static filterByCriteria(records: any[], criteria: any) {
    return records.filter(r => {
      if (criteria.status && r.status !== criteria.status) return false;
      if (criteria.minAmount && r.amount < criteria.minAmount) return false;
      return true;
    });
  }
}