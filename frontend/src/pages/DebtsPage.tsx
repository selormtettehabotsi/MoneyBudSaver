import React, { useState, useEffect } from "react";
import { debtsApi } from "../api/debts";
import { Debt } from "../types/finance";
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
  CreditCard,
  Edit2,
  Trash2,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Skeleton } from "../components/common/Skeleton";

export const DebtsPage: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { loadCachedOrFetch, isOnline } = useSync();
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();
  const { confirm } = useConfirm();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit Modal
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [name, setName] = useState("");
  const [totalPrincipal, setTotalPrincipal] = useState("");
  const [remainingBalance, setRemainingBalance] = useState("");
  const [interestRate, setInterestRate] = useState("0.00");
  const [minimumPayment, setMinimumPayment] = useState("");
  const [dueDay, setDueDay] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  // Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadDebts = async () => {
    setLoading(true);
    try {
      const list = await loadCachedOrFetch("debts", () => debtsApi.list(), (c) => { if (c) setDebts(c); });
      if (list) setDebts(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDebts();
  }, []);

  const handleOpenCreate = () => {
    if (!isOnline) {
      toastWarning("Recording loans requires an active network connection.");
      return;
    }
    setEditingDebt(null);
    setName("");
    setTotalPrincipal("");
    setRemainingBalance("");
    setInterestRate("0.00");
    setMinimumPayment("");
    setDueDay(1);
    setStartDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setModalError(null);
    setIsDebtModalOpen(true);
  };

  const handleOpenEdit = (d: Debt) => {
    if (!isOnline) {
      toastWarning("Editing debt entries requires an active network connection.");
      return;
    }
    setEditingDebt(d);
    setName(d.name);
    setTotalPrincipal(d.total_principal);
    setRemainingBalance(d.remaining_balance);
    setInterestRate(d.interest_rate);
    setMinimumPayment(d.minimum_payment);
    setDueDay(d.due_day_of_month);
    setStartDate(d.start_date);
    setNotes(d.notes || "");
    setModalError(null);
    setIsDebtModalOpen(true);
  };

  const handleOpenPayment = (d: Debt) => {
    if (!isOnline) {
      toastWarning("Recording payments requires an active network connection.");
      return;
    }
    setPayingDebt(d);
    setPaymentAmount(d.minimum_payment);
    setModalError(null);
    setIsPaymentModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!isOnline) {
      toastWarning("Deleting debt entries requires an active network connection.");
      return;
    }

    const confirmed = await confirm({
      title: "Delete Debt Entry?",
      message: "Are you sure you want to permanently delete this debt record?",
      confirmText: "Delete",
      cancelText: "Cancel",
      isDanger: true,
    });

    if (!confirmed) return;

    try {
      await debtsApi.delete(id);
      toastSuccess("Debt entry removed.");
      loadDebts();
    } catch (err: any) {
      toastError(err.message || "Failed to delete debt.");
    }
  };

  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const principalNum = parseFloat(totalPrincipal);
    if (!principalNum || isNaN(principalNum) || principalNum <= 0) {
      setModalError("Please enter a valid total principal amount.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingDebt) {
        await debtsApi.update(editingDebt.id, {
          name: name.trim(),
          total_principal: totalPrincipal,
          remaining_balance: remainingBalance || totalPrincipal,
          interest_rate: interestRate || "0.00",
          minimum_payment: minimumPayment || "0.00",
          due_day_of_month: dueDay,
          start_date: startDate,
          notes: notes.trim() || undefined,
        });
        toastSuccess("Debt details updated.");
      } else {
        await debtsApi.create({
          name: name.trim(),
          total_principal: totalPrincipal,
          remaining_balance: remainingBalance || totalPrincipal,
          interest_rate: interestRate || "0.00",
          minimum_payment: minimumPayment || "0.00",
          due_day_of_month: dueDay,
          start_date: startDate,
          notes: notes.trim() || undefined,
        });
        toastSuccess("Debt recorded.");
      }
      setIsDebtModalOpen(false);
      loadDebts();
    } catch (err: any) {
      setModalError(err.message || "Failed to save debt.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingDebt) return;
    setModalError(null);

    const payNum = parseFloat(paymentAmount);
    if (!payNum || isNaN(payNum) || payNum <= 0) {
      setModalError("Please enter a valid payment amount greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      await debtsApi.recordPayment(payingDebt.id, paymentAmount);
      setIsPaymentModalOpen(false);
      toastSuccess(`Payment of ${formatMoney(paymentAmount)} recorded for "${payingDebt.name}".`);
      loadDebts();
    } catch (err: any) {
      setModalError(err.message || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  };

  // Payoff calculations
  const calculatePayoff = (remainingStr: string, minPaymentStr: string, aprStr: string) => {
    const bal = parseFloat(remainingStr || "0");
    const pmt = parseFloat(minPaymentStr || "0");
    const apr = parseFloat(aprStr || "0") / 100;

    if (bal <= 0) return { label: "Fully Paid Off!", status: "paid" as const };
    if (pmt <= 0) return { label: "No monthly payment scheduled", status: "neutral" as const };

    const monthlyInterest = (bal * apr) / 12;
    if (pmt <= monthlyInterest) {
      return {
        label: "Payment below interest — this debt will grow!",
        status: "danger" as const,
      };
    }

    // Amortization approximation
    const months = Math.ceil(
      -Math.log(1 - (monthlyInterest / pmt)) / Math.log(1 + apr / 12)
    );

    if (isNaN(months) || months <= 0) {
      return { label: "Fully amortized", status: "success" as const };
    }

    return {
      label: `~${months} month${months > 1 ? "s" : ""} to full payoff`,
      status: "normal" as const,
    };
  };

  // Summaries
  const totalBalance = debts.reduce((acc, d) => acc + parseFloat(d.remaining_balance || "0"), 0);
  const totalMonthlyPayments = debts.reduce((acc, d) => acc + parseFloat(d.minimum_payment || "0"), 0);

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
              Total Outstanding Balance
            </div>
            <div
              className="tabular-nums"
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: totalBalance > 0 ? "var(--danger)" : "var(--success)",
              }}
            >
              {formatMoney(totalBalance)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Total Monthly Minimums
            </div>
            <div className="tabular-nums" style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
              {formatMoney(totalMonthlyPayments)}
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleOpenCreate}
          icon={<Plus size={15} />}
          disabled={!isOnline}
        >
          Add Debt or Loan
        </Button>
      </div>

      {/* Debt Cards Grid */}
      {loading && debts.length === 0 ? (
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
      ) : debts.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={32} style={{ color: "var(--success)" }} />}
          title="No debts recorded — clean balance sheet!"
          description="You currently have zero outstanding liabilities logged. Keep up the disciplined financial freedom!"
          actionLabel="Record a Loan or Credit Balance"
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
          {debts.map((d) => {
            const principal = parseFloat(d.total_principal || "0");
            const balance = parseFloat(d.remaining_balance || "0");
            const paid = Math.max(0, principal - balance);
            const paidPct = principal > 0 ? (paid / principal) * 100 : 0;
            const isPaidOff = balance <= 0;
            const apr = parseFloat(d.interest_rate || "0");
            const payoff = calculatePayoff(d.remaining_balance, d.minimum_payment, d.interest_rate);

            return (
              <div
                key={d.id}
                className="glass-panel"
                style={{
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "16px",
                  borderColor: isPaidOff ? "var(--success-border)" : "var(--border-color)",
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
                          background: isPaidOff ? "var(--success-bg)" : "var(--danger-bg)",
                          color: isPaidOff ? "var(--success)" : "var(--danger)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isPaidOff ? <ShieldCheck size={18} /> : <CreditCard size={18} />}
                      </div>
                      <div>
                        <h4 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                          {d.name}
                        </h4>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                          <span>Due day: {d.due_day_of_month}th</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {apr > 0 && (
                        <Badge variant="warning" size="sm">
                          {apr.toFixed(1)}% APR
                        </Badge>
                      )}
                      {isPaidOff && (
                        <Badge variant="success" size="sm">
                          Paid Off
                        </Badge>
                      )}
                    </div>
                  </div>

                  {d.notes && (
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "12px", lineHeight: 1.4 }}>
                      {d.notes}
                    </p>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                    <div>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                        Remaining Balance
                      </span>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: "19px",
                          fontWeight: 800,
                          color: isPaidOff ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {formatMoney(balance)}
                      </span>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                        Monthly Payment
                      </span>
                      <span className="tabular-nums" style={{ fontSize: "14px", fontWeight: 700 }}>
                        {formatMoney(d.minimum_payment)}
                      </span>
                    </div>
                  </div>

                  <div className="progress-bar-bg" style={{ height: "6px" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.max(1, paidPct))}%`,
                        background: isPaidOff ? "var(--success)" : "var(--accent-primary)",
                      }}
                    />
                  </div>

                  {/* Payoff line */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginTop: "10px",
                      fontSize: "12px",
                      color:
                        payoff.status === "danger"
                          ? "var(--danger)"
                          : payoff.status === "paid"
                          ? "var(--success)"
                          : "var(--text-secondary)",
                    }}
                  >
                    {payoff.status === "danger" ? (
                      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                    ) : (
                      <Clock size={13} style={{ flexShrink: 0 }} />
                    )}
                    <span>{payoff.label}</span>
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
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenPayment(d)}
                    icon={<ArrowUpRight size={14} />}
                    disabled={!isOnline || isPaidOff}
                  >
                    Record Payment
                  </Button>

                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(d)}
                      aria-label="Edit Debt"
                      disabled={!isOnline}
                      className="btn-icon"
                      style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px" }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id)}
                      aria-label="Delete Debt"
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

      {/* Add / Edit Debt Modal */}
      <Modal
        isOpen={isDebtModalOpen}
        onClose={() => setIsDebtModalOpen(false)}
        title={editingDebt ? "Edit Loan / Debt" : "Record New Loan or Credit"}
      >
        <form onSubmit={handleSaveDebt} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {modalError && (
            <div className="badge badge-danger" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
              {modalError}
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Debt / Loan Name</label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="e.g. Student Loan, Car Loan, Bank Overdraft"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <MoneyInput
              label="Total Principal"
              value={totalPrincipal}
              onChange={(val) => setTotalPrincipal(val)}
              placeholder="10000.00"
              required
            />
            <MoneyInput
              label="Remaining Balance"
              value={remainingBalance}
              onChange={(val) => setRemainingBalance(val)}
              placeholder="8500.00"
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="input-group">
              <label className="input-label">Annual APR (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input-field tabular-nums"
                placeholder="14.5"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
              />
            </div>
            <MoneyInput
              label="Monthly Minimum"
              value={minimumPayment}
              onChange={(val) => setMinimumPayment(val)}
              placeholder="350.00"
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="input-group">
              <label className="input-label">Due Day of Month (1-31)</label>
              <input
                type="number"
                min="1"
                max="31"
                className="input-field tabular-nums"
                value={dueDay}
                onChange={(e) => setDueDay(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Start Date</label>
              <input
                type="date"
                className="input-field"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Notes (Optional)</label>
            <textarea
              className="input-field"
              placeholder="Lender details, account number, or repayment notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ minHeight: "64px" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <Button type="button" variant="secondary" onClick={() => setIsDebtModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {editingDebt ? "Save Changes" : "Record Debt"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Loan Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Record Payment for "${payingDebt?.name}"`}
      >
        <form onSubmit={handleSavePayment} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
            <span style={{ color: "var(--text-secondary)" }}>Current Remaining Balance:</span>
            <strong className="tabular-nums">{formatMoney(payingDebt?.remaining_balance || "0")}</strong>
          </div>

          <MoneyInput
            label="Payment Amount"
            value={paymentAmount}
            onChange={(val) => setPaymentAmount(val)}
            placeholder="350.00"
            required
            autoFocus
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <Button type="button" variant="secondary" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Confirm Payment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
