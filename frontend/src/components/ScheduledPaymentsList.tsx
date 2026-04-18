import React, { useState, useEffect, useMemo } from 'react';
import {
  PaymentStatus,
  PaymentFrequency,
} from '../types/scheduling';

import type {
  PaymentSchedule,
  ScheduledPayment,
  CalendarEvent
} from '../types/scheduling';
import { SchedulingService } from '../services/schedulingService';

interface ScheduledPaymentsListProps {
  userId: string;
  onEditSchedule?: (schedule: PaymentSchedule) => void;
  onNewSchedule?: () => void;
}

export function ScheduledPaymentsList({ userId, onEditSchedule, onNewSchedule }: ScheduledPaymentsListProps) {
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<PaymentSchedule | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active');
  const [, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Advanced filter states
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [paymentFilters, setPaymentFilters] = useState({
    meterId: '',
    status: '' as PaymentStatus | '',
    dateRange: { start: '', end: '' },
    amountRange: { min: '', max: '' }
  });
  const [showExportMenu, setShowExportMenu] = useState(false);

  const service = SchedulingService.getInstance();

  useEffect(() => {
    loadSchedules();
  }, [userId]);

  useEffect(() => {
    if (schedules.length > 0) {
      loadCalendarEvents();
    }
  }, [schedules, currentMonth]);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const result = await service.getUserSchedules(userId);
      if (result.success && result.schedules) {
        setSchedules(result.schedules);
      }
    } catch (error) {
      console.error('Failed to load schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCalendarEvents = async () => {
    try {
      const events = await service.getCalendarEvents(
        userId,
        currentMonth.getFullYear(),
        currentMonth.getMonth()
      );
      setCalendarEvents(events);
    } catch (error) {
      console.error('Failed to load calendar events:', error);
    }
  };

  const handleCancelSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to cancel this schedule? All pending payments will be cancelled.')) {
      return;
    }

    try {
      const result = await service.cancelSchedule(scheduleId);
      if (result.success) {
        await loadSchedules();
        // Show success message
      } else {
        console.error('Failed to cancel schedule:', result.error);
        // Show error message
      }
    } catch (error) {
      console.error('Error cancelling schedule:', error);
    }
  };

  const handlePauseSchedule = async (scheduleId: string) => {
    try {
      // This would need to be implemented in the service
      console.log('Pause schedule:', scheduleId);
    } catch (error) {
      console.error('Error pausing schedule:', error);
    }
  };

  // Get all payment history from all schedules
  const allPaymentHistory = useMemo(() => {
    const allPayments: (ScheduledPayment & { meterId: string; scheduleDescription?: string })[] = [];

    schedules.forEach(schedule => {
      schedule.paymentHistory.forEach(payment => {
        allPayments.push({
          ...payment,
          meterId: schedule.meterId,
          scheduleDescription: schedule.description
        });
      });
    });

    return allPayments.sort((a, b) =>
      new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()
    );
  }, [schedules]);

  // Filter payment history based on all criteria
  const filteredPaymentHistory = useMemo(() => {
    return allPaymentHistory.filter(payment => {
      // Search term filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
          payment.meterId.toLowerCase().includes(searchLower) ||
          (payment.scheduleDescription?.toLowerCase().includes(searchLower) || '') ||
          (payment.transactionId && payment.transactionId.toLowerCase().includes(searchLower)) ||
          payment.id.toLowerCase().includes(searchLower) ||
          (payment.errorMessage && payment.errorMessage.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      // Meter ID filter
      if (paymentFilters.meterId && !payment.meterId.toLowerCase().includes(paymentFilters.meterId.toLowerCase())) {
        return false;
      }

      // Status filter
      if (paymentFilters.status && payment.status !== paymentFilters.status) {
        return false;
      }

      // Date range filter
      if (paymentFilters.dateRange.start || paymentFilters.dateRange.end) {
        const paymentDate = new Date(payment.scheduledDate);
        const startDate = paymentFilters.dateRange.start ? new Date(paymentFilters.dateRange.start) : null;
        const endDate = paymentFilters.dateRange.end ? new Date(paymentFilters.dateRange.end) : null;

        if (startDate && paymentDate < startDate) return false;
        if (endDate && paymentDate > endDate) return false;
      }

      // Amount range filter
      if (paymentFilters.amountRange.min || paymentFilters.amountRange.max) {
        const minAmount = paymentFilters.amountRange.min ? parseFloat(paymentFilters.amountRange.min) : 0;
        const maxAmount = paymentFilters.amountRange.max ? parseFloat(paymentFilters.amountRange.max) : Infinity;

        if (payment.amount < minAmount || payment.amount > maxAmount) {
          return false;
        }
      }

      return true;
    });
  }, [allPaymentHistory, searchTerm, paymentFilters]);

  const filteredSchedules = schedules.filter(schedule => {
    const matchesSearch = schedule.meterId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (schedule.description?.toLowerCase().includes(searchTerm.toLowerCase()) || '');

    switch (activeTab) {
      case 'active':
        return matchesSearch && schedule.status === PaymentStatus.SCHEDULED;
      case 'completed':
        return matchesSearch && schedule.status === PaymentStatus.COMPLETED;
      default:
        return matchesSearch;
    }
  });

  // Export functionality
  const handleExport = (format: 'csv' | 'json') => {
    const dataToExport = filteredPaymentHistory.map(payment => ({
      id: payment.id,
      meterId: payment.meterId,
      amount: payment.amount,
      scheduledDate: formatDate(payment.scheduledDate),
      actualPaymentDate: payment.actualPaymentDate ? formatDate(payment.actualPaymentDate) : '',
      status: payment.status,
      transactionId: payment.transactionId || '',
      errorMessage: payment.errorMessage || '',
      retryCount: payment.retryCount,
      scheduleDescription: payment.scheduleDescription || ''
    }));

    if (format === 'csv') {
      const headers = ['ID', 'Meter ID', 'Amount', 'Scheduled Date', 'Actual Payment Date', 'Status', 'Transaction ID', 'Error Message', 'Retry Count', 'Schedule Description'];
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => [
          row.id,
          row.meterId,
          row.amount,
          `"${row.scheduledDate}"`,
          `"${row.actualPaymentDate}"`,
          row.status,
          `"${row.transactionId}"`,
          `"${row.errorMessage}"`,
          row.retryCount,
          `"${row.scheduleDescription}"`
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

  const clearAllFilters = () => {
    setSearchTerm('');
    setPaymentFilters({
      meterId: '',
      status: '',
      dateRange: { start: '', end: '' },
      amountRange: { min: '', max: '' }
    });
  };

  const hasActiveFilters = searchTerm ||
    paymentFilters.meterId ||
    paymentFilters.status ||
    paymentFilters.dateRange.start ||
    paymentFilters.dateRange.end ||
    paymentFilters.amountRange.min ||
    paymentFilters.amountRange.max;

  const getFrequencyLabel = (frequency: PaymentFrequency): string => {
    const labels = {
      [PaymentFrequency.ONCE]: 'One-time',
      [PaymentFrequency.DAILY]: 'Daily',
      [PaymentFrequency.WEEKLY]: 'Weekly',
      [PaymentFrequency.BIWEEKLY]: 'Bi-weekly',
      [PaymentFrequency.MONTHLY]: 'Monthly',
      [PaymentFrequency.QUARTERLY]: 'Quarterly',
      [PaymentFrequency.YEARLY]: 'Yearly'
    };
    return labels[frequency] || frequency;
  };

  const getStatusColor = (status: PaymentStatus): string => {
    const colors = {
      [PaymentStatus.SCHEDULED]: 'text-sky-400 bg-sky-400/10',
      [PaymentStatus.COMPLETED]: 'text-green-400 bg-green-400/10',
      [PaymentStatus.FAILED]: 'text-red-400 bg-red-400/10',
      [PaymentStatus.CANCELLED]: 'text-slate-400 bg-slate-400/10',
      [PaymentStatus.PAUSED]: 'text-amber-400 bg-amber-400/10'
    };
    return colors[status] || 'text-slate-400 bg-slate-400/10';
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Scheduled Payments</h2>
          <p className="text-slate-400">Manage your recurring and scheduled payments</p>
        </div>
        {onNewSchedule && (
          <button
            onClick={onNewSchedule}
            className="px-4 h-10 bg-sky-500 hover:bg-sky-400 text-white font-medium rounded-lg transition-colors"
          >
            New Schedule
          </button>
        )}
      </div>

      {/* Enhanced Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search transactions by meter ID, description, transaction ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 h-10 pl-10 pr-4 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
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
            disabled={filteredPaymentHistory.length === 0}
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
        <div className="absolute right-4 top-32 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-10">
          <div className="p-2">
            <button
              onClick={() => {
                handleExport('csv');
                setShowExportMenu(false);
              }}
              className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-700 rounded-md transition-colors"
            >
              Export as CSV
            </button>
            <button
              onClick={() => {
                handleExport('json');
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
      {showAdvancedFilters && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-100">Advanced Filters</h3>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear All
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Meter ID Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Meter ID
              </label>
              <input
                type="text"
                placeholder="Enter meter ID..."
                value={paymentFilters.meterId}
                onChange={(e) => setPaymentFilters(prev => ({ ...prev, meterId: e.target.value }))}
                className="w-full h-10 px-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Status
              </label>
              <select
                value={paymentFilters.status}
                onChange={(e) => setPaymentFilters(prev => ({ ...prev, status: e.target.value as PaymentStatus | '' }))}
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
                  value={paymentFilters.dateRange.start}
                  onChange={(e) => setPaymentFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, start: e.target.value }
                  }))}
                  className="w-full h-10 px-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
                <input
                  type="date"
                  placeholder="End date"
                  value={paymentFilters.dateRange.end}
                  onChange={(e) => setPaymentFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, end: e.target.value }
                  }))}
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
                  value={paymentFilters.amountRange.min}
                  onChange={(e) => setPaymentFilters(prev => ({
                    ...prev,
                    amountRange: { ...prev.amountRange, min: e.target.value }
                  }))}
                  min="0"
                  step="0.01"
                  className="w-full h-10 px-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
                <input
                  type="number"
                  placeholder="Max amount"
                  value={paymentFilters.amountRange.max}
                  onChange={(e) => setPaymentFilters(prev => ({
                    ...prev,
                    amountRange: { ...prev.amountRange, max: e.target.value }
                  }))}
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
          {searchTerm && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Search: {searchTerm}
            </span>
          )}
          {paymentFilters.meterId && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Meter: {paymentFilters.meterId}
            </span>
          )}
          {paymentFilters.status && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Status: {paymentFilters.status}
            </span>
          )}
          {(paymentFilters.dateRange.start || paymentFilters.dateRange.end) && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Date: {paymentFilters.dateRange.start || 'Any'} - {paymentFilters.dateRange.end || 'Any'}
            </span>
          )}
          {(paymentFilters.amountRange.min || paymentFilters.amountRange.max) && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 rounded-md text-sm">
              Amount: {paymentFilters.amountRange.min || '0'} - {paymentFilters.amountRange.max || '∞'}
            </span>
          )}
        </div>
      )}

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <p className="text-slate-400">
          Showing {filteredPaymentHistory.length} of {allPaymentHistory.length} transactions
        </p>
        <div className="text-right">
          <p className="text-sm text-slate-400">Total Amount</p>
          <p className="text-lg font-semibold text-slate-100">
            {formatCurrency(filteredPaymentHistory.reduce((sum, p) => sum + p.amount, 0))}
          </p>
        </div>
      </div>

      {/* Payment History Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-100">Payment History</h3>
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-1">
            {['all', 'completed', 'failed', 'pending'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === tab
                    ? 'bg-sky-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredPaymentHistory.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-slate-200 mb-2">
              No payment history found
            </h3>
            <p className="text-slate-400">
              {allPaymentHistory.length === 0
                ? 'No payment history available'
                : 'Try adjusting your search filters'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredPaymentHistory.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-4 bg-slate-800 rounded-lg hover:bg-slate-750 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-medium text-slate-100">{payment.meterId}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                      {payment.status.replace('_', ' ')}
                    </span>
                    {payment.scheduleDescription && (
                      <span className="text-sm text-slate-400">{payment.scheduleDescription}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-6 text-sm text-slate-400">
                    <span>Scheduled: {formatDate(payment.scheduledDate)}</span>
                    {payment.actualPaymentDate && (
                      <span>Paid: {formatDate(payment.actualPaymentDate)}</span>
                    )}
                    {payment.transactionId && (
                      <span>TX: {payment.transactionId.slice(0, 8)}...</span>
                    )}
                    {payment.retryCount > 0 && (
                      <span className="text-amber-400">Retries: {payment.retryCount}</span>
                    )}
                  </div>
                  {payment.errorMessage && (
                    <p className="text-red-400 text-xs mt-1">{payment.errorMessage}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-slate-100">{formatCurrency(payment.amount)}</p>
                  {payment.status === PaymentStatus.FAILED && (
                    <button className="mt-1 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-md transition-colors">
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-100">Calendar View</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              className="p-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              ◀
            </button>
            <span className="text-slate-200 font-medium">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              className="p-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-xs font-medium text-slate-400 py-2">
              {day}
            </div>
          ))}

          {/* Calendar days would go here - simplified for now */}
          <div className="col-span-7 text-center text-slate-500 py-8">
            Calendar view coming soon...
          </div>
        </div>
      </div>

      {/* Schedules List */}
      <div className="space-y-4">
        {filteredSchedules.length === 0 ? (
          <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="text-4xl mb-4">📅</div>
            <h3 className="text-lg font-medium text-slate-200 mb-2">
              No scheduled payments found
            </h3>
            <p className="text-slate-400 mb-4">
              {activeTab === 'active'
                ? 'You have no active scheduled payments'
                : `No ${activeTab} payments found`
              }
            </p>
            {onNewSchedule && activeTab === 'active' && (
              <button
                onClick={onNewSchedule}
                className="px-4 h-10 bg-sky-500 hover:bg-sky-400 text-white font-medium rounded-lg transition-colors"
              >
                Create Your First Schedule
              </button>
            )}
          </div>
        ) : (
          filteredSchedules.map((schedule) => (
            <div
              key={schedule.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-lg font-semibold text-slate-100 mb-1">
                        {schedule.meterId}
                      </h4>
                      {schedule.description && (
                        <p className="text-slate-400 text-sm">{schedule.description}</p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(schedule.status)}`}>
                      {schedule.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-400 mb-1">Amount</p>
                      <p className="text-slate-200 font-medium">{formatCurrency(schedule.amount)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Frequency</p>
                      <p className="text-slate-200 font-medium">{getFrequencyLabel(schedule.frequency)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Next Payment</p>
                      <p className="text-slate-200 font-medium">
                        {schedule.nextPaymentDate ? formatDate(schedule.nextPaymentDate) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Progress</p>
                      <p className="text-slate-200 font-medium">
                        {schedule.currentPaymentCount}
                        {schedule.maxPayments ? ` / ${schedule.maxPayments}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Payment History */}
                  {schedule.paymentHistory.length > 0 && (
                    <div className="mt-4">
                      <p className="text-slate-400 text-sm mb-2">Recent Payments</p>
                      <div className="space-y-1">
                        {schedule.paymentHistory.slice(-3).reverse().map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between text-sm">
                            <span className="text-slate-300">
                              {formatDate(payment.scheduledDate)}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-200">{formatCurrency(payment.amount)}</span>
                              <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(payment.status)}`}>
                                {payment.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 lg:ml-4">
                  <button
                    onClick={() => setSelectedSchedule(schedule)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    View Details
                  </button>

                  {schedule.status === PaymentStatus.SCHEDULED && onEditSchedule && (
                    <button
                      onClick={() => onEditSchedule(schedule)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      Edit
                    </button>
                  )}

                  {schedule.status === PaymentStatus.SCHEDULED && (
                    <button
                      onClick={() => handlePauseSchedule(schedule.id)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      Pause
                    </button>
                  )}

                  {schedule.status === PaymentStatus.SCHEDULED && (
                    <button
                      onClick={() => handleCancelSchedule(schedule.id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Schedule Details Modal */}
      {selectedSchedule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-100">Schedule Details</h3>
              <button
                onClick={() => setSelectedSchedule(null)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 text-sm mb-1">Meter ID</p>
                  <p className="text-slate-200 font-medium">{selectedSchedule.meterId}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedSchedule.status)}`}>
                    {selectedSchedule.status.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Amount</p>
                  <p className="text-slate-200 font-medium">{formatCurrency(selectedSchedule.amount)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Frequency</p>
                  <p className="text-slate-200 font-medium">{getFrequencyLabel(selectedSchedule.frequency)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Start Date</p>
                  <p className="text-slate-200 font-medium">{formatDate(selectedSchedule.startDate)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">End Date</p>
                  <p className="text-slate-200 font-medium">
                    {selectedSchedule.endDate ? formatDate(selectedSchedule.endDate) : 'No end date'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Next Payment</p>
                  <p className="text-slate-200 font-medium">
                    {selectedSchedule.nextPaymentDate ? formatDate(selectedSchedule.nextPaymentDate) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Progress</p>
                  <p className="text-slate-200 font-medium">
                    {selectedSchedule.currentPaymentCount}
                    {selectedSchedule.maxPayments ? ` / ${selectedSchedule.maxPayments}` : ' payments'}
                  </p>
                </div>
              </div>

              {selectedSchedule.description && (
                <div>
                  <p className="text-slate-400 text-sm mb-1">Description</p>
                  <p className="text-slate-200">{selectedSchedule.description}</p>
                </div>
              )}

              <div>
                <p className="text-slate-400 text-sm mb-3">Payment History</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedSchedule.paymentHistory.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                      <div>
                        <p className="text-slate-200 font-medium">{formatDate(payment.scheduledDate)}</p>
                        {payment.actualPaymentDate && (
                          <p className="text-slate-400 text-sm">
                            Paid: {formatDate(payment.actualPaymentDate)}
                          </p>
                        )}
                        {payment.transactionId && (
                          <p className="text-slate-400 text-xs">
                            TX: {payment.transactionId.slice(0, 10)}...
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-slate-200 font-medium">{formatCurrency(payment.amount)}</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs mt-1 ${getStatusColor(payment.status)}`}>
                          {payment.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
