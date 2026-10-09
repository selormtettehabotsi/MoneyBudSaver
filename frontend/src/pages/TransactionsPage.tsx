import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { transactionsApi, TransactionFilterParams } from "../api/transactions";
import { categoriesApi } from "../api/categories";
import { Transaction, Category, TransactionType, TransactionListResponse } from "../types/finance";
import { useCurrency } from "../context/CurrencyContext";
import { useSync } from "../context/SyncContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmDialogContext";
import { Icon } from "../components/common/Icon";
import { Modal } from "../components/common/Modal";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { EmptyState } from "../components/common/EmptyState";
import { MoneyInput } from "../components/common/MoneyInput";
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  Clock,
  TrendingUp,
  TrendingDown,
  Wallet,
  ReceiptText,
} from "lucide-react";
import { Skeleton } from "../components/common/Skeleton";

export const TransactionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const { isOnline, loadCachedOrFetch, createOfflineTransaction, outboxItems } = useSync();
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();
  const { confirm } = useConfirm();

  const [transactions, setTransactions] = useState<(Transaction & { is_pending_sync?: boolean })[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Summaries
  const [totalIncome, setTotalIncome] = useState<string>("0.00");
  const [totalExpense, setTotalExpense] = useState<string>("0.00");
  const [netAmount, setNetAmount] = useState<string>("0.00");

  // Filters
  const [filters, setFilters] = useState<TransactionFilterParams>({
    type: undefined,
    category_id: undefined,
    search: "",
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // Form Fields
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [dateVal, setDateVal] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await loadCachedOrFetch(
        "categories",
        () => categoriesApi.list(),
        (updatedCats: Category[]) => {
          if (updatedCats) setCategories(updatedCats);
        }
      );
      if (cats) setCategories(cats);
    } catch {}
  }, [loadCachedOrFetch]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadCachedOrFetch(
        "transactions",
        () => transactionsApi.list(filters),
        (updated: TransactionListResponse) => {
          if (updated && updated.items) {
            setTransactions(updated.items);
            setTotalIncome(updated.total_income);
            setTotalExpense(updated.total_expense);
            setNetAmount(updated.net_amount);
          }
        }
      );
      if (res && res.items) {
        setTransactions(res.items);
        setTotalIncome(res.total_income);
        setTotalExpense(res.total_expense);
        setNetAmount(res.net_amount);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, loadCachedOrFetch]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Refresh when quick add or outbox changes
  useEffect(() => {
    const handleTxAdded = () => loadTransactions();
    window.addEventListener("mc_transaction_added", handleTxAdded);
    return () => window.removeEventListener("mc_transaction_added", handleTxAdded);
  }, [loadTransactions]);

  // Combine live transactions with pending offline items
  const allTransactions = useMemo(() => {
    const pendingList: (Transaction & { is_pending_sync?: boolean })[] = outboxItems.map((item) => ({
      id: item.client_id,
      amount: String(item.payload.amount),
      type: item.payload.type,
      description: item.payload.description,
      category_id: item.payload.category_id,
      date: item.payload.date,
      created_at: item.created_at,
      user_id: item.user_id,
      is_recurring: item.payload.is_recurring || false,
      tags: item.payload.tags || [],
      is_pending_sync: true,
    }));

    return [...pendingList, ...transactions];
  }, [transactions, outboxItems]);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups: { dateLabel: string; items: typeof allTransactions }[] = [];
    const map = new Map<string, typeof allTransactions>();

    const todayStr = new Date().toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    for (const tx of allTransactions) {
      const d = tx.date;
      if (!map.has(d)) {
        map.set(d, []);
      }
      map.get(d)!.push(tx);
    }

    // Sort dates descending
    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    for (const d of sortedDates) {
      let label = d;
      if (d === todayStr) label = "Today";
      else if (d === yesterdayStr) label = "Yesterday";
      else {
        try {
          const parsed = new Date(d + "T00:00:00");
          label = parsed.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: parsed.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
          });
        } catch {
          label = d;
        }
      }

      groups.push({ dateLabel: label, items: map.get(d)! });
    }

    return groups;
  }, [allTransactions]);

  const handleOpenCreate = () => {
    setEditingTx(null);
    setAmount("");
    setType("expense");
    setDateVal(new Date().toISOString().split("T")[0]);
    setDescription("");
    setCategoryId("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tx: Transaction) => {
    if (!isOnline) {
      toastWarning("Editing existing transactions requires an active server connection.");
      return;
    }
    setEditingTx(tx);
    setAmount(tx.amount);
    setType(tx.type);
    setDateVal(tx.date);
    setDescription(tx.description);
    setCategoryId(tx.category_id || "");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!isOnline) {
      toastWarning("Deleting transactions requires an active server connection.");
      return;
    }

    const confirmed = await confirm({
      title: "Delete Transaction?",
      message: "Are you sure you want to permanently remove this transaction from your records?",
      confirmText: "Delete",
      cancelText: "Cancel",
      isDanger: true,
    });

    if (!confirmed) return;

    try {
      await transactionsApi.delete(id);
      toastSuccess("Transaction deleted.");
      loadTransactions();
    } catch (err: any) {
      toastError(err.message || "Failed to delete transaction.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedAmt = parseFloat(amount);
    if (!parsedAmt || isNaN(parsedAmt) || parsedAmt <= 0) {
      setFormError("Please enter a valid amount greater than zero.");
      return;
    }

    if (!description.trim()) {
      setFormError("Description is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingTx) {
        await transactionsApi.update(editingTx.id, {
          amount,
          type,
          date: dateVal,
          description: description.trim(),
          category_id: categoryId || null,
        });
        toastSuccess("Transaction updated.");
      } else {
        await createOfflineTransaction({
          amount,
          type,
          date: dateVal,
          description: description.trim(),
          category_id: categoryId || null,
        });
        toastSuccess(isOnline ? "Transaction created." : "Queued to offline outbox.");
      }
      setIsModalOpen(false);
      loadTransactions();
    } catch (err: any) {
      setFormError(err.message || "Failed to save transaction.");
    } finally {
      setSubmitting(false);
    }
  };

  const netNum = parseFloat(netAmount);
  const isNetPositive = netNum >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      {/* 1. Compact Summary Strip in One Row on Desktop */}
      <div
        className="glass-panel"
        style={{
          padding: "16px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "var(--success-bg)",
              color: "var(--success)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <TrendingUp size={20} />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Total Income
            </div>
            <div className="tabular-nums" style={{ fontSize: "18px", fontWeight: 700, color: "var(--success)" }}>
              +{formatMoney(totalIncome)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "var(--danger-bg)",
              color: "var(--danger)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <TrendingDown size={20} />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Total Expenses
            </div>
            <div className="tabular-nums" style={{ fontSize: "18px", fontWeight: 700, color: "var(--danger)" }}>
              -{formatMoney(totalExpense)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: isNetPositive ? "var(--success-bg)" : "var(--danger-bg)",
              color: isNetPositive ? "var(--success)" : "var(--danger)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Wallet size={20} />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Net Balance
            </div>
            <div
              className="tabular-nums"
              style={{
                fontSize: "18px",
                fontWeight: 800,
                color: isNetPositive ? "var(--success)" : "var(--danger)",
              }}
            >
              {isNetPositive ? "+" : ""}
              {formatMoney(netAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Unified Toolbar on One Line */}
      <div
        className="glass-panel"
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 320px", flexWrap: "wrap" }}>
          {/* Search Box */}
          <div style={{ position: "relative", flex: "1 1 180px" }}>
            <input
              type="text"
              placeholder="Search description..."
              className="input-field"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              style={{ paddingLeft: "36px", height: "40px", minHeight: "40px", fontSize: "14px" }}
            />
            <Search
              size={16}
              style={{ position: "absolute", left: "12px", top: "12px", color: "var(--text-muted)" }}
            />
          </div>

          {/* Type Filter Select */}
          <select
            className="input-field"
            value={filters.type || ""}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                type: (e.target.value as TransactionType) || undefined,
              }))
            }
            style={{ width: "auto", minWidth: "120px", height: "40px", minHeight: "40px", fontSize: "14px" }}
          >
            <option value="">All Types</option>
            <option value="income">Income Only</option>
            <option value="expense">Expense Only</option>
          </select>

          {/* Category Filter Select */}
          <select
            className="input-field"
            value={filters.category_id || ""}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                category_id: e.target.value || undefined,
              }))
            }
            style={{ width: "auto", minWidth: "150px", height: "40px", minHeight: "40px", fontSize: "14px" }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleOpenCreate}
          icon={<Plus size={16} />}
        >
          Add Transaction
        </Button>
      </div>

      {/* 3. Transaction List Grouped by Date */}
      {loading && allTransactions.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Skeleton height="64px" borderRadius="var(--radius-lg)" />
          <Skeleton height="64px" borderRadius="var(--radius-lg)" />
          <Skeleton height="64px" borderRadius="var(--radius-lg)" />
        </div>
      ) : groupedTransactions.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={26} />}
          title="No transactions found"
          description="You haven't recorded any transactions matching your filters yet."
          actionLabel="Add Transaction"
          onAction={handleOpenCreate}
          secondaryActionLabel="Import CSV Statement"
          onSecondaryAction={() => navigate("/data")}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {groupedTransactions.map((group) => (
            <div key={group.dateLabel} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  paddingLeft: "4px",
                }}
              >
                {group.dateLabel}
              </div>

              <div
                className="glass-panel"
                style={{
                  padding: "0",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {group.items.map((tx, idx) => {
                  const cat = categories.find((c) => c.id === tx.category_id);
                  const isExp = tx.type === "expense";

                  return (
                    <div
                      key={tx.id}
                      style={{
                        padding: "14px 18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom:
                          idx < group.items.length - 1 ? "1px solid var(--border-color)" : "none",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "10px",
                            background: cat ? `${cat.color_hex}22` : "var(--bg-surface-solid)",
                            color: cat?.color_hex || "var(--text-muted)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon name={cat?.icon_name || "Tag"} size={18} color={cat?.color_hex} />
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "14px",
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {tx.description}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                              {cat?.name || "Uncategorized"}
                            </span>
                            {tx.is_pending_sync && (
                              <Badge variant="warning" size="sm" icon={<Clock size={10} />}>
                                Waiting to sync
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
                        <span
                          className="tabular-nums"
                          style={{
                            fontSize: "15px",
                            fontWeight: 700,
                            color: isExp ? "var(--danger)" : "var(--success)",
                          }}
                        >
                          {isExp ? "-" : "+"}
                          {formatMoney(tx.amount)}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(tx)}
                            disabled={!isOnline || !!tx.is_pending_sync}
                            title={
                              !isOnline
                                ? "Editing requires network connection"
                                : tx.is_pending_sync
                                ? "Item pending sync"
                                : "Edit Transaction"
                            }
                            className="btn-icon"
                            style={{
                              width: "32px",
                              height: "32px",
                              minWidth: "32px",
                              minHeight: "32px",
                              opacity: !isOnline || tx.is_pending_sync ? 0.4 : 1,
                              cursor: !isOnline || tx.is_pending_sync ? "not-allowed" : "pointer",
                            }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(tx.id)}
                            disabled={!isOnline || !!tx.is_pending_sync}
                            title={
                              !isOnline
                                ? "Deleting requires network connection"
                                : tx.is_pending_sync
                                ? "Item pending sync"
                                : "Delete Transaction"
                            }
                            className="btn-icon"
                            style={{
                              width: "32px",
                              height: "32px",
                              minWidth: "32px",
                              minHeight: "32px",
                              color: "var(--danger)",
                              opacity: !isOnline || tx.is_pending_sync ? 0.4 : 1,
                              cursor: !isOnline || tx.is_pending_sync ? "not-allowed" : "pointer",
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. New / Edit Transaction Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTx ? "Edit Transaction" : "Record New Transaction"}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {formError && (
            <div
              className="badge badge-danger"
              style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: "13px" }}
            >
              {formError}
            </div>
          )}

          {/* Type Toggle: Expense / Income */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              background: "var(--bg-surface-solid)",
              padding: "4px",
              borderRadius: "var(--radius-md)",
            }}
          >
            <button
              type="button"
              onClick={() => setType("expense")}
              style={{
                padding: "8px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                background: type === "expense" ? "var(--danger-bg)" : "transparent",
                color: type === "expense" ? "var(--danger)" : "var(--text-muted)",
                transition: "all 0.15s ease",
              }}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              style={{
                padding: "8px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                background: type === "income" ? "var(--success-bg)" : "transparent",
                color: type === "income" ? "var(--success)" : "var(--text-muted)",
                transition: "all 0.15s ease",
              }}
            >
              Income
            </button>
          </div>

          {/* Amount using MoneyInput */}
          <MoneyInput
            label="Amount"
            value={amount}
            onChange={(val) => setAmount(val)}
            placeholder="0.00"
            required
            autoFocus
          />

          {/* Description */}
          <div className="input-group">
            <label className="input-label">Description / Merchant</label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="e.g. Supermarket Grocery, Freelance Payment"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Category Dropdown */}
          <div className="input-group">
            <label className="input-label">Category</label>
            <select
              className="input-field"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Uncategorized</option>
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
            <label className="input-label">Transaction Date</label>
            <input
              type="date"
              required
              className="input-field"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {editingTx ? "Save Changes" : "Create Transaction"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
