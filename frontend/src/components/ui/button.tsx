import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'default' | 'outline';
}

export function Button({ children, onClick, className = '', variant = 'default' }: ButtonProps) {
  const base = 'px-4 py-2 rounded-lg font-medium transition-colors';
  const styles = variant === 'outline'
    ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
    : 'bg-blue-600 text-white hover:bg-blue-700';
  return <button onClick={onClick} className={`${base} ${styles} ${className}`}>{children}</button>;
}
