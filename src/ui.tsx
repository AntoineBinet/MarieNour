import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
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
      {/* aria-live=polite + role=status : les toasts sont annoncés aux lecteurs d'écran. */}
      <div className="toast-wrap" role="status" aria-live="polite" aria-atomic="false">
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Mémorise le focus de départ pour le restaurer à la fermeture.
    const prevActive = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => (el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    // Focus initial : premier champ/bouton du dialogue (ou le dialogue lui-même).
    (focusables()[0] ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Piège le focus : Tab/Shift+Tab bouclent à l'intérieur de la modale.
      if (e.key === "Tab" && el) {
        const f = focusables();
        if (!f.length) {
          e.preventDefault();
          el.focus();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      // Restaure le focus sur l'élément déclencheur s'il est toujours dans le DOM.
      if (prevActive && document.contains(prevActive)) prevActive.focus();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " modal-lg" : ""}`} role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="btn btn-icon btn-soft" onClick={onClose} aria-label="Fermer"><Icon name="close" size={16} /></button>
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
  icon,
  title,
  hint,
  action,
}: {
  /** @deprecated — l'app utilise des icônes SVG « maison », jamais d'emoji dans le chrome. */
  emoji?: string;
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon ?? "sparkle"} size={34} strokeWidth={1.6} /></span>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {hint && <p className="muted">{hint}</p>}
      {action && <div style={{ marginTop: "var(--space-4)" }}>{action}</div>}
    </div>
  );
}

/* ── Field helper ───────────────────────────────────────────────────────── */
// Associe le <label> à son champ (htmlFor/id) pour l'accessibilité : un clic sur
// le libellé donne le focus au champ, et les lecteurs d'écran l'annoncent. L'id
// est injecté dans l'unique enfant s'il n'en porte pas déjà un.
export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const child =
    isValidElement(children) && (children as { props?: { id?: string } }).props?.id == null
      ? cloneElement(children as ReactElement<{ id?: string }>, { id })
      : children;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {child}
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
