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
  type PointerEvent as ReactPointerEvent,
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
    // Les erreurs restent plus longtemps (5 s) pour laisser le temps de les lire.
    const ttl = error ? 5000 : 3200;
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {/* aria-live=polite + role=status : les toasts sont annoncés aux lecteurs d'écran.
          Les toasts d'erreur portent role=alert (annonce assertive, immédiate). */}
      <div className="toast-wrap" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? " error" : ""}`} role={t.error ? "alert" : undefined}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/* ── Verrou de scroll iOS-proof (partagé) ───────────────────────────────── */
// Technique iOS : on fige le <body> en position:fixed (le simple overflow:hidden
// ne stoppe pas le rubber-band de Safari) et on mémorise le scroll pour le
// restaurer. Compteur global → réentrant pour les modales imbriquées (seul le
// premier verrou fige, seul le dernier déverrou restaure). Exporté pour être
// réutilisé par la palette ⌘K et le tiroir sidebar (une seule implémentation).
let scrollLockCount = 0;
let lockedScrollY = 0;
export function lockBodyScroll() {
  if (scrollLockCount === 0) {
    lockedScrollY = window.scrollY;
    const s = document.body.style;
    s.position = "fixed";
    s.top = `-${lockedScrollY}px`;
    s.left = "0";
    s.right = "0";
    s.width = "100%";
  }
  scrollLockCount += 1;
}
export function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    const s = document.body.style;
    s.position = "";
    s.top = "";
    s.left = "";
    s.right = "";
    s.width = "";
    window.scrollTo(0, lockedScrollY);
  }
}

/* ── Suivi du clavier virtuel (variable --kb) ───────────────────────────── */
// Pose sur <html> la hauteur occultée par le clavier virtuel iOS (via
// window.visualViewport) : la passe CSS l'utilise (--kb) pour remonter la feuille
// basse et les toasts au-dessus du clavier. Compteur global comme le verrou.
let kbCount = 0;
function measureKb() {
  const vv = window.visualViewport;
  if (!vv) return;
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty("--kb", `${Math.round(kb)}px`);
}
function subscribeKeyboard() {
  if (kbCount === 0 && window.visualViewport) {
    window.visualViewport.addEventListener("resize", measureKb);
    window.visualViewport.addEventListener("scroll", measureKb);
    measureKb();
  }
  kbCount += 1;
}
function unsubscribeKeyboard() {
  kbCount = Math.max(0, kbCount - 1);
  if (kbCount === 0) {
    const vv = window.visualViewport;
    if (vv) {
      vv.removeEventListener("resize", measureKb);
      vv.removeEventListener("scroll", measureKb);
    }
    document.documentElement.style.setProperty("--kb", "0px");
  }
}

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
  // Mode « feuille basse » : la poignée et le geste ne s'activent qu'en tactile
  // étroit (≤900px). Suivi réactif pour couvrir les changements d'orientation.
  const [isSheet, setIsSheet] = useState(false);
  const [dragging, setDragging] = useState(false);
  // État du glissement (refs → pas de re-rendu à chaque frame de doigt).
  const drag = useRef({ startY: 0, dy: 0, lastY: 0, lastT: 0, vy: 0, active: false });
  // Nettoyage des écouteurs de glissement encore actifs si la modale se démonte.
  const dragCleanup = useRef<null | (() => void)>(null);
  useEffect(() => () => dragCleanup.current?.(), []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsSheet(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Verrou de scroll iOS + suivi du clavier virtuel, tant que la modale est montée.
  useEffect(() => {
    lockBodyScroll();
    subscribeKeyboard();
    return () => {
      unlockBodyScroll();
      unsubscribeKeyboard();
    };
  }, []);

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
    // Champ focalisé (ex. clavier virtuel qui s'ouvre) → on le remonte dans la vue.
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !el || !el.contains(t)) return;
      window.setTimeout(() => {
        try {
          t.scrollIntoView({ block: "nearest" });
        } catch {
          /* navigateurs anciens sans options — sans gravité */
        }
      }, 120);
    };
    document.addEventListener("keydown", onKey);
    el?.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey);
      el?.removeEventListener("focusin", onFocusIn);
      // Restaure le focus sur l'élément déclencheur s'il est toujours dans le DOM.
      if (prevActive && document.contains(prevActive)) prevActive.focus();
    };
  }, [onClose]);

  // Glisser-vers-le-bas pour fermer (feuille mobile). Démarre uniquement depuis
  // la poignée ou l'en-tête — jamais depuis le contenu défilable de la modale.
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSheet || !e.isPrimary) return;
    const el = ref.current;
    if (!el) return;
    const d = drag.current;
    d.startY = e.clientY;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.dy = 0;
    d.vy = 0;
    d.active = false; // devient vrai seulement après un vrai déplacement (pas un tap)

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - d.startY;
      const dt = Math.max(1, ev.timeStamp - d.lastT);
      d.vy = (ev.clientY - d.lastY) / dt; // px/ms (vers le bas = positif)
      d.lastY = ev.clientY;
      d.lastT = ev.timeStamp;
      // Sous le petit seuil : on laisse passer (tap sur le bouton fermer, etc.).
      if (!d.active && Math.abs(dy) < 4) return;
      if (!d.active) {
        d.active = true;
        setDragging(true); // coupe la transition CSS pendant le suivi du doigt
      }
      d.dy = Math.max(0, dy); // glissement vers le bas uniquement
      el.style.transform = `translateY(${d.dy}px)`;
      ev.preventDefault();
    };
    const removeListeners = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      dragCleanup.current = null;
    };
    const onUp = () => {
      removeListeners();
      if (!d.active) return; // simple tap : rien à faire, le clic éventuel passe
      const shouldClose = d.dy > 120 || d.vy > 0.6;
      setDragging(false);
      if (shouldClose) {
        onClose();
      } else {
        // Retour élastique : on efface la translation (transition CSS reprend).
        el.style.transform = "";
      }
      d.active = false;
      d.dy = 0;
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    dragCleanup.current = removeListeners;
  };

  const dragHandlers = isSheet ? { onPointerDown: onDragStart } : {};

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal${wide ? " modal-lg" : ""}${dragging ? " dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        ref={ref}
        tabIndex={-1}
      >
        {/* Poignée de feuille (mobile) : indique et déclenche le glisser-pour-fermer. */}
        {isSheet && <div className="sheet-handle" aria-hidden="true" {...dragHandlers} />}
        {title && (
          <div className="modal-head" {...dragHandlers}>
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
