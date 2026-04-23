/**
 * Performance optimization utilities for low-end devices
 */

import React from 'react';

// Device detection
export interface DeviceInfo {
  isLowEnd: boolean;
  isMobile: boolean;
  memory: number;
  cores: number;
}

export function getDeviceInfo(): DeviceInfo {
  const navigator = window.navigator as any;
  
  // Detect if mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Estimate device capabilities
  const memory = navigator.deviceMemory || 4; // Default to 4GB if unknown
  const cores = navigator.hardwareConcurrency || 4; // Default to 4 cores if unknown
  
  // Consider device low-end if:
  // - Less than 4GB RAM
  // - Less than 4 CPU cores
  // - Mobile device (generally less powerful)
  const isLowEnd = memory < 4 || cores < 4 || isMobile;
  
  return {
    isLowEnd,
    isMobile,
    memory,
    cores
  };
}

// Lazy loading for components
export function lazyLoad<T extends React.ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>
) {
  return React.lazy(importFunc);
}

// Debounce utility for performance
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle utility for performance
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Intersection Observer for lazy loading
export function createIntersectionObserver(
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit
): IntersectionObserver | null {
  if (!('IntersectionObserver' in window)) {
    return null; // Not supported
  }
  
  const defaultOptions: IntersectionObserverInit = {
    rootMargin: '50px',
    threshold: 0.1,
    ...options
  };
  
  return new IntersectionObserver(callback, defaultOptions);
}

// Performance monitoring
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }
  
  startMeasure(name: string): void {
    if ('performance' in window && 'mark' in performance) {
      performance.mark(`${name}-start`);
    }
  }
  
  endMeasure(name: string): number {
    if ('performance' in window && 'measure' in performance) {
      try {
        performance.mark(`${name}-end`);
        performance.measure(name, `${name}-start`, `${name}-end`);
        const entries = performance.getEntriesByName(name, 'measure');
        const duration = entries[entries.length - 1]?.duration || 0;
        
        // Store metric for analysis
        if (!this.metrics.has(name)) {
          this.metrics.set(name, []);
        }
        this.metrics.get(name)!.push(duration);
        
        // Clean up marks
        performance.clearMarks(`${name}-start`);
        performance.clearMarks(`${name}-end`);
        performance.clearMeasures(name);
        
        return duration;
      } catch (e) {
        console.warn('Performance measurement failed:', e);
      }
    }
    return 0;
  }
  
  getAverageMetric(name: string): number {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  getMetrics(): Record<string, { average: number; count: number }> {
    const result: Record<string, { average: number; count: number }> = {};
    for (const [name, values] of this.metrics.entries()) {
      result[name] = {
        average: this.getAverageMetric(name),
        count: values.length
      };
    }
    return result;
  }
}

// CSS optimization utilities
export function getOptimizedStyles(isLowEnd: boolean): React.CSSProperties {
  const baseStyles: React.CSSProperties = {
    willChange: 'auto', // Reset will-change to auto
  };
  
  if (isLowEnd) {
    return {
      ...baseStyles,
      // Disable expensive animations and transitions
      transition: 'none',
      animation: 'none',
      // Use simpler shadows
      boxShadow: 'none',
      // Disable transform optimizations that can be expensive
      transform: 'none',
    };
  }
  
  return baseStyles;
}

// Image optimization
export function getOptimizedImageUrl(url: string, isLowEnd: boolean): string {
  if (!isLowEnd) return url;
  
  // For low-end devices, you might want to serve lower quality images
  // This is a placeholder - implement based on your image service
  return url;
}

// Memory management
export function cleanup(): void {
  // Clear any caches, observers, etc.
  if ('gc' in window && typeof (window as any).gc === 'function') {
    (window as any).gc(); // Force garbage collection if available
  }
}

// Request idle callback for background tasks
export function requestIdleCallback(
  callback: IdleRequestCallback,
  options?: IdleRequestOptions
): number {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, options);
  }
  
  // Fallback for browsers that don't support it
  return setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 1) as any;
}

export function cancelIdleCallback(handle: number): void {
  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
}
