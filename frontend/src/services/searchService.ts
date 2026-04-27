import { SearchFilters } from '../hooks/usePaymentSearch';
import { sanitizeSearchQuery, sanitizeDate, clamp } from '../utils/sanitize';

export class SearchService {
  static async searchPayments(filters: SearchFilters): Promise<any[]> {
    const queryParams = new URLSearchParams();

    if (filters.query) {
      const q = sanitizeSearchQuery(filters.query, 200);
      if (q) queryParams.append('q', q);
    }
    if (filters.dateFrom) {
      const d = sanitizeDate(filters.dateFrom);
      if (d) queryParams.append('from', d);
    }
    if (filters.dateTo) {
      const d = sanitizeDate(filters.dateTo);
      if (d) queryParams.append('to', d);
    }
    if (filters.minAmount !== undefined) {
      const n = clamp(Number(filters.minAmount), 0, 1_000_000_000);
      if (Number.isFinite(n)) queryParams.append('min', n.toString());
    }
    if (filters.maxAmount !== undefined) {
      const n = clamp(Number(filters.maxAmount), 0, 1_000_000_000);
      if (Number.isFinite(n)) queryParams.append('max', n.toString());
    }
    if (filters.status) {
      // Only allow known status values
      const allowed = ['pending', 'confirmed', 'failed', 'queued'];
      if (allowed.includes(filters.status)) queryParams.append('status', filters.status);
    }

    const response = await fetch(`/api/search/payments?${queryParams.toString()}`);
    if (!response.ok) throw new Error('Search failed. Please try again!');
    return response.json();
  }

  static exportToCSV(data: any[]) {
    const headers = ['ID', 'Meter ID', 'Amount', 'Status', 'Timestamp'];
    // Escape CSV fields to prevent CSV injection
    const escapeCSV = (val: unknown): string => {
      const str = String(val ?? '').replace(/"/g, '""');
      // Prefix with single-quote if value starts with formula characters
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return `"${safe}"`;
    };
    const csvContent = [
      headers.join(','),
      ...data.map(p =>
        [p.id, p.meterId, p.amount, p.status, p.timestamp].map(escapeCSV).join(',')
      ),
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
    const safeName = sanitizeSearchQuery(name, 100);
    if (!safeName) return;
    const saved = JSON.parse(localStorage.getItem('saved_searches') || '[]');
    saved.push({ name: safeName, filters, id: Date.now() });
    localStorage.setItem('saved_searches', JSON.stringify(saved));
  }
}