// src/components/PaymentReceiptCard.tsx
// Renders an on-screen receipt card after a successful payment,
// with a "Download PDF" button that calls receiptService.

import React, { useState, useCallback } from "react";
import type { PaymentReceipt } from "../types/receipt";
import { generateReceiptPDF } from "../services/receiptService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentReceiptCardProps {
  receipt: PaymentReceipt;
  onClose?: () => void;
  onNewPayment?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str: string, head = 8, tail = 8): string {
  if (str.length <= head + tail + 3) return str;
  return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

function fmtXLM(n: number): string {
  return `${n.toFixed(7)} XLM`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ReceiptRow: React.FC<{
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
}> = ({ label, value, mono = false, highlight = false }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "12px",
      padding: "9px 14px",
      borderRadius: "8px",
      background: highlight ? "rgba(6,182,212,0.06)" : "transparent",
      borderBottom: "1px dashed rgba(148,163,184,0.2)",
    }}
  >
    <span
      style={{
        fontSize: "12px",
        color: "#64748b",
        fontWeight: 500,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontSize: mono ? "11px" : "12.5px",
        fontWeight: 600,
        color: "#0f172a",
        fontFamily: mono ? "'Fira Code', 'Courier New', monospace" : "inherit",
        textAlign: "right",
        wordBreak: "break-all",
      }}
    >
      {value}
    </span>
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: "10px",
      fontWeight: 700,
      letterSpacing: "0.1em",
      color: "#0e7490",
      textTransform: "uppercase",
      padding: "16px 14px 6px",
    }}
  >
    {children}
  </div>
);

const StatusPill: React.FC<{ status: PaymentReceipt["status"] }> = ({
  status,
}) => {
  const config = {
    confirmed: { bg: "#dcfce7", color: "#16a34a", label: "✓ Confirmed" },
    pending: { bg: "#fef3c7", color: "#d97706", label: "⏳ Pending" },
    failed: { bg: "#fee2e2", color: "#dc2626", label: "✗ Failed" },
  }[status];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const PaymentReceiptCard: React.FC<PaymentReceiptCardProps> = ({
  receipt,
  onClose,
  onNewPayment,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await generateReceiptPDF(receipt);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (err) {
      console.error("Receipt generation failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [receipt, downloading]);

  const isWater = receipt.meterType === "water";
  const accentColor = isWater ? "#0891b2" : "#ca8a04";
  const accentLight = isWater ? "#cffafe" : "#fef9c3";
  const meterIcon = isWater ? "💧" : "⚡";

  return (
    <>
      {/* ── Keyframes ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap');

        @keyframes wb-slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wb-checkPop {
          0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
          70%  { transform: scale(1.15) rotate(4deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes wb-spin {
          to { transform: rotate(360deg); }
        }
        .wb-download-btn:hover:not(:disabled) {
          box-shadow: 0 0 0 3px rgba(6,182,212,0.25) !important;
          transform: translateY(-1px) !important;
        }
        .wb-download-btn:active:not(:disabled) {
          transform: translateY(0) !important;
        }
        .wb-ghost-btn:hover {
          background: rgba(6,182,212,0.06) !important;
        }
      `}</style>

      {/* ── Overlay backdrop ── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) onClose();
        }}
      >
        {/* ── Receipt card ── */}
        <div
          style={{
            width: "100%",
            maxWidth: "480px",
            maxHeight: "90vh",
            overflowY: "auto",
            background: "#ffffff",
            borderRadius: "20px",
            boxShadow:
              "0 32px 64px rgba(0,0,0,0.2), 0 0 0 1px rgba(148,163,184,0.15)",
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            animation: "wb-slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* ── Header band ── */}
          <div
            style={{
              background: `linear-gradient(135deg, #0e7490 0%, ${accentColor} 100%)`,
              padding: "28px 24px 20px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Decorative circles */}
            <div
              style={{
                position: "absolute",
                right: -24,
                top: -24,
                width: 100,
                height: 100,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 16,
                bottom: -32,
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
              }}
            />

            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close receipt"
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "14px",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            )}

            {/* Success check */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
                marginBottom: "14px",
                animation: "wb-checkPop 0.5s 0.1s cubic-bezier(0.34,1.56,0.64,1) both",
              }}
            >
              {meterIcon}
            </div>

            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>
              Payment Receipt
            </div>
            <div style={{ color: "#ffffff", fontSize: "22px", fontWeight: 700, letterSpacing: "-0.01em", marginBottom: "8px" }}>
              {fmtXLM(receipt.totalAmount)}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <StatusPill status={receipt.status} />
              {receipt.network === "testnet" && (
                <span style={{ fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "999px", background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)", letterSpacing: "0.06em" }}>
                  TESTNET
                </span>
              )}
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)" }}>
                {fmtDate(receipt.timestamp)} · {fmtTime(receipt.timestamp)}
              </span>
            </div>
          </div>

          {/* ── Receipt # strip ── */}
          <div
            style={{
              background: accentLight,
              padding: "8px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "11px", color: accentColor, fontWeight: 600 }}>
              Receipt No.
            </span>
            <span style={{ fontSize: "12px", fontFamily: "'Fira Code', monospace", fontWeight: 600, color: "#0f172a" }}>
              {receipt.receiptId}
            </span>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: "0 8px 8px" }}>

            <SectionLabel>Payment Details</SectionLabel>
            <ReceiptRow label="Meter ID" value={receipt.meterId} mono highlight />
            <ReceiptRow
              label="Meter Type"
              value={`${receipt.meterType.charAt(0).toUpperCase()}${receipt.meterType.slice(1)}`}
            />
            {receipt.billingPeriod && (
              <ReceiptRow label="Billing Period" value={receipt.billingPeriod} highlight />
            )}
            {receipt.customerName && (
              <ReceiptRow label="Customer" value={receipt.customerName} />
            )}

            <SectionLabel>Blockchain</SectionLabel>
            <ReceiptRow
              label="Tx Hash"
              value={truncate(receipt.transactionHash)}
              mono
              highlight
            />
            <ReceiptRow
              label="Account"
              value={truncate(receipt.stellarAccount)}
              mono
            />
            <ReceiptRow
              label="Network"
              value={receipt.network === "mainnet" ? "Mainnet" : "Testnet"}
              highlight
            />
            {receipt.blockHeight && (
              <ReceiptRow
                label="Ledger"
                value={receipt.blockHeight.toLocaleString()}
              />
            )}

            <SectionLabel>Amount Breakdown</SectionLabel>
            <ReceiptRow label="Bill Amount" value={fmtXLM(receipt.amountPaid)} highlight />
            <ReceiptRow
              label="Service Fee"
              value={fmtXLM(receipt.serviceFee ?? 0)}
            />

            {/* Total */}
            <div
              style={{
                margin: "12px 6px 0",
                padding: "12px 14px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #ecfeff 0%, #f0fdf4 100%)",
                border: "1.5px solid rgba(6,182,212,0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0e7490" }}>
                Total Paid
              </span>
              <span style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>
                {fmtXLM(receipt.totalAmount)}
              </span>
            </div>

            {/* Verify link */}
            <div style={{ padding: "14px 6px 4px" }}>
              <a
                href={`https://stellar.expert/explorer/${receipt.network}/tx/${receipt.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11.5px",
                  color: "#0891b2",
                  textDecoration: "none",
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: "8px",
                  background: "#ecfeff",
                  border: "1px solid rgba(6,182,212,0.2)",
                }}
              >
                <span>🔗</span>
                Verify on Stellar Expert
                <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: "10px" }}>↗</span>
              </a>
            </div>
          </div>

          {/* ── Action buttons ── */}
          <div
            style={{
              padding: "16px 16px 20px",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              gap: "10px",
              flexDirection: "column",
            }}
          >
            {/* Download PDF */}
            <button
              className="wb-download-btn"
              onClick={handleDownload}
              disabled={downloading}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: "10px",
                border: "none",
                background: downloaded
                  ? "linear-gradient(135deg, #16a34a, #15803d)"
                  : "linear-gradient(135deg, #0e7490 0%, #0891b2 100%)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 700,
                cursor: downloading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.2s ease",
                fontFamily: "inherit",
                letterSpacing: "0.01em",
              }}
            >
              {downloading ? (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    style={{ animation: "wb-spin 0.7s linear infinite" }}
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Generating PDF…
                </>
              ) : downloaded ? (
                <>✓ Downloaded!</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download Receipt PDF
                </>
              )}
            </button>

            {/* Secondary actions */}
            <div style={{ display: "flex", gap: "8px" }}>
              {onNewPayment && (
                <button
                  className="wb-ghost-btn"
                  onClick={onNewPayment}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1.5px solid #e2e8f0",
                    background: "transparent",
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                >
                  + New Payment
                </button>
              )}
              {onClose && (
                <button
                  className="wb-ghost-btn"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1.5px solid #e2e8f0",
                    background: "transparent",
                    color: "#94a3b8",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PaymentReceiptCard;