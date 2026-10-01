// Contrat DOM des primitives de src/ui.tsx (rendu serveur, sans navigateur) :
// les classes stables et les crochets lus par la couche fx et les lots de
// refonte (cf. docs/DESIGN-FX.md §4). Rendu par react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  AvatarStack,
  EmptyState,
  IconButton,
  ListGroup,
  ListRow,
  MenuButton,
  PageHeader,
  Ring,
  Seg,
  Skeleton,
  devinerConfirmation,
} from "../src/ui";

// Le routeur mémoire utilise useLayoutEffect, sans effet en rendu serveur : on
// tait cet avertissement attendu (et lui seul).
beforeAll(() => {
  const orig = console.error;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("useLayoutEffect does nothing on the server")) return;
    orig(...args);
  });
});

const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(h(MemoryRouter, null, el));

describe("PageHeader", () => {
  it("rend un grand titre h1.page-title, sans sur-titre, et une seule ligne de sous-titre", () => {
    const out = html(h(PageHeader, { title: "Listes", subtitle: "3 à cocher", actions: h("button", null, "x") }));
    expect(out).toContain('<header class="page-header">');
    expect(out).toMatch(/<h1 class="page-title">Listes<\/h1>/);
    expect(out).toContain('<p class="page-subtitle">3 à cocher</p>');
    expect(out).toContain('class="page-actions"');
    expect(out).not.toContain("eyebrow");
  });
  it("pose un lien de retour quand back est fourni", () => {
    const out = html(h(PageHeader, { title: "Road trip", back: { to: "/voyages", label: "Voyages" } }));
    expect(out).toMatch(/<a class="page-back" href="\/voyages">/);
  });
});

describe("EmptyState", () => {
  it("est un aperçu fantôme, cartes par défaut, et garde les anciennes props", () => {
    const out = html(h(EmptyState, { emoji: "x", title: "Aucune liste", hint: "Crée-en une.", action: h("button", null, "Créer") }));
    expect(out).toContain('class="empty empty--ghost" data-variant="cards"');
    expect(out).toContain('class="empty-ghost" aria-hidden="true"');
    expect(out).toContain('class="empty-ghost-icon"');
    expect(out).toContain('<h3 class="empty-title">Aucune liste</h3>');
    expect(out).toContain("empty-action");
  });
  it("dessine la forme du contenu selon la variante", () => {
    expect(html(h(EmptyState, { title: "t", variant: "list" }))).toContain("ghost-row");
    expect(html(h(EmptyState, { title: "t", variant: "grid" }))).toContain("ghost-tile");
    expect(html(h(EmptyState, { title: "t", variant: "text" }))).toContain("ghost-text");
  });
  it("n'utilise jamais l'étincelle par défaut (règle anti-« IA » n° 6)", () => {
    for (const variant of ["list", "cards", "grid", "text"] as const) {
      const out = html(h(EmptyState, { title: "t", variant }));
      // L'étincelle de Icon.tsx commence par ce tracé.
      expect(out).not.toContain("M12 3c.4 3.6");
    }
  });
});

describe("Ring", () => {
  it("porte data-fx-progress (borné 0..1) et une progression accessible", () => {
    const out = html(h(Ring, { value: 0.6, label: "3 sur 5" }));
    expect(out).toContain('class="ring"');
    expect(out).toContain('data-fx-progress="0.600"');
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-valuenow="60"');
    expect(html(h(Ring, { value: 4 }))).toContain('data-fx-progress="1.000"');
    expect(html(h(Ring, { value: Number.NaN }))).toContain('data-fx-progress="0.000"');
  });
});

describe("Seg", () => {
  it("est un tablist d'onglets à pastille, un seul sélectionné et focalisable", () => {
    const out = html(
      h(Seg, {
        label: "Filtre",
        value: "b",
        onChange: () => {},
        options: [
          { value: "a", label: "Tout" },
          { value: "b", label: "À faire", badge: 3 },
        ],
      }),
    );
    expect(out).toContain('role="tablist"');
    expect(out).toContain('class="segmented-thumb"');
    expect(out.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(out).toMatch(/role="tab" aria-selected="true" tabindex="0"/);
    expect(out).toMatch(/role="tab" aria-selected="false" tabindex="-1"/);
    expect(out).toContain('class="segmented-badge">3<');
  });
});

describe("ListGroup / ListRow", () => {
  it("rend une liste groupée ; une rangée qui mène quelque part a un chevron", () => {
    const out = html(
      h(
        ListGroup,
        { title: "Réglages" },
        h(ListRow, { icon: "bell", title: "Notifications", to: "/notifs" }),
        h(ListRow, { title: "Version", trailing: "36" }),
      ),
    );
    expect(out).toContain('<ul class="list-group-body" role="list">');
    expect(out.match(/class="list-group-item"/g)?.length).toBe(2);
    expect(out).toMatch(/<a class="list-row has-leading list-row--tap" href="\/notifs">/);
    expect(out.match(/list-row-chev/g)?.length).toBe(1);
    expect(out).toContain('<span class="list-row-trail">36</span>');
  });
});

describe("AvatarStack, IconButton, MenuButton", () => {
  it("AvatarStack : initiales, compteur « +N » et nom accessible accordé", () => {
    const out = html(h(AvatarStack, { people: [{ name: "Marie Lefèvre" }, { name: "Léa" }, { name: "Hugo" }], max: 2 }));
    expect(out).toContain(">ML<");
    expect(out).toContain(">+1<");
    expect(out).toContain('aria-label="Marie Lefèvre, Léa et 1 autre"');
  });
  it("IconButton : nom accessible obligatoire porté par aria-label", () => {
    const out = html(h(IconButton, { icon: "search", label: "Rechercher" }));
    expect(out).toContain('aria-label="Rechercher"');
    expect(out).toContain('class="icon-btn icon-btn--soft"');
  });
  it("MenuButton : bouton « … » qui annonce un menu", () => {
    const out = html(h(MenuButton, { items: [{ label: "Supprimer", danger: true, onClick: () => {} }] }));
    expect(out).toContain('aria-haspopup="menu"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain("Plus d&#x27;actions");
  });
});

describe("Skeleton", () => {
  it("variantes, groupe et masquage aux lecteurs d'écran", () => {
    expect(html(h(Skeleton, {}))).toBe('<span class="skeleton skeleton--line" aria-hidden="true"></span>');
    const out = html(h(Skeleton, { variant: "thumb", count: 3 }));
    expect(out).toContain('class="skeleton-group skeleton-group--thumb"');
    expect(out.match(/skeleton--thumb/g)?.length).toBe(3);
  });
});

describe("devinerConfirmation", () => {
  it("déduit le verbe et la gravité du début du message", () => {
    expect(devinerConfirmation("Supprimer la recette « Tarte » ?")).toEqual({ label: "Supprimer", danger: true });
    expect(devinerConfirmation("Retirer Marie de tes amis ?")).toEqual({ label: "Retirer", danger: true });
    expect(devinerConfirmation("Clôturer le sondage ?")).toEqual({ label: "Clôturer", danger: false });
    expect(devinerConfirmation("Es-tu sûr ?")).toEqual({ label: "Confirmer", danger: false });
  });
});
