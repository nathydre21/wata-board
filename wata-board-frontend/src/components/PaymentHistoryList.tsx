import React, { useState, useMemo } from 'react';
import type { ScheduledPayment, PaymentStatus } from '../types/scheduling';

interface PaymentHistoryListProps {
  payments: ScheduledPayment[];
  meterId?: string;
}

export function PaymentHistoryList({ payments, meterId }: PaymentHistoryListProps) {
  const [filters, setFilters] = useState<PaymentHistoryFilters>({
    searchTerm: '',
    meterId: meterId || '',
    status: '',
    dateRange: { start: '', end: '' },
    amountRange: { min: '', max: '' }
  });

  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      // Search term filter (searches transaction ID, error messages)
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const matchesSearch =
          (payment.transactionId && payment.transactionId.toLowerCase().includes(searchLower)) ||
          (payment.errorMessage && payment.errorMessage.toLowerCase().includes(searchLower)) ||
          payment.id.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Meter ID filter (if meterId is provided in props, use it as default)
      if (filters.meterId) {
        // This would need to be implemented based on how payments relate to meters
        // For now, we'll assume the payment has a meterId property or we can get it from the schedule
        // const paymentMeterId = getPaymentMeterId(payment); // This function would need to be implemented
        // if (!paymentMeterId?.toLowerCase().includes(filters.meterId.toLowerCase())) return false;
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
  }, [payments, filters]);

  const getStatusColor = (status: PaymentStatus): string => {
    const colors = {
      [PaymentStatus.PENDING]: 'text-amber-400 bg-amber-400/10',
      [PaymentStatus.SCHEDULED]: 'text-sky-400 bg-sky-400/10',
      [PaymentStatus.PROCESSING]: 'text-purple-400 bg-purple-400/10',
      [PaymentStatus.COMPLETED]: 'text-green-400 bg-green-400/10',
      [PaymentStatus.FAILED]: 'text-red-400 bg-red-400/10',
      [PaymentStatus.CANCELLED]: 'text-slate-400 bg-slate-400/10',
      [PaymentStatus.PAUSED]: 'text-blue-400 bg-blue-400/10'
    };
    return colors[status] || 'text-slate-400 bg-slate-400/10';
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'XLM',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const handleExport = (format: 'csv' | 'json') => {
    const dataToExport = filteredPayments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      scheduledDate: formatDate(payment.scheduledDate),
      actualPaymentDate: payment.actualPaymentDate ? formatDate(payment.actualPaymentDate) : '',
      status: payment.status,
      transactionId: payment.transactionId || '',
      errorMessage: payment.errorMessage || '',
      retryCount: payment.retryCount
    }));

    if (format === 'csv') {
      const headers = ['ID', 'Amount', 'Scheduled Date', 'Actual Payment Date', 'Status', 'Transaction ID', 'Error Message', 'Retry Count'];
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => [
          row.id,
          row.amount,
          `"${row.scheduledDate}"`,
          `"${row.actualPaymentDate}"`,
          row.status,
          `"${row.transactionId}"`,
          `"${row.errorMessage}"`,
          row.retryCount
        ].join(','))
      ].join('\n');

      downloadFile(csvContent, 'payment-history.csv', 'text/csv');
    } else {
      const jsonContent = JSON.stringify(dataToExport, null, 2);
      downloadFile(jsonContent, 'payment-history.json', 'application/json');
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-slate-100 mb-2">Payment History</h2>
        <p className="text-slate-400">
          View and search your payment transaction history
          {meterId && ` for meter ${meterId}`}
        </p>
      </div>

      {/* Filters */}
      <PaymentHistoryFilter
        filters={filters}
        onFiltersChange={setFilters}
        onExport={handleExport}
        paymentCount={filteredPayments.length}
      />

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <p className="text-slate-400">
          Showing {filteredPayments.length} of {payments.length} transactions
        </p>
        <div className="text-right">
          <p className="text-sm text-slate-400">Total Amount</p>
          <p className="text-lg font-semibold text-slate-100">
            {formatCurrency(filteredPayments.reduce((sum, p) => sum + p.amount, 0))}
          </p>
        </div>
      </div>

      {/* Payments List */}
      <div className="space-y-3">
        {filteredPayments.length === 0 ? (
          <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-slate-200 mb-2">
              No transactions found
            </h3>
            <p className="text-slate-400">
              {payments.length === 0
                ? 'No payment history available'
                : 'Try adjusting your search filters'
              }
            </p>
          </div>
        ) : (
          filteredPayments.map((payment) => (
            <div
              key={payment.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-lg font-semibold text-slate-100">
                          {formatCurrency(payment.amount)}
                        </h4>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                          {payment.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="text-slate-400">
                          Scheduled: {formatDate(payment.scheduledDate)}
                        </p>
                        {payment.actualPaymentDate && (
                          <p className="text-slate-400">
                            Paid: {formatDate(payment.actualPaymentDate)}
                          </p>
                        )}
                        {payment.transactionId && (
                          <p className="text-slate-400">
                            Transaction: {payment.transactionId.slice(0, 10)}...{payment.transactionId.slice(-6)}
                          </p>
                        )}
                        {payment.errorMessage && (
                          <p className="text-red-400 text-xs mt-1">
                            Error: {payment.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Actions/Details */}
                <div className="flex flex-col gap-2 lg:ml-4">
                  {payment.retryCount > 0 && (
                    <div className="text-right">
                      <span className="text-amber-400 text-sm">
                        Retry: {payment.retryCount}
                      </span>
                    </div>
                  )}
                  {payment.status === PaymentStatus.FAILED && (
                    <button className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition-colors text-sm">
                      Retry Payment
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
