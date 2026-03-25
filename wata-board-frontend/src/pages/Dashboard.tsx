import React, { useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { setupKeyboardNavigation, setupFocusVisible } from '../utils/accessibility';

// Mock Data
const monthlyUsage = [
  { name: 'Jan', water: 400, electricity: 240 },
  { name: 'Feb', water: 300, electricity: 139 },
  { name: 'Mar', water: 200, electricity: 980 },
  { name: 'Apr', water: 278, electricity: 390 },
  { name: 'May', water: 189, electricity: 480 },
  { name: 'Jun', water: 239, electricity: 380 },
  { name: 'Jul', water: 349, electricity: 430 },
  { name: 'Aug', water: 400, electricity: 500 },
  { name: 'Sep', water: 300, electricity: 400 },
  { name: 'Oct', water: 200, electricity: 300 },
  { name: 'Nov', water: 278, electricity: 200 },
  { name: 'Dec', water: 189, electricity: 300 },
];

const paymentMethods = [
  { name: 'XLM (Native)', value: 85 },
  { name: 'USDC', value: 15 }
];

const COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#ef4444'];

const recentTransactions = [
  { id: '1', date: '2026-03-24', type: 'Electricity', amount: '240 XLM', status: 'Completed' },
  { id: '2', date: '2026-03-15', type: 'Water', amount: '85 XLM', status: 'Completed' },
  { id: '3', date: '2026-03-01', type: 'Electricity', amount: '220 XLM', status: 'Completed' },
  { id: '4', date: '2026-02-28', type: 'Water', amount: '90 XLM', status: 'Completed' },
];

const Dashboard: React.FC = () => {
  useEffect(() => {
    setupKeyboardNavigation();
    setupFocusVisible();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 pb-10 fade-in">
      <main id="main-content" role="main" aria-label="Dashboard">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
          <header className="mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-white hover:text-sky-400 transition-colors">Dashboard Overview</h1>
            <p className="mt-2 text-sm text-slate-400">Advanced visualization of your utility usage and payment history.</p>
          </header>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 hover:bg-slate-900/60 transition-colors backdrop-blur-sm group">
              <h3 className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">Total Spent This Year</h3>
              <p className="mt-2 text-4xl font-semibold text-sky-400 tracking-tight shadow-sm">3,450 XLM</p>
              <p className="mt-2 text-xs text-emerald-400 font-medium">+12% from last year</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 hover:bg-slate-900/60 transition-colors backdrop-blur-sm group">
              <h3 className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">Average Monthly Cost</h3>
              <p className="mt-2 text-4xl font-semibold text-slate-100 tracking-tight shadow-sm">287 XLM</p>
              <p className="mt-2 text-xs text-slate-500 font-medium">Water & Electricity combined</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 hover:bg-slate-900/60 transition-colors backdrop-blur-sm group">
              <h3 className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">Pending Bills</h3>
              <p className="mt-2 text-4xl font-semibold text-amber-400 tracking-tight shadow-sm">0</p>
              <p className="mt-2 text-xs text-slate-500 font-medium">All caught up!</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Monthly Usage Area Chart */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 backdrop-blur-sm hover:border-slate-700 transition-colors">
              <h3 className="text-lg font-semibold tracking-tight text-slate-100 mb-6">Utility Cost Trends</h3>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyUsage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorElec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '0.75rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                      itemStyle={{ fontSize: '14px', fontWeight: 500 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '20px' }}/>
                    <Area type="monotone" dataKey="water" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorWater)" name="Water (XLM)" />
                    <Area type="monotone" dataKey="electricity" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorElec)" name="Electricity (XLM)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Payment Methods Pie Chart */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 backdrop-blur-sm hover:border-slate-700 transition-colors">
              <h3 className="text-lg font-semibold tracking-tight text-slate-100 mb-6">Payment Methods</h3>
              <div className="h-[320px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentMethods}
                      cx="50%"
                      cy="45%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {paymentMethods.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '0.75rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                      itemStyle={{ color: '#f8fafc', fontWeight: 500 }}
                      formatter={(value: number) => [`${value}%`, 'Usage']}
                    />
                    <Legend iconType="circle" verticalAlign="bottom" wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Monthly Bar Chart */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 backdrop-blur-sm hover:border-slate-700 transition-colors lg:col-span-2">
              <h3 className="text-lg font-semibold tracking-tight text-slate-100 mb-6">Monthly Energy Usage</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyUsage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{ fill: '#1e293b', opacity: 0.4 }}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '0.75rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                      itemStyle={{ fontWeight: 500 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '20px' }}/>
                    <Bar dataKey="water" fill="#10b981" radius={[6, 6, 0, 0]} name="Water (Gal x 10)" maxBarSize={40} />
                    <Bar dataKey="electricity" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="Electricity (kWh)" maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Transactions List */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 backdrop-blur-sm hover:border-slate-700 transition-colors flex flex-col">
              <h3 className="text-lg font-semibold tracking-tight text-slate-100 mb-6">Recent Transactions</h3>
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <ul className="space-y-4">
                  {recentTransactions.map((tx) => (
                    <li key={tx.id} className="flex justify-between items-center bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 hover:border-slate-600 transition-colors group cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === 'Water' ? 'bg-sky-500/20 text-sky-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {tx.type === 'Water' ? '💧' : '⚡'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{tx.type}</p>
                          <p className="text-xs text-slate-500 mt-1">{tx.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-100">{tx.amount}</p>
                        <p className="text-xs text-emerald-400 mt-1 font-medium">{tx.status}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <button className="mt-6 w-full py-2.5 text-sm font-medium text-slate-300 hover:text-white transition-all bg-slate-800/40 hover:bg-slate-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500">
                View All Transactions
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
