import { SearchFilters } from '../hooks/usePaymentSearch';

export class SearchService {
  static async searchPayments(filters: SearchFilters): Promise<any[]> {
    const queryParams = new URLSearchParams();
    if (filters.query) queryParams.append('q', filters.query);
    if (filters.dateFrom) queryParams.append('from', filters.dateFrom);
    if (filters.dateTo) queryParams.append('to', filters.dateTo);
    if (filters.minAmount) queryParams.append('min', filters.minAmount.toString());
    if (filters.maxAmount) queryParams.append('max', filters.maxAmount.toString());
    if (filters.status) queryParams.append('status', filters.status);

    const response = await fetch(`/api/search/payments?${queryParams.toString()}`);
    if (!response.ok) throw new Error('Search failed');
    return response.json();
  }

  static exportToCSV(data: any[]) {
    const headers = ['ID', 'Meter ID', 'Amount', 'Status', 'Timestamp'];
    const csvContent = [
      headers.join(','),
      ...data.map(p => [p.id, p.meterId, p.amount, p.status, p.timestamp].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'payment_history.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  static saveQuery(name: string, filters: SearchFilters) {
    const saved = JSON.parse(localStorage.getItem('saved_searches') || '[]');
    saved.push({ name, filters, id: Date.now() });
    localStorage.setItem('saved_searches', JSON.stringify(saved));
  }
}