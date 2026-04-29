// src/services/receiptService.ts
// Generates downloadable PDF receipts for Wata-Board utility payments.
// Uses jsPDF (install: npm install jspdf) — no canvas required.

import type { PaymentReceipt, ReceiptGenerationOptions } from "../types/receipt";

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncateHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

function formatXLM(amount: number): string {
  return `${amount.toFixed(7)} XLM`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
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

// ─── Color palette ───────────────────────────────────────────────────────────

const COLORS = {
  primary: [14, 116, 144] as [number, number, number],     // cyan-700
  primaryLight: [207, 250, 254] as [number, number, number], // cyan-100
  accent: [6, 182, 212] as [number, number, number],       // cyan-500
  dark: [15, 23, 42] as [number, number, number],          // slate-900
  mid: [71, 85, 105] as [number, number, number],          // slate-500
  light: [148, 163, 184] as [number, number, number],      // slate-400
  muted: [241, 245, 249] as [number, number, number],      // slate-100
  white: [255, 255, 255] as [number, number, number],
  success: [22, 163, 74] as [number, number, number],      // green-600
  successLight: [220, 252, 231] as [number, number, number],
  water: [6, 182, 212] as [number, number, number],
  electricity: [234, 179, 8] as [number, number, number],
};

// ─── PDF Generator ───────────────────────────────────────────────────────────

export async function generateReceiptPDF(
  receipt: PaymentReceipt,
  options: ReceiptGenerationOptions = {}
): Promise<void> {
  // Dynamic import so jsPDF is only loaded when needed
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

  // ── Background ──────────────────────────────────────────────────────────────
  doc.setFillColor(...COLORS.white);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  // Top header band
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE_W, 52, "F");

  // Decorative arc — bottom of header
  doc.setFillColor(...COLORS.primary);
  doc.ellipse(PAGE_W / 2, 52, PAGE_W * 0.7, 12, "F");

  // ── Logo / Brand (header) ───────────────────────────────────────────────────
  y = 14;
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Wata-Board", MARGIN, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(207, 250, 254); // cyan-100
  doc.text("Decentralized Utility Payments · Stellar Blockchain", MARGIN, y + 6);

  // Utility type badge (top right)
  const badgeColor =
    receipt.meterType === "water" ? COLORS.water : COLORS.electricity;
  const badgeLabel =
    receipt.meterType === "water" ? "WATER" : "ELECTRICITY";

  doc.setFillColor(255, 255, 255, 0.15);
  doc.roundedRect(PAGE_W - MARGIN - 30, y - 6, 30, 10, 2, 2, "F");
  doc.setTextColor(...(receipt.meterType === "water" ? [207, 250, 254] : [254, 243, 199]));
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(badgeLabel, PAGE_W - MARGIN - 15, y - 0.5, { align: "center" });

  // ── Receipt title ───────────────────────────────────────────────────────────
  y = 34;
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("PAYMENT RECEIPT", PAGE_W / 2, y, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(207, 250, 254);
  doc.text(`Receipt No. ${receipt.receiptId}`, PAGE_W / 2, y + 6, {
    align: "center",
  });

  // ── Status badge ────────────────────────────────────────────────────────────
  y = 68;
  const statusColors = {
    confirmed: COLORS.success,
    pending: [234, 179, 8] as [number, number, number],
    failed: [220, 38, 38] as [number, number, number],
  };
  const statusBg = {
    confirmed: COLORS.successLight,
    pending: [254, 243, 199] as [number, number, number],
    failed: [254, 226, 226] as [number, number, number],
  };

  const scol = statusColors[receipt.status];
  const sbg = statusBg[receipt.status];
  const statusText = receipt.status.toUpperCase();

  doc.setFillColor(...sbg);
  doc.roundedRect(PAGE_W / 2 - 18, y - 5, 36, 9, 2, 2, "F");
  doc.setTextColor(...scol);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`✓ ${statusText}`, PAGE_W / 2, y + 0.5, { align: "center" });

  // ── Amount highlighted box ──────────────────────────────────────────────────
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
      `≈ ${receipt.fiatCurrency} ${receipt.amountFiat.toLocaleString()}`,
      PAGE_W - MARGIN - 2,
      y + 21,
      { align: "right" }
    );
  }

  // ── Section: Payment Details ────────────────────────────────────────────────
  y = 122;

  function sectionHeader(title: string, yPos: number): void {
    doc.setFillColor(...COLORS.primaryLight);
    doc.roundedRect(MARGIN, yPos, CONTENT_W, 8, 1, 1, "F");
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(title.toUpperCase(), MARGIN + 4, yPos + 5.5);
  }

  function tableRow(
    label: string,
    value: string,
    yPos: number,
    highlight = false
  ): void {
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
    // Truncate long values
    const maxChars = 42;
    const displayValue =
      value.length > maxChars ? value.slice(0, maxChars) + "…" : value;
    doc.text(displayValue, PAGE_W - MARGIN - 2, yPos + 4.5, {
      align: "right",
    });

    // Dotted separator
    doc.setDrawColor(...COLORS.muted);
    doc.setLineWidth(0.2);
    doc.setLineDash([1, 2]);
    doc.line(MARGIN + 3, yPos + 6.5, PAGE_W - MARGIN - 2, yPos + 6.5);
    doc.setLineDash([]);
  }

  // Payment Details
  sectionHeader("Payment Details", y);
  y += 10;
  tableRow("Date", formatDate(receipt.timestamp), y, true);
  y += 7.5;
  tableRow("Time", formatTime(receipt.timestamp), y);
  y += 7.5;
  tableRow("Billing Period", receipt.billingPeriod ?? "—", y, true);
  y += 7.5;
  tableRow("Meter ID", receipt.meterId, y);
  y += 7.5;
  tableRow(
    "Meter Type",
    receipt.meterType.charAt(0).toUpperCase() + receipt.meterType.slice(1),
    y,
    true
  );

  if (receipt.customerName) {
    y += 7.5;
    tableRow("Customer", receipt.customerName, y);
  }
  if (receipt.customerAddress) {
    y += 7.5;
    tableRow("Address", receipt.customerAddress, y, true);
  }

  // ── Section: Transaction Details ────────────────────────────────────────────
  y += 14;
  sectionHeader("Blockchain Transaction", y);
  y += 10;
  tableRow(
    "Transaction Hash",
    truncateHash(receipt.transactionHash, 10),
    y,
    true
  );
  y += 7.5;
  tableRow("Stellar Account", truncateHash(receipt.stellarAccount, 10), y);
  y += 7.5;
  tableRow("Network", receipt.network === "mainnet" ? "Mainnet" : "Testnet", y, true);
  y += 7.5;
  tableRow("Contract ID", truncateHash(receipt.contractId, 10), y);
  if (receipt.blockHeight) {
    y += 7.5;
    tableRow("Block / Ledger", receipt.blockHeight.toLocaleString(), y, true);
  }

  // ── Section: Amount Breakdown ───────────────────────────────────────────────
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

  // Total divider
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
  doc.text(formatXLM(receipt.totalAmount), PAGE_W - MARGIN - 4, y + 7, {
    align: "right",
  });

  // ── QR Placeholder / Verification note ─────────────────────────────────────
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
  // Wrap long URL
  const urlLines = doc.splitTextToSize(verifyUrl, CONTENT_W - 8);
  doc.text(urlLines, MARGIN + 4, y + 13);

  // ── Footer ──────────────────────────────────────────────────────────────────
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
    `Generated on ${formatDate(new Date())} · Wata-Board · Stellar Blockchain`,
    PAGE_W / 2,
    footerY + 5,
    { align: "center" }
  );

  // Network watermark (subtle)
  if (receipt.network === "testnet") {
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(52);
    doc.setFont("helvetica", "bold");
    doc.saveGraphicsState();
    // Rotate watermark text
    doc.text("TESTNET", PAGE_W / 2, PAGE_H / 2, {
      align: "center",
      angle: 45,
    });
    doc.restoreGraphicsState();
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const filename =
    options.filename ??
    `wataboard-receipt-${receipt.receiptId.toLowerCase()}.pdf`;
  doc.save(filename);
}

// ─── Factory: build a receipt from a raw payment response ────────────────────

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