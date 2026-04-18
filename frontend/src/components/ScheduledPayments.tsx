import React, { useState } from 'react';
import { useScheduledPayments } from '../hooks/useScheduledPayments';
import { PaymentFrequency, PaymentStatus } from '../types/scheduling';

interface ScheduledPaymentsProps {
  userId: string;
}

export const ScheduledPayments: React.FC<ScheduledPaymentsProps> = ({ userId }) => {
  const { schedules, loading, error, cancelSchedule, analytics } = useScheduledPayments(userId);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    setIsCancelling(id);
    try {
      await cancelSchedule(id, 'User requested cancellation');
    } finally {
      setIsCancelling(null);
    }
  };

  if (loading) return <div className="p-4 text-center">Loading schedules...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="space-y-6 p-4">
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-lg shadow">
          <div className="text-center">
            <p className="text-sm text-gray-500">Active Schedules</p>
            <p className="text-2xl font-bold">{analytics.activeSchedules}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Total Paid</p>
            <p className="text-2xl font-bold">{analytics.totalAmount} XLM</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Monthly Projection</p>
            <p className="text-2xl font-bold">{analytics.monthlyProjection.toFixed(2)} XLM</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Next Payment</p>
            <p className="text-lg font-semibold">{analytics.nextPaymentAmount} XLM</p>
            <p className="text-xs text-gray-400">{new Date(analytics.nextPaymentDate).toLocaleDateString()}</p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">Payment Calendar</h4>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-xs font-bold">{d}</div>)}
          {Array.from({ length: 30 }).map((_, i) => {
            const isScheduled = schedules.some(s => new Date(s.nextPaymentDate).getDate() === i + 1);
            return (
              <div key={i} className={`h-8 w-8 flex items-center justify-center rounded-full text-xs ${isScheduled ? 'bg-blue-600 text-white font-bold' : 'text-gray-400'}`}>
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Your Scheduled Payments</h3>
        </div>
        <ul className="divide-y divide-gray-200">
          {schedules.length === 0 ? (
            <li className="px-4 py-8 text-center text-gray-500">No scheduled payments found.</li>
          ) : (
            schedules.map((schedule) => (
              <li key={schedule.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-blue-600 truncate">
                        Meter: {schedule.meterId}
                      </p>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          schedule.status === PaymentStatus.SCHEDULED ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {schedule.status}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500">
                          {schedule.amount} XLM • {schedule.frequency}
                        </p>
                        <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                          Next: {new Date(schedule.nextPaymentDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                        {schedule.description && (
                          <span className="italic truncate max-w-xs">{schedule.description}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    {schedule.status === PaymentStatus.SCHEDULED && (
                      <button
                        onClick={() => handleCancel(schedule.id)}
                        disabled={isCancelling === schedule.id}
                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                      >
                        {isCancelling === schedule.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                   <p className="text-xs text-gray-400">
                     Created: {new Date(schedule.createdAt).toLocaleDateString()} • 
                     Payments: {schedule.currentPaymentCount} / {schedule.maxPayments || '∞'}
                   </p>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};