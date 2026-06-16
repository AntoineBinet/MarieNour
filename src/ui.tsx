import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "./components/Icon";

/* ── Toasts ─────────────────────────────────────────────────────────────── */
interface Toast { id: number; message: string; error?: boolean; }
interface ToastCtx { push: (message: string, error?: boolean) => void; }
const ToastContext = createContext<ToastCtx>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? " error" : ""}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/* ── Modal ──────────────────────────────────────────────────────────────── */
export function Modal({
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " modal-lg" : ""}`} role="dialog" aria-modal="true">
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="btn btn-icon btn-soft" onClick={onClose} aria-label="Fermer">✕</button>
          </div>
        )}
        {children}
        {footer && <div className="row" style={{ justifyContent: "flex-end", marginTop: "var(--space-5)" }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ── Spinner / Empty ────────────────────────────────────────────────────── */
export const Spinner = () => <div className="spinner" aria-label="Chargement" />;

export function EmptyState({
  emoji,
  icon,
  title,
  hint,
  action,
}: {
  emoji?: string;
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? (
        <span className="empty-icon"><Icon name={icon} size={34} strokeWidth={1.6} /></span>
      ) : (
        <span className="emoji">{emoji ?? "✨"}</span>
      )}
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {hint && <p className="muted">{hint}</p>}
      {action && <div style={{ marginTop: "var(--space-4)" }}>{action}</div>}
    </div>
  );
}

/* ── Field helper ───────────────────────────────────────────────────────── */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

/* ── Confirm dialog hook ────────────────────────────────────────────────── */
export function useConfirm() {
  const [state, setState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((message: string) => new Promise<boolean>((resolve) => setState({ message, resolve })), []);
  const node = state ? (
    <Modal
      title="Confirmer"
      onClose={() => {
        state.resolve(false);
        setState(null);
      }}
      footer={
        <>
          <button className="btn btn-soft" onClick={() => { state.resolve(false); setState(null); }}>Annuler</button>
          <button className="btn btn-primary" onClick={() => { state.resolve(true); setState(null); }}>Confirmer</button>
        </>
      }
    >
      <p>{state.message}</p>
    </Modal>
  ) : null;
  return { confirm, confirmNode: node };
}

/* ── Color swatch row ───────────────────────────────────────────────────── */
export const NOTE_COLORS = ["sand", "sage", "sky", "blush", "lilac", "butter"];
export function SwatchRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="row gap-2 wrap">
      {NOTE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch${value === c ? " sel" : ""}`}
          style={{ background: `var(--${c})` }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}
