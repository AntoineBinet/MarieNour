import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Icon } from "./Icon";
import type { Memory, MemoryReel } from "@shared/types";

const PHOTO_MS = 5000;
const TEXT_MS = 6000;
const LINK_MS = 7000;

function durationFor(m: Memory): number {
  if (m.kind === "text") return TEXT_MS;
  if (m.kind === "link") return LINK_MS;
  return PHOTO_MS; // photo (vidéo gérée séparément via l'élément <video>)
}

function timeAgo(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const providerLabel: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  pinterest: "Pinterest",
  vimeo: "Vimeo",
  spotify: "Spotify",
  twitter: "X",
  facebook: "Facebook",
  snapchat: "Snapchat",
  web: "Lien",
};

/**
 * Lecteur de « stories » plein écran, façon Snapchat : barres de progression en
 * haut, lecture automatique, tap à droite/gauche pour avancer/reculer, maintien
 * pour mettre en pause. Optimisé mobile (gestes tactiles) et clavier sur PC.
 */
export default function StoryViewer({
  reels,
  startReel = 0,
  onClose,
}: {
  reels: MemoryReel[];
  startReel?: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [ri, setRi] = useState(Math.max(0, Math.min(startReel, reels.length - 1)));
  const [mi, setMi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0→1 de la story courante
  const [muted, setMuted] = useState(true);

  const reel = reels[ri];
  const memory = reel?.memories[mi];

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const elapsedRef = useRef<number>(0);
  const pausedRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Synchronise la pause sans relancer la boucle d'animation.
  useEffect(() => {
    pausedRef.current = paused;
    const v = videoRef.current;
    if (v) {
      if (paused) v.pause();
      else void v.play().catch(() => {});
    }
  }, [paused]);

  const goClose = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["memory-recap"] });
    onClose();
  }, [onClose, qc]);

  const next = useCallback(() => {
    setProgress(0);
    elapsedRef.current = 0;
    if (!reel) return goClose();
    if (mi < reel.memories.length - 1) {
      setMi((v) => v + 1);
    } else if (ri < reels.length - 1) {
      setRi((v) => v + 1);
      setMi(0);
    } else {
      goClose();
    }
  }, [reel, mi, ri, reels.length, goClose]);

  const prev = useCallback(() => {
    setProgress(0);
    elapsedRef.current = 0;
    if (mi > 0) {
      setMi((v) => v - 1);
    } else if (ri > 0) {
      const prevReel = reels[ri - 1];
      setRi((v) => v - 1);
      setMi(prevReel.memories.length - 1);
    } else {
      setProgress(0);
    }
  }, [mi, ri, reels]);

  // Progression animée (sauf vidéo, pilotée par l'élément <video>). La pause est
  // lue via pausedRef pour ne pas réinitialiser la barre en cours.
  useEffect(() => {
    if (!memory) return;
    if (memory.kind === "video") return; // géré par onTimeUpdate / onEnded
    elapsedRef.current = 0;
    setProgress(0);
    const dur = durationFor(memory);
    let last = 0;
    const tick = (t: number) => {
      if (!last) last = t;
      const dt = t - last;
      last = t;
      if (!pausedRef.current) {
        elapsedRef.current += dt;
        const p = Math.min(1, elapsedRef.current / dur);
        setProgress(p);
        if (p >= 1) {
          next();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ri, mi, memory?.id, next]);

  // Clavier (PC).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") setPaused((p) => !p);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [next, prev, goClose]);

  const like = useMutation({
    mutationFn: () => api.like("memory", memory!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memories"] });
      qc.invalidateQueries({ queryKey: ["memory-recap"] });
    },
  });

  if (!reel || !memory) return null;

  // Gestes tactiles : tap court = navigation, maintien = pause.
  const onPointerDown = () => {
    holdTimer.current = setTimeout(() => setPaused(true), 220);
  };
  const endHold = (clientX: number, width: number) => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (paused) {
      setPaused(false);
      return;
    }
    if (clientX < width * 0.32) prev();
    else next();
  };

  const author = reel.author;
  const dur = durationFor(memory);

  return (
    <div className="story-overlay" role="dialog" aria-modal="true">
      <div className="story-stage">
        {/* Média de fond */}
        <div className="story-media">
          {memory.kind === "photo" && memory.media_url && (
            <img src={memory.media_url} alt={memory.caption ?? ""} className="story-img" />
          )}
          {memory.kind === "video" && memory.media_url && (
            <video
              ref={videoRef}
              src={memory.media_url}
              className="story-img"
              autoPlay
              playsInline
              muted={muted}
              onEnded={next}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration) setProgress(Math.min(1, v.currentTime / v.duration));
              }}
            />
          )}
          {memory.kind === "link" && (
            <div className="story-link" data-provider={memory.link_provider ?? "web"}>
              {memory.link_image && <img src={memory.link_image} alt="" className="story-link-bg" />}
              <div className="story-link-card">
                <span className="chip chip-accent">{providerLabel[memory.link_provider ?? "web"] ?? "Lien"}</span>
                {memory.link_title && <h3>{memory.link_title}</h3>}
                <a
                  className="btn btn-primary"
                  href={memory.url ?? "#"}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icon name="link" size={15} /> Ouvrir
                </a>
              </div>
            </div>
          )}
          {memory.kind === "text" && (
            <div className="story-text">
              <p>{memory.caption}</p>
            </div>
          )}
        </div>

        {/* Zone de gestes (tap / maintien) */}
        <div
          className="story-touch"
          onPointerDown={onPointerDown}
          onPointerUp={(e) => endHold(e.clientX - e.currentTarget.getBoundingClientRect().left, e.currentTarget.clientWidth)}
          onPointerLeave={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            if (paused) setPaused(false);
          }}
        />

        {/* Barres de progression */}
        <div className="story-bars" style={{ ["--dur" as string]: `${dur}ms` }}>
          {reel.memories.map((_, i) => (
            <span className="story-bar" key={i}>
              <i style={{ width: i < mi ? "100%" : i === mi ? `${progress * 100}%` : "0%" }} />
            </span>
          ))}
        </div>

        {/* En-tête auteur */}
        <div className="story-head">
          <div className="story-avatar">
            {author.avatar_url ? <img src={author.avatar_url} alt="" /> : <Icon name="flower" size={18} />}
          </div>
          <div className="story-head-text">
            <strong>{reel.is_mine ? "Moi" : author.display_name}</strong>
            <span>
              {memory.collection_title ? `${memory.collection_title} · ` : ""}
              {timeAgo(memory.taken_at)}
            </span>
          </div>
          {paused && <span className="story-paused"><Icon name="info" size={13} /> en pause</span>}
          {memory.kind === "video" && (
            <button
              className="story-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
              aria-label={muted ? "Activer le son" : "Couper le son"}
            >
              <Icon name={muted ? "info" : "music"} size={18} />
            </button>
          )}
          <button className="story-icon-btn" onClick={goClose} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Pied : légende + j'aime */}
        <div className="story-foot">
          {memory.caption && memory.kind !== "text" && <p className="story-caption">{memory.caption}</p>}
          <div className="story-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="story-like"
              onClick={() => like.mutate()}
              aria-label={memory.liked_by_me ? "Je n'aime plus" : "J'aime"}
            >
              <Icon name="heart" size={22} filled={memory.liked_by_me} />
              {memory.like_count > 0 && <span>{memory.like_count}</span>}
            </button>
            {(memory.kind === "link" || memory.kind === "video") && memory.url && (
              <a className="story-like" href={memory.url} target="_blank" rel="noreferrer noopener">
                <Icon name="link" size={20} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
