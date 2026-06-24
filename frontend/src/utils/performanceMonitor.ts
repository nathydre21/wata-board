/**
 * Performance monitoring utilities for low-end device optimization
 */

export interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  componentName: string;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private observers: PerformanceObserver[] = [];

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Measure render performance for components
  measureRender(componentName: string, renderFn: () => void): void {
    const startTime = performance.now();
    
    // Use requestIdleCallback for non-critical measurements on low-end devices
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        const endTime = performance.now();
        this.recordMetric({
          componentName,
          renderTime: endTime - startTime,
          memoryUsage: this.getMemoryUsage()
        });
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        const endTime = performance.now();
        this.recordMetric({
          componentName,
          renderTime: endTime - startTime,
          memoryUsage: this.getMemoryUsage()
        });
      }, 0);
    }

    renderFn();
  }

  // Throttle expensive operations
  throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: number | null = null;
    let lastExecTime = 0;
    
    return (...args: Parameters<T>) => {
      const currentTime = Date.now();
      
      if (currentTime - lastExecTime > delay) {
        func(...args);
        lastExecTime = currentTime;
      } else {
        clearTimeout(timeoutId!);
        timeoutId = window.setTimeout(() => {
          func(...args);
          lastExecTime = currentTime;
        }, delay - (currentTime - lastExecTime));
      }
    };
  };

  // Debounce input events for better performance
  debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: number | null = null;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId!);
      timeoutId = window.setTimeout(() => func(...args), delay);
    };
  };

  // Check if device is low-end
  isLowEndDevice(): boolean {
    // Check hardware concurrency
    const concurrency = navigator.hardwareConcurrency || 4;
    const isLowCPU = concurrency <= 2;
    
    // Check memory (if available)
    const memory = (navigator as any).deviceMemory;
    const isLowMemory = memory && memory < 4; // Less than 4GB
    
    // Check connection speed
    const connection = (navigator as any).connection;
    const isSlowConnection = connection && (
      connection.effectiveType === 'slow-2g' ||
      connection.effectiveType === '2g' ||
      connection.effectiveType === '3g' ||
      connection.downlink < 1
    );

    return isLowCPU || isLowMemory || isSlowConnection;
  }

  // Get memory usage if available
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / 1048576; // Convert to MB
    }
    return 0;
  }

  // Record performance metrics
  private recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only last 50 metrics to avoid memory leaks
    if (this.metrics.length > 50) {
      this.metrics = this.metrics.slice(-50);
    }
    
    // Log warnings for slow renders
    if (metric.renderTime > 16) { // > 1 frame at 60fps
      console.warn(`Slow render detected in ${metric.componentName}: ${metric.renderTime.toFixed(2)}ms`);
    }
  }

  // Get performance report
  getReport(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  // Clear metrics
  clearMetrics(): void {
    this.metrics = [];
  }

  // Setup performance observers if available
  setupObservers(): void {
    if ('PerformanceObserver' in window) {
      // Observe long tasks
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > 50) { // Tasks longer than 50ms
            console.warn(`Long task detected: ${entry.duration.toFixed(2)}ms`);
          }
        });
      });

      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch (e) {
        // Some browsers don't support longtask observation
        console.debug('Long task observation not supported');
      }
    }
  }

  // Cleanup observers
  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.clearMetrics();
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

// Export utility functions
export const measureRender = (componentName: string) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
  const originalMethod = descriptor.value;
  
  descriptor.value = function(this: any, ...args: any[]) {
    return performanceMonitor.measureRender(componentName, () => originalMethod.apply(this, args));
  };
  
  return descriptor;
};

export const throttle = performanceMonitor.throttle.bind(performanceMonitor);
export const debounce = performanceMonitor.debounce.bind(performanceMonitor);
export const isLowEndDevice = performanceMonitor.isLowEndDevice.bind(performanceMonitor);
