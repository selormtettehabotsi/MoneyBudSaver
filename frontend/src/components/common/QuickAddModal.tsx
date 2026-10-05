import React, { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { categoriesApi } from "../../api/categories";
import { Category, TransactionType } from "../../types/finance";
import { useCurrency } from "../../context/CurrencyContext";
import { Plus, RefreshCw } from "lucide-react";
import { useSync } from "../../context/SyncContext";

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currency } = useCurrency();
  const { createOfflineTransaction, loadCachedOrFetch } = useSync();
  const [categories, setCategories] = useState<Category[]>([]);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [dateVal, setDateVal] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCachedOrFetch(
        "categories",
        () => categoriesApi.list(),
        (cats: Category[]) => {
          if (cats) {
            setCategories(cats);
            if (cats.length > 0 && !categoryId) {
              const firstOfType = cats.find((c) => c.type === type);
              if (firstOfType) setCategoryId(firstOfType.id);
            }
          }
        }
      ).then((cats) => {
        if (cats) {
          setCategories(cats);
          if (cats.length > 0 && !categoryId) {
            const firstOfType = cats.find((c) => c.type === type);
            if (firstOfType) setCategoryId(firstOfType.id);
          }
        }
      });
      setAmount("");
      setDescription("");
      setError(null);
    }
  }, [isOpen, type, loadCachedOrFetch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid positive amount.");
      return;
    }
    if (!description.trim()) {
      setError("Please provide a description.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createOfflineTransaction({
        amount: parseFloat(amount).toFixed(2),
        type,
        date: dateVal,
        description: description.trim(),
        category_id: categoryId || null,
      });

      onClose();
      if (onSuccess) onSuccess();
      window.dispatchEvent(new CustomEvent("mc_transaction_added"));
    } catch (err: any) {
      setError(err.message || "Failed to record transaction.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quick Add Transaction">
      {error && (
        <div
          className="badge-danger"
          style={{ padding: "8px 12px", marginBottom: "14px", borderRadius: "var(--radius-sm)" }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Type selector */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`btn btn-sm ${type === "expense" ? "btn-danger" : "btn-secondary"}`}
            style={{ flex: 1, minHeight: "44px" }}
            onClick={() => setType("expense")}
          >
            Expense
          </button>
          <button
            type="button"
            className={`btn btn-sm ${type === "income" ? "btn-success" : "btn-secondary"}`}
            style={{ flex: 1, minHeight: "44px" }}
            onClick={() => setType("income")}
          >
            Income
          </button>
        </div>

        {/* Amount */}
        <div className="input-group">
          <label className="input-label">Amount ({currency})</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            className="input-field"
            style={{ fontSize: "18px", fontWeight: 700 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className="input-group">
          <label className="input-label">Description / Merchant</label>
          <input
            type="text"
            required
            placeholder="e.g. Grocery store, Uber, Salary"
            className="input-field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Category */}
        <div className="input-group">
          <label className="input-label">Category</label>
          <select
            className="input-field"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">(None / General)</option>
            {categories
              .filter((c) => c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>

        {/* Date */}
        <div className="input-group">
          <label className="input-label">Date</label>
          <input
            type="date"
            required
            className="input-field"
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-2" style={{ marginTop: "8px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ minHeight: "44px" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary flex items-center gap-2"
            style={{ minHeight: "44px" }}
          >
            {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
            <span>{submitting ? "Saving..." : "Save Transaction"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
