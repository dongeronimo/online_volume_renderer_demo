/**
 * Configuration for data loading based on environment
 */

// Debug logging
console.log('Environment variables:', {
  VITE_DATA_SOURCE: import.meta.env.VITE_DATA_SOURCE,
  VITE_DATA_BASE_URL: import.meta.env.VITE_DATA_BASE_URL,
  MODE: import.meta.env.MODE,
  DEV: import.meta.env.DEV,
  all: import.meta.env
});

const dataSource = import.meta.env.VITE_DATA_SOURCE || 'local';
const baseUrl = import.meta.env.VITE_DATA_BASE_URL || '/medical';

export const config = {
  dataSource,
  baseUrl,
  
  /**
   * Gets the full path for a dataset resource
   * @param series - Series name (e.g., "abdomen-feet-first")
   * @param resource - Resource path relative to series (e.g., "metadata.json" or "slice_0001.raw")
   */
  getDataPath(series: string, resource: string): string {
    return `${baseUrl}/${series}/${resource}`;
  }
};