import React from 'react';

interface LoadingSpinnerProps {
  /** Controls the spinner dimensions. Defaults to "md". */
  size?: 'sm' | 'md' | 'lg';
  /** Extra Tailwind classes appended to the root wrapper element. */
  className?: string;
  /** Accessible label rendered as a visually-hidden span for screen readers. */
  label?: string;
}

const sizeClasses: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
};

/**
 * Reusable animated loading spinner.
 *
 * Accessibility:
 * - The spinner div carries `aria-hidden="true"` so screen readers ignore it.
 * - When `label` is provided a `<span className="sr-only">` is rendered so
 *   assistive technologies can announce the loading state.
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = '',
  label,
}) => {
  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      <div
        aria-hidden="true"
        className={`animate-spin rounded-full border-slate-600 border-t-sky-500 ${sizeClasses[size]}`}
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
};
