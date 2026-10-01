import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./components/Icon";

/* ════════════════════════════════════════════════════════════════════════
   Couches (portails) : toutes les surfaces superposées (feuilles, alertes,
   toasts, menus) vivent dans #mn-couches, frère de #root dans index.html.
   Elles passent ainsi au-dessus de toute l'app (lecteur de stories compris),
   et #root peut être rendu `inert` pendant qu'une feuille est ouverte.
   ════════════════════════════════════════════════════════════════════════ */
function couches(): HTMLElement {
  return document.getElementById("mn-couches") ?? document.body;
}

/** Vrai sur un écran étroit (feuille basse plutôt que modale centrée). */
function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const sync = () => setMatch(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return match;
}
const SHEET_MQ = "(max-width: 900px)";

/* ── Pile des couches et inertie de l'app ───────────────────────────────── */
// Une seule couche « active » à la fois : la dernière ouverte reçoit Échap et
// garde le focus. Tant qu'au moins une couche modale est ouverte, #root est
// `inert` (le reste de l'app ne reçoit ni clic ni focus, ni lecteur d'écran).
// Compteur réentrant : seule la dernière couche fermée lève l'inertie, et elle
// la lève AVANT de rendre le focus (un élément inerte ne peut pas le recevoir).
const layerStack: number[] = [];
let nextLayerId = 1;
let inertCount = 0;
function holdInert() {
  inertCount += 1;
  if (inertCount === 1) document.getElementById("root")?.setAttribute("inert", "");
}
function releaseInert() {
  inertCount = Math.max(0, inertCount - 1);
  if (inertCount === 0) document.getElementById("root")?.removeAttribute("inert");
}
const isTopLayer = (id: number) => layerStack[layerStack.length - 1] === id;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELD =
  'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="range"]):not([type="color"]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]';

/**
 * Comportement commun des couches modales : pile, inertie de l'app, verrou de
 * défilement, Échap (couche du dessus seulement), piège du focus, focus
 * initial et restitution du focus au déclencheur.
 *
 * Focus initial : un champ déjà focalisé par `autoFocus` est respecté ; sinon,
 * avec un pointeur fin (souris), le premier champ de saisie ; au doigt, le
 * dialogue lui-même (un clavier virtuel qui s'ouvre tout seul masquerait la
 * moitié de la feuille). Jamais le bouton de fermeture : plus d'anneau orange
 * sur la croix à l'ouverture.
 */
function useLayer(
  ref: React.RefObject<HTMLElement>,
  onClose: () => void,
  opts: { initial?: "field" | "self" | ((el: HTMLElement) => HTMLElement | null); keyboard?: boolean } = {},
) {
  // onClose change d'identité à chaque rendu du parent (fonction fléchée) :
  // on le lit dans une réf pour que l'effet ne s'exécute QU'UNE fois. Avant,
  // chaque frappe dans une feuille relançait l'effet, rendait le focus au
  // déclencheur puis le reposait sur le premier élément : le clavier iOS se
  // fermait après chaque ajout.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const initial = opts.initial ?? "field";
  const initialRef = useRef(initial);
  const keyboard = !!opts.keyboard;
  // Déclencheur à qui rendre le focus : lu pendant le PREMIER rendu, avant que
  // React ne pose un éventuel autoFocus dans la couche (l'effet arriverait
  // trop tard et retiendrait le champ de la couche elle-même).
  const trigger = useRef<HTMLElement | null | undefined>(undefined);
  if (trigger.current === undefined && typeof document !== "undefined") {
    trigger.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    const id = nextLayerId++;
    layerStack.push(id);
    const prevActive = trigger.current ?? null;
    holdInert();
    lockBodyScroll();
    if (keyboard) subscribeKeyboard();

    const el = ref.current;
    const focusables = () => (el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    if (el && !el.contains(document.activeElement)) {
      const init = initialRef.current;
      let target: HTMLElement | null = null;
      if (typeof init === "function") target = init(el);
      else if (init === "field") {
        const fine = !!window.matchMedia?.("(pointer: fine)").matches;
        if (fine) target = el.querySelector<HTMLElement>(FIELD);
      }
      (target ?? el).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (!isTopLayer(id)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key === "Tab" && el) {
        const f = focusables();
        if (!f.length) {
          e.preventDefault();
          el.focus();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !el.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // Champ focalisé (clavier virtuel qui s'ouvre) : on le remonte dans la vue.
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !el || !el.contains(t) || t === el) return;
      window.setTimeout(() => {
        try {
          t.scrollIntoView({ block: "nearest" });
        } catch {
          /* navigateurs anciens sans options : sans gravité */
        }
      }, 120);
    };
    document.addEventListener("keydown", onKey);
    el?.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey);
      el?.removeEventListener("focusin", onFocusIn);
      const i = layerStack.lastIndexOf(id);
      if (i >= 0) layerStack.splice(i, 1);
      if (keyboard) unsubscribeKeyboard();
      unlockBodyScroll();
      // L'inertie tombe AVANT la restitution du focus.
      releaseInert();
      if (prevActive && document.contains(prevActive)) prevActive.focus({ preventScroll: true });
    };
  }, [ref, keyboard]);
}

/* ── Toasts (l'« île ») ─────────────────────────────────────────────────── */
export type ToastKind = "success" | "error" | "info";
export interface ToastAction {
  label: string;
  onClick: () => void;
}
export interface ToastOptions {
  kind?: ToastKind;
  action?: ToastAction;
  /** Durée d'affichage en ms (défaut : 3,2 s ; 5 s pour une erreur ; 6 s avec une action). */
  duration?: number;
}
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}
interface ToastCtx {
  /** `push(message)`, `push(message, true)` (erreur, ancienne signature) ou
   *  `push(message, { kind, action: { label, onClick }, duration })`. */
  push: (message: string, errorOrOptions?: boolean | ToastOptions) => void;
}
const ToastContext = createContext<ToastCtx>({ push: () => {} });
const TOAST_ICON: Record<ToastKind, IconName> = { success: "checkCircle", error: "alert", info: "info" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, number>());
  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);
  const push = useCallback(
    (message: string, errorOrOptions?: boolean | ToastOptions) => {
      const opts: ToastOptions =
        typeof errorOrOptions === "boolean" ? { kind: errorOrOptions ? "error" : "success" } : errorOrOptions ?? {};
      const kind: ToastKind = opts.kind ?? "success";
      const id = Date.now() + Math.random();
      // Trois toasts au plus : le plus ancien laisse sa place.
      setToasts((list) => [...list.slice(-2), { id, message, kind, action: opts.action }]);
      const ttl = opts.duration ?? (opts.action ? 6000 : kind === "error" ? 5000 : 3200);
      timers.current.set(id, window.setTimeout(() => dismiss(id), ttl));
    },
    [dismiss],
  );
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {/* aria-live=polite + role=status : les toasts sont annoncés aux lecteurs
          d'écran ; une erreur porte role=alert (annonce immédiate). */}
      {createPortal(
        <div className="toast-wrap" role="status" aria-live="polite" aria-atomic="false">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast${t.kind === "error" ? " error" : ""}`}
              data-kind={t.kind}
              role={t.kind === "error" ? "alert" : undefined}
            >
              <span className="toast-ic" aria-hidden="true">
                <Icon name={TOAST_ICON[t.kind]} size={20} strokeWidth={2} />
              </span>
              <span className="toast-msg" onClick={() => dismiss(t.id)}>
                {t.message}
              </span>
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    dismiss(t.id);
                    t.action?.onClick();
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        couches(),
      )}
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
// basse au-dessus du clavier. Compteur global comme le verrou.
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

/* ── Modal (feuille basse au téléphone, modale centrée au bureau) ───────── */
export function Modal({
  title,
  onClose,
  children,
  wide,
  footer,
  label,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
  /** Nom accessible quand il n'y a pas de titre (ou un titre non textuel). */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Mode « feuille basse » : la poignée et le geste ne s'activent qu'en étroit
  // (≤ 900 px). Suivi réactif pour couvrir les changements d'orientation.
  const isSheet = useMedia(SHEET_MQ);
  const [dragging, setDragging] = useState(false);
  // État du glissement (refs → pas de re-rendu à chaque image du doigt).
  const drag = useRef({ startY: 0, dy: 0, lastY: 0, lastT: 0, vy: 0, active: false });
  const dragCleanup = useRef<null | (() => void)>(null);
  useEffect(() => () => dragCleanup.current?.(), []);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayer(ref, onClose, { keyboard: true });

  // Glisser-vers-le-bas pour fermer (feuille mobile). Démarre uniquement depuis
  // la poignée ou l'en-tête, jamais depuis le contenu défilable.
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
      if (!d.active && Math.abs(dy) < 4) return; // tap sur la croix : on laisse passer
      if (!d.active) {
        d.active = true;
        setDragging(true); // coupe la transition CSS pendant le suivi du doigt
      }
      d.dy = Math.max(0, dy); // vers le bas uniquement
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
      if (!d.active) return;
      const shouldClose = d.dy > 120 || d.vy > 0.6;
      setDragging(false);
      if (shouldClose) closeRef.current();
      else el.style.transform = ""; // retour élastique (la transition CSS reprend)
      d.active = false;
      d.dy = 0;
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    dragCleanup.current = removeListeners;
  };
  const dragHandlers = isSheet ? { onPointerDown: onDragStart } : {};

  return createPortal(
    <div className="overlay" data-state="open" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div
        className={`modal has-body${wide ? " modal-lg" : ""}${dragging ? " dragging" : ""}${footer ? " has-foot" : ""}${title ? "" : " no-head"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? label : undefined}
        ref={ref}
        tabIndex={-1}
      >
        {/* Poignée de feuille (mobile) : indique et déclenche le glisser-pour-fermer. */}
        {isSheet && <div className="sheet-handle" aria-hidden="true" {...dragHandlers} />}
        {title && (
          <div className="modal-head" {...dragHandlers}>
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn btn-icon btn-soft modal-close" onClick={() => closeRef.current()} aria-label="Fermer">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    couches(),
  );
}

/* ── Spinner ────────────────────────────────────────────────────────────── */
export const Spinner = () => <div className="spinner" role="status" aria-label="Chargement" />;

/* ── État vide : aperçu fantôme ─────────────────────────────────────────── */
export type EmptyVariant = "list" | "cards" | "grid" | "text";
const EMPTY_ICON: Record<EmptyVariant, IconName> = { list: "lists", cards: "grid", grid: "image", text: "notes" };

function GhostShapes({ variant }: { variant: EmptyVariant }) {
  if (variant === "list")
    return (
      <>
        {[0, 1, 2].map((i) => (
          <span key={i} className="ghost-row">
            <span className="ghost-dot" />
            <span className="ghost-line" style={{ width: `${[62, 48, 56][i]}%` }} />
          </span>
        ))}
      </>
    );
  if (variant === "grid")
    return (
      <span className="ghost-grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="ghost-tile" />
        ))}
      </span>
    );
  if (variant === "text")
    return (
      <span className="ghost-text">
        {[88, 96, 72, 54].map((w, i) => (
          <span key={i} className="ghost-line" style={{ width: `${w}%` }} />
        ))}
      </span>
    );
  return (
    <span className="ghost-cards">
      {[0, 1, 2].map((i) => (
        <span key={i} className="ghost-card">
          <span className="ghost-line" style={{ width: "58%" }} />
          <span className="ghost-line ghost-line--soft" style={{ width: "82%" }} />
        </span>
      ))}
    </span>
  );
}

/**
 * État vide : un aperçu fantôme (contours en pointillés de la forme du contenu
 * à venir) avec l'icône posée dessus, un titre, une phrase et UNE action.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  variant = "cards",
}: {
  /** @deprecated : l'app utilise des icônes SVG « maison », jamais d'emoji dans le chrome. */
  emoji?: string;
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
  /** Forme du contenu attendu (défaut : cartes). */
  variant?: EmptyVariant;
}) {
  return (
    <div className="empty empty--ghost" data-variant={variant}>
      <div className="empty-ghost" aria-hidden="true">
        <GhostShapes variant={variant} />
        <span className="empty-ghost-icon">
          <Icon name={icon ?? EMPTY_ICON[variant]} size={26} strokeWidth={1.7} />
        </span>
      </div>
      <h3 className="empty-title">{title}</h3>
      {hint && <p className="empty-hint">{hint}</p>}
      {action && <div className="empty-action">{action}</div>}
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

/* ── Confirmation (feuille d'action iOS / alerte centrée) ───────────────── */
export interface ConfirmOptions {
  /** Titre = la question (« Supprimer « Courses » ? »). Sans titre, le message en tient lieu. */
  title?: string;
  /** Verbe du bouton (« Supprimer la liste »). Deviné depuis le message sinon. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action destructrice : bouton rouge. Deviné depuis le message sinon. */
  danger?: boolean;
}
const VERBES_DESTRUCTEURS = ["Supprimer", "Retirer", "Effacer", "Vider", "Quitter", "Annuler", "Bloquer", "Déconnecter"];
const VERBES = [...VERBES_DESTRUCTEURS, "Clôturer", "Archiver", "Remplacer", "Réinitialiser", "Envoyer", "Publier"];
/** Devine le libellé et la gravité depuis le début du message (« Supprimer … ? »). */
export function devinerConfirmation(message: string): { label: string; danger: boolean } {
  const premier = message.trim().split(/\s+/)[0]?.replace(/[^\p{L}-]/gu, "") ?? "";
  if (VERBES.includes(premier)) return { label: premier, danger: VERBES_DESTRUCTEURS.includes(premier) };
  return { label: "Confirmer", danger: false };
}

function ConfirmSheet({
  message,
  opts,
  onResult,
}: {
  message: string;
  opts: ConfirmOptions;
  onResult: (v: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const msgId = useId();
  const guess = devinerConfirmation(message);
  const danger = opts.danger ?? guess.danger;
  const confirmLabel = opts.confirmLabel ?? guess.label;
  const title = opts.title ?? message;
  const body = opts.title ? message : null;
  // Focus initial : « Annuler » si l'action est destructrice (Entrée ne casse
  // rien par mégarde), le bouton d'action sinon.
  useLayer(ref, () => onResult(false), {
    initial: (el) => el.querySelector<HTMLElement>(danger ? ".confirm-cancel" : ".confirm-ok"),
  });
  return createPortal(
    <div className="overlay overlay--confirm" data-state="open" onMouseDown={(e) => e.target === e.currentTarget && onResult(false)}>
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? msgId : undefined}
        ref={ref}
        tabIndex={-1}
      >
        <div className="confirm-text">
          <h2 className="confirm-title" id={titleId}>{title}</h2>
          {body && <p className="confirm-msg" id={msgId}>{body}</p>}
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn confirm-cancel" onClick={() => onResult(false)}>
            {opts.cancelLabel ?? "Annuler"}
          </button>
          <button type="button" className={`btn confirm-ok${danger ? " is-danger" : ""}`} onClick={() => onResult(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    couches(),
  );
}

/**
 * `const { confirm, confirmNode } = useConfirm();` puis
 * `if (await confirm("Supprimer « Courses » ?", { danger: true, confirmLabel: "Supprimer la liste" }))`.
 * Rendu en feuille d'action iOS au téléphone, en petite alerte au bureau.
 */
export function useConfirm() {
  const [state, setState] = useState<{ message: string; opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback(
    (message: string, opts?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setState({ message, opts: opts ?? {}, resolve })),
    [],
  );
  const node = state ? (
    <ConfirmSheet
      message={state.message}
      opts={state.opts}
      onResult={(v) => {
        state.resolve(v);
        setState(null);
      }}
    />
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

/* ════════════════════════════════════════════════════════════════════════
   Primitives 2026 (styles : section « Primitives 2026 » de styles.css)
   ════════════════════════════════════════════════════════════════════════ */

/* ── PageHeader : grand titre iOS ───────────────────────────────────────── */
/**
 * Grand titre de page (Fraunces), sans sur-titre, suivi au plus d'UNE ligne
 * utile. `actions` : au téléphone, passer des `IconButton` (ou des `.btn` dont
 * le texte est dans un `<span className="btn-label">`, masqué au téléphone).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Lien de retour vers la page parente (« ‹ Voyages »). */
  back?: { to: string; label: string };
}) {
  return (
    <header className="page-header">
      {back && (
        <Link className="page-back" to={back.to}>
          <Icon name="chevronLeft" size={18} strokeWidth={2} />
          <span>{back.label}</span>
        </Link>
      )}
      <div className="page-header-row">
        <div className="page-header-text">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}

/* ── Skeleton ───────────────────────────────────────────────────────────── */
export type SkeletonVariant = "line" | "card" | "avatar" | "thumb";
export function Skeleton({
  variant = "line",
  width,
  height,
  count = 1,
  className,
}: {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  /** Nombre de répétitions (lignes, vignettes…). */
  count?: number;
  className?: string;
}) {
  const style: CSSProperties = {};
  if (width != null) style.width = width;
  if (height != null) style.height = height;
  const items = Array.from({ length: Math.max(1, count) }, (_, i) => (
    <span
      key={i}
      className={`skeleton skeleton--${variant}${className ? ` ${className}` : ""}`}
      // Lignes successives un peu plus courtes : un paragraphe, pas une grille.
      style={variant === "line" && count > 1 && width == null && i === count - 1 ? { ...style, width: "62%" } : style}
      aria-hidden="true"
    />
  ));
  return count > 1 ? <span className={`skeleton-group skeleton-group--${variant}`}>{items}</span> : items[0];
}

/* ── Ring : anneau de progression ───────────────────────────────────────── */
export function Ring({
  value,
  size = 44,
  stroke = 4,
  color = "var(--accent-strong)",
  track = "var(--ring-track)",
  label,
  children,
}: {
  /** Progression de 0 à 1 (bornée). */
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  /** Nom accessible (« 3 sur 5 cochés »). */
  label?: string;
  children?: ReactNode;
}) {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  return (
    <span
      className="ring"
      style={{ width: size, height: size }}
      data-fx-progress={v.toFixed(3)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100 100"
          strokeDashoffset={100 - v * 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={v === 0 ? 0 : 1}
        />
      </svg>
      {children != null && <span className="ring-label">{children}</span>}
    </span>
  );
}

/* ── Seg : contrôle segmenté à pastille glissante ───────────────────────── */
export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  /** Petit compteur à droite du libellé. */
  badge?: ReactNode;
}
export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Nom accessible du groupe d'onglets. */
  label?: string;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const list = listRef.current;
    const scroller = scrollRef.current;
    if (!list || !scroller) return;
    const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
    setThumb(active ? { x: active.offsetLeft, w: active.offsetWidth } : null);
    const max = scroller.scrollWidth - scroller.clientWidth;
    setEdges({ start: scroller.scrollLeft > 2, end: scroller.scrollLeft < max - 2 });
  }, []);

  useLayoutEffect(() => {
    measure();
    // Amène l'onglet choisi dans la vue quand la barre défile.
    const scroller = scrollRef.current;
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (scroller && active && scroller.scrollWidth > scroller.clientWidth) {
      const left = active.offsetLeft - 12;
      const right = active.offsetLeft + active.offsetWidth + 12 - scroller.clientWidth;
      if (scroller.scrollLeft > left) scroller.scrollLeft = left;
      else if (scroller.scrollLeft < right) scroller.scrollLeft = right;
    }
  }, [value, options.length, measure]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    ro?.observe(scroller);
    if (listRef.current) ro?.observe(listRef.current);
    scroller.addEventListener("scroll", measure, { passive: true });
    // Les polices web changent la largeur des libellés après le premier rendu.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      ro?.disconnect();
      scroller.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = options.findIndex((o) => o.value === value);
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % options.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + options.length) % options.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = options.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(options[n].value);
    window.requestAnimationFrame(() =>
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[n]?.focus(),
    );
  };

  return (
    <div
      ref={scrollRef}
      className={`segmented-scroll${className ? ` ${className}` : ""}`}
      data-fade-start={edges.start ? "" : undefined}
      data-fade-end={edges.end ? "" : undefined}
    >
      <div ref={listRef} className="segmented" role="tablist" aria-label={label}>
        <span
          className="segmented-thumb"
          aria-hidden="true"
          style={thumb ? { width: thumb.w, transform: `translateX(${thumb.x}px)`, opacity: 1 } : { opacity: 0 }}
        />
        {options.map((o) => {
          const sel = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={sel}
              tabIndex={sel ? 0 : -1}
              className={`segmented-item${sel ? " is-selected" : ""}`}
              onClick={() => onChange(o.value)}
              onKeyDown={onKey}
            >
              {o.icon && <Icon name={o.icon} size={16} />}
              <span>{o.label}</span>
              {o.badge != null && <span className="segmented-badge">{o.badge}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── ListGroup + ListRow : liste groupée iOS ────────────────────────────── */
export function ListGroup({
  title,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  /** Ligne d'explication sous le groupe. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <section className={`list-group${className ? ` ${className}` : ""}`}>
      {title && <h3 className="list-group-title">{title}</h3>}
      <ul className="list-group-body" role="list">
        {rows.map((r, i) => (
          <li key={isValidElement(r) && r.key != null ? r.key : i} className="list-group-item">
            {r}
          </li>
        ))}
      </ul>
      {footer && <p className="list-group-foot">{footer}</p>}
    </section>
  );
}

export function ListRow({
  leading,
  icon,
  title,
  subtitle,
  trailing,
  chevron,
  onClick,
  to,
  danger,
  disabled,
}: {
  /** Élément de tête (avatar, vignette…). */
  leading?: ReactNode;
  /** Icône nue en tête (pas de tuile teintée). */
  icon?: IconName;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Accessoire à droite (valeur, interrupteur, badge…). */
  trailing?: ReactNode;
  /** Chevron « › » : par défaut quand la rangée mène quelque part (to / onClick). */
  chevron?: boolean;
  onClick?: () => void;
  to?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const lead = leading ?? (icon ? <Icon name={icon} size={22} /> : null);
  const tap = !!(to || onClick) && !disabled;
  const showChevron = chevron ?? tap;
  const cls = `list-row${lead ? " has-leading" : ""}${tap ? " list-row--tap" : ""}${danger ? " is-danger" : ""}`;
  const inner = (
    <>
      {lead && <span className="list-row-lead">{lead}</span>}
      <span className="list-row-main">
        <span className="list-row-title">{title}</span>
        {subtitle && <span className="list-row-sub">{subtitle}</span>}
      </span>
      {trailing != null && <span className="list-row-trail">{trailing}</span>}
      {showChevron && (
        <span className="list-row-chev" aria-hidden="true">
          <Icon name="chevronRight" size={18} strokeWidth={2} />
        </span>
      )}
    </>
  );
  if (to && !disabled)
    return (
      <Link className={cls} to={to}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick} disabled={disabled}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

/* ── AvatarStack ────────────────────────────────────────────────────────── */
export interface AvatarPerson {
  name: string;
  avatar_url?: string | null;
}
function initiales(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return s.toUpperCase() || "?";
}
export function AvatarStack({
  people,
  max = 4,
  size = 28,
  label,
}: {
  people: AvatarPerson[];
  max?: number;
  size?: number;
  /** Nom accessible (« Marie, Léa et 2 autres »). Construit automatiquement sinon. */
  label?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const auto =
    people.length === 0
      ? "Personne"
      : people.length <= max
        ? people.map((p) => p.name).join(", ")
        : `${shown.map((p) => p.name).join(", ")} et ${rest} autre${rest > 1 ? "s" : ""}`;
  return (
    <span className="avatar-stack" role="img" aria-label={label ?? auto} style={{ ["--av" as string]: `${size}px` }}>
      {shown.map((p, i) => (
        <span key={i} className="avatar-stack-item">
          {p.avatar_url ? <img src={p.avatar_url} alt="" /> : <span className="avatar-stack-initials">{initiales(p.name)}</span>}
        </span>
      ))}
      {rest > 0 && <span className="avatar-stack-item avatar-stack-more">+{rest}</span>}
    </span>
  );
}

/* ── IconButton : bouton rond 44 px ─────────────────────────────────────── */
export type IconButtonProps = {
  icon: IconName;
  /** Nom accessible OBLIGATOIRE (le bouton n'a pas de texte). */
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "soft" | "plain" | "primary";
  size?: number;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "className" | "disabled" | "children">;
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, onClick, variant = "soft", size = 20, className, type = "button", disabled, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={`icon-btn icon-btn--${variant}${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={rest.title ?? label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={size} />
    </button>
  );
});

/* ── MenuButton : « … » (feuille d'actions au téléphone, popover au bureau) ─ */
export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ActionSheet({ items, title, onClose }: { items: MenuItem[]; title?: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayer(ref, onClose, { initial: "self" });
  return createPortal(
    <div className="overlay overlay--confirm" data-state="open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="action-sheet" role="dialog" aria-modal="true" aria-label={title ?? "Actions"} ref={ref} tabIndex={-1}>
        <div className="action-sheet-group" role="menu">
          {title && <p className="action-sheet-title">{title}</p>}
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`action-sheet-item${it.danger ? " is-danger" : ""}`}
              disabled={it.disabled}
              onClick={() => {
                onClose();
                it.onClick();
              }}
            >
              {it.icon && <Icon name={it.icon} size={20} />}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="action-sheet-cancel" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>,
    couches(),
  );
}

function MenuPopover({
  id,
  items,
  anchor,
  align,
  onClose,
}: {
  id: string;
  items: MenuItem[];
  anchor: HTMLElement;
  align: "start" | "end";
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === "end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    const below = r.bottom + 6 + h <= vh - 8 || r.top - 6 - h < 8;
    const top = below ? r.bottom + 6 : r.top - 6 - h;
    setPos({ top, left, origin: `${align === "end" ? "right" : "left"} ${below ? "top" : "bottom"}` });
  }, [anchor, align]);

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    first?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.contains(t)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        anchor.focus();
      }
      if (e.key === "Tab") closeRef.current();
    };
    const onScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      closeRef.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchor]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    let n = -1;
    if (e.key === "ArrowDown") n = (i + 1) % list.length;
    else if (e.key === "ArrowUp") n = (i - 1 + list.length) % list.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = list.length - 1;
    if (n < 0) return;
    e.preventDefault();
    list[n]?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      id={id}
      className="menu-popover"
      role="menu"
      data-state="open"
      onKeyDown={onMenuKey}
      style={
        pos
          ? { top: pos.top, left: pos.left, transformOrigin: pos.origin }
          : { top: 0, left: 0, visibility: "hidden" }
      }
    >
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          className={`menu-item${it.danger ? " is-danger" : ""}`}
          disabled={it.disabled}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          {it.icon && <Icon name={it.icon} size={18} />}
          <span>{it.label}</span>
        </button>
      ))}
    </div>,
    couches(),
  );
}

/**
 * Bouton « … » qui regroupe les actions secondaires et destructrices d'un
 * élément (règle : jamais de corbeille rouge sur chaque carte). Feuille
 * d'actions au téléphone, popover ancré au bureau.
 */
export function MenuButton({
  items,
  label = "Plus d'actions",
  icon = "more",
  title,
  align = "end",
  variant = "plain",
  className,
}: {
  items: MenuItem[];
  label?: string;
  icon?: IconName;
  /** Titre de la feuille d'actions au téléphone. */
  title?: string;
  align?: "start" | "end";
  variant?: "soft" | "plain";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const sheet = useMedia(SHEET_MQ);
  const menuId = useId();
  return (
    <>
      <IconButton
        ref={btnRef}
        icon={icon}
        label={label}
        variant={variant}
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open && !sheet ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        data-menu-button=""
      />
      {open &&
        (sheet ? (
          <ActionSheet items={items} title={title} onClose={() => setOpen(false)} />
        ) : (
          btnRef.current && (
            <MenuPopover id={menuId} items={items} anchor={btnRef.current} align={align} onClose={() => setOpen(false)} />
          )
        ))}
    </>
  );
}
