/**
 * Performance monitoring and metrics utilities
 */

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  metrics: PerformanceMetric[];
  totalDuration: number;
  averageDuration: number;
  slowest: PerformanceMetric | null;
  fastest: PerformanceMetric | null;
}

/**
 * Performance monitor for tracking operation timing
 */
export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completed: PerformanceMetric[] = [];
  private enabled: boolean = true;

  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start measuring an operation
   * @param name - Unique name for this measurement
   * @param metadata - Optional metadata to attach
   * @returns The metric object
   */
  start(name: string, metadata?: Record<string, any>): PerformanceMetric {
    if (!this.enabled) {
      return { name, startTime: 0 };
    }

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata,
    };

    this.metrics.set(name, metric);
    return metric;
  }

  /**
   * Stop measuring an operation
   * @param name - Name of the measurement to stop
   * @returns The completed metric with duration
   */
  end(name: string): PerformanceMetric | null {
    if (!this.enabled) {
      return null;
    }

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Performance metric '${name}' not found`);
      return null;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    this.metrics.delete(name);
    this.completed.push(metric);

    return metric;
  }

  /**
   * Measure an async function
   * @param name - Name for this measurement
   * @param fn - Function to measure
   * @param metadata - Optional metadata
   * @returns Promise with the function result
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    this.start(name, metadata);
    try {
      const result = await fn();
      this.end(name);
      return result;
    } catch (error) {
      this.end(name);
      throw error;
    }
  }

  /**
   * Measure a synchronous function
   * @param name - Name for this measurement
   * @param fn - Function to measure
   * @param metadata - Optional metadata
   * @returns The function result
   */
  measureSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    if (!this.enabled) {
      return fn();
    }

    this.start(name, metadata);
    try {
      const result = fn();
      this.end(name);
      return result;
    } catch (error) {
      this.end(name);
      throw error;
    }
  }

  /**
   * Get all completed metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.completed];
  }

  /**
   * Get metrics for a specific operation name
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.completed.filter((m) => m.name === name);
  }

  /**
   * Get a performance report
   */
  getReport(): PerformanceReport {
    if (this.completed.length === 0) {
      return {
        metrics: [],
        totalDuration: 0,
        averageDuration: 0,
        slowest: null,
        fastest: null,
      };
    }

    const totalDuration = this.completed.reduce(
      (sum, m) => sum + (m.duration || 0),
      0
    );

    const averageDuration = totalDuration / this.completed.length;

    const slowest = this.completed.reduce((prev, current) =>
      (current.duration || 0) > (prev.duration || 0) ? current : prev
    );

    const fastest = this.completed.reduce((prev, current) =>
      (current.duration || 0) < (prev.duration || 0) ? current : prev
    );

    return {
      metrics: this.getMetrics(),
      totalDuration,
      averageDuration,
      slowest,
      fastest,
    };
  }

  /**
   * Get metrics summary grouped by operation name
   */
  getSummary(): Record<
    string,
    {
      count: number;
      totalDuration: number;
      averageDuration: number;
      minDuration: number;
      maxDuration: number;
    }
  > {
    const summary: Record<string, any> = {};

    for (const metric of this.completed) {
      if (!summary[metric.name]) {
        summary[metric.name] = {
          count: 0,
          totalDuration: 0,
          minDuration: Infinity,
          maxDuration: 0,
        };
      }

      const s = summary[metric.name];
      const duration = metric.duration || 0;

      s.count++;
      s.totalDuration += duration;
      s.minDuration = Math.min(s.minDuration, duration);
      s.maxDuration = Math.max(s.maxDuration, duration);
    }

    // Calculate averages
    for (const name in summary) {
      summary[name].averageDuration =
        summary[name].totalDuration / summary[name].count;
    }

    return summary;
  }

  /**
   * Format a duration in milliseconds to a human-readable string
   */
  static formatDuration(ms: number): string {
    if (ms < 1) {
      return `${(ms * 1000).toFixed(2)}μs`;
    }
    if (ms < 1000) {
      return `${ms.toFixed(2)}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Print a formatted report to console
   */
  printReport(): void {
    const report = this.getReport();

    if (report.metrics.length === 0) {
      console.log('No performance metrics recorded');
      return;
    }

    console.log('\n=== Performance Report ===');
    console.log(`Total operations: ${report.metrics.length}`);
    console.log(
      `Total duration: ${PerformanceMonitor.formatDuration(report.totalDuration)}`
    );
    console.log(
      `Average duration: ${PerformanceMonitor.formatDuration(report.averageDuration)}`
    );

    if (report.slowest) {
      console.log(
        `Slowest: ${report.slowest.name} (${PerformanceMonitor.formatDuration(report.slowest.duration || 0)})`
      );
    }

    if (report.fastest) {
      console.log(
        `Fastest: ${report.fastest.name} (${PerformanceMonitor.formatDuration(report.fastest.duration || 0)})`
      );
    }

    console.log('\n=== Summary by Operation ===');
    const summary = this.getSummary();
    for (const [name, stats] of Object.entries(summary)) {
      console.log(`\n${name}:`);
      console.log(`  Count: ${stats.count}`);
      console.log(
        `  Total: ${PerformanceMonitor.formatDuration(stats.totalDuration)}`
      );
      console.log(
        `  Average: ${PerformanceMonitor.formatDuration(stats.averageDuration)}`
      );
      console.log(
        `  Min: ${PerformanceMonitor.formatDuration(stats.minDuration)}`
      );
      console.log(
        `  Max: ${PerformanceMonitor.formatDuration(stats.maxDuration)}`
      );
    }
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.completed = [];
  }

  /**
   * Export metrics to JSON
   */
  export(): string {
    return JSON.stringify(
      {
        metrics: this.completed,
        report: this.getReport(),
        summary: this.getSummary(),
      },
      null,
      2
    );
  }
}

/**
 * Global performance monitor instance
 */
export const globalMonitor = new PerformanceMonitor();

/**
 * Decorator to measure method execution time
 * @param target - Class prototype
 * @param propertyKey - Method name
 * @param descriptor - Property descriptor
 */
export function Measure(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const name = `${target.constructor.name}.${propertyKey}`;
    return globalMonitor.measure(name, () => originalMethod.apply(this, args));
  };

  return descriptor;
}

/**
 * Simple timer utility
 */
export class Timer {
  private startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * Get elapsed time in milliseconds
   */
  elapsed(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.startTime = performance.now();
  }

  /**
   * Get formatted elapsed time
   */
  format(): string {
    return PerformanceMonitor.formatDuration(this.elapsed());
  }
}
