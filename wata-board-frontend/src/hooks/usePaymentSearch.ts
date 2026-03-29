import { useState, useMemo } from 'react';

export interface SearchFilters {
  query: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  status?: string;
  sortBy?: 'date' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

export const usePaymentSearch = (payments: any[]) => {
  const [filters, setFilters] = useState<SearchFilters>({ 
    query: '',
    sortBy: 'date',
    sortOrder: 'desc'
  });

  const filteredResults = useMemo(() => {
    const filtered = payments.filter(p => {
      const matchesQuery = !filters.query || 
        p.meterId.toLowerCase().includes(filters.query.toLowerCase()) ||
        p.id.toLowerCase().includes(filters.query.toLowerCase());
      
      const matchesAmount = (!filters.minAmount || p.amount >= filters.minAmount) &&
                           (!filters.maxAmount || p.amount <= filters.maxAmount);
                           
      const matchesStatus = !filters.status || p.status === filters.status;

      const matchesDate = (!filters.dateFrom || new Date(p.timestamp) >= new Date(filters.dateFrom)) &&
                         (!filters.dateTo || new Date(p.timestamp) <= new Date(filters.dateTo));

      return matchesQuery && matchesAmount && matchesStatus && matchesDate;
    });

    return [...filtered].sort((a, b) => {
      const factor = filters.sortOrder === 'desc' ? -1 : 1;
      if (filters.sortBy === 'amount') {
        return (a.amount - b.amount) * factor;
      }
      return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) * factor;
    });
  }, [payments, filters]);

  return {
    filters,
    setFilters,
    results: filteredResults
  };
};