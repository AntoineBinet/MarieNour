// Bandeau d'actions « intelligentes » affiché sous une note : transforme le
// texte capté en suggestions cliquables (planifier une activité, ajouter une
// dépense au portefeuille, faire une liste de courses, préparer un voyage…).
// La logique de détection vit dans noteIntel.ts ; ici on ne fait qu'afficher.
import { useMemo } from "react";
import { analyzeNote, type NoteSuggestion } from "../noteIntel";
import { Icon } from "./Icon";
import type { Note } from "@shared/types";

export function NoteSuggestions({
  note,
  onPick,
}: {
  note: Pick<Note, "title" | "body">;
  onPick: (s: NoteSuggestion) => void;
}) {
  const suggestions = useMemo(
    () => analyzeNote({ title: note.title, body: note.body }),
    [note.title, note.body],
  );
  if (suggestions.length === 0) return null;

  return (
    <div className="note-suggest" onClick={(e) => e.stopPropagation()}>
      <span className="note-suggest-spark" title="Suggestions intelligentes">
        <Icon name="wand" size={13} />
      </span>
      {suggestions.map((s) => (
        <button
          key={s.kind}
          type="button"
          className="note-suggest-chip"
          title={s.hint}
          onClick={(e) => {
            e.stopPropagation();
            onPick(s);
          }}
        >
          <Icon name={s.icon} size={13} />
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

export default NoteSuggestions;
