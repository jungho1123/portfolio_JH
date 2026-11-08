"use client";
import { useState, useId, cloneElement, isValidElement } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
        ? cloneElement(children, {
            id,
            ...(hint ? { "aria-describedby": `${id}-hint` } : {}),
          })
        : children}
      {hint && (
        <small className="muted" id={`${id}-hint`}>
          {hint}
        </small>
      )}
    </div>
  );
}
export function Confirm({
  label,
  title,
  description,
  danger,
  onConfirm,
  disabled,
}: {
  label: string;
  title: string;
  description: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          setError("");
        }
      }}
    >
      <Dialog.Trigger
        className={`button ${danger ? "danger" : "secondary"}`}
        disabled={disabled}
      >
        {label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="confirm-dialog">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          {error && (
            <p className="notice error-notice" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Dialog.Close className="button secondary" disabled={busy}>
              취소
            </Dialog.Close>
            <button
              disabled={busy}
              className={`button ${danger ? "danger" : ""}`}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "작업 실패");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "처리 중…" : "확인"}
            </button>
          </div>
          <Dialog.Close
            className="icon-button close-button"
            aria-label="대화상자 닫기"
            disabled={busy}
          >
            <X size={18} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
