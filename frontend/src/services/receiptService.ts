import html2pdf from 'html2pdf.js';
import QRCode from 'qrcode';
import type { FrontendReceipt, FrontendReceiptData, ReceiptGenerationOptions as FrontendReceiptGenerationOptions } from '../types/receipt';
import type { PaymentReceipt, PDFReceiptOptions } from '../types/receipt';
import { toISOString, fromDateISOString } from '../../../shared/types';
import { balanceUtils } from './walletBalance';
import { formatDate } from '../i18n/index';
const formatXLM = balanceUtils.formatXLM;

type Receipt = FrontendReceipt;
type ReceiptData = FrontendReceiptData;

export class ReceiptService {
  private static readonly STORAGE_KEY = 'wata-board-receipts';
  private static readonly RECEIPT_PREFIX = 'RCP';
  private receipts: Map<string, Receipt> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private generateReceiptNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${ReceiptService.RECEIPT_PREFIX}-${timestamp}-${random}`;
  }

  private async generateQRCode(data: Record<string, any>): Promise<string> {
    try {
      const qrText = JSON.stringify(data);
      return await QRCode.toDataURL(qrText, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
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

  async generatePDF(receipt: Receipt, includeWatermark = true): Promise<Blob> {
    const htmlContent = this.generateHTMLReceipt(receipt, includeWatermark);
    const el = document.createElement('div');
    el.innerHTML = htmlContent;

    return new Promise((resolve, reject) => {
      const options = {
        margin: 10,
        filename: `receipt-${receipt.receiptNumber}.pdf`,
        image: { type: 'png' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait' as const, unit: 'mm', format: 'a4' }
      };

      html2pdf().set(options).from(el).toPdf().get('pdf').then((pdf: any) => {
        resolve(pdf.output('blob'));
      }).catch(reject);
    });
  }

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
            .amount-value { font-size: 32px; font-weight: bold; color: ${receipt.status === 'generated' || receipt.status === 'viewed' ? '#10b981' : '#666'}; }
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

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(ReceiptService.STORAGE_KEY);
      if (stored) {
        const receipts = JSON.parse(stored) as Receipt[];
        receipts.forEach(r => {
          r.date = fromDateISOString(r.date as unknown as string);
          if (r.billPeriod) {
            r.billPeriod.start = fromDateISOString(r.billPeriod.start as unknown as string);
            r.billPeriod.end = fromDateISOString(r.billPeriod.end as unknown as string);
          }
          this.receipts.set(r.id, r);
        });
      }
    } catch (error) {
      console.error('Failed to load receipts from storage:', error);
    }
  }

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
      toISOString(r.date),
      r.status,
      r.transactionHash || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function generateReceiptId(): string {
  return `WB-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

const COLORS = {
  primary: [14, 116, 144] as [number, number, number],
  primaryLight: [207, 250, 254] as [number, number, number],
  accent: [6, 182, 212] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  mid: [71, 85, 105] as [number, number, number],
  light: [148, 163, 184] as [number, number, number],
  muted: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  success: [22, 163, 74] as [number, number, number],
  successLight: [220, 252, 231] as [number, number, number],
  water: [6, 182, 212] as [number, number, number],
  electricity: [234, 179, 8] as [number, number, number],
};

export async function generateReceiptPDF(
  receipt: PaymentReceipt,
  options: PDFReceiptOptions = {}
): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 20;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  let y = 0;

  doc.setFillColor(...COLORS.white);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE_W, 52, "F");

  doc.setFillColor(...COLORS.primary);
  doc.ellipse(PAGE_W / 2, 52, PAGE_W * 0.7, 12, "F");

  y = 14;
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Wata-Board", MARGIN, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(207, 250, 254);
  doc.text("Decentralized Utility Payments · Stellar Blockchain", MARGIN, y + 6);

  const badgeLabel = receipt.meterType === "water" ? "WATER" : "ELECTRICITY";

  doc.setFillColor(255, 255, 255, 0.15);
  doc.roundedRect(PAGE_W - MARGIN - 30, y - 6, 30, 10, 2, 2, "F");
  const badgeTextColor = receipt.meterType === "water" ? [207, 250, 254] as const : [254, 243, 199] as const;
  doc.setTextColor(...badgeTextColor);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(badgeLabel, PAGE_W - MARGIN - 15, y - 0.5, { align: "center" });

  y = 34;
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("PAYMENT RECEIPT", PAGE_W / 2, y, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(207, 250, 254);
  doc.text(`Receipt No. ${receipt.receiptId}`, PAGE_W / 2, y + 6, { align: "center" });

  y = 68;
  const statusColors: Record<string, [number, number, number]> = {
    confirmed: COLORS.success,
    pending: [234, 179, 8],
    failed: [220, 38, 38],
  };
  const statusBg: Record<string, [number, number, number]> = {
    confirmed: COLORS.successLight,
    pending: [254, 243, 199],
    failed: [254, 226, 226],
  };

  const scol = statusColors[receipt.status] || COLORS.mid;
  const sbg = statusBg[receipt.status] || COLORS.muted;
  const statusText = receipt.status.toUpperCase();

  doc.setFillColor(...sbg);
  doc.roundedRect(PAGE_W / 2 - 18, y - 5, 36, 9, 2, 2, "F");
  doc.setTextColor(...scol);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`\u2713 ${statusText}`, PAGE_W / 2, y + 0.5, { align: "center" });

  y = 84;
  doc.setFillColor(...COLORS.muted);
  doc.roundedRect(MARGIN, y, CONTENT_W, 28, 3, 3, "F");

  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(MARGIN, y, 4, 28, 2, 2, "F");

  doc.setTextColor(...COLORS.mid);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("TOTAL AMOUNT PAID", MARGIN + 10, y + 9);

  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(formatXLM(receipt.totalAmount), MARGIN + 10, y + 21);

  if (receipt.amountFiat && receipt.fiatCurrency) {
    doc.setTextColor(...COLORS.light);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `\u2248 ${receipt.fiatCurrency} ${receipt.amountFiat.toLocaleString()}`,
      PAGE_W - MARGIN - 2,
      y + 21,
      { align: "right" }
    );
  }

  y = 122;

  function sectionHeader(title: string, yPos: number): void {
    doc.setFillColor(...COLORS.primaryLight);
    doc.roundedRect(MARGIN, yPos, CONTENT_W, 8, 1, 1, "F");
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(title.toUpperCase(), MARGIN + 4, yPos + 5.5);
  }

  function tableRow(label: string, value: string, yPos: number, highlight = false): void {
    if (highlight) {
      doc.setFillColor(...COLORS.muted);
      doc.rect(MARGIN, yPos - 1, CONTENT_W, 7, "F");
    }
    doc.setTextColor(...COLORS.mid);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(label, MARGIN + 3, yPos + 4.5);

    doc.setTextColor(...COLORS.dark);
    doc.setFont("helvetica", "bold");
    const maxChars = 42;
    const displayValue = value.length > maxChars ? value.slice(0, maxChars) + "\u2026" : value;
    doc.text(displayValue, PAGE_W - MARGIN - 2, yPos + 4.5, { align: "right" });

    doc.setDrawColor(...COLORS.muted);
    doc.setLineWidth(0.2);
    (doc as any).setLineDash([1, 2]);
    doc.line(MARGIN + 3, yPos + 6.5, PAGE_W - MARGIN - 2, yPos + 6.5);
    (doc as any).setLineDash([]);
  }

  if (receipt.customerAddress) {
    y += 7.5;
    tableRow("Address", receipt.customerAddress, y, true);
  }

  y += 14;
  sectionHeader("Amount Breakdown", y);
  y += 10;
  tableRow("Bill Amount", formatXLM(receipt.amountPaid), y, true);
  y += 7.5;
  tableRow(
    "Service Fee",
    receipt.serviceFee !== undefined ? formatXLM(receipt.serviceFee) : "0.0000000 XLM",
    y
  );

  y += 9;
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;

  doc.setFillColor(...COLORS.primaryLight);
  doc.roundedRect(MARGIN, y, CONTENT_W, 10, 2, 2, "F");
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", MARGIN + 5, y + 7);
  doc.text(formatXLM(receipt.totalAmount), PAGE_W - MARGIN - 4, y + 7, { align: "right" });

  y += 20;
  doc.setFillColor(...COLORS.muted);
  doc.roundedRect(MARGIN, y, CONTENT_W, 18, 2, 2, "F");

  doc.setTextColor(...COLORS.mid);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  const verifyUrl = `https://stellar.expert/explorer/${receipt.network}/tx/${receipt.transactionHash}`;
  doc.text("Verify this transaction on Stellar Expert:", MARGIN + 4, y + 7);
  doc.setTextColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  const urlLines = doc.splitTextToSize(verifyUrl, CONTENT_W - 8);
  doc.text(urlLines, MARGIN + 4, y + 13);

  const footerY = PAGE_H - 20;
  doc.setDrawColor(...COLORS.muted);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, footerY - 4, PAGE_W - MARGIN, footerY - 4);

  doc.setTextColor(...COLORS.light);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(
    "This receipt is computer-generated and valid without a signature.",
    PAGE_W / 2,
    footerY,
    { align: "center" }
  );
  doc.text(
    `Generated on ${formatDate(new Date())} \u00B7 Wata-Board \u00B7 Stellar Blockchain`,
    PAGE_W / 2,
    footerY + 5,
    { align: "center" }
  );

  if (receipt.network === "testnet") {
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(52);
    doc.setFont("helvetica", "bold");
    doc.saveGraphicsState();
    doc.text("TESTNET", PAGE_W / 2, PAGE_H / 2, { align: "center", angle: 45 });
    doc.restoreGraphicsState();
  }

  const filename = options.filename ?? `wataboard-receipt-${receipt.receiptId.toLowerCase()}.pdf`;
  doc.save(filename);
}

export function buildReceiptFromPayment(params: {
  transactionHash: string;
  meterId: string;
  meterType: "water" | "electricity";
  amountPaid: number;
  serviceFee?: number;
  network: "testnet" | "mainnet";
  contractId: string;
  stellarAccount: string;
  customerName?: string;
  customerAddress?: string;
  billingPeriod?: string;
  blockHeight?: number;
  status?: "confirmed" | "pending" | "failed";
}): PaymentReceipt {
  const serviceFee = params.serviceFee ?? 0;
  return {
    receiptId: generateReceiptId(),
    transactionHash: params.transactionHash,
    meterId: params.meterId,
    meterType: params.meterType,
    amountPaid: params.amountPaid,
    serviceFee,
    totalAmount: params.amountPaid + serviceFee,
    network: params.network,
    contractId: params.contractId,
    stellarAccount: params.stellarAccount,
    customerName: params.customerName,
    customerAddress: params.customerAddress,
    billingPeriod: params.billingPeriod,
    blockHeight: params.blockHeight,
    timestamp: new Date(),
    status: params.status ?? "confirmed",
  };
}
