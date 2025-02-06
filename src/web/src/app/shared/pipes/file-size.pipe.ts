import { Pipe, PipeTransform } from '@angular/core'; // ^15.0.0

/**
 * Angular pipe that formats numeric file sizes into human-readable strings
 * with appropriate units (B, KB, MB, GB) and configurable decimal precision.
 * 
 * Features:
 * - Handles sizes from bytes to gigabytes
 * - Configurable decimal precision (default: 2)
 * - Locale-aware number formatting
 * - Handles edge cases (null, undefined, negative values)
 * - Pure pipe implementation for optimal performance
 * 
 * @example
 * {{ 1024 | fileSize }} // outputs "1.00 KB"
 * {{ 1048576 | fileSize:1 }} // outputs "1.0 MB"
 */
@Pipe({
  name: 'fileSize',
  pure: true // Enables memoization for better performance
})
export class FileSizePipe implements PipeTransform {
  // Binary unit conversion values (1024^n)
  private readonly units: number[] = [
    1024, // KB
    1024 * 1024, // MB
    1024 * 1024 * 1024 // GB
  ];

  // Unit labels for human-readable output
  private readonly unitLabels: string[] = ['B', 'KB', 'MB', 'GB'];

  /**
   * Transforms a numeric file size into a human-readable string with appropriate unit.
   * 
   * @param size - The file size in bytes
   * @param decimals - Number of decimal places to display (default: 2)
   * @returns Formatted file size string with unit (e.g., "2.50 MB")
   */
  transform(size: number, decimals: number = 2): string {
    // Handle edge cases
    if (size === null || size === undefined || size === 0) {
      return '0 B';
    }

    // Handle negative values
    const absoluteSize = Math.abs(size);
    const sign = size < 0 ? '-' : '';

    // Find appropriate unit
    let unitIndex = 0;
    for (let i = 0; i < this.units.length; i++) {
      if (absoluteSize < this.units[i]) {
        break;
      }
      unitIndex = i + 1;
    }

    // Calculate converted value
    const value = unitIndex === 0
      ? absoluteSize
      : absoluteSize / this.units[unitIndex - 1];

    // Round to specified decimal places
    const roundedValue = Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);

    // Format number according to locale settings
    const formattedValue = roundedValue.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });

    // Return formatted string with unit
    return `${sign}${formattedValue} ${this.unitLabels[unitIndex]}`;
  }
}