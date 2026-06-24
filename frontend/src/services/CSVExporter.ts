/**
 * CSVExporter - Generates CSV formatted exports from payment transaction data
 * 
 * Implements CSV export with:
 * - UTF-8 encoding support
 * - ISO 8601 date formatting (YYYY-MM-DD)
 * - Decimal currency formatting
 * - Proper escaping of special characters (commas, quotes, newlines)
 * - Localized column headers
 */

import type { PaymentTransaction, ExportMetadata, CSVExporter as ICSVExporter } from '../types/export';

/**
 * CSVExporter implementation
 * 
 * Requirements:
 * - 4.1: Generate CSV files with proper header rows containing column names
 * - 4.2: Escape special characters in CSV data to prevent parsing errors
 * - 4.3: Use UTF-8 encoding for CSV files to support international characters
 * - 4.4: Format dates in ISO 8601 format (YYYY-MM-DD)
 * - 4.5: Format currency amounts as decimal numbers
 */
export class CSVExporter implements ICSVExporter {
  /**
   * Generates CSV content from payment transactions
   * 
   * @param transactions - List of transactions to export
   * @param metadata - Export metadata
   * @param locale - Language code for localized headers (currently unused, will be used with i18n)
   * @returns CSV content as a UTF-8 string
   */
  generate(
    transactions: PaymentTransaction[],
    metadata: ExportMetadata,
    locale: string
  ): string {
    // Generate header row
    const headers = this.generateHeaderRow(locale);
    
    // Generate data rows
    const dataRows = transactions.map(transaction => this.generateDataRow(transaction));
    
    // Combine header and data rows
    const csvLines = [headers, ...dataRows];
    
    // Join with newlines and add UTF-8 BOM for proper encoding
    return '\uFEFF' + csvLines.join('\n');
  }

  /**
   * Generates the CSV header row with column names
   * 
   * @param locale - Language code for localization (future use with i18n)
   * @returns CSV header row string
   */
  private generateHeaderRow(locale: string): string {
    // Column names - will be localized in future task (11.2)
    const columns = [
      'Transaction ID',
      'Date',
      'Amount',
      'Currency',
      'Status',
      'Description',
      'Merchant',
      'Category',
      'Payment Method',
      'Reference'
    ];
    
    return columns.map(col => this.escapeCSVField(col)).join(',');
  }

  /**
   * Generates a CSV data row from a transaction
   * 
   * @param transaction - Payment transaction to convert to CSV row
   * @returns CSV data row string
   */
  private generateDataRow(transaction: PaymentTransaction): string {
    const fields = [
      transaction.id,
      this.formatDate(transaction.date),
      this.formatCurrency(transaction.amount),
      transaction.currency,
      transaction.status,
      transaction.description,
      transaction.merchant,
      transaction.category ?? '',
      transaction.paymentMethod ?? '',
      transaction.reference ?? ''
    ];
    
    return fields.map(field => this.escapeCSVField(String(field))).join(',');
  }

  /**
   * Formats a date as ISO 8601 (YYYY-MM-DD)
   * 
   * Requirement 4.4: Format dates in ISO 8601 format
   * 
   * @param date - Date to format
   * @returns ISO 8601 formatted date string
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formats a currency amount as a decimal number
   * 
   * Requirement 4.5: Format currency amounts as decimal numbers
   * 
   * @param amount - Amount to format
   * @returns Decimal formatted amount string
   */
  private formatCurrency(amount: number): string {
    // Format to 2 decimal places without currency symbols
    return amount.toFixed(2);
  }

  /**
   * Escapes special CSV characters in a field
   * 
   * Requirement 4.2: Escape special characters to prevent parsing errors
   * 
   * Special characters that need escaping:
   * - Comma (,) - field delimiter
   * - Double quote (") - field wrapper
   * - Newline (\n, \r) - row delimiter
   * 
   * Escaping rules:
   * - If field contains comma, quote, or newline, wrap in double quotes
   * - If field contains double quote, escape it by doubling ("" -> """")
   * 
   * @param field - Field value to escape
   * @returns Escaped field value
   */
  private escapeCSVField(field: string): string {
    // Check if field needs escaping
    const needsEscaping = field.includes(',') || 
                          field.includes('"') || 
                          field.includes('\n') || 
                          field.includes('\r');
    
    if (!needsEscaping) {
      return field;
    }
    
    // Escape double quotes by doubling them
    const escapedField = field.replace(/"/g, '""');
    
    // Wrap in double quotes
    return `"${escapedField}"`;
  }
}
