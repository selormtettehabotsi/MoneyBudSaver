import React, { useState } from "react";
import { useSync } from "../../context/SyncContext";
import { WifiOff, RefreshCw, CheckCircle2, Clock, Trash2, RotateCcw } from "lucide-react";
import { Modal } from "./Modal";
import { useCurrency } from "../../context/CurrencyContext";

export const SyncStatusIndicator: React.FC = () => {
  const {
    isOnline,
    syncStatus,
    lastSyncedAt,
    outboxItems,
    triggerSync,
    retryOutboxItem,
    discardOutboxItem,
  } = useSync();
  const { formatMoney } = useCurrency();
  const [isOutboxModalOpen, setIsOutboxModalOpen] = useState(false);

  const pendingCount = outboxItems.length;

  const renderBadge = () => {
    if (!isOnline || syncStatus === "offline") {
      return (
        <button
          type="button"
          onClick={() => pendingCount > 0 && setIsOutboxModalOpen(true)}
          className="badge badge-warning flex items-center gap-1.5"
          style={{
            cursor: pendingCount > 0 ? "pointer" : "default",
            padding: "8px 12px",
            fontSize: "0.75rem",
            minHeight: "44px",
            minWidth: "44px",
            border: "1px solid rgba(245, 158, 11, 0.4)",
          }}
          title={pendingCount > 0 ? `${pendingCount} offline transaction(s) queued` : "Offline mode active"}
          aria-label={pendingCount > 0 ? `${pendingCount} offline transaction queued` : "Offline mode"}
        >
          <WifiOff size={14} />
          <span>Offline {pendingCount > 0 ? `(${pendingCount})` : ""}</span>
        </button>
      );
    }

    if (syncStatus === "syncing") {
      return (
        <span
          className="badge badge-secondary flex items-center gap-1.5"
          style={{ padding: "8px 12px", fontSize: "0.75rem", minHeight: "44px", minWidth: "44px" }}
        >
          <RefreshCw size={14} className="animate-spin" />
          <span>Syncing...</span>
        </span>
      );
    }

    if (pendingCount > 0) {
      return (
        <button
          type="button"
          onClick={() => setIsOutboxModalOpen(true)}
          className="badge badge-warning flex items-center gap-1.5"
          style={{ cursor: "pointer", padding: "8px 12px", fontSize: "0.75rem", minHeight: "44px", minWidth: "44px" }}
          aria-label={`${pendingCount} pending items in sync queue`}
        >
          <Clock size={14} />
          <span>{pendingCount} Pending Sync</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => triggerSync()}
        className="badge badge-success flex items-center gap-1.5"
        style={{
          cursor: "pointer",
          padding: "8px 12px",
          fontSize: "0.75rem",
          minHeight: "44px",
          minWidth: "44px",
          background: "rgba(16, 185, 129, 0.12)",
        }}
        title={lastSyncedAt ? `Last synced at ${lastSyncedAt.toLocaleTimeString()}` : "Synced"}
        aria-label="Trigger Sync"
      >
        <CheckCircle2 size={14} />
        <span>Synced</span>
      </button>
    );
  };

  return (
    <>
      <div className="flex items-center gap-2">{renderBadge()}</div>

      {/* Offline Outbox Modal */}
      <Modal
        isOpen={isOutboxModalOpen}
        onClose={() => setIsOutboxModalOpen(false)}
        title="Offline Sync Queue (Outbox)"
      >
        <div className="flex flex-col gap-4">
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            The following transactions were recorded while offline on this device. They will automatically sync to the server when connection returns.
          </p>

          {outboxItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: "var(--text-muted)",
                fontSize: "0.875rem",
              }}
            >
              No pending transactions in outbox.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {outboxItems.map((item) => {
                const isFailed = item.status === "failed";
                return (
                  <div
                    key={item.client_id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-surface-solid)",
                      border: `1px solid ${isFailed ? "var(--danger-border)" : "var(--border-color)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                        <strong style={{ fontSize: "0.875rem" }}>{item.payload.description || "Untitled Transaction"}</strong>
                        <span className={`badge ${isFailed ? "badge-danger" : "badge-warning"}`} style={{ fontSize: "0.6875rem" }}>
                          {isFailed ? "Failed" : "Waiting to sync"}
                        </span>
                      </div>
                      <div className="tabular-nums" style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        {item.payload.date} • {formatMoney(item.payload.amount)} ({item.payload.type})
                      </div>
                      {item.error_message && (
                        <div style={{ fontSize: "0.6875rem", color: "var(--danger)", marginTop: "4px" }}>
                          {item.error_message}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => retryOutboxItem(item.client_id)}
                        className="btn-icon"
                        title="Retry sync"
                        aria-label="Retry sync"
                      >
                        <RotateCcw size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => discardOutboxItem(item.client_id)}
                        className="btn-icon"
                        style={{ color: "var(--danger)" }}
                        title="Discard from outbox"
                        aria-label="Discard from outbox"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-3" style={{ marginTop: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={!isOnline || outboxItems.length === 0}
              onClick={async () => {
                await triggerSync();
              }}
              className="btn btn-primary flex items-center gap-2"
              style={{ minHeight: "44px" }}
            >
              <RefreshCw size={16} />
              <span>Sync All Now</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOutboxModalOpen(false)}
              className="btn btn-secondary"
              style={{ minHeight: "44px" }}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
