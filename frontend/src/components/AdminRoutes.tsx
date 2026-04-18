import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ContractManager } from '../components/Admin/ContractManager';

const AdminDashboard = () => (
  <div className="p-8">
    <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ContractManager />
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">System Analytics</h2>
          <p className="text-gray-600">Active Node Status: Optimal</p>
          <p className="text-sm mt-2 text-blue-600">Volume: 50,000 XLM / Month</p>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">User Management & Support</h2>
        <div className="border-t pt-4">
          <p className="text-sm text-gray-500">Active Support Tickets: 0</p>
          <button className="mt-4 text-sm text-blue-600 hover:underline">View All Users</button>
        </div>
      </div>
    </div>
  </div>
);

export const AdminRoutes = () => {
  const isAdmin = localStorage.getItem('admin_token');
  return (
    <Routes>
      <Route path="/" element={isAdmin ? <AdminDashboard /> : <Navigate to="/login" />} />
    </Routes>
  );
};