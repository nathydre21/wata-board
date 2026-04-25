import React from 'react';
import { useTranslation } from 'react-i18next';

const PrivacyPolicy: React.FC = () => {
  const { t } = useTranslation();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-slate-200">
      <h1 className="text-3xl font-bold mb-6 text-slate-100">Privacy Policy</h1>
      <p className="mb-4">Effective Date: April 25, 2026</p>
      
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-sky-400">1. Information We Collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Account Information: Your user ID, public keys, and profile details.</li>
          <li>Financial Data: Transaction history, meter IDs, and payment amounts.</li>
          <li>Technical Data: IP address, browser type, and usage logs.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-sky-400">2. How We Use Your Information</h2>
        <p>We use your information to provide services, process transactions, comply with legal obligations, and improve user experience.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-sky-400">3. Data Retention</h2>
        <p>We retain financial data for 7 years and audit logs for 1 year, as detailed in our Data Retention Policy.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-sky-400">4. Contact Us</h2>
        <p>For privacy concerns, contact us at privacy@wataboard.io.</p>
      </section>
    </main>
  );
};

export default PrivacyPolicy;
