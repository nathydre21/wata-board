import React, { useState, useRef, useEffect } from 'react';
import { useTheme, type Theme } from '../hooks/useTheme';
import { announceToScreenReader, generateId } from '../utils/accessibility';

interface ThemeSwitcherProps {
  className?: string;
  variant?: 'dropdown' | 'icon' | 'compact';
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  className = '',
  variant = 'icon',
}) => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownId = useRef(generateId('theme-dropdown'));
  const buttonId = useRef(generateId('theme-button'));

  const themes: Array<{ value: Theme; label: string; icon: string; description: string }> = [
    { value: 'light', label: 'Light', icon: '☀️', description: 'Light mode' },
    { value: 'dark', label: 'Dark', icon: '🌙', description: 'Dark mode' },
    { value: 'system', label: 'System', icon: '🖥️', description: 'System preference' },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    setIsOpen(false);
    const themeLabel = themes.find(t => t.value === newTheme)?.label || newTheme;
    announceToScreenReader(`Theme changed to ${themeLabel}`);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  };

  if (variant === 'icon') {
    return (
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-900 ${className}`}
        aria-label={`Toggle theme. Current: ${theme}`}
        title={`Current theme: ${theme}. Click to change.`}
        type="button"
      >
        <span className="text-xl">{resolvedTheme === 'dark' ? '🌙' : '☀️'}</span>
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`relative inline-block ${className}`}>
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          id={buttonId.current}
          aria-label={`Toggle theme. Current: ${theme}`}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-controls={dropdownId.current}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400"
          type="button"
        >
          <span className="text-sm">{resolvedTheme === 'dark' ? '🌙' : '☀️'}</span>
          <span className="text-xs uppercase tracking-wide">{theme}</span>
        </button>

        {isOpen && (
          <div
            ref={dropdownRef}
            id={dropdownId.current}
            onKeyDown={handleKeyDown}
            className="absolute right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 min-w-[150px]"
            role="menu"
            aria-orientation="vertical"
          >
            {themes.map((t) => (
              <button
                key={t.value}
                onClick={() => handleThemeChange(t.value)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  theme === t.value
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                }`}
                role="menuitem"
                type="button"
              >
                <span className="mr-2">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default dropdown variant
  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        id={buttonId.current}
        aria-label={`Theme: ${theme}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={dropdownId.current}
        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400"
        type="button"
      >
        <span className="text-lg">{resolvedTheme === 'dark' ? '🌙' : '☀️'}</span>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          id={dropdownId.current}
          onKeyDown={handleKeyDown}
          className="absolute right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="px-4 py-2 text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700">
            Theme
          </div>
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => handleThemeChange(t.value)}
              className={`w-full text-left px-4 py-3 text-sm whitespace-nowrap transition-colors ${
                theme === t.value
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              }`}
              role="menuitem"
              type="button"
              title={t.description}
            >
              <span className="mr-2">{t.icon}</span>
              {t.label}
              {theme === t.value && <span className="ml-2">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
