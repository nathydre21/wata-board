import { useState, useEffect, useCallback } from 'react';
import { getDeviceInfo, getOptimizedStyles, PerformanceMonitor, requestIdleCallback, cancelIdleCallback } from '../utils/performance';

export interface PerformanceOptimizationState {
  isLowEnd: boolean;
  isMobile: boolean;
  deviceInfo: {
    memory: number;
    cores: number;
  };
  optimizedStyles: React.CSSProperties;
  reduceMotion: boolean;
  reduceAnimations: boolean;
  enableLazyLoading: boolean;
}

export function usePerformanceOptimization(): PerformanceOptimizationState {
  const [deviceInfo, setDeviceInfo] = useState(() => getDeviceInfo());
  const [reduceMotion, setReduceMotion] = useState(false);
  
  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setReduceMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  const optimizedStyles = getOptimizedStyles(deviceInfo.isLowEnd);
  const reduceAnimations = deviceInfo.isLowEnd || reduceMotion;
  const enableLazyLoading = deviceInfo.isLowEnd || deviceInfo.isMobile;
  
  return {
    isLowEnd: deviceInfo.isLowEnd,
    isMobile: deviceInfo.isMobile,
    deviceInfo: {
      memory: deviceInfo.memory,
      cores: deviceInfo.cores
    },
    optimizedStyles,
    reduceMotion,
    reduceAnimations,
    enableLazyLoading
  };
}

// Hook for performance monitoring
export function usePerformanceMonitor(componentName: string) {
  const monitor = PerformanceMonitor.getInstance();
  
  const startMeasure = useCallback(() => {
    monitor.startMeasure(componentName);
  }, [componentName, monitor]);
  
  const endMeasure = useCallback(() => {
    return monitor.endMeasure(componentName);
  }, [componentName, monitor]);
  
  return { startMeasure, endMeasure };
}

// Hook for idle tasks
export function useIdleTask() {
  const [isIdle, setIsIdle] = useState(false);
  
  const scheduleTask = useCallback((task: () => void, options?: IdleRequestOptions) => {
    const handle = requestIdleCallback((deadline) => {
      setIsIdle(true);
      task();
      setIsIdle(false);
    }, options);
    
    return handle;
  }, []);
  
  const cancelTask = useCallback((handle: number) => {
    cancelIdleCallback(handle);
  }, []);
  
  return { scheduleTask, cancelTask, isIdle };
}
