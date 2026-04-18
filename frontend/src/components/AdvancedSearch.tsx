import React from 'react';
import { usePaymentSearch, SearchFilters } from '../../hooks/usePaymentSearch';
import { SearchService } from '../../services/searchService';

export const AdvancedSearch: React.FC<{ payments: any[] }> = ({ payments }) => {
  const { filters, setFilters, results } = usePaymentSearch(payments);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveSearch = () => {
    const name = prompt('Enter a name for this search:');
    if (name) SearchService.saveQuery(name, filters);
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

        <div>
          <label className="block text-sm font-medium text-gray-700">Sort By</label>
          <select
            name="sortBy"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            value={filters.sortBy}
            onChange={handleChange}
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
          </select>
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
          <button
            onClick={handleSaveSearch}
            className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
          >
            Save Search
          </button>
        </div>
      </div>
    </div>
  );
};