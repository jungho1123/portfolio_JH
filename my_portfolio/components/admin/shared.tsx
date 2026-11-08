"use client";
import {
  useState,
  useId,
  useRef,
  useLayoutEffect,
  cloneElement,
  isValidElement,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Field(props: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      {isValidElement<{ id?: string; "aria-describedby"?: string }>(
        props.children,
      )
        ? cloneElement(props.children, {
            id,
            ...(props.hint ? { "aria-describedby": `${id}-hint` } : {}),
          })
        : props.children}
      {props.hint && (
        <small className="muted" id={`${id}-hint`}>
          {props.hint}
        </small>
      )}
    </div>
  );
}
export function Confirm(props: {
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
  const session = useRef({ active: false });
  useLayoutEffect(() => {
    const scope = { active: true };
    session.current = scope;
    return () => {
      scope.active = false;
      setOpen(false);
      setBusy(false);
      setError("");
    };
  }, []);
  async function confirmAction() {
    const scope = session.current;
    setBusy(true);
    try {
      await props.onConfirm();
      if (scope.active) setOpen(false);
    } catch (e) {
      if (scope.active) setError(e instanceof Error ? e.message : "작업 실패");
    } finally {
      if (scope.active) setBusy(false);
    }
  }
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
        className={`button ${props.danger ? "danger" : "secondary"}`}
        disabled={props.disabled}
      >
        {props.label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="confirm-dialog">
          <Dialog.Title>{props.title}</Dialog.Title>
          <Dialog.Description>{props.description}</Dialog.Description>
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
              className={`button ${props.danger ? "danger" : ""}`}
              onClick={confirmAction}
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
