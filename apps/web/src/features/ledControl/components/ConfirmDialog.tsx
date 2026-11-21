import { Modal } from "@shared/components/ui/Modal";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  children?: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation built on the shared Modal. */
export const ConfirmDialog = ({
  isOpen,
  title,
  children,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) => (
  <Modal
    isOpen={isOpen}
    onClose={onCancel}
    title={title}
    size="sm"
    footer={
      <>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-btn border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-background cursor-pointer"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted hover:bg-primary-light cursor-pointer"
        >
          {confirmLabel}
        </button>
      </>
    }
  >
    {children}
  </Modal>
);
