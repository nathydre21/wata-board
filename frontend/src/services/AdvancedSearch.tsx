import React from 'react';
import { usePaymentSearch } from '../../hooks/usePaymentSearch';
import { SearchService } from '../../services/searchService';
import { sanitizeSearchQuery, sanitizeDate, clamp } from '../../utils/sanitize';

export const AdvancedSearch: React.FC<{ payments: any[] }> = ({ payments }) => {
  const { filters, setFilters, results } = usePaymentSearch(payments);

  const ALLOWED_STATUSES = ['', 'completed', 'pending', 'failed', 'queued'];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let sanitized: string | number = value;

    if (name === 'query') sanitized = sanitizeSearchQuery(value, 200);
    else if (name === 'dateFrom' || name === 'dateTo') sanitized = sanitizeDate(value);
    else if (name === 'minAmount' || name === 'maxAmount') {
      const n = parseFloat(value);
      sanitized = Number.isFinite(n) ? clamp(n, 0, 1_000_000_000) : '';
    } else if (name === 'status') {
      sanitized = ALLOWED_STATUSES.includes(value) ? value : '';
    }

    setFilters(prev => ({ ...prev, [name]: sanitized }));
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg shadow-sm mb-6 border border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="col-span-full">
          <label className="block text-sm font-medium text-gray-700">Full-text Search</label>
          <input
            type="text"
            name="query"
            placeholder="Search by ID or Meter..."
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            value={filters.query}
            onChange={handleChange}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Min Amount</label>
          <input
            type="number"
            name="minAmount"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            onChange={handleChange}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select
            name="status"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            onChange={handleChange}
          >
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Date From</label>
          <input
            type="date"
            name="dateFrom"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-between items-center border-t pt-4">
        <span className="text-sm text-gray-500">
          Showing {results.length} results
        </span>
        <div className="space-x-2">
          <button
            onClick={() => SearchService.exportToCSV(results)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export Results
          </button>
        </div>
      </div>
    </div>
  );
};