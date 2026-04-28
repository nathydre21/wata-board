// src/hooks/usePaymentReceipt.ts
// Drop-in hook: call triggerReceipt() after a successful pay_bill tx.
// Shows PaymentReceiptCard modal automatically.

import { useState, useCallback } from "react";
import { buildReceiptFromPayment } from "../services/receiptService";
import type { PaymentReceipt } from "../types/receipt";

interface PaymentResult {
  transactionHash: string;
  meterId: string;
  meterType: "water" | "electricity";
  amountPaid: number;
  serviceFee?: number;
  blockHeight?: number;
  billingPeriod?: string;
  customerName?: string;
  customerAddress?: string;
  status?: "confirmed" | "pending" | "failed";
}

interface UsePaymentReceiptReturn {
  receipt: PaymentReceipt | null;
  isReceiptVisible: boolean;
  triggerReceipt: (result: PaymentResult) => void;
  closeReceipt: () => void;
  clearReceipt: () => void;
}

interface UsePaymentReceiptOptions {
  network?: "testnet" | "mainnet";
  contractId?: string;
  stellarAccount?: string;
}

export function usePaymentReceipt(
  options: UsePaymentReceiptOptions = {}
): UsePaymentReceiptReturn {
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [isReceiptVisible, setIsReceiptVisible] = useState(false);

  const network =
    options.network ??
    (import.meta.env.VITE_NETWORK as "testnet" | "mainnet") ??
    "testnet";

  const contractId =
    options.contractId ??
    import.meta.env.VITE_CONTRACT_ID ??
    "";

  const stellarAccount = options.stellarAccount ?? "";

  const triggerReceipt = useCallback(
    (result: PaymentResult) => {
      const built = buildReceiptFromPayment({
        ...result,
        network,
        contractId,
        stellarAccount,
      });
      setReceipt(built);
      setIsReceiptVisible(true);
    },
    [network, contractId, stellarAccount]
  );

  const closeReceipt = useCallback(() => {
    setIsReceiptVisible(false);
  }, []);

  const clearReceipt = useCallback(() => {
    setIsReceiptVisible(false);
    setReceipt(null);
  }, []);

  return { receipt, isReceiptVisible, triggerReceipt, closeReceipt, clearReceipt };
}