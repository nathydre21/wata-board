import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduledPayment, PaymentStatus } from '../types/scheduling';
import { SchedulingService } from '../services/schedulingService';
import { receiptService } from '../services/receiptService';
import { PaymentHistoryFilter, PaymentHistoryFilters } from '../components/PaymentHistoryFilter';
import { PaymentDetailsModal } from '../components/PaymentDetailsModal';
import { SkeletonLoader } from '../components/SkeletonLoader';

/**
 * Payment History Page Component
 * Displays all payment transactions with search, filter, and export capabilities
 */
export default function PaymentHistory() {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<ScheduledPayment[]>([]);
  const [filters, setFilters] = useState<PaymentHistoryFilters>({
    searchTerm: '',
    meterId: '',
    status: '',
    dateRange: { start: '', end: '' },
    amountRange: { min: '', max: '' }
  });
  const [selectedPayment, setSelectedPayment] = useState<ScheduledPayment | null>(null);
  const [selectedMeterId, setSelectedMeterId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Load all payments on component mount
  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = () => {
    setIsLoading(true);
    try {
      const schedulingService = SchedulingService.getInstance();
      const allSchedules = schedulingService.getAllSchedules();
      const allPayments: ScheduledPayment[] = [];

      allSchedules.forEach(schedule => {
        allPayments.push(...schedule.paymentHistory);
      });

      // Sort by date descending by default
      allPayments.sort((a, b) => 
        new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()
      );

      setPayments(allPayments);
    } catch (error) {
      console.error('Failed to load payments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter and sort payments
  const filteredAndSortedPayments = useMemo(() => {
    let filtered = payments.filter(payment => {
      // Search filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const matchesSearch =
          (payment.transactionId?.toLowerCase().includes(searchLower)) ||
          (payment.errorMessage?.toLowerCase().includes(searchLower)) ||
          payment.id.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status && payment.status !== filters.status) {
        return false;
      }

      // Date range filter
      if (filters.dateRange.start || filters.dateRange.end) {
        const paymentDate = new Date(payment.scheduledDate);
        const startDate = filters.dateRange.start ? new Date(filters.dateRange.start) : null;
        const endDate = filters.dateRange.end ? new Date(filters.dateRange.end) : null;

        if (startDate && paymentDate < startDate) return false;
        if (endDate && paymentDate > endDate) return false;
      }

      // Amount range filter
      if (filters.amountRange.min || filters.amountRange.max) {
        const minAmount = filters.amountRange.min ? parseFloat(filters.amountRange.min) : 0;
        const maxAmount = filters.amountRange.max ? parseFloat(filters.amountRange.max) : Infinity;

        if (payment.amount < minAmount || payment.amount > maxAmount) {
          return false;
        }
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':
          return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
        case 'date-desc':
          return new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime();
        case 'amount-asc':
          return a.amount - b.amount;
        case 'amount-desc':
          return b.amount - a.amount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [payments, filters, sortBy]);

  // Calculate statistics
  const statistics = useMemo(() => {
    const total = filteredAndSortedPayments.length;
    const totalAmount = filteredAndSortedPayments.reduce((sum, p) => sum + p.amount, 0);
    const completed = filteredAndSortedPayments.filter(p => p.status === 'completed').length;
    const failed = filteredAndSortedPayments.filter(p => p.status === 'failed').length;
    const pending = filteredAndSortedPayments.filter(p => 
      p.status === 'pending' || p.status === 'scheduled' || p.status === 'processing'
    ).length;

    return {
      total,
      totalAmount,
      completed,
      failed,
      pending,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }, [filteredAndSortedPayments]);

  const handleExport = (format: 'csv' | 'json') => {
    if (format === 'csv') {
      exportAsCSV(filteredAndSortedPayments);
    } else {
      exportAsJSON(filteredAndSortedPayments);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'XLM',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (date: Date): string => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: PaymentStatus) => {
    const badges = {
      'completed': { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Completed' },
      'pending': { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Pending' },
      'scheduled': { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Scheduled' },
      'processing': { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Processing' },
      'failed': { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Failed' },
      'cancelled': { bg: 'bg-slate-500/10', text: 'text-slate-400', label: 'Cancelled' },
      'paused': { bg: 'bg-indigo-500/10', text: 'text-indigo-400', label: 'Paused' }
    };
    const badge = badges[status as keyof typeof badges];
    return badge || badges['pending'];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">
            <div className="w-12 h-12 border-4 border-slate-700 border-t-sky-500 rounded-full animate-spin mx-auto"></div>
          </div>
          <p className="text-slate-400">Loading payment history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto" aria-busy={isLoading}>
        {/* Header — always visible, even while loading */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">Payment History</h1>
          <p className="text-slate-400">View and manage all your utility bill payments</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {isLoading ? (
            <>
              <SkeletonLoader width="w-full" height="h-24" />
              <SkeletonLoader width="w-full" height="h-24" />
              <SkeletonLoader width="w-full" height="h-24" />
              <SkeletonLoader width="w-full" height="h-24" />
              <SkeletonLoader width="w-full" height="h-24" />
            </>
          ) : (
            <>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <p className="text-slate-400 text-sm font-medium mb-1">Total Transactions</p>
                <p className="text-3xl font-bold text-slate-100">{statistics.total}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <p className="text-slate-400 text-sm font-medium mb-1">Total Amount</p>
                <p className="text-2xl font-bold text-slate-100">{formatCurrency(statistics.totalAmount)}</p>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <p className="text-green-400 text-sm font-medium mb-1">Completed</p>
                <p className="text-3xl font-bold text-green-400">{statistics.completed}</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <p className="text-red-400 text-sm font-medium mb-1">Failed</p>
                <p className="text-3xl font-bold text-red-400">{statistics.failed}</p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <p className="text-blue-400 text-sm font-medium mb-1">Success Rate</p>
                <p className="text-3xl font-bold text-blue-400">{statistics.successRate}%</p>
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
          <PaymentHistoryFilter
            filters={filters}
            onFiltersChange={setFilters}
            onExport={handleExport}
            paymentCount={filteredAndSortedPayments.length}
          />

          {/* View and Sort Controls */}
          <div className="flex flex-col sm:flex-row gap-4 mt-6 pt-6 border-t border-slate-800">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <svg className="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
                List
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <svg className="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                </svg>
                Grid
              </button>
            </div>

            <div className="ml-auto">
              <label className="text-sm text-slate-400 font-medium mr-2">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="amount-desc">Highest Amount</option>
                <option value="amount-asc">Lowest Amount</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <SkeletonLoader count={8} width="w-full" height="h-16" />
        ) : filteredAndSortedPayments.length === 0 ? (
          <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-lg">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-xl font-semibold text-slate-200 mb-2">No transactions found</h3>
            <p className="text-slate-400">
              {payments.length === 0
                ? 'You have no payment history yet'
                : 'Try adjusting your search filters'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-slate-400 text-sm mb-4">
              Showing {filteredAndSortedPayments.length} of {payments.length} transactions
            </p>

            {viewMode === 'list' ? (
              <div className="space-y-3">
                {filteredAndSortedPayments.map((payment) => {
                  const badge = getStatusBadge(payment.status);
                  return (
                    <div
                      key={payment.id}
                      onClick={() => {
                        setSelectedPayment(payment);
                      }}
                      className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 cursor-pointer transition-colors group"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="font-mono text-sm text-slate-400 bg-slate-800/50 px-3 py-1 rounded">
                              {payment.id.substring(0, 8)}...
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                              {badge.label}
                            </span>
                          </div>
                          <div className="text-slate-300 mb-1">
                            Date: {formatDate(payment.scheduledDate)} at {formatTime(payment.scheduledDate)}
                          </div>
                          {payment.errorMessage && (
                            <div className="text-red-400 text-sm">Error: {payment.errorMessage}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-slate-100">{payment.amount} XLM</p>
                          <p className="text-slate-400 text-sm">Retry count: {payment.retryCount}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAndSortedPayments.map((payment) => {
                  const badge = getStatusBadge(payment.status);
                  return (
                    <div
                      key={payment.id}
                      onClick={() => setSelectedPayment(payment)}
                      className="bg-slate-900 border border-slate-800 rounded-lg p-6 hover:border-slate-700 cursor-pointer transition-colors group"
                    >
                      <div className="mb-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-slate-100 mb-2">{payment.amount} XLM</p>
                      <p className="text-slate-400 text-sm mb-4">
                        {formatDate(payment.scheduledDate)}
                      </p>
                      <div className="font-mono text-xs text-slate-500 bg-slate-800/50 px-2 py-1 rounded truncate">
                        {payment.id}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment Details Modal */}
      {selectedPayment && (
        <PaymentDetailsModal
          payment={selectedPayment}
          meterId={selectedMeterId || undefined}
          onClose={() => setSelectedPayment(null)}
          onRetry={() => {
            // Retry logic would be implemented here
            setSelectedPayment(null);
            loadPayments();
          }}
        />
      )}
    </div>
  );
}

/**
 * Export payments as CSV
 */
function exportAsCSV(payments: ScheduledPayment[]): void {
  const headers = ['ID', 'Amount', 'Status', 'Scheduled Date', 'Actual Date', 'Transaction ID', 'Error', 'Retries'];
  const rows = payments.map(p => [
    p.id,
    p.amount,
    p.status,
    new Date(p.scheduledDate).toISOString(),
    p.actualPaymentDate ? new Date(p.actualPaymentDate).toISOString() : '',
    p.transactionId || '',
    p.errorMessage || '',
    p.retryCount
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  downloadFile(csvContent, 'payment-history.csv', 'text/csv');
}

/**
 * Export payments as JSON
 */
function exportAsJSON(payments: ScheduledPayment[]): void {
  const jsonContent = JSON.stringify(payments, null, 2);
  downloadFile(jsonContent, 'payment-history.json', 'application/json');
}

/**
 * Helper to download file
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
