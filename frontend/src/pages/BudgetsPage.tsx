import React, { useState, useEffect } from "react";
import { budgetsApi } from "../api/budgets";
import { categoriesApi } from "../api/categories";
import { BudgetProgress, Category } from "../types/finance";
import { useCurrency } from "../context/CurrencyContext";
import { Icon } from "../components/common/Icon";
import { Modal } from "../components/common/Modal";
import { PlusCircle, ChevronLeft, ChevronRight, FolderPlus } from "lucide-react";

export const BudgetsPage: React.FC = () => {
  const { formatMoney } = useCurrency();
  const today = new Date();
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [year, setYear] = useState<number>(today.getFullYear());

  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Budget Modal
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [amountLimit, setAmountLimit] = useState("");

  // Category Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<"income" | "expense">("expense");
  const [categoryColor, setCategoryColor] = useState("#6366f1");
  const [categoryIcon, setCategoryIcon] = useState("tag");

  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [budgetList, catList] = await Promise.all([
        budgetsApi.list(month, year),
        categoriesApi.list(),
      ]);
      setBudgets(budgetList);
      setCategories(catList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [month, year]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      await budgetsApi.setLimit({
        category_id: selectedCategoryId,
        month,
        year,
        amount_limit: amountLimit,
      });
      setIsBudgetModalOpen(false);
      loadData();
    } catch (err: any) {
      setModalError(err.message || "Failed to save budget limit.");
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      await categoriesApi.create({
        name: categoryName,
        type: categoryType,
        color_hex: categoryColor,
        icon_name: categoryIcon,
      });
      setIsCategoryModalOpen(false);
      setCategoryName("");
      loadData();
    } catch (err: any) {
      setModalError(err.message || "Failed to create category.");
    }
  };

  const monthName = new Date(year, month - 1, 1).toLocaleString("default", { month: "long" });

  const totalBudgeted = budgets.reduce((acc, b) => acc + parseFloat(b.amount_limit || "0"), 0);
  const totalSpent = budgets.reduce((acc, b) => acc + parseFloat(b.actual_spent || "0"), 0);
  const overallUsedPct = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header & Controls */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "26px" }}>Budgets & Spending Limits</h1>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Control expenses per category and avoid overspending
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn btn-secondary btn-sm" onClick={() => setIsCategoryModalOpen(true)}>
            <FolderPlus size={15} />
            <span>New Category</span>
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setSelectedCategoryId(categories[0]?.id || "");
              setAmountLimit("");
              setModalError(null);
              setIsBudgetModalOpen(true);
            }}
          >
            <PlusCircle size={15} />
            <span>Set Budget Limit</span>
          </button>
        </div>
      </div>

      {/* Month Navigator & Summary Bar */}
      <div className="glass-panel flex items-center justify-between" style={{ padding: "16px 20px" }}>
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary btn-sm" onClick={handlePrevMonth}>
            <ChevronLeft size={16} />
          </button>
          <h3 style={{ fontSize: "18px", minWidth: "160px", textAlign: "center" }}>
            {monthName} {year}
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={handleNextMonth}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-6" style={{ fontSize: "13px" }}>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Budgeted: </span>
            <strong style={{ color: "var(--text-primary)" }}>{formatMoney(totalBudgeted)}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Spent: </span>
            <strong style={{ color: totalSpent > totalBudgeted ? "var(--danger)" : "var(--text-primary)" }}>
              {formatMoney(totalSpent)}
            </strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Total Used: </span>
            <strong style={{ color: overallUsedPct > 100 ? "var(--danger)" : "var(--success)" }}>
              {overallUsedPct.toFixed(0)}%
            </strong>
          </div>
        </div>
      </div>

      {/* Budgets Grid */}
      <div className="grid grid-cols-2 gap-4">
        {loading ? (
          <div style={{ gridColumn: "1 / -1", padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
            Loading monthly budgets...
          </div>
        ) : budgets.length === 0 ? (
          <div
            className="glass-panel"
            style={{
              gridColumn: "1 / -1",
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            No category budgets set for {monthName} {year}. Click "Set Budget Limit" to add one.
          </div>
        ) : (
          budgets.map((b) => {
            const isOver = b.is_over_budget;
            return (
              <div
                key={b.id}
                className="glass-panel flex flex-col justify-between"
                style={{
                  padding: "18px 20px",
                  borderColor: isOver ? "var(--danger-border)" : "var(--border-color)",
                }}
              >
                <div>
                  {/* Category info */}
                  <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
                    <div className="flex items-center gap-3">
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "8px",
                          background: `${b.category_color}25`,
                          color: b.category_color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={b.category_icon} size={18} color={b.category_color} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>
                        {b.category_name}
                      </span>
                    </div>

                    <span className={`badge ${isOver ? "badge-danger" : "badge-success"}`}>
                      {isOver ? "Over Budget" : `${b.percentage_used.toFixed(0)}% Used`}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="progress-bar-bg" style={{ height: "10px", margin: "12px 0 10px 0" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(100, b.percentage_used)}%`,
                        background: isOver ? "var(--danger)" : b.category_color,
                      }}
                    />
                  </div>
                </div>

                {/* Numbers */}
                <div className="flex items-center justify-between" style={{ fontSize: "13px", marginTop: "8px" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Spent: </span>
                    <strong style={{ color: isOver ? "var(--danger)" : "var(--text-primary)" }}>
                      {formatMoney(b.actual_spent)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Limit: </span>
                    <strong>{formatMoney(b.amount_limit)}</strong>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Set Budget Modal */}
      <Modal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        title={`Set Budget for ${monthName} ${year}`}
      >
        {modalError && (
          <div className="badge-danger" style={{ padding: "8px 12px", marginBottom: "14px", borderRadius: "var(--radius-sm)" }}>
            {modalError}
          </div>
        )}
        <form onSubmit={handleSaveBudget} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Expense Category</label>
            <select
              className="input-field"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              required
            >
              {categories
                .filter((c) => c.type === "expense")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Monthly Limit Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              className="input-field"
              value={amountLimit}
              onChange={(e) => setAmountLimit(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: "10px" }}>
            Save Budget Limit
          </button>
        </form>
      </Modal>

      {/* Create Custom Category Modal */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Create New Category"
      >
        {modalError && (
          <div className="badge-danger" style={{ padding: "8px 12px", marginBottom: "14px", borderRadius: "var(--radius-sm)" }}>
            {modalError}
          </div>
        )}
        <form onSubmit={handleSaveCategory} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Category Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Subscriptions & Software"
              className="input-field"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Type</label>
            <select
              className="input-field"
              value={categoryType}
              onChange={(e) => setCategoryType(e.target.value as any)}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="input-group">
              <label className="input-label">Color</label>
              <input
                type="color"
                className="input-field"
                style={{ padding: "4px", height: "42px", cursor: "pointer" }}
                value={categoryColor}
                onChange={(e) => setCategoryColor(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Icon Name</label>
              <select
                className="input-field"
                value={categoryIcon}
                onChange={(e) => setCategoryIcon(e.target.value)}
              >
                <option value="tag">Tag</option>
                <option value="shopping-cart">Cart</option>
                <option value="home">Home</option>
                <option value="briefcase">Briefcase</option>
                <option value="trending-up">Trending</option>
                <option value="film">Entertainment</option>
                <option value="book-open">Education</option>
                <option value="shield">Savings</option>
                <option value="credit-card">Debt</option>
                <option value="zap">Bills</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: "10px" }}>
            Create Category
          </button>
        </form>
      </Modal>
    </div>
  );
};
