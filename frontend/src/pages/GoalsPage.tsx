import React, { useState, useEffect } from "react";
import { goalsApi } from "../api/goals";
import { SavingsGoal } from "../types/finance";
import { useCurrency } from "../context/CurrencyContext";
import { Modal } from "../components/common/Modal";
import { PlusCircle, Target, ArrowUpRight, ArrowDownLeft, Trash2, Edit2 } from "lucide-react";

export const GoalsPage: React.FC = () => {
  const { formatMoney } = useCurrency();
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

  // Adjust Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustingGoal, setAdjustingGoal] = useState<SavingsGoal | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustIsDeposit, setAdjustIsDeposit] = useState(true);

  const [modalError, setModalError] = useState<string | null>(null);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const list = await goalsApi.list();
      setGoals(list);
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
    setAdjustingGoal(g);
    setAdjustIsDeposit(isDeposit);
    setAdjustAmount("");
    setModalError(null);
    setIsAdjustModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this savings goal?")) return;
    try {
      await goalsApi.delete(id);
      loadGoals();
    } catch (err: any) {
      alert(err.message || "Failed to delete goal.");
    }
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      if (editingGoal) {
        await goalsApi.update(editingGoal.id, {
          title,
          target_amount: targetAmount,
          current_amount: currentAmount,
          target_date: targetDate || null,
          notes,
        });
      } else {
        await goalsApi.create({
          title,
          target_amount: targetAmount,
          current_amount: currentAmount,
          target_date: targetDate || null,
          notes,
        });
      }
      setIsGoalModalOpen(false);
      loadGoals();
    } catch (err: any) {
      setModalError(err.message || "Failed to save goal.");
    }
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingGoal) return;
    setModalError(null);
    try {
      const signedAmount = adjustIsDeposit
        ? adjustAmount
        : `-${adjustAmount}`;
      await goalsApi.adjust(adjustingGoal.id, signedAmount);
      setIsAdjustModalOpen(false);
      loadGoals();
    } catch (err: any) {
      setModalError(err.message || "Failed to adjust balance.");
    }
  };

  const totalSaved = goals.reduce((acc, g) => acc + parseFloat(g.current_amount || "0"), 0);
  const totalTarget = goals.reduce((acc, g) => acc + parseFloat(g.target_amount || "0"), 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "26px" }}>Savings Goals</h1>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Track progress towards emergency funds and future milestones
          </span>
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
          <PlusCircle size={15} />
          <span>New Goal</span>
        </button>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel" style={{ padding: "16px 20px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Total Saved in Goals</span>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--success)", marginTop: "4px" }}>
            {formatMoney(totalSaved)}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "16px 20px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Combined Target</span>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px" }}>
            {formatMoney(totalTarget)}
          </div>
        </div>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-2 gap-4">
        {loading ? (
          <div style={{ gridColumn: "1 / -1", padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
            Loading savings goals...
          </div>
        ) : goals.length === 0 ? (
          <div
            className="glass-panel"
            style={{ gridColumn: "1 / -1", padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}
          >
            No savings goals created yet. Click "New Goal" to get started!
          </div>
        ) : (
          goals.map((g) => {
            const isDone = g.is_completed || g.progress_percentage >= 100;
            return (
              <div
                key={g.id}
                className="glass-panel flex flex-col justify-between"
                style={{ padding: "20px 22px", position: "relative" }}
              >
                <div>
                  <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
                    <div className="flex items-center gap-2">
                      <Target size={18} style={{ color: "var(--accent-primary)" }} />
                      <h3 style={{ fontSize: "16px" }}>{g.title}</h3>
                    </div>

                    <span className={`badge ${isDone ? "badge-success" : "badge-info"}`}>
                      {isDone ? "Goal Achieved" : `${g.progress_percentage.toFixed(0)}% Saved`}
                    </span>
                  </div>

                  {g.notes && (
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>{g.notes}</p>
                  )}

                  {/* Progress Bar */}
                  <div className="progress-bar-bg" style={{ height: "10px", margin: "14px 0" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(100, g.progress_percentage)}%`,
                        background: isDone
                          ? "linear-gradient(90deg, #10b981 0%, #06b6d4 100%)"
                          : "linear-gradient(90deg, #6366f1 0%, #06b6d4 100%)",
                      }}
                    />
                  </div>

                  {/* Amount Breakdown */}
                  <div className="flex items-center justify-between" style={{ fontSize: "13px" }}>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Saved: </span>
                      <strong style={{ color: "var(--success)" }}>{formatMoney(g.current_amount)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Target: </span>
                      <strong>{formatMoney(g.target_amount)}</strong>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center justify-between"
                  style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px", marginTop: "16px" }}
                >
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleOpenAdjust(g, true)}
                    >
                      <ArrowUpRight size={14} />
                      <span>Deposit</span>
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleOpenAdjust(g, false)}
                    >
                      <ArrowDownLeft size={14} />
                      <span>Withdraw</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(g)}
                      style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "4px" }}
                      title="Edit"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(g.id)}
                      style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: "4px" }}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Goal Modal */}
      <Modal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        title={editingGoal ? "Edit Savings Goal" : "Create Savings Goal"}
      >
        {modalError && (
          <div className="badge-danger" style={{ padding: "8px 12px", marginBottom: "14px", borderRadius: "var(--radius-sm)" }}>
            {modalError}
          </div>
        )}
        <form onSubmit={handleSaveGoal} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Goal Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Emergency Fund (6 Months)"
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="input-group">
              <label className="input-label">Target Amount</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                className="input-field"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Initial Saved Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="input-field"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </div>
          </div>

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
              rows={2}
              className="input-field"
              placeholder="Why this goal matters..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: "10px" }}>
            {editingGoal ? "Save Goal" : "Create Goal"}
          </button>
        </form>
      </Modal>

      {/* Adjust Balance Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title={adjustIsDeposit ? "Deposit Funds to Goal" : "Withdraw Funds from Goal"}
      >
        {modalError && (
          <div className="badge-danger" style={{ padding: "8px 12px", marginBottom: "14px", borderRadius: "var(--radius-sm)" }}>
            {modalError}
          </div>
        )}
        <form onSubmit={handleSaveAdjustment} className="flex flex-col gap-4">
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Target: <strong>{adjustingGoal?.title}</strong> (Current balance: {formatMoney(adjustingGoal?.current_amount)})
          </p>

          <div className="input-group">
            <label className="input-label">
              {adjustIsDeposit ? "Deposit Amount" : "Withdrawal Amount"}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              className="input-field"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className={`btn ${adjustIsDeposit ? "btn-success" : "btn-danger"}`}
            style={{ marginTop: "10px" }}
          >
            {adjustIsDeposit ? "Confirm Deposit" : "Confirm Withdrawal"}
          </button>
        </form>
      </Modal>
    </div>
  );
};
