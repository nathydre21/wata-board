import { useState } from 'react';
import { ExportDialog } from './ExportDialog';
import { exportService } from '../services/ExportService';
import type { ExportOptions } from '../types/export';

interface ExportButtonProps {
  disabled?: boolean;
  className?: string;
}

/**
 * ExportButton Component
 * 
 * Provides a button that opens the export dialog for payment history export.
 * Integrates with ExportService to handle the export process.
 * 
 * Requirements:
 * - 1.1: User can access export feature to choose between CSV and PDF formats
 */
export function ExportButton({ disabled = false, className = '' }: ExportButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const handleExport = async (options: ExportOptions): Promise<void> => {
    await exportService.exportPaymentHistory(options);
  };

  return (
    <>
      <button
        onClick={handleOpenDialog}
        disabled={disabled}
        className={`inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors ${className}`}
        aria-label="Export payment history"
      >
        <svg 
          className="w-4 h-4" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" 
          />
        </svg>
        Export
      </button>

      <ExportDialog
        open={isDialogOpen}
        onClose={handleCloseDialog}
        onExport={handleExport}
      />
    </>
  );
}
