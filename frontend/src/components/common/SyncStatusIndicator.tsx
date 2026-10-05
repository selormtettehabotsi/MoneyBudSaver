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
            padding: "4px 8px",
            fontSize: "11px",
            border: "1px solid rgba(245, 158, 11, 0.4)",
          }}
          title={pendingCount > 0 ? `${pendingCount} offline transaction(s) queued` : "Offline mode active"}
        >
          <WifiOff size={12} />
          <span>Offline {pendingCount > 0 ? `(${pendingCount})` : ""}</span>
        </button>
      );
    }

    if (syncStatus === "syncing") {
      return (
        <span
          className="badge badge-secondary flex items-center gap-1.5"
          style={{ padding: "4px 8px", fontSize: "11px" }}
        >
          <RefreshCw size={12} className="animate-spin" />
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
          style={{ cursor: "pointer", padding: "4px 8px", fontSize: "11px" }}
        >
          <Clock size={12} />
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
          padding: "4px 8px",
          fontSize: "11px",
          background: "rgba(16, 185, 129, 0.12)",
        }}
        title={lastSyncedAt ? `Last synced at ${lastSyncedAt.toLocaleTimeString()}` : "Synced"}
      >
        <CheckCircle2 size={12} />
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
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            The following transactions were recorded while offline on this device. They will automatically sync to the server when connection returns.
          </p>

          {outboxItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: "var(--text-muted)",
                fontSize: "13px",
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
                      justifyContent: "between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2">
                        <strong style={{ fontSize: "14px" }}>{item.payload.description || "Untitled Transaction"}</strong>
                        <span className={`badge ${isFailed ? "badge-danger" : "badge-warning"}`} style={{ fontSize: "10px" }}>
                          {isFailed ? "Failed" : "Waiting to sync"}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                        {item.payload.date} • {formatMoney(item.payload.amount)} ({item.payload.type})
                      </div>
                      {item.error_message && (
                        <div style={{ fontSize: "11px", color: "var(--accent-rose)", marginTop: "4px" }}>
                          {item.error_message}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => retryOutboxItem(item.client_id)}
                        className="btn btn-ghost"
                        style={{ padding: "6px" }}
                        title="Retry sync"
                      >
                        <RotateCcw size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => discardOutboxItem(item.client_id)}
                        className="btn btn-ghost"
                        style={{ padding: "6px", color: "var(--accent-rose)" }}
                        title="Discard from outbox"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between" style={{ marginTop: "8px" }}>
            <button
              type="button"
              disabled={!isOnline || outboxItems.length === 0}
              onClick={async () => {
                await triggerSync();
              }}
              className="btn btn-primary flex items-center gap-2"
            >
              <RefreshCw size={15} />
              <span>Sync All Now</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOutboxModalOpen(false)}
              className="btn btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
