import React, { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api.ts';
import { CostLibraryItem } from '../types/index.ts';
import { Package, Plus, Trash2, Edit2, Check, X, AlertCircle } from 'lucide-react';

export const CostLibraryPage: React.FC = () => {
  const [items, setItems] = useState<CostLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New item form state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('50');

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const loadItems = () => {
    setLoading(true);
    apiRequest<{ items: CostLibraryItem[] }>('/cost-library')
      .then((data) => {
        setItems(data.items);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load Cost Library');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await apiRequest('/cost-library', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          default_amount: Math.max(0, parseFloat(newAmount) || 0),
          currency: 'EUR',
        }),
      });

      setNewName('');
      setNewAmount('50');
      setShowAdd(false);
      loadItems();
    } catch (err: any) {
      setError(err.message || 'Failed to create item');
    }
  };

  const startEdit = (item: CostLibraryItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditAmount(item.default_amount.toString());
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditAmount('');
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;

    try {
      await apiRequest(`/cost-library/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName.trim(),
          default_amount: Math.max(0, parseFloat(editAmount) || 0),
          currency: 'EUR',
        }),
      });

      cancelEdit();
      loadItems();
    } catch (err: any) {
      setError(err.message || 'Failed to update item');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this item from your Cost Library? (Historical meetings that used this item will preserve their recorded amounts)')) {
      return;
    }

    try {
      await apiRequest(`/cost-library/${id}`, { method: 'DELETE' });
      loadItems();
    } catch (err: any) {
      setError(err.message || 'Failed to delete item');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Package className="w-6 h-6 text-status-warning" />
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink-primary tracking-tight">
              Cost Library
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-ink-secondary mt-1">
            Maintain reusable external costs (catering, room rentals, AV software) with default EUR (€) pricing.
          </p>
        </div>

        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2.5 rounded-xl bg-status-warning/15 hover:bg-status-warning/25 text-status-warning border border-status-warning/40 font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{showAdd ? 'Close Builder' : 'New Library Item'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-status-danger/10 border border-status-danger/30 rounded-xl text-status-danger text-xs font-mono flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Add New Item Box */}
      {showAdd && (
        <form onSubmit={handleCreate} className="p-5 bg-surface-card border border-status-warning/40 rounded-2xl shadow-xl space-y-4">
          <div className="text-xs font-mono text-status-warning font-bold uppercase tracking-wider">
            Create Reusable Cost Item
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-mono uppercase text-ink-secondary mb-1">Item Description / Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Executive Lunch Catering / Studio Rental"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-status-warning rounded-lg text-xs text-ink-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-ink-secondary mb-1">Default Price (EUR €) *</label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-status-warning rounded-lg text-xs text-ink-primary font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 rounded-lg bg-surface-elevated text-ink-secondary hover:text-ink-primary text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-status-warning text-[#090A0F] font-bold text-xs shadow-sm hover:brightness-110"
            >
              Save to Library
            </button>
          </div>
        </form>
      )}

      {/* Library Items List */}
      {loading ? (
        <div className="py-16 text-center text-xs font-mono text-ink-muted">Loading Cost Library...</div>
      ) : items.length === 0 ? (
        <div className="p-8 bg-surface-card border border-border-subtle rounded-2xl text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-surface-elevated flex items-center justify-center text-ink-muted mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-ink-primary">No Cost Library Items Yet</div>
          <p className="text-xs text-ink-secondary max-w-sm mx-auto">
            Add recurring costs like catering, room fees, or equipment rentals to easily attach them when configuring meetings.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 rounded-lg bg-status-warning/20 text-status-warning border border-status-warning/40 text-xs font-bold"
          >
            Create First Item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const isEditing = editingId === item.id;

            return (
              <div
                key={item.id}
                className="p-4 bg-surface-card border border-border-subtle hover:border-status-warning/30 rounded-2xl shadow-lg flex flex-col justify-between transition-all"
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-surface-inset border border-border-subtle rounded text-xs text-ink-primary"
                    />
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono text-ink-muted">€</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface-inset border border-border-subtle rounded text-xs text-ink-primary font-mono"
                      />
                    </div>
                    <div className="flex justify-end space-x-1.5 pt-1">
                      <button
                        onClick={cancelEdit}
                        className="p-1 rounded bg-surface-elevated text-ink-muted hover:text-ink-primary"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleUpdate(item.id)}
                        className="p-1 rounded bg-brand-primary text-[#090A0F] font-bold"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-sm text-ink-primary leading-snug">{item.name}</div>
                        <div className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-status-warning/10 text-status-warning border border-status-warning/30 flex-shrink-0">
                          Library
                        </div>
                      </div>
                      <div className="text-[10px] text-ink-muted font-mono">
                        Last updated: {new Date(item.updated_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between">
                      <div className="text-base font-mono font-extrabold text-status-warning">
                        €{item.default_amount.toFixed(2)}
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => startEdit(item)}
                          className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-elevated transition-colors"
                          title="Edit Library Item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg text-ink-muted hover:text-status-danger hover:bg-status-danger/10 transition-colors"
                          title="Delete Library Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
