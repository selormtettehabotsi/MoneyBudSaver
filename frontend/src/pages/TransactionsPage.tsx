import React, { useState, useEffect } from "react";
import { transactionsApi, TransactionFilterParams } from "../api/transactions";
import { categoriesApi } from "../api/categories";
import { Transaction, Category, TransactionType } from "../types/finance";
import { useCurrency } from "../context/CurrencyContext";
import { Icon } from "../components/common/Icon";
import { Modal } from "../components/common/Modal";
import {
  PlusCircle,
  Search,
  Trash2,
  Edit2,
  Filter,
} from "lucide-react";

export const TransactionsPage: React.FC = () => {
  const { formatMoney } = useCurrency();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
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

  const loadCategories = async () => {
    try {
      const cats = await categoriesApi.list();
      setCategories(cats);
    } catch {}
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await transactionsApi.list(filters);
      setTransactions(res.items);
      setTotalIncome(res.total_income);
      setTotalExpense(res.total_expense);
      setNetAmount(res.net_amount);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [filters]);

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
    if (!window.confirm("Are you sure you want to delete this transaction?")) return;
    try {
      await transactionsApi.delete(id);
      loadTransactions();
    } catch (err: any) {
      alert(err.message || "Failed to delete transaction.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      if (editingTx) {
        await transactionsApi.update(editingTx.id, {
          amount,
          type,
          date: dateVal,
          description,
          category_id: categoryId || null,
        });
      } else {
        await transactionsApi.create({
          amount,
          type,
          date: dateVal,
          description,
          category_id: categoryId || null,
        });
      }
      setIsModalOpen(false);
      loadTransactions();
    } catch (err: any) {
      setFormError(err.message || "Failed to save transaction.");
    }
  };

  const filteredCategories = categories.filter((c) => c.type === type);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "26px" }}>Transactions</h1>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Log and categorize every inflow and outflow
          </span>
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
          <PlusCircle size={15} />
          <span>Add Transaction</span>
        </button>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel" style={{ padding: "14px 18px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Total Income</span>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--success)", marginTop: "4px" }}>
            +{formatMoney(totalIncome)}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "14px 18px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Total Expenses</span>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--danger)", marginTop: "4px" }}>
            -{formatMoney(totalExpense)}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "14px 18px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Net Balance</span>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: parseFloat(netAmount) >= 0 ? "var(--accent-secondary)" : "var(--danger)",
              marginTop: "4px",
            }}
          >
            {parseFloat(netAmount) >= 0 ? "+" : ""}
            {formatMoney(netAmount)}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="glass-panel flex items-center gap-3" style={{ padding: "12px 16px", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <input
            type="text"
            className="input-field"
            placeholder="Search description..."
            value={filters.search || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            style={{ paddingLeft: "36px", paddingRight: "12px" }}
          />
          <Search size={16} style={{ position: "absolute", left: "12px", top: "13px", color: "var(--text-muted)" }} />
        </div>

        {/* Type Filter */}
        <select
          className="input-field"
          style={{ width: "auto", minWidth: "130px" }}
          value={filters.type || ""}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, type: (e.target.value as TransactionType) || undefined }))
          }
        >
          <option value="">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>

        {/* Category Filter */}
        <select
          className="input-field"
          style={{ width: "auto", minWidth: "160px" }}
          value={filters.category_id || ""}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, category_id: e.target.value || undefined }))
          }
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
      </div>

      {/* Transactions List */}
      <div className="glass-panel" style={{ padding: "16px 20px" }}>
        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
            Loading transactions...
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }} className="flex flex-col items-center gap-2">
            <Filter size={32} style={{ opacity: 0.4 }} />
            <p>No transactions found matching your filter criteria.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {transactions.map((tx) => {
              const isIncome = tx.type === "income";
              const catColor = tx.category?.color_hex || "#6366f1";
              const catIcon = tx.category?.icon_name || (isIncome ? "trending-up" : "shopping-cart");

              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-surface-solid)",
                    border: "1px solid var(--border-color)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Left info */}
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: `${catColor}20`,
                        color: catColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name={catIcon} size={18} color={catColor} />
                    </div>

                    <div className="flex flex-col">
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{tx.description}</span>
                      <div className="flex items-center gap-2" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        <span>{tx.date}</span>
                        <span>•</span>
                        <span style={{ color: catColor, fontWeight: 500 }}>
                          {tx.category?.name || "Uncategorized"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Amount & Actions */}
                  <div className="flex items-center gap-4">
                    <span
                      style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        color: isIncome ? "var(--success)" : "var(--text-primary)",
                      }}
                    >
                      {isIncome ? "+" : "-"}
                      {formatMoney(tx.amount)}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(tx)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          padding: "6px",
                        }}
                        title="Edit"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--danger)",
                          cursor: "pointer",
                          padding: "6px",
                        }}
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTx ? "Edit Transaction" : "New Transaction"}
      >
        {formError && (
          <div className="badge-danger" style={{ padding: "8px 12px", marginBottom: "14px", borderRadius: "var(--radius-sm)" }}>
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Type switcher */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`btn btn-sm ${type === "expense" ? "btn-danger" : "btn-secondary"}`}
              style={{ flex: 1 }}
              onClick={() => {
                setType("expense");
                setCategoryId("");
              }}
            >
              Expense
            </button>
            <button
              type="button"
              className={`btn btn-sm ${type === "income" ? "btn-success" : "btn-secondary"}`}
              style={{ flex: 1 }}
              onClick={() => {
                setType("income");
                setCategoryId("");
              }}
            >
              Income
            </button>
          </div>

          <div className="input-group">
            <label className="input-label">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              className="input-field"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Description</label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="e.g. Supermarket Grocery"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Category</label>
            <select
              className="input-field"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select a Category</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

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

          <button type="submit" className="btn btn-primary" style={{ marginTop: "10px" }}>
            {editingTx ? "Save Changes" : "Create Transaction"}
          </button>
        </form>
      </Modal>
    </div>
  );
};
