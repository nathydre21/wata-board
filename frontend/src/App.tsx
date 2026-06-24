import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ResponsiveNavigation } from './components/ResponsiveNavigation'
import { LoadingSpinner } from './components/LoadingSpinner'
import { ErrorBoundary } from './components/ErrorBoundary'

const About = lazy(() => import('./pages/About'))
const Contact = lazy(() => import('./pages/Contact'))
const DataRetentionPolicy = lazy(() => import('./pages/DataRetentionPolicy'))
const PaymentHistory = lazy(() => import('./pages/PaymentHistory'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const QRPaymentHandler = lazy(() => import('./pages/QRPaymentHandler').then(m => ({ default: m.QRPaymentHandler })))
const Rate = lazy(() => import('./pages/Rate'))
const ScheduledPayments = lazy(() => import('./pages/ScheduledPayments'))
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard'))
const RealTimeMonitoringDashboard = lazy(() => import('./components/RealTimeMonitoringDashboard'))

function App() {
  return (
    <BrowserRouter>
      <ResponsiveNavigation />
      <ErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-950">
            <LoadingSpinner size="lg" label="Loading..." />
          </div>
        }>
          <Routes>
            <Route path="/" element={<PaymentHistory />} />
            <Route path="/schedules" element={<ScheduledPayments />} />
            <Route path="/analytics" element={<AnalyticsDashboard userId="current-user" />} />
            <Route path="/monitoring" element={<RealTimeMonitoringDashboard />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/payment-history" element={<PaymentHistory />} />
            <Route path="/qr-payment" element={<QRPaymentHandler />} />
            <Route path="/rate" element={<Rate />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/data-retention-policy" element={<DataRetentionPolicy />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
