import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { apiRequest } from '../utils/api.ts';
import { Receipt, CostLibraryItem, ExternalCost } from '../types/index.ts';
import { ReceiptSummary } from '../components/ReceiptSummary.tsx';
import { ArrowLeft, PlusCircle, History, Sparkles, Package, Plus, Trash2, X, Check } from 'lucide-react';

interface MeetingReceiptPageProps {
  meetingId: string;
  onNavigate: (tab: string, meetingId?: string) => void;
}

export const MeetingReceiptPage: React.FC<MeetingReceiptPageProps> = ({ meetingId, onNavigate }) => {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Post-End External Cost Editor state
  const [showEditModal, setShowEditModal] = useState(false);
  const [costLibrary, setCostLibrary] = useState<CostLibraryItem[]>([]);
  const [editExternalCosts, setEditExternalCosts] = useState<ExternalCost[]>([]);
  const [newCostName, setNewCostName] = useState('');
  const [newCostAmount, setNewCostAmount] = useState('50');
  const [selectedLibId, setSelectedLibId] = useState('');
  const [savingCosts, setSavingCosts] = useState(false);

  const loadReceipt = async () => {
    try {
      const data = await apiRequest<{ receipt: Receipt }>(`/meetings/${meetingId}/receipt`);
      setReceipt(data.receipt);
    } catch (err: any) {
      setError(err.message || 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReceipt().then(() => {
      // Trigger celebratory confetti for successfully surviving the meeting
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#10B981', '#00F0FF', '#0D9488', '#F59E0B'],
        });
      } catch (_) {}
    });

    apiRequest<{ items: CostLibraryItem[] }>('/cost-library')
      .then((data) => setCostLibrary(data.items || []))
      .catch(() => {});
  }, [meetingId]);

  const openEditModal = () => {
    if (receipt) {
      setEditExternalCosts(
        receipt.external_costs.map((c) => ({
          id: c.id,
          cost_library_id: c.cost_library_id,
          name: c.name,
          amount: c.amount,
          currency: c.currency || receipt.currency || 'EUR',
          is_overridden: c.is_overridden,
        }))
      );
    }
    setShowEditModal(true);
  };

  const handleAddCostFromInput = () => {
    if (!newCostName.trim()) return;
    const amt = parseFloat(newCostAmount) || 0;
    const selectedLib = costLibrary.find((l) => l.id === selectedLibId);

    setEditExternalCosts((prev) => [
      ...prev,
      {
        cost_library_id: selectedLib ? selectedLib.id : null,
        name: newCostName.trim(),
        amount: amt,
        currency: 'EUR',
        is_overridden: selectedLib ? amt !== selectedLib.default_amount : false,
      },
    ]);

    setNewCostName('');
    setNewCostAmount('50');
    setSelectedLibId('');
  };

  const handleSelectLibItem = (libId: string) => {
    setSelectedLibId(libId);
    const item = costLibrary.find((l) => l.id === libId);
    if (item) {
      setNewCostName(item.name);
      setNewCostAmount(item.default_amount.toString());
    }
  };

  const handleRemoveCost = (index: number) => {
    setEditExternalCosts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveCosts = async () => {
    setSavingCosts(true);
    try {
      await apiRequest(`/meetings/${meetingId}/external-costs`, {
        method: 'POST',
        body: JSON.stringify({ external_costs: editExternalCosts }),
      });
      setShowEditModal(false);
      await loadReceipt();
    } catch (err: any) {
      alert('Failed to save external costs: ' + err.message);
    } finally {
      setSavingCosts(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center font-mono text-xs text-ink-muted">
        Generating fiscal receipt...
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="p-4 bg-status-danger/10 border border-status-danger/40 rounded-xl text-status-danger text-sm font-mono">
          {error || 'Receipt not found'}
        </div>
        <button
          onClick={() => onNavigate('dashboard')}
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          Return to Cockpit
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Navigation / Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={() => onNavigate('dashboard')}
          className="inline-flex items-center space-x-2 text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Cockpit</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigate('config')}
            className="px-4 py-2 rounded-xl bg-brand-primary text-[#090A0F] font-bold text-xs flex items-center space-x-1.5 shadow-glow-emerald"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Meeting Meter</span>
          </button>
          <button
            onClick={() => onNavigate('history')}
            className="px-3 py-2 rounded-xl bg-surface-card hover:bg-surface-elevated text-ink-secondary hover:text-ink-primary border border-border-subtle text-xs font-semibold flex items-center space-x-1.5"
          >
            <History className="w-4 h-4" />
            <span>All History</span>
          </button>
        </div>
      </div>

      {/* Main Thermal Receipt Summary Component */}
      <ReceiptSummary receipt={receipt} onEditExternalCosts={openEditModal} />

      {/* Post-End External Cost Editor Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-surface-card border border-border-subtle rounded-2xl max-w-lg w-full p-6 shadow-hud-modal space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-brand-cyan">
                <Package className="w-5 h-5" />
                <h3 className="text-base font-bold text-ink-primary">Edit Post-End External Costs</h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-ink-muted hover:text-ink-primary p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              External costs (e.g. catering, room rentals, vendor fees) can be adjusted post-meeting. Participant measurements remain permanently locked.
            </p>

            {/* List of current external costs */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {editExternalCosts.length === 0 ? (
                <div className="p-4 border border-dashed border-border-subtle rounded-xl text-center text-xs text-ink-muted">
                  No external costs attached to this meeting yet.
                </div>
              ) : (
                editExternalCosts.map((cost, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-surface-inset border border-border-subtle rounded-xl flex items-center justify-between text-xs font-mono"
                  >
                    <div>
                      <div className="font-semibold text-ink-primary font-sans">{cost.name}</div>
                      {cost.is_overridden && (
                        <div className="text-[10px] text-brand-cyan">Custom Overridden Rate</div>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-brand-cyan font-mono">€{cost.amount.toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCost(idx)}
                        className="p-1 rounded text-ink-muted hover:text-status-danger transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add external cost inputs */}
            <div className="p-3 bg-surface-inset border border-border-subtle rounded-xl space-y-3">
              <span className="text-[11px] font-mono text-ink-muted uppercase block font-semibold">
                Attach External Cost Item
              </span>

              {costLibrary.length > 0 && (
                <div>
                  <select
                    value={selectedLibId}
                    onChange={(e) => handleSelectLibItem(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-lg text-xs text-ink-primary focus:outline-none"
                  >
                    <option value="">-- Or choose from Cost Library --</option>
                    {costLibrary.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (Default: €{item.default_amount.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={newCostName}
                    onChange={(e) => setNewCostName(e.target.value)}
                    placeholder="Item name (e.g. Lunch Catering)"
                    className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-lg text-xs text-ink-primary focus:outline-none"
                  />
                </div>
                <div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-mono text-ink-muted">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newCostAmount}
                      onChange={(e) => setNewCostAmount(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 bg-surface-card border border-border-subtle rounded-lg text-xs font-mono text-ink-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddCostFromInput}
                disabled={!newCostName.trim()}
                className="w-full py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-bright text-brand-cyan border border-brand-cyan/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Cost to List</span>
              </button>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                disabled={savingCosts}
                className="px-4 py-2 rounded-lg bg-surface-elevated text-ink-secondary hover:text-ink-primary text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCosts}
                disabled={savingCosts}
                className="px-4 py-2 rounded-lg bg-brand-cyan hover:bg-brand-cyan/90 text-[#090A0F] text-xs font-bold transition-all"
              >
                {savingCosts ? 'Saving...' : 'Recalculate & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
