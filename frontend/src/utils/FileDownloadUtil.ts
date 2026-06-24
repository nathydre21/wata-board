/**
 * FileDownloadUtil - Handles browser file downloads
 * 
 * Provides functionality to:
 * - Create Blob from content
 * - Generate download URL
 * - Trigger browser download
 * - Clean up resources
 */

import type { FileDownloadUtil as IFileDownloadUtil } from '../types/export';

/**
 * FileDownloadUtil implementation
 * 
 * Requirements:
 * - 6.1: Trigger file download with appropriate filename
 * - 6.2: Include export format and date in filename
 * - 6.3: Display error message when download fails
 */
export class FileDownloadUtil implements IFileDownloadUtil {
  /**
   * Triggers a browser file download
   * 
   * @param content File content (string or Blob)
   * @param filename Name for the downloaded file
   * @param mimeType MIME type of the file
   * @throws Error if download fails
   */
  downloadFile(content: string | Blob, filename: string, mimeType: string): void {
    try {
      // Create Blob if content is a string
      const blob = content instanceof Blob
        ? content
        : new Blob([content], { type: mimeType });

      // Create download URL
      const url = URL.createObjectURL(blob);

      // Create temporary anchor element
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';

      // Add to document, trigger click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL object after a short delay
      // to ensure the download has started
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

    } catch (error) {
      console.error('Download failed:', error);
      throw new Error('Download was blocked. Please check your browser settings.');
    }
  }
}

/**
 * Singleton instance of FileDownloadUtil
 */
export const fileDownloadUtil = new FileDownloadUtil();
