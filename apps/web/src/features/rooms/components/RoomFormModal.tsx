import type { CreateRoomBody } from "@cimcms/contracts";
import { Modal } from "@shared/components/ui/Modal";
import { useState } from "react";

interface RoomFormModalProps {
  isOpen: boolean;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: CreateRoomBody) => void;
}

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/;

/** Create-room dialog (code and name are required). The code cannot be changed later. */
export const RoomFormModal = ({ isOpen, error, busy, onClose, onSubmit }: RoomFormModalProps) => {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const codeOk = CODE_RE.test(code);
  const valid = codeOk && name.trim().length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create room"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-border px-4 py-2 text-sm font-medium text-text-primary cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() =>
              onSubmit({
                code,
                name: name.trim(),
                ...(notes.trim() && { notes: notes.trim() }),
              })
            }
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-40 cursor-pointer"
          >
            Create
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-text-primary mb-1">Room code</span>
          <input
            aria-label="Room code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={20}
            className="w-full rounded-btn border border-border px-3 py-2"
          />
          {code && !codeOk && (
            <span className="text-xs text-rose-700">
              Letters, digits, dash and underscore only (max 20).
            </span>
          )}
        </label>
        <label className="block">
          <span className="block font-medium text-text-primary mb-1">Room name</span>
          <input
            aria-label="Room name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full rounded-btn border border-border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block font-medium text-text-primary mb-1">Notes</span>
          <textarea
            aria-label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            className="w-full rounded-btn border border-border px-3 py-2"
          />
        </label>
        {error && (
          <p className="rounded-btn bg-rose-50 text-rose-700 px-3 py-2" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
