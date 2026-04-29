import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NetworkSwitcher } from './NetworkSwitcher';
import { announceToScreenReader, trapFocus, generateId, getAriaLabel } from '../utils/accessibility';

const NAV_ITEMS = [
  { path: '/', label: 'Pay Bill' },
  { path: '/schedules', label: 'Schedules' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/monitoring', label: 'Monitoring' },
  { path: '/about', label: 'About' },
  { path: '/contact', label: 'Contact' },
];

interface MobileNavigationProps {
  isOpen: boolean;
  onClose: () => void;
}

const MobileNavigation: React.FC<MobileNavigationProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const menuId = useRef(generateId('mobile-menu'));
  const closeButtonId = useRef(generateId('close-button'));

  const isActive = (path: string) =>
    location.pathname === path
      ? 'text-brand-primary bg-brand-surface-high'
      : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface-high';

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        announceToScreenReader('Navigation menu closed');
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      if (menuRef.current) {
        cleanupRef.current = trapFocus(menuRef.current);
      }
      announceToScreenReader('Navigation menu opened');
    } else {
      document.body.style.overflow = 'unset';
      cleanupRef.current?.();
      cleanupRef.current = null;
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
      cleanupRef.current?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-40 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
        data-testid="mobile-menu-backdrop"
      />

      {/* Slide-in menu */}
      <div
        ref={menuRef}
        className="fixed inset-y-0 left-0 w-full max-w-sm bg-brand-surface-low border-r border-brand-surface-high z-50 lg:hidden animate-slide-down"
        role="dialog"
        aria-modal="true"
        aria-labelledby={menuId.current}
        aria-label="Mobile navigation menu"
        data-testid="mobile-menu"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-brand-surface-high">
            <Link
              to="/"
              className="text-xl font-semibold tracking-tight text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-brand-bg rounded"
              onClick={onClose}
              aria-label="Wata-Board home page"
              id={menuId.current}
            >
              Wata-Board
            </Link>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 rounded-lg text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface-high transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-brand-bg"
              aria-label={getAriaLabel('close-button')}
              id={closeButtonId.current}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-4 overflow-y-auto" role="navigation" aria-label="Main navigation">
            <ul className="space-y-1" role="menu">
              {NAV_ITEMS.map(({ path, label }) => (
                <li key={path} role="none">
                  <Link
                    to={path}
                    className={`block px-4 py-3 rounded-lg text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-brand-bg ${isActive(path)}`}
                    onClick={onClose}
                    aria-current={location.pathname === path ? 'page' : undefined}
                    role="menuitem"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Network Switcher */}
          <div className="p-4 border-t border-brand-surface-high">
            <div className="flex items-center justify-center">
              <NetworkSwitcher showLabel={true} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MobileNavigation;
