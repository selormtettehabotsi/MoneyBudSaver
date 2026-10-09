import React, { useState, useEffect } from "react";
import { budgetsApi } from "../api/budgets";
import { categoriesApi } from "../api/categories";
import { BudgetProgress, Category } from "../types/finance";
import { useCurrency } from "../context/CurrencyContext";
import { useSync } from "../context/SyncContext";
import { useToast } from "../context/ToastContext";
import { Icon } from "../components/common/Icon";
import { Modal } from "../components/common/Modal";
import { Button } from "../components/common/Button";
import { EmptyState } from "../components/common/EmptyState";
import { MoneyInput } from "../components/common/MoneyInput";
import { Badge } from "../components/common/Badge";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  PieChart,
  Calendar,
} from "lucide-react";
import { Skeleton } from "../components/common/Skeleton";

export const BudgetsPage: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { loadCachedOrFetch, isOnline } = useSync();
  const { success: toastSuccess, warning: toastWarning } = useToast();

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
  const [submitting, setSubmitting] = useState(false);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const availableIcons = [
    "Tag", "Cart", "Home", "Briefcase", "Trending", "Entertainment",
    "Education", "Savings", "Debt", "Bills", "Coffee", "Utensils",
    "Car", "Heart", "Zap"
  ];

  const availableColors = [
    "#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e",
    "#8b5cf6", "#ec4899", "#14b8a6", "#3b82f6", "#84cc16"
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      const [budgetList, catList] = await Promise.all([
        loadCachedOrFetch(`budgets_${year}_${month}`, () => budgetsApi.list(month, year), (c) => { if (c) setBudgets(c); }),
        loadCachedOrFetch("categories", () => categoriesApi.list(), (c) => { if (c) setCategories(c); }),
      ]);
      if (budgetList) setBudgets(budgetList);
      if (catList) setCategories(catList);
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

  const handleOpenBudgetModal = (categoryIdToEdit?: string, currentLimit?: string) => {
    if (!isOnline) {
      toastWarning("Setting budgets requires an active internet connection.");
      return;
    }
    setSelectedCategoryId(categoryIdToEdit || (categories.find(c => c.type === "expense")?.id || ""));
    setAmountLimit(currentLimit || "");
    setModalError(null);
    setIsBudgetModalOpen(true);
  };

  const handleOpenCategoryModal = () => {
    if (!isOnline) {
      toastWarning("Creating categories requires an active internet connection.");
      return;
    }
    setCategoryName("");
    setCategoryType("expense");
    setCategoryColor("#6366f1");
    setCategoryIcon("tag");
    setModalError(null);
    setIsCategoryModalOpen(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const parsed = parseFloat(amountLimit);
    if (!parsed || isNaN(parsed) || parsed <= 0) {
      setModalError("Please enter a valid monthly limit greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      await budgetsApi.setLimit({
        category_id: selectedCategoryId,
        month,
        year,
        amount_limit: amountLimit,
      });
      setIsBudgetModalOpen(false);
      toastSuccess("Budget limit saved.");
      loadData();
    } catch (err: any) {
      setModalError(err.message || "Failed to save budget limit.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!categoryName.trim()) {
      setModalError("Category name is required.");
      return;
    }

    setSubmitting(true);
    try {
      await categoriesApi.create({
        name: categoryName.trim(),
        type: categoryType,
        color_hex: categoryColor,
        icon_name: categoryIcon,
      });
      setIsCategoryModalOpen(false);
      toastSuccess(`Category "${categoryName}" created.`);
      loadData();
    } catch (err: any) {
      setModalError(err.message || "Failed to create category.");
    } finally {
      setSubmitting(false);
    }
  };

  // Summaries
  const totalBudgeted = budgets.reduce((acc, b) => acc + parseFloat(b.amount_limit || "0"), 0);
  const totalSpent = budgets.reduce((acc, b) => acc + parseFloat(b.actual_spent || "0"), 0);
  const totalPercentage = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      {/* Month Switcher & Actions Strip */}
      <div
        className="glass-panel"
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous Month"
            className="btn-icon"
            style={{ width: "36px", height: "36px", minWidth: "36px", minHeight: "36px" }}
          >
            <ChevronLeft size={18} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Calendar size={18} style={{ color: "var(--accent-primary)" }} />
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>
              {monthNames[month - 1]} {year}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next Month"
            className="btn-icon"
            style={{ width: "36px", height: "36px", minWidth: "36px", minHeight: "36px" }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleOpenCategoryModal}
            icon={<FolderPlus size={15} />}
            disabled={!isOnline}
            title={!isOnline ? "Network required" : undefined}
          >
            New Category
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleOpenBudgetModal()}
            icon={<Plus size={15} />}
            disabled={!isOnline}
            title={!isOnline ? "Network required" : undefined}
          >
            Set Budget Limit
          </Button>
        </div>
      </div>

      {/* Overall Month Spending Summary Bar */}
      {budgets.length > 0 && (
        <div
          className="glass-panel"
          style={{
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", gap: "16px", alignItems: "baseline" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                Total Budgeted: <strong className="tabular-nums" style={{ color: "var(--text-primary)" }}>{formatMoney(totalBudgeted)}</strong>
              </span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                Total Spent: <strong className="tabular-nums" style={{ color: totalPercentage > 100 ? "var(--danger)" : "var(--text-primary)" }}>{formatMoney(totalSpent)}</strong>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Badge
                variant={totalPercentage > 100 ? "danger" : totalPercentage >= 80 ? "warning" : "success"}
                size="sm"
              >
                {totalPercentage.toFixed(0)}% Utilized
              </Badge>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {totalBudgeted >= totalSpent
                  ? `${formatMoney(totalBudgeted - totalSpent)} remaining`
                  : `${formatMoney(totalSpent - totalBudgeted)} over budget`}
              </span>
            </div>
          </div>

          <div className="progress-bar-bg" style={{ height: "8px" }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.min(100, totalPercentage)}%`,
                background:
                  totalPercentage > 100
                    ? "var(--danger)"
                    : totalPercentage >= 80
                    ? "var(--warning)"
                    : "var(--accent-primary)",
              }}
            />
          </div>
        </div>
      )}

      {/* Budget Cards Grid */}
      {loading && budgets.length === 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
            gap: "16px",
          }}
        >
          <Skeleton height="180px" borderRadius="var(--radius-lg)" />
          <Skeleton height="180px" borderRadius="var(--radius-lg)" />
        </div>
      ) : budgets.length === 0 ? (
        <EmptyState
          icon={<PieChart size={28} />}
          title={`No budgets set for ${monthNames[month - 1]} ${year}`}
          description="Establish monthly spending thresholds for your expenses to track burn and maintain financial discipline."
          actionLabel="Set Budget Limit"
          onAction={() => handleOpenBudgetModal()}
          secondaryActionLabel="Create Category"
          onSecondaryAction={handleOpenCategoryModal}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
            gap: "16px",
          }}
        >
          {budgets.map((b) => {
            const spentNum = parseFloat(b.actual_spent || "0");
            const limitNum = parseFloat(b.amount_limit || "0");
            const pct = limitNum > 0 ? (spentNum / limitNum) * 100 : 0;
            const remaining = limitNum - spentNum;
            const isOver = pct > 100;
            const isNear = pct >= 80 && !isOver;

            return (
              <div
                key={b.category_id}
                className="glass-panel"
                style={{
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "14px",
                  borderColor: isOver ? "var(--danger-border)" : isNear ? "var(--warning-border)" : "var(--border-color)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "10px",
                          background: `${b.category_color || "#6366f1"}22`,
                          color: b.category_color || "#6366f1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={b.category_icon || "Tag"} size={18} color={b.category_color} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                          {b.category_name}
                        </h4>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {isOver ? "Limit Exceeded" : `${formatMoney(Math.max(0, remaining))} left`}
                        </span>
                      </div>
                    </div>

                    <Badge
                      variant={isOver ? "danger" : isNear ? "warning" : "success"}
                      size="sm"
                    >
                      {pct.toFixed(0)}% Used
                    </Badge>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                    <span className="tabular-nums" style={{ fontSize: "18px", fontWeight: 700, color: isOver ? "var(--danger)" : "var(--text-primary)" }}>
                      {formatMoney(spentNum)}
                    </span>
                    <span className="tabular-nums" style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                      of {formatMoney(limitNum)}
                    </span>
                  </div>

                  <div className="progress-bar-bg" style={{ height: "6px" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.max(1, pct))}%`,
                        background: isOver
                          ? "var(--danger)"
                          : isNear
                          ? "var(--warning)"
                          : b.category_color || "var(--accent-primary)",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenBudgetModal(b.category_id, b.amount_limit)}
                    disabled={!isOnline}
                  >
                    Adjust Limit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Set Budget Limit Modal */}
      <Modal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        title={`Set Budget Limit · ${monthNames[month - 1]} ${year}`}
      >
        <form onSubmit={handleSaveBudget} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {modalError && (
            <div className="badge badge-danger" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
              {modalError}
            </div>
          )}

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

          <MoneyInput
            label="Monthly Limit Amount"
            value={amountLimit}
            onChange={(val) => setAmountLimit(val)}
            placeholder="500.00"
            required
            autoFocus
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <Button type="button" variant="secondary" onClick={() => setIsBudgetModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Save Budget Limit
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Category Modal */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Create New Category"
      >
        <form onSubmit={handleSaveCategory} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {modalError && (
            <div className="badge badge-danger" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
              {modalError}
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Category Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Subscriptions & Software, Cloud Hosting"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="input-group">
            <label className="input-label">Type</label>
            <select
              className="input-field"
              value={categoryType}
              onChange={(e) => setCategoryType(e.target.value as "income" | "expense")}
            >
              <option value="expense">Expense Category</option>
              <option value="income">Income Category</option>
            </select>
          </div>

          {/* Color Swatches */}
          <div className="input-group">
            <label className="input-label">Color Theme</label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", padding: "4px 0" }}>
              {availableColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCategoryColor(color)}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: color,
                    border: categoryColor === color ? "3px solid #ffffff" : "1px solid transparent",
                    boxShadow: categoryColor === color ? "0 0 8px rgba(0,0,0,0.4)" : "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Icon Picker */}
          <div className="input-group">
            <label className="input-label">Category Icon</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "8px",
                maxHeight: "160px",
                overflowY: "auto",
                padding: "4px",
              }}
            >
              {availableIcons.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setCategoryIcon(ic)}
                  className="btn-icon"
                  style={{
                    width: "100%",
                    height: "40px",
                    background: categoryIcon === ic ? "var(--accent-primary-glow)" : "var(--bg-surface-solid)",
                    border: categoryIcon === ic ? "1px solid var(--accent-primary)" : "1px solid var(--border-color)",
                    color: categoryIcon === ic ? "var(--accent-primary)" : "var(--text-secondary)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <Icon name={ic} size={18} />
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <Button type="button" variant="secondary" onClick={() => setIsCategoryModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Create Category
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
