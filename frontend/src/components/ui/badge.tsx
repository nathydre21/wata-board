import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'destructive';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const styles: Record<string, string> = {
    default: 'bg-green-100 text-green-800',
    secondary: 'bg-gray-100 text-gray-800',
    destructive: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[variant]} ${className}`}>
      {children}
    </span>
  );
}
