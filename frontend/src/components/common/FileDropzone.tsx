import React, { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, X } from "lucide-react";
import { Button } from "./Button";

export interface FileDropzoneProps {
  accept?: string;
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  accept,
  onFileSelect,
  selectedFile,
  label = "Choose a file or drag & drop here",
  hint = "Supports .csv or .json files",
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && !selectedFile && inputRef.current?.click()}
      style={{
        border: `2px dashed ${
          isDragging
            ? "var(--accent-primary)"
            : selectedFile
            ? "var(--success)"
            : "var(--border-color)"
        }`,
        borderRadius: "var(--radius-lg)",
        background: isDragging
          ? "var(--accent-primary-glow)"
          : selectedFile
          ? "var(--success-bg)"
          : "var(--bg-surface-solid)",
        padding: "24px 20px",
        textAlign: "center",
        cursor: disabled ? "not-allowed" : selectedFile ? "default" : "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            onFileSelect(e.target.files[0]);
          }
        }}
        disabled={disabled}
        style={{ display: "none" }}
      />

      {selectedFile ? (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", justifyContent: "center" }}>
          <div
            style={{
              padding: "10px",
              borderRadius: "50%",
              background: "var(--bg-surface)",
              color: "var(--success)",
              display: "flex",
            }}
          >
            <CheckCircle2 size={24} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
              {selectedFile.name}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {formatFileSize(selectedFile.size)} · {selectedFile.type || "file"}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFileSelect(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            aria-label="Remove file"
            style={{
              marginLeft: "12px",
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "var(--bg-surface)",
              color: "var(--accent-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UploadCloud size={24} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
              {label}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              {hint}
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            disabled={disabled}
          >
            Browse Files
          </Button>
        </>
      )}
    </div>
  );
};
