import React, { useState, useEffect } from "react";
import { goalsApi } from "../api/goals";
import { SavingsGoal } from "../types/finance";
import { useCurrency } from "../context/CurrencyContext";
import { useSync } from "../context/SyncContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmDialogContext";
import { Modal } from "../components/common/Modal";
import { Button } from "../components/common/Button";
import { EmptyState } from "../components/common/EmptyState";
import { MoneyInput } from "../components/common/MoneyInput";
import { Badge } from "../components/common/Badge";
import {
  Plus,
  Target,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Edit2,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "../components/common/Skeleton";

export const GoalsPage: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { loadCachedOrFetch, isOnline } = useSync();
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();
  const { confirm } = useConfirm();

  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit Modal
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [title, setTitle] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");

  // Deposit / Withdraw Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustingGoal, setAdjustingGoal] = useState<SavingsGoal | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustIsDeposit, setAdjustIsDeposit] = useState(true);

  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const list = await loadCachedOrFetch("savings_goals", () => goalsApi.list(), (c) => { if (c) setGoals(c); });
      if (list) setGoals(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const handleOpenCreate = () => {
    if (!isOnline) {
      toastWarning("Creating goals requires an active network connection.");
      return;
    }
    setEditingGoal(null);
    setTitle("");
    setTargetAmount("");
    setCurrentAmount("0.00");
    setTargetDate("");
    setNotes("");
    setModalError(null);
    setIsGoalModalOpen(true);
  };

  const handleOpenEdit = (g: SavingsGoal) => {
    if (!isOnline) {
      toastWarning("Editing goals requires an active network connection.");
      return;
    }
    setEditingGoal(g);
    setTitle(g.title);
    setTargetAmount(g.target_amount);
    setCurrentAmount(g.current_amount);
    setTargetDate(g.target_date || "");
    setNotes(g.notes || "");
    setModalError(null);
    setIsGoalModalOpen(true);
  };

  const handleOpenAdjust = (g: SavingsGoal, isDeposit: boolean) => {
    if (!isOnline) {
      toastWarning("Adjusting goal balances requires an active network connection.");
      return;
    }
    setAdjustingGoal(g);
    setAdjustIsDeposit(isDeposit);
    setAdjustAmount("");
    setModalError(null);
    setIsAdjustModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!isOnline) {
      toastWarning("Deleting goals requires an active network connection.");
      return;
    }

    const confirmed = await confirm({
      title: "Delete Savings Goal?",
      message: "Are you sure you want to delete this savings goal? Stored progress records will be removed.",
      confirmText: "Delete",
      cancelText: "Cancel",
      isDanger: true,
    });

    if (!confirmed) return;

    try {
      await goalsApi.delete(id);
      toastSuccess("Savings goal deleted.");
      loadGoals();
    } catch (err: any) {
      toastError(err.message || "Failed to delete goal.");
    }
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const targetNum = parseFloat(targetAmount);
    if (!targetNum || isNaN(targetNum) || targetNum <= 0) {
      setModalError("Please enter a valid target amount greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingGoal) {
        await goalsApi.update(editingGoal.id, {
          title: title.trim(),
          target_amount: targetAmount,
          current_amount: currentAmount || "0.00",
          target_date: targetDate || null,
          notes: notes.trim() || undefined,
        });
        toastSuccess("Savings goal updated.");
      } else {
        await goalsApi.create({
          title: title.trim(),
          target_amount: targetAmount,
          current_amount: currentAmount || "0.00",
          target_date: targetDate || null,
          notes: notes.trim() || undefined,
        });
        toastSuccess("Savings goal created.");
      }
      setIsGoalModalOpen(false);
      loadGoals();
    } catch (err: any) {
      setModalError(err.message || "Failed to save goal.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingGoal) return;
    setModalError(null);

    const val = parseFloat(adjustAmount);
    if (!val || isNaN(val) || val <= 0) {
      setModalError("Please enter a valid amount greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const finalAmount = adjustIsDeposit ? adjustAmount : `-${adjustAmount}`;
      await goalsApi.adjust(adjustingGoal.id, finalAmount, adjustIsDeposit ? "Deposit" : "Withdrawal");
      toastSuccess(
        `${adjustIsDeposit ? "Deposited" : "Withdrew"} ${formatMoney(adjustAmount)} ${
          adjustIsDeposit ? "into" : "from"
        } "${adjustingGoal.title}".`
      );
      setIsAdjustModalOpen(false);
      loadGoals();
    } catch (err: any) {
      setModalError(err.message || "Failed to adjust balance.");
    } finally {
      setSubmitting(false);
    }
  };

  // Summaries
  const totalSaved = goals.reduce((acc, g) => acc + parseFloat(g.current_amount || "0"), 0);
  const totalTarget = goals.reduce((acc, g) => acc + parseFloat(g.target_amount || "0"), 0);
  const combinedPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      {/* Summary Strip */}
      <div
        className="glass-panel"
        style={{
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", gap: "24px", alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Total Saved in Goals
            </div>
            <div className="tabular-nums" style={{ fontSize: "22px", fontWeight: 800, color: "var(--success)" }}>
              {formatMoney(totalSaved)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Combined Target
            </div>
            <div className="tabular-nums" style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
              {formatMoney(totalTarget)}
            </div>
          </div>
          {totalTarget > 0 && (
            <Badge variant="brand" size="md">
              {combinedPct.toFixed(0)}% Overall Progress
            </Badge>
          )}
        </div>

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleOpenCreate}
          icon={<Plus size={15} />}
          disabled={!isOnline}
        >
          Create Goal
        </Button>
      </div>

      {/* Goal Cards Grid */}
      {loading && goals.length === 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          <Skeleton height="200px" borderRadius="var(--radius-lg)" />
          <Skeleton height="200px" borderRadius="var(--radius-lg)" />
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title="No savings goals created yet"
          description="Build an emergency runway buffer or set up a milestone target like a home deposit or equipment purchase."
          actionLabel="Create First Goal (e.g. Emergency Fund)"
          onAction={handleOpenCreate}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {goals.map((g) => {
            const savedNum = parseFloat(g.current_amount || "0");
            const targetNum = parseFloat(g.target_amount || "0");
            const pct = targetNum > 0 ? (savedNum / targetNum) * 100 : 0;
            const isCompleted = pct >= 100;

            return (
              <div
                key={g.id}
                className="glass-panel"
                style={{
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "16px",
                  borderColor: isCompleted ? "var(--success-border)" : "var(--border-color)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "10px",
                          background: isCompleted ? "var(--success-bg)" : "var(--accent-primary-glow)",
                          color: isCompleted ? "var(--success)" : "var(--accent-primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isCompleted ? <Sparkles size={18} /> : <Target size={18} />}
                      </div>
                      <div>
                        <h4 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                          {g.title}
                        </h4>
                        {g.target_date && (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                            <Calendar size={11} />
                            <span>Target: {new Date(g.target_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Badge variant={isCompleted ? "success" : "neutral"} size="sm">
                      {isCompleted ? "Goal Achieved!" : `${pct.toFixed(0)}% Saved`}
                    </Badge>
                  </div>

                  {g.notes && (
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "12px", lineHeight: 1.4 }}>
                      {g.notes}
                    </p>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                    <span className="tabular-nums" style={{ fontSize: "19px", fontWeight: 800, color: isCompleted ? "var(--success)" : "var(--text-primary)" }}>
                      {formatMoney(savedNum)}
                    </span>
                    <span className="tabular-nums" style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                      Target: {formatMoney(targetNum)}
                    </span>
                  </div>

                  <div className="progress-bar-bg" style={{ height: "8px" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.max(1, pct))}%`,
                        background: isCompleted
                          ? "linear-gradient(90deg, #10b981 0%, #059669 100%)"
                          : "var(--accent-primary)",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderTop: "1px solid var(--border-color)",
                    paddingTop: "12px",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", gap: "6px" }}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenAdjust(g, true)}
                      icon={<ArrowUpRight size={14} style={{ color: "var(--success)" }} />}
                      disabled={!isOnline}
                    >
                      Deposit
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenAdjust(g, false)}
                      icon={<ArrowDownLeft size={14} style={{ color: "var(--warning)" }} />}
                      disabled={!isOnline || savedNum <= 0}
                    >
                      Withdraw
                    </Button>
                  </div>

                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(g)}
                      aria-label="Edit Goal"
                      disabled={!isOnline}
                      className="btn-icon"
                      style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px" }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(g.id)}
                      aria-label="Delete Goal"
                      disabled={!isOnline}
                      className="btn-icon"
                      style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px", color: "var(--danger)" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Goal Modal */}
      <Modal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        title={editingGoal ? "Edit Savings Goal" : "Create New Savings Goal"}
      >
        <form onSubmit={handleSaveGoal} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {modalError && (
            <div className="badge badge-danger" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
              {modalError}
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Goal Title</label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="e.g. Emergency Fund (6 Months), New Laptop"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <MoneyInput
            label="Target Amount"
            value={targetAmount}
            onChange={(val) => setTargetAmount(val)}
            placeholder="5000.00"
            required
          />

          {!editingGoal && (
            <MoneyInput
              label="Initial Amount Saved"
              value={currentAmount}
              onChange={(val) => setCurrentAmount(val)}
              placeholder="0.00"
            />
          )}

          <div className="input-group">
            <label className="input-label">Target Completion Date (Optional)</label>
            <input
              type="date"
              className="input-field"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Notes (Optional)</label>
            <textarea
              className="input-field"
              placeholder="Purpose, account location, or motivation"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ minHeight: "64px" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <Button type="button" variant="secondary" onClick={() => setIsGoalModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {editingGoal ? "Save Changes" : "Create Goal"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deposit / Withdraw Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title={adjustIsDeposit ? `Deposit to "${adjustingGoal?.title}"` : `Withdraw from "${adjustingGoal?.title}"`}
      >
        <form onSubmit={handleSaveAdjust} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {modalError && (
            <div className="badge badge-danger" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
              {modalError}
            </div>
          )}

          <div
            style={{
              padding: "12px 14px",
              background: "var(--bg-surface-solid)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "13px",
            }}
          >
            <span style={{ color: "var(--text-secondary)" }}>Current Saved Balance:</span>
            <strong className="tabular-nums">{formatMoney(adjustingGoal?.current_amount || "0")}</strong>
          </div>

          <MoneyInput
            label={adjustIsDeposit ? "Deposit Amount" : "Withdraw Amount"}
            value={adjustAmount}
            onChange={(val) => setAdjustAmount(val)}
            placeholder="100.00"
            required
            autoFocus
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <Button type="button" variant="secondary" onClick={() => setIsAdjustModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={adjustIsDeposit ? "primary" : "secondary"}
              loading={submitting}
            >
              {adjustIsDeposit ? "Confirm Deposit" : "Confirm Withdrawal"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
