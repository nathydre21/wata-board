import React, { useState } from 'react';
import type { PaymentStatus } from '../types/scheduling';

export interface PaymentHistoryFilters {
  searchTerm: string;
  meterId: string;
  status: PaymentStatus | '';
  dateRange: {
    start: string;
    end: string;
  };
  amountRange: {
    min: string;
    max: string;
  };
}

interface PaymentHistoryFilterProps {
  filters: PaymentHistoryFilters;
  onFiltersChange: (filters: PaymentHistoryFilters) => void;
  onExport: (format: 'csv' | 'json') => void;
  paymentCount: number;
}

export function PaymentHistoryFilter({
  filters,
  onFiltersChange,
  onExport,
  paymentCount
}: PaymentHistoryFilterProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleFilterChange = (key: keyof PaymentHistoryFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const handleDateRangeChange = (field: 'start' | 'end', value: string) => {
    handleFilterChange('dateRange', {
      ...filters.dateRange,
      [field]: value
    });
  };

  const handleAmountRangeChange = (field: 'min' | 'max', value: string) => {
    handleFilterChange('amountRange', {
      ...filters.amountRange,
      [field]: value
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      searchTerm: '',
      meterId: '',
      status: '',
      dateRange: { start: '', end: '' },
      amountRange: { min: '', max: '' }
    });
  };

  const hasActiveFilters = filters.searchTerm ||
    filters.meterId ||
    filters.status ||
    filters.dateRange.start ||
    filters.dateRange.end ||
    filters.amountRange.min ||
    filters.amountRange.max;

  return (
    <div className="space-y-4">
      {/* Main Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search transactions..."
            value={filters.searchTerm}
            onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
            className="w-full h-10 pl-10 pr-4 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-4 h-10 rounded-lg font-medium transition-colors flex items-center gap-2 ${hasActiveFilters
              ? 'bg-sky-500 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="bg-sky-600 text-white text-xs px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </button>

          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="px-4 h-10 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors flex items-center gap-2"
            disabled={paymentCount === 0}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* Export Menu */}
      {showExportMenu && (
        <div className="absolute right-4 top-16 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-10">
          <div className="p-2">
            <button
              onClick={() => {
                onExport('csv');
                setShowExportMenu(false);
              }}
              className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-700 rounded-md transition-colors"
            >
              Export as CSV
            </button>
            <button
              onClick={() => {
                onExport('json');
                setShowExportMenu(false);
              }}
              className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-700 rounded-md transition-colors"
            >
              Export as JSON
            </button>
          </div>
        </div>
      )}

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-100">Advanced Filters</h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear All
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Meter ID Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Meter ID
              </label>
              <input
                type="text"
                placeholder="Enter meter ID..."
                value={filters.meterId}
                onChange={(e) => handleFilterChange('meterId', e.target.value)}
                className="w-full h-10 px-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value as PaymentStatus | '')}
                className="w-full h-10 px-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="scheduled">Scheduled</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
                <option value="paused">Paused</option>
              </select>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                <svg className="inline h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Date Range
              </label>
              <div className="space-y-2">
                <input
                  type="date"
                  placeholder="Start date"
                  value={filters.dateRange.start}
                  onChange={(e) => handleDateRangeChange('start', e.target.value)}
                  className="w-full h-10 px-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
                <input
                  type="date"
                  placeholder="End date"
                  value={filters.dateRange.end}
                  onChange={(e) => handleDateRangeChange('end', e.target.value)}
                  className="w-full h-10 px-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Amount Range Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                <svg className="inline h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Amount Range (XLM)
              </label>
              <div className="space-y-2">
                <input
                  type="number"
                  placeholder="Min amount"
                  value={filters.amountRange.min}
                  onChange={(e) => handleAmountRangeChange('min', e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full h-10 px-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
                <input
                  type="number"
                  placeholder="Max amount"
                  value={filters.amountRange.max}
                  onChange={(e) => handleAmountRangeChange('max', e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full h-10 px-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-slate-400">Active filters:</span>
          {filters.searchTerm && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Search: {filters.searchTerm}
            </span>
          )}
          {filters.meterId && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Meter: {filters.meterId}
            </span>
          )}
          {filters.status && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Status: {filters.status}
            </span>
          )}
          {(filters.dateRange.start || filters.dateRange.end) && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Date: {filters.dateRange.start || 'Any'} - {filters.dateRange.end || 'Any'}
            </span>
          )}
          {(filters.amountRange.min || filters.amountRange.max) && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Amount: {filters.amountRange.min || '0'} - {filters.amountRange.max || '∞'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
