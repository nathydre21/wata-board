/**
 * ExportService - Orchestrates the payment history export process
 * 
 * Coordinates:
 * - Export option validation (format, date range)
 * - Payment data retrieval and filtering
 * - Export generation (CSV or PDF)
 * - File download triggering
 * - Error handling and user feedback
 */

import type {
  ExportService as IExportService,
  ExportOptions,
  ExportMetadata,
  PaymentDataService,
  CSVExporter as ICSVExporter,
  PDFExporter as IPDFExporter,
  FileDownloadUtil
} from '../types/export';

/**
 * ExportService implementation
 * 
 * Requirements:
 * - 1.2: Validate format selection before proceeding
 * - 1.3: Support exporting the same data in both CSV and PDF formats
 * - 3.2: Return descriptive error message for invalid date ranges
 * - 6.1: Trigger file download with appropriate filename
 * - 6.2: Include export format and date in filename
 */
export class ExportService implements IExportService {
  private readonly paymentDataService: PaymentDataService;
  private readonly csvExporter: ICSVExporter;
  private readonly pdfExporter: IPDFExporter;
  private readonly fileDownloadUtil: FileDownloadUtil;

  constructor(
    paymentDataService: PaymentDataService,
    csvExporter: ICSVExporter,
    pdfExporter: IPDFExporter,
    fileDownloadUtil: FileDownloadUtil
  ) {
    this.paymentDataService = paymentDataService;
    this.csvExporter = csvExporter;
    this.pdfExporter = pdfExporter;
    this.fileDownloadUtil = fileDownloadUtil;
  }

  /**
   * Exports payment history based on the provided options
   * 
   * Process:
   * 1. Validate export options (format, date range)
   * 2. Fetch payment data with filters
   * 3. Generate export metadata
   * 4. Generate export content (CSV or PDF)
   * 5. Trigger file download
   * 
   * @param options Export configuration
   * @throws Error if validation fails or export generation fails
   */
  async exportPaymentHistory(options: ExportOptions): Promise<void> {
    // Step 1: Validate format
    this.validateFormat(options.format);

    // Step 2: Validate date range (if provided)
    if (options.dateRange) {
      this.validateDateRange(options.dateRange.startDate, options.dateRange.endDate);
    }

    // Step 3: Fetch payment data
    const transactions = await this.paymentDataService.getPaymentHistory(
      options.dateRange
        ? {
            startDate: options.dateRange.startDate,
            endDate: options.dateRange.endDate
          }
        : undefined
    );

    // Step 4: Generate export metadata
    const metadata: ExportMetadata = {
      exportDate: new Date(),
      totalTransactions: transactions.length,
      dateRange: options.dateRange,
      isOffline: this.paymentDataService.isOffline(),
      language: this.getCurrentLanguage()
    };

    // Step 5: Generate export content based on format
    let content: string | Blob;
    let mimeType: string;
    let fileExtension: string;

    if (options.format === 'csv') {
      content = this.csvExporter.generate(transactions, metadata, metadata.language);
      mimeType = 'text/csv;charset=utf-8;';
      fileExtension = 'csv';
    } else if (options.format === 'pdf') {
      content = this.pdfExporter.generate(transactions, metadata, metadata.language);
      mimeType = 'application/pdf';
      fileExtension = 'pdf';
    } else {
      // This should never happen due to validateFormat, but TypeScript needs it
      throw new Error(`Unsupported format: ${options.format}`);
    }

    // Step 6: Generate filename and trigger download
    const filename = this.generateFilename(fileExtension, metadata.exportDate);
    this.fileDownloadUtil.downloadFile(content, filename, mimeType);
  }

  /**
   * Validates the export format
   * 
   * Requirement 1.2: Validate the selection before proceeding
   * 
   * @param format Format to validate
   * @throws Error if format is not 'csv' or 'pdf'
   */
  private validateFormat(format: string): void {
    if (format !== 'csv' && format !== 'pdf') {
      throw new Error('Please select a valid export format (CSV or PDF)');
    }
  }

  /**
   * Validates the date range
   * 
   * Requirement 3.2: Return descriptive error message for invalid date ranges
   * 
   * @param startDate Start date
   * @param endDate End date
   * @throws Error if date range is invalid
   */
  private validateDateRange(startDate: Date, endDate: Date): void {
    // Check if dates are valid Date objects
    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
      throw new Error('Please provide valid dates in the format YYYY-MM-DD');
    }

    if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
      throw new Error('Please provide valid dates in the format YYYY-MM-DD');
    }

    // Check if end date is before start date
    if (endDate < startDate) {
      throw new Error('End date must be after start date');
    }
  }

  /**
   * Generates a filename for the export
   * 
   * Requirements:
   * - 6.1: Trigger file download with appropriate filename
   * - 6.2: Include export format and date in filename
   * 
   * Format: payment-history-YYYY-MM-DD.{ext}
   * 
   * @param extension File extension (csv or pdf)
   * @param exportDate Date of export
   * @returns Generated filename
   */
  private generateFilename(extension: string, exportDate: Date): string {
    const year = exportDate.getFullYear();
    const month = String(exportDate.getMonth() + 1).padStart(2, '0');
    const day = String(exportDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    return `payment-history-${dateStr}.${extension}`;
  }

  /**
   * Gets the current language setting
   * 
   * For now, returns 'en' as default. Will be integrated with i18n in task 11.
   * 
   * @returns Language code
   */
  private getCurrentLanguage(): string {
    // TODO: Integrate with i18n system in task 11
    return 'en';
  }
}

/**
 * Singleton instance of ExportService
 */
import { paymentDataService } from './PaymentDataService';
import { CSVExporter } from './CSVExporter';
import { PDFExporter } from './PDFExporter';
import { fileDownloadUtil } from '../utils/FileDownloadUtil';

export const exportService = new ExportService(
  paymentDataService,
  new CSVExporter(),
  new PDFExporter(),
  fileDownloadUtil
);

