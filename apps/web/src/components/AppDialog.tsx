import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

export type NoticeRequest = {
  title: string;
  body: string;
  tone?: "default" | "danger";
};

type ConfirmItem = { kind: "confirm"; request: ConfirmRequest; resolve: (accepted: boolean) => void };
type NoticeItem = { kind: "notice"; request: NoticeRequest };
type DialogItem = ConfirmItem | NoticeItem;

type DialogApi = {
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  notify: (request: NoticeRequest) => void;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useConfirm() {
  const api = useContext(DialogContext);
  if (!api) throw new Error("Confirmation dialogs are unavailable.");
  return api.confirm;
}

export function useNotify() {
  const api = useContext(DialogContext);
  if (!api) throw new Error("Error dialogs are unavailable.");
  return api.notify;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const queue = useRef<DialogItem[]>([]);
  const currentRef = useRef<DialogItem | null>(null);
  const [current, setCurrent] = useState<DialogItem | null>(null);

  const show = useCallback((item: DialogItem) => {
    const sameNotice = (candidate: DialogItem | null) =>
      item.kind === "notice" &&
      candidate?.kind === "notice" &&
      candidate.request.title === item.request.title &&
      candidate.request.body === item.request.body;
    if (sameNotice(currentRef.current) || queue.current.some((queued) => sameNotice(queued))) return;
    if (currentRef.current) {
      queue.current.push(item);
      return;
    }
    currentRef.current = item;
    setCurrent(item);
  }, []);

  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        show({ kind: "confirm", request, resolve });
      }),
    [show],
  );

  const notify = useCallback(
    (request: NoticeRequest) => {
      show({ kind: "notice", request });
    },
    [show],
  );

  function finish(accepted: boolean) {
    if (currentRef.current?.kind === "confirm") currentRef.current.resolve(accepted);
    const next = queue.current.shift() ?? null;
    currentRef.current = next;
    setCurrent(next);
  }

  return (
    <DialogContext.Provider value={{ confirm, notify }}>
      {children}
      {current ? <DialogFrame item={current} onClose={finish} /> : null}
    </DialogContext.Provider>
  );
}

function DialogFrame({ item, onClose }: { item: DialogItem; onClose: (accepted: boolean) => void }) {
  const danger = item.request.tone === "danger";
  const titleId = "app-dialog-title";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#020617]/75 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={() => onClose(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-3xl border border-line bg-panel p-6 text-paper shadow-[0_24px_80px_rgba(2,6,23,0.65)]"
      >
        <p id={titleId} className="text-lg font-semibold">
          {item.request.title}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">{item.request.body}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {item.kind === "confirm" ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>
                {item.request.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className="btn btn-solid"
                style={
                  danger
                    ? { background: "linear-gradient(180deg, #fca5a5 0%, #f87171 45%, #dc2626 100%)", color: "#07111f" }
                    : undefined
                }
                onClick={() => onClose(true)}
              >
                {item.request.confirmLabel ?? "Confirm"}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-solid" onClick={() => onClose(false)}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
