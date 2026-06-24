/**
 * PDFExporter - Generates PDF formatted exports from payment transaction data
 * 
 * Implements PDF export with:
 * - Professional table layout
 * - Header with export metadata
 * - Page numbers on multi-page documents
 * - Currency formatting with symbols
 * - Localized headers and labels
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PaymentTransaction, ExportMetadata, PDFExporter as IPDFExporter } from '../types/export';

/**
 * PDFExporter implementation
 * 
 * Requirements:
 * - 5.1: Generate PDF files with a clear header containing export metadata
 * - 5.2: Format PDF content in a readable table layout
 * - 5.3: Include page numbers on multi-page PDF exports
 * - 5.4: Format currency amounts with appropriate symbols
 */
export class PDFExporter implements IPDFExporter {
  /**
   * Generates PDF content from payment transactions
   * 
   * @param transactions - List of transactions to export
   * @param metadata - Export metadata
   * @param locale - Language code for localized headers (currently unused, will be used with i18n)
   * @returns PDF content as a Blob
   */
  generate(
    transactions: PaymentTransaction[],
    metadata: ExportMetadata,
    locale: string
  ): Blob {
    // Create new PDF document (A4 size, portrait orientation)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Add header with metadata
    this.addHeader(doc, metadata);

    // Add transaction table
    this.addTransactionTable(doc, transactions, metadata);

    // Add page numbers
    this.addPageNumbers(doc);

    // Convert to Blob and return
    const pdfBlob = doc.output('blob');
    return pdfBlob;
  }

  /**
   * Adds header section with export metadata
   * 
   * Requirement 5.1: Generate PDF files with a clear header containing export metadata
   * 
   * @param doc - jsPDF document instance
   * @param metadata - Export metadata
   */
  private addHeader(doc: jsPDF, metadata: ExportMetadata): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPosition = 15;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Payment History Export', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;

    // Export metadata
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    // Export date
    const exportDateStr = this.formatDate(metadata.exportDate);
    doc.text(`Export Date: ${exportDateStr}`, 14, yPosition);
    yPosition += 5;

    // Date range (if filtered)
    if (metadata.dateRange) {
      const startDateStr = this.formatDate(metadata.dateRange.startDate);
      const endDateStr = this.formatDate(metadata.dateRange.endDate);
      doc.text(`Period: ${startDateStr} - ${endDateStr}`, 14, yPosition);
      yPosition += 5;
    }

    // Total transactions
    doc.text(`Total Transactions: ${metadata.totalTransactions}`, 14, yPosition);
    yPosition += 5;

    // Offline status (if applicable)
    if (metadata.isOffline) {
      doc.text('Generated Offline', 14, yPosition);
      yPosition += 5;
    }
  }

  /**
   * Adds transaction table to the PDF
   * 
   * Requirement 5.2: Format PDF content in a readable table layout
   * Requirement 5.4: Format currency amounts with appropriate symbols
   * 
   * @param doc - jsPDF document instance
   * @param transactions - List of transactions
   * @param metadata - Export metadata
   */
  private addTransactionTable(
    doc: jsPDF,
    transactions: PaymentTransaction[],
    metadata: ExportMetadata
  ): void {
    // Define table columns (will be localized in future task 11.3)
    const columns = [
      { header: 'Transaction ID', dataKey: 'id' },
      { header: 'Date', dataKey: 'date' },
      { header: 'Amount', dataKey: 'amount' },
      { header: 'Currency', dataKey: 'currency' },
      { header: 'Status', dataKey: 'status' },
      { header: 'Description', dataKey: 'description' },
      { header: 'Merchant', dataKey: 'merchant' }
    ];

    // Prepare table data
    const tableData = transactions.map(transaction => ({
      id: transaction.id,
      date: this.formatDate(transaction.date),
      amount: this.formatCurrencyForPDF(transaction.amount, transaction.currency),
      currency: transaction.currency,
      status: this.capitalizeFirstLetter(transaction.status),
      description: transaction.description,
      merchant: transaction.merchant
    }));

    // Generate table using autoTable
    autoTable(doc, {
      columns: columns,
      body: tableData,
      startY: 40, // Start below header
      theme: 'striped',
      headStyles: {
        fillColor: [66, 66, 66],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 2
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        id: { cellWidth: 25 },
        date: { cellWidth: 22 },
        amount: { cellWidth: 20, halign: 'right' },
        currency: { cellWidth: 18 },
        status: { cellWidth: 20 },
        description: { cellWidth: 35 },
        merchant: { cellWidth: 30 }
      },
      margin: { top: 40, left: 14, right: 14 },
      didDrawPage: (data) => {
        // Page numbers will be added separately in addPageNumbers
      }
    });
  }

  /**
   * Adds page numbers to all pages
   * 
   * Requirement 5.3: Include page numbers on multi-page PDF exports
   * 
   * @param doc - jsPDF document instance
   */
  private addPageNumbers(doc: jsPDF): void {
    const pageCount = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const pageText = `Page ${i} of ${pageCount}`;
      doc.text(pageText, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }
  }

  /**
   * Formats a date as a readable string
   * 
   * @param date - Date to format
   * @returns Formatted date string (e.g., "January 15, 2024")
   */
  private formatDate(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Formats a currency amount with appropriate symbol
   * 
   * Requirement 5.4: Format currency amounts with appropriate symbols
   * 
   * @param amount - Amount to format
   * @param currency - ISO 4217 currency code
   * @returns Formatted currency string (e.g., "$150.00")
   */
  private formatCurrencyForPDF(amount: number, currency: string): string {
    // Map of common currency codes to symbols
    const currencySymbols: Record<string, string> = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CNY': '¥',
      'INR': '₹',
      'AUD': 'A$',
      'CAD': 'C$',
      'CHF': 'CHF',
      'SEK': 'kr',
      'NZD': 'NZ$'
    };

    const symbol = currencySymbols[currency] || currency;
    const formattedAmount = amount.toFixed(2);

    // For currencies like JPY that don't use decimal places
    if (currency === 'JPY') {
      return `${symbol}${Math.round(amount)}`;
    }

    return `${symbol}${formattedAmount}`;
  }

  /**
   * Capitalizes the first letter of a string
   * 
   * @param str - String to capitalize
   * @returns Capitalized string
   */
  private capitalizeFirstLetter(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
