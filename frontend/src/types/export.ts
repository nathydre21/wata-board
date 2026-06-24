/**
 * Payment History Export Types
 * 
 * Core type definitions for the payment history export feature.
 * Supports CSV and PDF export formats with comprehensive metadata.
 */

/**
 * Represents a single payment transaction with all relevant details
 * for export purposes.
 */
export interface PaymentTransaction {
  /** Unique transaction identifier */
  id: string;
  
  /** Transaction date/time */
  date: Date;
  
  /** Transaction amount (decimal) */
  amount: number;
  
  /** ISO 4217 currency code (e.g., "USD", "EUR") */
  currency: string;
  
  /** Transaction status (e.g., "completed", "pending", "failed") */
  status: string;
  
  /** Transaction description */
  description: string;
  
  /** Merchant or recipient name */
  merchant: string;
  
  /** Optional transaction category */
  category?: string;
  
  /** Optional payment method */
  paymentMethod?: string;
  
  /** Optional reference number */
  reference?: string;
}

/**
 * Options for configuring an export operation
 */
export interface ExportOptions {
  /** Export format: CSV or PDF */
  format: 'csv' | 'pdf';
  
  /** Optional date range filter */
  dateRange?: {
    /** Start date (inclusive) */
    startDate: Date;
    
    /** End date (inclusive) */
    endDate: Date;
  };
}

/**
 * Metadata included with every export
 */
export interface ExportMetadata {
  /** When the export was generated */
  exportDate: Date;
  
  /** Number of transactions in the export */
  totalTransactions: number;
  
  /** Date range if filtered */
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  
  /** Whether the export was generated offline */
  isOffline: boolean;
  
  /** Language code (e.g., "en", "es", "fr") */
  language: string;
}

/**
 * Service interface for orchestrating the export process
 */
export interface ExportService {
  /**
   * Exports payment history based on the provided options
   * @param options Export configuration
   * @throws Error if validation fails or export generation fails
   */
  exportPaymentHistory(options: ExportOptions): Promise<void>;
}

/**
 * Interface for CSV export generation
 */
export interface CSVExporter {
  /**
   * Generates CSV content from payment transactions
   * @param transactions List of transactions to export
   * @param metadata Export metadata
   * @param locale Language code for localized headers
   * @returns CSV content as a string
   */
  generate(
    transactions: PaymentTransaction[],
    metadata: ExportMetadata,
    locale: string
  ): string;
}

/**
 * Interface for PDF export generation
 */
export interface PDFExporter {
  /**
   * Generates PDF content from payment transactions
   * @param transactions List of transactions to export
   * @param metadata Export metadata
   * @param locale Language code for localized headers
   * @returns PDF content as a Blob
   */
  generate(
    transactions: PaymentTransaction[],
    metadata: ExportMetadata,
    locale: string
  ): Blob;
}

/**
 * Interface for payment data retrieval and filtering
 */
export interface PaymentDataService {
  /**
   * Retrieves payment history with optional filtering
   * @param filters Optional date range filters
   * @returns List of payment transactions
   */
  getPaymentHistory(filters?: PaymentFilters): Promise<PaymentTransaction[]>;
  
  /**
   * Checks if the application is currently offline
   * @returns true if offline, false otherwise
   */
  isOffline(): boolean;
}

/**
 * Filters for payment data retrieval
 */
export interface PaymentFilters {
  /** Optional start date filter (inclusive) */
  startDate?: Date;
  
  /** Optional end date filter (inclusive) */
  endDate?: Date;
}

/**
 * Interface for file download utility
 */
export interface FileDownloadUtil {
  /**
   * Triggers a browser file download
   * @param content File content (string or Blob)
   * @param filename Name for the downloaded file
   * @param mimeType MIME type of the file
   */
  downloadFile(content: string | Blob, filename: string, mimeType: string): void;
}
