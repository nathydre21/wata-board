import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NetworkSwitcher } from './NetworkSwitcher';
import { ThemeSwitcher } from './ThemeSwitcher';
import MobileNavigation from './MobileNavigation';
import { announceToScreenReader, trapFocus, generateId, getAriaLabel } from '../utils/accessibility';

export const ResponsiveNavigation: React.FC = memo(() => {
  const { t } = useTranslation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Navigation items - single source of truth
  const NAV_ITEMS = [
    { path: '/', label: t('navigation.home') },
    { path: '/schedules', label: t('navigation.schedules') || 'Schedules' },
    { path: '/analytics', label: t('navigation.analytics') || 'Analytics' },
    { path: '/monitoring', label: t('navigation.monitoring') || 'Monitoring' },
    { path: '/about', label: t('navigation.about') },
    { path: '/contact', label: t('navigation.contact') },
  ];

  const navigationId = useRef(generateId('navigation'));
  const menuButtonId = useRef(generateId('menu-button'));

  const isActive = useCallback((path: string) => {
    return location.pathname === path
      ? 'text-sky-500 dark:text-sky-400'
      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100';
  }, [location.pathname]);

  const toggleMobileMenu = useCallback(() => {
    const newOpenState = !isMobileMenuOpen;
    setIsMobileMenuOpen(newOpenState);

    if (newOpenState) {
      announceToScreenReader(t('accessibility.navigation.menuOpened'));
      if (mobileMenuRef.current) {
        cleanupRef.current = trapFocus(mobileMenuRef.current);
      }
    } else {
      announceToScreenReader(t('accessibility.navigation.menuClosed'));
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      menuButtonRef.current?.focus();
    }
  }, [isMobileMenuOpen, t]);

  const closeMobileMenu = useCallback(() => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
      announceToScreenReader(t('accessibility.navigation.menuClosed'));
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      menuButtonRef.current?.focus();
    }
  }, [isMobileMenuOpen, t]);

  // Close on route change
  useEffect(() => {
    closeMobileMenu();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) closeMobileMenu();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMobileMenuOpen, closeMobileMenu]);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  const linkClass = (path: string, extra = '') =>
    `transition px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-brand-bg ${isActive(path)} ${extra}`;

  return (
    <>
      <nav
        className="border-b border-brand-surface-high bg-brand-surface-low/80 backdrop-blur-md sticky top-0 z-40"
  return (
    <>
      <nav
        className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm sticky top-0 z-40 transition-colors duration-200"
        role="navigation"
        aria-label="Main navigation"
        id={navigationId.current}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              to="/"
              className="text-xl font-semibold tracking-tight text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-brand-bg rounded"
              aria-label="Wata-Board home page"
            >
              Wata-Board
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex lg:items-center lg:gap-6">
              <div className="flex items-center gap-1 text-sm" role="menubar">
                {NAV_ITEMS.map(({ path, label }) => (
                  <Link
                    key={path}
                    to={path}
                    className={linkClass(path)}
                    aria-current={location.pathname === path ? 'page' : undefined}
                    role="menuitem"
                  >
                    {label}
                  </Link>
                ))}

            {/* Mobile/Tablet controls */}
            <div className="lg:hidden flex items-center gap-3">
              <ThemeSwitcher variant="icon" />
              <NetworkSwitcher showLabel={false} />
              <button
                ref={menuButtonRef}
                onClick={toggleMobileMenu}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                aria-label={getAriaLabel('menu-button')}
                aria-expanded={isMobileMenuOpen}
                aria-controls={navigationId.current}
                id={menuButtonId.current}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Tablet Navigation row */}
          <div className="hidden md:flex lg:hidden py-3 border-t border-slate-200 dark:border-slate-800" role="menubar">
            <div className="flex items-center gap-4 text-sm w-full justify-center flex-1">
              {NAV_ITEMS.map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  className={linkClass(path, 'py-1')}
                  aria-current={location.pathname === path ? 'page' : undefined}
                  role="menuitem"
                >
                  {label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <ThemeSwitcher variant="icon" />
              <NetworkSwitcher showLabel={false} />
            </div>
          </div>
      </nav>

      {/* Mobile Navigation Menu */}
      <MobileNavigation isOpen={isMobileMenuOpen} onClose={closeMobileMenu} />
    </>
  );
});
