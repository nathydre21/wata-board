import React, { useState } from 'react';
import { sanitizeText, isValidEmail, sanitizeString } from '../utils/sanitize';

function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ALLOWED_SUBJECTS = ['general', 'support', 'billing', 'feedback'];

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const name = sanitizeString(formData.name, 100);
    if (!name || name.length < 2) newErrors.name = 'Name must be at least 2 characters.';

    if (!isValidEmail(formData.email)) newErrors.email = 'Please enter a valid email address.';

    if (!formData.subject || !ALLOWED_SUBJECTS.includes(formData.subject)) {
      newErrors.subject = 'Please select a valid subject.';
    }

    const message = sanitizeText(formData.message, 2000);
    if (!message || message.length < 10) newErrors.message = 'Message must be at least 10 characters.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const sanitized = {
      name: sanitizeString(formData.name, 100),
      email: formData.email.trim().toLowerCase().slice(0, 254),
      subject: ALLOWED_SUBJECTS.includes(formData.subject) ? formData.subject : '',
      message: sanitizeText(formData.message, 2000),
    };

    console.log('Form submitted:', sanitized);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    if (errors[e.target.name]) {
      setErrors(prev => { const next = { ...prev }; delete next[e.target.name]; return next; });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 transition-colors duration-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 p-4 sm:p-6 lg:p-8 shadow-xl shadow-black/10 dark:shadow-black/20">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight mb-6 text-slate-900 dark:text-slate-50">Contact Us</h1>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <p className="text-slate-600 dark:text-slate-300 text-responsive leading-relaxed">
                Have questions or feedback? We'd love to hear from you. Fill out the form
                and our team will get back to you as soon as possible.
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                  <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-sky-500 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="text-sm sm:text-base">support@wata-board.com</span>
                </div>

                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                  <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-sky-500 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="text-sm sm:text-base">Blockchain City, Stellar Network</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full h-12 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/50 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none ring-sky-500/30 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-4 focus:ring-sky-500/20 transition-all"
                  placeholder="Your name"
                  required
                  maxLength={100}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full h-12 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/50 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none ring-sky-500/30 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-4 focus:ring-sky-500/20 transition-all"
                  placeholder="your@email.com"
                  required
                  maxLength={254}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Subject</label>
                <select
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  className="w-full h-12 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/50 px-4 text-sm text-slate-900 dark:text-slate-100 outline-none ring-sky-500/30 focus:ring-4 focus:ring-sky-500/20 transition-all"
                  required
                >
                  <option value="">Select a subject</option>
                  <option value="general">General Inquiry</option>
                  <option value="support">Technical Support</option>
                  <option value="billing">Billing Question</option>
                  <option value="feedback">Feedback</option>
                </select>
                {errors.subject && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.subject}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Message</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={4}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/50 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none ring-sky-500/30 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-4 focus:ring-sky-500/20 transition-all resize-none"
                  placeholder="How can we help you?"
                  required
                  maxLength={2000}
                />
                {errors.message && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.message}</p>}
              </div>

              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-sky-500 px-6 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 ring-1 ring-inset ring-white/10 transition hover:bg-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-500/30"
              >
                {submitted ? 'Message Sent!' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Contact;