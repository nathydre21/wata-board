import html2pdf from 'html2pdf.js';
import QRCode from 'qrcode';
import { Receipt, ReceiptData, ReceiptGenerationOptions } from '../types/receipt';

/**
 * Service for generating, storing, and retrieving payment receipts
 */
export class ReceiptService {
  private static readonly STORAGE_KEY = 'wata-board-receipts';
  private static readonly RECEIPT_PREFIX = 'RCP';
  private receipts: Map<string, Receipt> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Generate a new receipt number
   */
  private generateReceiptNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${ReceiptService.RECEIPT_PREFIX}-${timestamp}-${random}`;
  }

  /**
   * Create and store a receipt from payment data
   */
  async createReceipt(
    paymentId: string,
    data: ReceiptData,
    options: Partial<ReceiptGenerationOptions> = {}
  ): Promise<Receipt> {
    const receiptNumber = this.generateReceiptNumber();
    
    // Generate QR code if requested
    let qrCode: string | undefined;
    if (options.includeQR !== false) {
      qrCode = await this.generateQRCode({
        paymentId,
        receiptNumber,
        amount: data.amount,
        date: data.date.toISOString(),
        meterId: data.meterId,
        transactionId: data.transactionId
      });
    }

    const receipt: Receipt = {
      id: `receipt-${paymentId}`,
      paymentId,
      receiptNumber,
      meterId: data.meterId,
      amount: data.amount,
      currency: data.currency || 'XLM',
      date: data.date,
      transactionHash: data.blockchainHash,
      billPeriod: data.billPeriod,
      payerName: data.payerName,
      payerAddress: data.payerAddress,
      providerName: data.providerName || 'Wata-Board',
      qrCode,
      status: 'generated',
      notes: data.notes
    };

    this.receipts.set(receipt.id, receipt);
    this.saveToStorage();

    return receipt;
  }

  /**
   * Generate QR code for receipt
   */
  private async generateQRCode(data: Record<string, any>): Promise<string> {
    try {
      const qrText = JSON.stringify(data);
      return await QRCode.toDataURL(qrText, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 200,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      return '';
    }
  }

  /**
   * Generate PDF receipt
   */
  async generatePDF(receipt: Receipt, includeWatermark = true): Promise<Blob> {
    const htmlContent = this.generateHTMLReceipt(receipt, includeWatermark);
    const el = document.createElement('div');
    el.innerHTML = htmlContent;
    
    return new Promise((resolve, reject) => {
      const options = {
        margin: 10,
        filename: `receipt-${receipt.receiptNumber}.pdf`,
        image: { type: 'png', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
      };

      html2pdf().set(options).from(el).toPdf().get('pdf').then((pdf: any) => {
        resolve(pdf.output('blob'));
      }).catch(reject);
    });
  }

  /**
   * Generate HTML receipt
   */
  private generateHTMLReceipt(receipt: Receipt, includeWatermark = true): string {
    return `
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: white; }
            .receipt-container { max-width: 600px; margin: 0 auto; padding: 40px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .company-name { font-size: 28px; font-weight: bold; color: #333; margin-bottom: 5px; }
            .receipt-title { font-size: 18px; color: #666; margin-bottom: 10px; }
            .receipt-number { font-size: 12px; color: #999; font-family: monospace; }
            .section { margin-bottom: 25px; }
            .section-title { font-size: 12px; font-weight: bold; color: #333; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
            .label { color: #666; }
            .value { font-weight: 500; color: #333; }
            .amount-section { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .amount-label { font-size: 12px; color: #666; }
            .amount-value { font-size: 32px; font-weight: bold; color: ${receipt.status === 'completed' ? '#10b981' : '#666'}; }
            .status-badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-top: 10px; }
            .status-completed { background-color: #d1fae5; color: #065f46; }
            .status-pending { background-color: #fef3c7; color: #92400e; }
            .qr-section { text-align: center; margin: 20px 0; }
            .qr-code { max-width: 150px; }
            .footer { text-align: center; font-size: 11px; color: #999; border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; }
            .watermark { position: absolute; font-size: 72px; color: rgba(200, 200, 200, 0.1); transform: rotate(-45deg); z-index: -1; }
            @media print { body { background: white; } }
          </style>
        </head>
        <body>
          ${includeWatermark ? '<div class="watermark">RECEIPT</div>' : ''}
          <div class="receipt-container">
            <div class="header">
              <div class="company-name">${receipt.providerName}</div>
              <div class="receipt-title">Payment Receipt</div>
              <div class="receipt-number">Receipt #${receipt.receiptNumber}</div>
            </div>

            <div class="amount-section">
              <div class="amount-label">Payment Amount</div>
              <div class="amount-value">${receipt.amount} ${receipt.currency}</div>
              <span class="status-badge status-${receipt.status}">
                ${receipt.status.toUpperCase()}
              </span>
            </div>

            <div class="section">
              <div class="section-title">Transaction Details</div>
              <div class="detail-row">
                <span class="label">Date</span>
                <span class="value">${new Date(receipt.date).toLocaleDateString()} ${new Date(receipt.date).toLocaleTimeString()}</span>
              </div>
              <div class="detail-row">
                <span class="label">Meter ID</span>
                <span class="value">${receipt.meterId}</span>
              </div>
              ${receipt.transactionHash ? `
              <div class="detail-row">
                <span class="label">Blockchain Hash</span>
                <span class="value" style="font-family: monospace; font-size: 11px;">${receipt.transactionHash.substring(0, 20)}...</span>
              </div>
              ` : ''}
            </div>

            ${receipt.qrCode ? `
            <div class="qr-section">
              <img src="${receipt.qrCode}" alt="Receipt QR Code" class="qr-code" />
              <p style="font-size: 11px; color: #999; margin-top: 10px;">Scan to verify receipt</p>
            </div>
            ` : ''}

            ${receipt.notes ? `
            <div class="section">
              <div class="section-title">Notes</div>
              <p style="font-size: 13px; color: #666; line-height: 1.6;">${receipt.notes}</p>
            </div>
            ` : ''}

            <div class="footer">
              <p>Generated on ${new Date().toLocaleDateString()}</p>
              <p>Thank you for using ${receipt.providerName}</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Download receipt as PDF
   */
  async downloadReceiptPDF(receipt: Receipt, includeWatermark = true): Promise<void> {
    try {
      const pdfBlob = await this.generatePDF(receipt, includeWatermark);
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${receipt.receiptNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Mark as downloaded
      receipt.status = 'downloaded';
      this.receipts.set(receipt.id, receipt);
      this.saveToStorage();
    } catch (error) {
      console.error('Failed to download receipt:', error);
      throw new Error('Failed to generate PDF receipt');
    }
  }

  /**
   * Get receipt by ID
   */
  getReceipt(receiptId: string): Receipt | undefined {
    return this.receipts.get(receiptId);
  }

  /**
   * Get receipt by payment ID
   */
  getReceiptByPaymentId(paymentId: string): Receipt | undefined {
    for (const receipt of this.receipts.values()) {
      if (receipt.paymentId === paymentId) {
        return receipt;
      }
    }
    return undefined;
  }

  /**
   * Get all receipts
   */
  getAllReceipts(): Receipt[] {
    return Array.from(this.receipts.values());
  }

  /**
   * Get receipts for a meter
   */
  getReceiptsByMeter(meterId: string): Receipt[] {
    return Array.from(this.receipts.values()).filter(r => r.meterId === meterId);
  }

  /**
   * Mark receipt as viewed
   */
  markAsViewed(receiptId: string): void {
    const receipt = this.receipts.get(receiptId);
    if (receipt && receipt.status === 'generated') {
      receipt.status = 'viewed';
      this.receipts.set(receiptId, receipt);
      this.saveToStorage();
    }
  }

  /**
   * Search receipts
   */
  searchReceipts(query: string): Receipt[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.receipts.values()).filter(r =>
      r.receiptNumber.toLowerCase().includes(lowerQuery) ||
      r.paymentId.toLowerCase().includes(lowerQuery) ||
      r.meterId.toLowerCase().includes(lowerQuery) ||
      (r.transactionHash?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  /**
   * Save receipts to localStorage
   */
  private saveToStorage(): void {
    try {
      const receipts = Array.from(this.receipts.values());
      localStorage.setItem(ReceiptService.STORAGE_KEY, JSON.stringify(receipts));
    } catch (error) {
      console.error('Failed to save receipts to storage:', error);
    }
  }

  /**
   * Load receipts from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(ReceiptService.STORAGE_KEY);
      if (stored) {
        const receipts = JSON.parse(stored) as Receipt[];
        receipts.forEach(r => {
          r.date = new Date(r.date);
          if (r.billPeriod) {
            r.billPeriod.start = new Date(r.billPeriod.start);
            r.billPeriod.end = new Date(r.billPeriod.end);
          }
          this.receipts.set(r.id, r);
        });
      }
    } catch (error) {
      console.error('Failed to load receipts from storage:', error);
    }
  }

  /**
   * Export all receipts as JSON
   */
  exportAsJSON(): string {
    return JSON.stringify(Array.from(this.receipts.values()), null, 2);
  }

  /**
   * Export receipts as CSV
   */
  exportAsCSV(): string {
    const receipts = Array.from(this.receipts.values());
    if (receipts.length === 0) return '';

    const headers = ['Receipt Number', 'Payment ID', 'Meter ID', 'Amount', 'Currency', 'Date', 'Status', 'Transaction Hash'];
    const rows = receipts.map(r => [
      r.receiptNumber,
      r.paymentId,
      r.meterId,
      r.amount,
      r.currency,
      r.date.toISOString(),
      r.status,
      r.transactionHash || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Delete receipt
   */
  deleteReceipt(receiptId: string): void {
    this.receipts.delete(receiptId);
    this.saveToStorage();
  }

  /**
   * Clear all receipts
   */
  clearAll(): void {
    this.receipts.clear();
    this.saveToStorage();
  }
}

// Export singleton instance
export const receiptService = new ReceiptService();
