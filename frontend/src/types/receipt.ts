/**
 * Receipt and Transaction Voucher Types
 */

export interface Receipt {
  id: string;
  paymentId: string;
  meterId: string;
  amount: number;
  currency: string;
  date: Date;
  transactionHash?: string;
  receiptNumber: string;
  billPeriod?: {
    start: Date;
    end: Date;
  };
  payerName?: string;
  payerAddress?: string;
  providerName: string;
  providerLogo?: string;
  qrCode?: string; // Base64 encoded QR code image
  status: 'pending' | 'generated' | 'viewed' | 'downloaded';
  notes?: string;
}

export interface ReceiptGenerationOptions {
  includeQR: boolean;
  includeWatermark: boolean;
  format: 'pdf' | 'html';
  includeMetadata: boolean;
}

export interface ReceiptData {
  receiptNumber: string;
  date: Date;
  transactionId: string;
  meterId: string;
  meterType: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  walletAddress?: string;
  blockchainHash?: string;
  notes?: string;
}
