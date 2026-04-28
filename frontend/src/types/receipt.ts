/**
 * Frontend Receipt Types - Re-export from shared types for consistency
 */
export type {
  Receipt,
  ReceiptData
} from '../../../shared/types';

// Additional frontend-specific interfaces
export interface ReceiptGenerationOptions {
  includeQR: boolean;
  includeWatermark: boolean;
  format: 'pdf' | 'html';
  includeMetadata: boolean;
}

// Frontend-specific interfaces with Date objects
export interface FrontendReceipt {
  id: string;
  paymentId: string;
  meterId: string;
  amount: number;
  currency: string;
  date: Date; // Frontend uses Date objects
  transactionHash?: string;
  receiptNumber: string;
  billPeriod?: {
    start: Date; // Frontend uses Date objects
    end: Date; // Frontend uses Date objects
  };
  payerName?: string;
  payerAddress?: string;
  providerName: string;
  providerLogo?: string;
  qrCode?: string; // Base64 encoded QR code image
  status: 'pending' | 'generated' | 'viewed' | 'downloaded';
  notes?: string;
}

export interface FrontendReceiptData {
  receiptNumber: string;
  date: Date; // Frontend uses Date objects
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

// Helper functions for date conversion between frontend Date objects and standardized ISO strings
import type { Receipt as SharedReceipt, ReceiptData as SharedReceiptData } from '../../../shared/types';
import { toISOString, fromDateISOString } from '../../../shared/types';

export function convertToFrontendReceipt(sharedReceipt: SharedReceipt): FrontendReceipt {
  return {
    ...sharedReceipt,
    date: fromDateISOString(sharedReceipt.date),
    billPeriod: sharedReceipt.billPeriod ? {
      start: fromDateISOString(sharedReceipt.billPeriod.start),
      end: fromDateISOString(sharedReceipt.billPeriod.end)
    } : undefined
  };
}

export function convertToSharedReceipt(frontendReceipt: FrontendReceipt): SharedReceipt {
  return {
    ...frontendReceipt,
    date: toISOString(frontendReceipt.date),
    billPeriod: frontendReceipt.billPeriod ? {
      start: toISOString(frontendReceipt.billPeriod.start),
      end: toISOString(frontendReceipt.billPeriod.end)
    } : undefined
  };
}

export function convertToFrontendReceiptData(sharedReceiptData: SharedReceiptData): FrontendReceiptData {
  return {
    ...sharedReceiptData,
    date: fromDateISOString(sharedReceiptData.date)
  };
}

export function convertToSharedReceiptData(frontendReceiptData: FrontendReceiptData): SharedReceiptData {
  return {
    ...frontendReceiptData,
    date: toISOString(frontendReceiptData.date)
  };
}


// src/types/receipt.ts

export interface PaymentReceipt {
  receiptId: string;
  transactionHash: string;
  meterId: string;
  meterType: "water" | "electricity";
  customerName?: string;
  customerAddress?: string;
  amountPaid: number;        // in XLM
  amountFiat?: number;       // in local currency (optional)
  fiatCurrency?: string;     // e.g. "NGN"
  serviceFee?: number;       // in XLM
  totalAmount: number;       // in XLM
  network: "testnet" | "mainnet";
  contractId: string;
  stellarAccount: string;    // wallet public key (truncated for display)
  timestamp: Date;
  status: "confirmed" | "pending" | "failed";
  blockHeight?: number;
  billingPeriod?: string;    // e.g. "May 2025"
}

export interface ReceiptGenerationOptions {
  format?: "pdf" | "png";
  filename?: string;
}