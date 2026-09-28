import React, { useState } from 'react';
import { Receipt } from '../types/index.ts';
import { formatDuration, exportReceiptToPdf, exportReceiptToImage, downloadCsv } from '../utils/export.ts';
import { Download, FileText, Image as ImageIcon, Printer, AlertTriangle, Sparkles, Package, Clock, ShieldCheck } from 'lucide-react';

interface ReceiptSummaryProps {
  receipt: Receipt;
  onEditExternalCosts?: () => void;
}

export const ReceiptSummary: React.FC<ReceiptSummaryProps> = ({ receipt, onEditExternalCosts }) => {
  const [isExporting, setIsExporting] = useState(false);
  const currencySymbol = receipt.currency === 'EUR' ? '€' : receipt.currency === 'USD' ? '$' : receipt.currency === 'GBP' ? '£' : '€';

  const handlePdf = async () => {
    try {
      setIsExporting(true);
      await exportReceiptToPdf('meeting-receipt-paper', `MeetingMeter-${receipt.meeting_id.substring(0, 8)}.pdf`);
    } catch (err: any) {
      alert('PDF export failed: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImage = async () => {
    try {
      setIsExporting(true);
      await exportReceiptToImage('meeting-receipt-paper', `MeetingMeter-${receipt.meeting_id.substring(0, 8)}.png`);
    } catch (err: any) {
      alert('Image export failed: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const isManual = receipt.provenance === 'MANUAL_ENTRY';
  const hasExternal = receipt.external_costs && receipt.external_costs.length > 0;
  const isPostEdited = Boolean(
    receipt.updated_at &&
    ((receipt.ended_at && receipt.updated_at !== receipt.ended_at) || receipt.updated_at !== receipt.created_at)
  );

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
      {/* Export Action Bar */}
      <div className="flex items-center justify-center flex-wrap gap-2 mb-6 w-full print:hidden">
        <button
          onClick={handlePdf}
          disabled={isExporting}
          className="px-4 py-2 rounded-lg bg-surface-card hover:bg-surface-elevated text-brand-primary border border-brand-primary/30 flex items-center space-x-2 text-xs font-semibold shadow-sm transition-all"
        >
          <FileText className="w-4 h-4" />
          <span>Export PDF</span>
        </button>

        <button
          onClick={handleImage}
          disabled={isExporting}
          className="px-4 py-2 rounded-lg bg-surface-card hover:bg-surface-elevated text-brand-cyan border border-brand-cyan/30 flex items-center space-x-2 text-xs font-semibold shadow-sm transition-all"
        >
          <ImageIcon className="w-4 h-4" />
          <span>Export Image</span>
        </button>

        <button
          onClick={() => downloadCsv(receipt.meeting_id)}
          className="px-4 py-2 rounded-lg bg-surface-card hover:bg-surface-elevated text-ink-primary border border-border-subtle flex items-center space-x-2 text-xs font-semibold shadow-sm transition-all"
        >
          <Download className="w-4 h-4" />
          <span>Download CSV</span>
        </button>

        {onEditExternalCosts && (
          <button
            onClick={onEditExternalCosts}
            className="px-4 py-2 rounded-lg bg-surface-card hover:bg-surface-elevated text-brand-cyan border border-brand-cyan/40 flex items-center space-x-2 text-xs font-semibold shadow-sm transition-all"
          >
            <Package className="w-4 h-4" />
            <span>Edit External Costs</span>
          </button>
        )}

        <button
          onClick={handlePrint}
          className="px-4 py-2 rounded-lg bg-surface-card hover:bg-surface-elevated text-ink-secondary hover:text-ink-primary border border-border-subtle flex items-center space-x-2 text-xs font-semibold shadow-sm transition-all"
        >
          <Printer className="w-4 h-4" />
          <span>Print</span>
        </button>
      </div>

      {/* Printable Thermal Receipt Card */}
      <div
        id="meeting-receipt-paper"
        className="w-full bg-[#FFFFFF] text-[#18181B] p-6 sm:p-8 rounded-xl shadow-2xl font-mono border border-[#E2E8F0] relative overflow-hidden"
      >
        {/* Receipt Header */}
        <div className="text-center pb-4 border-b-2 border-dashed border-[#18181B]/30">
          <div className="text-xl font-extrabold tracking-widest uppercase">*** MEETINGMETER ***</div>
          <div className="text-xs text-[#52525B] uppercase tracking-wider mt-0.5">
            {isManual ? 'Post-Hoc Manual Entry Receipt' : 'Real-Time Fiscal Telemetry Receipt'}
          </div>
          <div className="text-[11px] text-[#71717A] mt-1">SESSION REF: {receipt.meeting_id}</div>
          <div className="mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#F4F4F5] text-[#52525B] border border-[#E4E4E7]">
            PROVENANCE: {isManual ? 'MANUAL ENTRY' : 'LIVE TELEMETRY'}
          </div>
        </div>

        {/* Meeting Metadata */}
        <div className="py-4 border-b border-[#E2E8F0] text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-[#71717A]">MEETING:</span>
            <span className="font-bold text-[#18181B] text-right">{receipt.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#71717A]">ORGANIZER:</span>
            <span>{receipt.creator?.name || 'Creator'}</span>
          </div>
          {isManual && receipt.manual_reason && (
            <div className="flex justify-between">
              <span className="text-[#71717A]">ENTRY REASON:</span>
              <span className="text-right text-[#52525B] max-w-xs">{receipt.manual_reason}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[#71717A]">STARTED:</span>
            <span>{receipt.started_at ? new Date(receipt.started_at).toLocaleString() : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#71717A]">CONCLUDED:</span>
            <span>{receipt.ended_at ? new Date(receipt.ended_at).toLocaleString() : '-'}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span className="text-[#71717A]">TOTAL DURATION:</span>
            <span>{formatDuration(receipt.total_duration_seconds)}</span>
          </div>
          {isPostEdited && (
            <div className="flex justify-between text-[11px] text-[#0284C7] pt-1 border-t border-dotted border-[#E2E8F0]">
              <span>LAST UPDATED:</span>
              <span>{new Date(receipt.updated_at).toLocaleString()} (Costs Adjusted)</span>
            </div>
          )}
        </div>

        {/* Participants Itemized Breakdown */}
        <div className="py-4 border-b border-[#E2E8F0]">
          <div className="text-xs font-bold uppercase text-[#71717A] mb-2 flex justify-between">
            <span>PARTICIPANT / RATE</span>
            <span>TIME / COST</span>
          </div>
          <div className="space-y-2 text-xs">
            {receipt.participants.map((p) => {
              const rateDisplay = p.rate_known && p.hourly_rate_snapshot !== null
                ? `${currencySymbol}${p.hourly_rate_snapshot.toFixed(2)}/hr`
                : 'RATE: UNKNOWN';
              const costDisplay = p.rate_known && p.calculated_cost !== null
                ? `${currencySymbol}${p.calculated_cost.toFixed(2)}`
                : 'UNKNOWN';

              return (
                <div key={p.id} className="flex justify-between items-start border-b border-dotted border-[#E2E8F0] pb-1.5">
                  <div className="pr-2">
                    <div className="font-bold text-[#18181B]">
                      {p.name} {p.is_guest && <span className="text-[10px] uppercase text-[#71717A]">(Guest)</span>}
                    </div>
                    <div className="text-[10px] text-[#71717A]">{p.role || 'Member'} • {rateDisplay}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-[#18181B]">{costDisplay}</div>
                    <div className="text-[10px] text-[#71717A]">{formatDuration(p.measured_seconds)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* External Costs Breakdown Section if present */}
        {hasExternal && (
          <div className="py-4 border-b border-[#E2E8F0]">
            <div className="text-xs font-bold uppercase text-[#71717A] mb-2 flex justify-between">
              <span>EXTERNAL FIXED COST</span>
              <span>AMOUNT</span>
            </div>
            <div className="space-y-2 text-xs">
              {receipt.external_costs.map((c, i) => (
                <div key={c.id || i} className="flex justify-between items-start border-b border-dotted border-[#E2E8F0] pb-1.5">
                  <div className="pr-2">
                    <div className="font-bold text-[#18181B]">{c.name}</div>
                    {c.is_overridden && (
                      <div className="text-[10px] text-[#0284C7] uppercase">Custom Override</div>
                    )}
                  </div>
                  <div className="text-right font-bold text-[#18181B]">
                    {currencySymbol}{c.amount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unknown Cost Notice if present */}
        {receipt.unknown_cost_count > 0 && (
          <div className="my-3 p-2 bg-[#FEF3C7] border border-[#F59E0B]/40 rounded text-[11px] text-[#92400E] flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Note: {receipt.unknown_cost_count} participant(s) had undisclosed hourly rates and are omitted from total currency sum.</span>
          </div>
        )}

        {/* Subtotals and Final Totals Section */}
        <div className="py-4 border-b-2 border-[#18181B] space-y-1.5">
          <div className="flex justify-between text-xs text-[#52525B]">
            <span>ROSTER SIZE:</span>
            <span>{receipt.participants_count} people</span>
          </div>
          <div className="flex justify-between text-xs text-[#52525B]">
            <span>PARTICIPANT TIME COST:</span>
            <span>{currencySymbol}{(receipt.participant_cost_total ?? receipt.final_estimated_cost).toFixed(2)}</span>
          </div>
          {hasExternal && (
            <div className="flex justify-between text-xs text-[#52525B]">
              <span>EXTERNAL FIXED COSTS:</span>
              <span>{currencySymbol}{(receipt.external_cost_total ?? 0).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm sm:text-base font-extrabold text-[#18181B] pt-2 border-t border-[#E2E8F0]">
            <span>FINAL ESTIMATED MEETING COST:</span>
            <span className="text-lg sm:text-xl text-[#059669]">
              {currencySymbol}{(receipt.final_estimated_cost ?? receipt.total_estimated_cost ?? 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Sarcastic Tone Quote */}
        <div className="py-4 text-center border-b border-dashed border-[#18181B]/30">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-[#F4F4F5] rounded-full text-xs font-semibold text-[#18181B] italic">
            <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
            <span>"{receipt.tone_quote || 'Meetings are the practical alternative to work.'}"</span>
          </div>
        </div>

        {/* Barcode & Footer Disclaimer */}
        <div className="pt-4 text-center space-y-2">
          {/* Simulated Monospace Barcode */}
          <div className="font-mono text-2xl tracking-[0.25em] text-[#18181B] select-none overflow-hidden">
            || | | ||| || ||| | || ||| || ||| | |||
          </div>
          <div className="text-[9px] text-[#71717A] max-w-sm mx-auto leading-tight">
            {receipt.estimate_disclaimer || 'Estimated calculation only. Not official payroll/billing.'}
          </div>
        </div>
      </div>
    </div>
  );
};
