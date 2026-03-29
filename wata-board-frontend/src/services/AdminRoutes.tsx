import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

const AdminDashboard = () => (
  <div className="p-8">
    <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Contract Parameters</h2>
        <button className="bg-blue-600 text-white px-4 py-2 rounded">Update Base Fee</button>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">System Analytics</h2>
        <p className="text-gray-600">Active Node Status: Optimal</p>
      </div>
    </div>
  </div>
);

export const AdminRoutes = () => {
  const isAdmin = localStorage.getItem('admin_token'); // Simplified check
  return (
    <Routes>
      <Route path="/" element={isAdmin ? <AdminDashboard /> : <Navigate to="/login" />} />
    </Routes>
  );
};