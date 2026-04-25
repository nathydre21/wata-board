import React from 'react';

const DataRetentionPolicy: React.FC = () => {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-slate-200">
      <h1 className="text-3xl font-bold mb-6 text-slate-100">Data Retention Policy</h1>
      
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-sky-400">1. Overview</h2>
        <p>This policy outlines the retention periods for different data types within Wata Board.</p>
      </section>

      <section className="mb-8 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900">
              <th className="p-4 border-b border-slate-800">Data Category</th>
              <th className="p-4 border-b border-slate-800">Retention Period</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-4 border-b border-slate-800">Financial Transactions</td>
              <td className="p-4 border-b border-slate-800">7 Years</td>
            </tr>
            <tr className="bg-slate-900/30">
              <td className="p-4 border-b border-slate-800">Audit Logs</td>
              <td className="p-4 border-b border-slate-800">1 Year (365 Days)</td>
            </tr>
            <tr>
              <td className="p-4 border-b border-slate-800">App Logs</td>
              <td className="p-4 border-b border-slate-800">14 Days</td>
            </tr>
            <tr className="bg-slate-900/30">
              <td className="p-4">User Profiles</td>
              <td className="p-4">Until Account Deletion</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-sky-400">2. Automated Deletion</h2>
        <p>We use automated scripts to periodically prune logs and expired data to ensure compliance with this policy.</p>
      </section>
    </main>
  );
};

export default DataRetentionPolicy;
