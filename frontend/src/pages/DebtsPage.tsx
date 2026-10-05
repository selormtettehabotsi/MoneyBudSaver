import React, { useState, useEffect } from "react";
import { debtsApi } from "../api/debts";
import { Debt } from "../types/finance";
import { useCurrency } from "../context/CurrencyContext";
import { Modal } from "../components/common/Modal";
import { PlusCircle, CreditCard, Edit2, Trash2, ArrowUpRight } from "lucide-react";

export const DebtsPage: React.FC = () => {
  const { formatMoney } = useCurrency();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit Modal
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [name, setName] = useState("");
  const [totalPrincipal, setTotalPrincipal] = useState("");
  const [remainingBalance, setRemainingBalance] = useState("");
  const [interestRate, setInterestRate] = useState("0.000");
  const [minimumPayment, setMinimumPayment] = useState("");
  const [dueDay, setDueDay] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  // Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  const [modalError, setModalError] = useState<string | null>(null);

  const loadDebts = async () => {
    setLoading(true);
    try {
      const list = await debtsApi.list();
      setDebts(list);
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
    setEditingDebt(null);
    setName("");
    setTotalPrincipal("");
    setRemainingBalance("");
    setInterestRate("0.000");
    setMinimumPayment("");
    setDueDay(1);
    setStartDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setModalError(null);
    setIsDebtModalOpen(true);
  };

  const handleOpenEdit = (d: Debt) => {
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
    setPayingDebt(d);
    setPaymentAmount(d.minimum_payment);
    setModalError(null);
    setIsPaymentModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this debt entry?")) return;
    try {
      await debtsApi.delete(id);
      loadDebts();
    } catch (err: any) {
      alert(err.message || "Failed to delete debt.");
    }
  };

  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      if (editingDebt) {
        await debtsApi.update(editingDebt.id, {
          name,
          total_principal: totalPrincipal,
          remaining_balance: remainingBalance,
          interest_rate: interestRate,
          minimum_payment: minimumPayment,
          due_day_of_month: dueDay,
          start_date: startDate,
          notes,
        });
      } else {
        await debtsApi.create({
          name,
          total_principal: totalPrincipal,
          remaining_balance: remainingBalance || totalPrincipal,
          interest_rate: interestRate,
          minimum_payment: minimumPayment,
          due_day_of_month: dueDay,
          start_date: startDate,
          notes,
        });
      }
      setIsDebtModalOpen(false);
      loadDebts();
    } catch (err: any) {
      setModalError(err.message || "Failed to save debt.");
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingDebt) return;
    setModalError(null);
    try {
      await debtsApi.recordPayment(payingDebt.id, paymentAmount);
      setIsPaymentModalOpen(false);
      loadDebts();
    } catch (err: any) {
      setModalError(err.message || "Failed to record payment.");
    }
  };

  const totalDebtBalance = debts.reduce((acc, d) => acc + parseFloat(d.remaining_balance || "0"), 0);
  const totalMonthlyObligations = debts.reduce((acc, d) => acc + parseFloat(d.minimum_payment || "0"), 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "26px" }}>Debts & Loans</h1>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Amortization timelines, interest rates, and debt payoff acceleration
          </span>
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
          <PlusCircle size={15} />
          <span>Add Loan / Debt</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel" style={{ padding: "16px 20px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Total Outstanding Balance</span>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--danger)", marginTop: "4px" }}>
            {formatMoney(totalDebtBalance)}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "16px 20px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Total Monthly Payments</span>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--warning)", marginTop: "4px" }}>
            {formatMoney(totalMonthlyObligations)}
          </div>
        </div>
      </div>

      {/* Debts Grid */}
      <div className="grid grid-cols-2 gap-4">
        {loading ? (
          <div style={{ gridColumn: "1 / -1", padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
            Loading debts and loans...
          </div>
        ) : debts.length === 0 ? (
          <div
            className="glass-panel"
            style={{ gridColumn: "1 / -1", padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}
          >
            No outstanding loans or debts recorded. Clean balance sheet!
          </div>
        ) : (
          debts.map((d) => {
            const isZero = parseFloat(d.remaining_balance || "0") <= 0;
            return (
              <div
                key={d.id}
                className="glass-panel flex flex-col justify-between"
                style={{ padding: "20px 22px", position: "relative" }}
              >
                <div>
                  <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
                    <div className="flex items-center gap-2">
                      <CreditCard size={18} style={{ color: "var(--danger)" }} />
                      <h3 style={{ fontSize: "16px" }}>{d.name}</h3>
                    </div>

                    <span className={`badge ${isZero ? "badge-success" : "badge-danger"}`}>
                      {isZero ? "Paid Off" : `${parseFloat(d.interest_rate || "0").toFixed(1)}% APR`}
                    </span>
                  </div>

                  {/* Numbers */}
                  <div className="flex items-center justify-between" style={{ margin: "14px 0 8px 0" }}>
                    <div>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Remaining Balance</span>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--danger)" }}>
                        {formatMoney(d.remaining_balance)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Monthly Payment</span>
                      <div style={{ fontSize: "15px", fontWeight: 600 }}>{formatMoney(d.minimum_payment)}</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="progress-bar-bg" style={{ height: "8px", margin: "10px 0" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(100, d.payoff_progress_percentage)}%`,
                        background: "linear-gradient(90deg, #10b981 0%, #06b6d4 100%)",
                      }}
                    />
                  </div>

                  {/* Timeline Estimates */}
                  <div className="flex items-center justify-between" style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                    <span>Paid: {d.payoff_progress_percentage.toFixed(0)}%</span>
                    <span>
                      {d.months_to_payoff !== null
                        ? d.months_to_payoff === 0
                          ? "Fully amortized"
                          : `~${d.months_to_payoff} months remaining`
                        : "Payment below interest"}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center justify-between"
                  style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px", marginTop: "16px" }}
                >
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleOpenPayment(d)}
                    disabled={isZero}
                  >
                    <ArrowUpRight size={14} />
                    <span>Record Payment</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(d)}
                      style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "4px" }}
                      title="Edit"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
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

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isDebtModalOpen}
        onClose={() => setIsDebtModalOpen(false)}
        title={editingDebt ? "Edit Loan Record" : "Add Loan / Debt"}
      >
        {modalError && (
          <div className="badge-danger" style={{ padding: "8px 12px", marginBottom: "14px", borderRadius: "var(--radius-sm)" }}>
            {modalError}
          </div>
        )}
        <form onSubmit={handleSaveDebt} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Debt / Loan Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Car Loan / Bank Overdraft"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="input-group">
              <label className="input-label">Total Principal</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                className="input-field"
                value={totalPrincipal}
                onChange={(e) => setTotalPrincipal(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Remaining Balance</label>
              <input
                type="number"
                step="0.01"
                min="0.00"
                required
                placeholder="0.00"
                className="input-field"
                value={remainingBalance}
                onChange={(e) => setRemainingBalance(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="input-group">
              <label className="input-label">Annual Interest Rate (% APR)</label>
              <input
                type="number"
                step="0.001"
                min="0.000"
                required
                placeholder="0.000"
                className="input-field"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Monthly Minimum Payment</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                className="input-field"
                value={minimumPayment}
                onChange={(e) => setMinimumPayment(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="input-group">
              <label className="input-label">Due Day of Month (1-31)</label>
              <input
                type="number"
                min="1"
                max="31"
                required
                className="input-field"
                value={dueDay}
                onChange={(e) => setDueDay(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Start Date</label>
              <input
                type="date"
                required
                className="input-field"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: "10px" }}>
            {editingDebt ? "Save Changes" : "Save Loan Record"}
          </button>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Record Loan Payment"
      >
        {modalError && (
          <div className="badge-danger" style={{ padding: "8px 12px", marginBottom: "14px", borderRadius: "var(--radius-sm)" }}>
            {modalError}
          </div>
        )}
        <form onSubmit={handleSavePayment} className="flex flex-col gap-4">
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Recording payment for: <strong>{payingDebt?.name}</strong> (Current balance: {formatMoney(payingDebt?.remaining_balance)})
          </p>

          <div className="input-group">
            <label className="input-label">Payment Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              className="input-field"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-success" style={{ marginTop: "10px" }}>
            Confirm Payment
          </button>
        </form>
      </Modal>
    </div>
  );
};
