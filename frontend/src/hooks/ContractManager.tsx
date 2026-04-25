import React, { useState } from 'react';

export const ContractManager: React.FC = () => {
  const [fee, setFee] = useState(100);

  const updateFee = async () => {
    await fetch('/api/admin/contract/update-params', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': localStorage.getItem('admin_token') || '' },
      body: JSON.stringify({ feeBase: fee })
    });
    alert('Fee updated');
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <h3 className="text-lg font-bold mb-4">Smart Contract Parameters</h3>
      <div className="flex items-center space-x-4">
        <label>Base Fee (Stroops):</label>
        <input 
          type="number" 
          value={fee} 
          onChange={(e) => setFee(Number(e.target.value))}
          className="border rounded p-1"
        />
        <button onClick={updateFee} className="bg-blue-500 text-white px-4 py-1 rounded">Update</button>
      </div>
    </div>
  );
};