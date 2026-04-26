import React from 'react';

interface SkeletonLoaderProps {
  /** Tailwind width class, e.g. "w-full", "w-32". Defaults to "w-full". */
  width?: string;
  /** Tailwind height class, e.g. "h-4", "h-6". Defaults to "h-4". */
  height?: string;
  /**
   * Number of skeleton bars to render stacked vertically.
   * Must be a positive integer. Defaults to 1.
   * Values ≤ 0 render nothing.
   */
  count?: number;
  /** Extra Tailwind classes appended to the root element. */
  className?: string;
}

/**
 * Reusable animated skeleton placeholder.
 *
 * Accessibility:
 * - The root element always carries `aria-hidden="true"` so screen readers
 *   skip the placeholder content entirely.
 */
export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = 'w-full',
  height = 'h-4',
  count = 1,
  className = '',
}) => {
  if (count <= 0) return null;

  const bar = (key?: number) => (
    <div
      key={key}
      className={`animate-pulse rounded bg-slate-700 ${width} ${height}`}
    />
  );

  if (count === 1) {
    return (
      <div aria-hidden="true" className={`animate-pulse rounded bg-slate-700 ${width} ${height} ${className}`} />
    );
  }

  return (
    <div aria-hidden="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: count }, (_, i) => bar(i))}
    </div>
  );
};
