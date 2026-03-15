# Plan d’implémentation — version mobile responsive

Objectif : une version **mobile propre, responsive et sans bug** lorsque l’utilisateur utilise l’app sur smartphone ou tablette.

---

## 1. État des lieux (audit)

### Déjà en place (à conserver)
- **Viewport** : `meta name="viewport" content="width=device-width, initial-scale=1.0"` ✅
- **Typo fluide** : `clamp()` pour `--text-*` ✅
- **Hauteur** : `min-height: 100dvh` (bon pour mobile / barre d’URL) ✅
- **Touch targets** : boutons `min-height: 44px` ✅
- **Breakpoints** :
  - `max-width: 1120px` : grille 1 colonne, sidebar au-dessus du contenu
  - `max-width: 760px` : app-shell réduit, blocs en colonne, grilles formulaire en 1 col
- **Tableau suivi** : `overflow-x: auto` sur `.tracking-table-wrap`, `min-width: 900px` sur la table ✅
- **Réduction de mouvement** : `prefers-reduced-motion` déjà géré ✅

### Points à traiter
| Zone | Risque | Action prévue |
|------|--------|----------------|
| **Topbar** | Titre + lede + 2 boutons en ligne → trop chargé sur petit écran | Réduire / replier lede, grouper actions (menu ou icônes) |
| **Sidebar** | Très longue en 1 colonne (hero + progression + nav + résumé) | Drawer repliable ou onglets bas pour navigation |
| **Navigation (tabs)** | Liste verticale longue → beaucoup de scroll | Bas de page fixe (tab bar) ou drawer |
| **Actions rapides** | 3 cartes en grille déjà en 1 col à 1120px | Vérifier espacement et lisibilité sur 320–400px |
| **Formulaires** | Champs, grilles 2/3 colonnes déjà en 1 col à 760px | Vérifier champs larges, selects, file input |
| **Input fichier** | `.click()` sur `<input type="file">` → OK sur mobile (ouvre sélecteur natif) | S’assurer que `accept` et UX sont clairs |
| **Scroll / ancres** | `scrollToElement` avec `behavior: "smooth"` | Tester sur iOS/Android (support variable) |
| **Raccourcis clavier** | Ctrl+S, Échap | Inutiles sur mobile ; ne pas en dépendre, pas de régression |
| **Footer** | Texte long + statut connexion | Raccourcir ou replier sur mobile |

---

## 2. Stratégie responsive

### Breakpoints proposés (alignés sur l’existant)
- **Large** : > 1120px (layout actuel 2 colonnes)
- **Medium** : 761px – 1120px (1 colonne, sidebar au-dessus)
- **Mobile** : ≤ 760px (comportement “mobile” : topbar compact, sidebar gérée en drawer ou onglets)
- **Small mobile** : ≤ 400px (marges et espacements encore réduits si besoin)

### Principes
1. **Mobile-first optionnel** : le CSS actuel est desktop-first ; on ajoute des surcharges dans des `@media (max-width: …)` sans tout réécrire.
2. **Pas de duplication de contenu** : même DOM pour mobile et desktop (pas de “version mobile” séparée en HTML).
3. **Touch-first** : zones cliquables ≥ 44×44px, pas d’interaction basée uniquement sur `:hover`.
4. **Performance** : éviter de charger des ressources lourdes inutiles sur mobile si besoin (hors scope v1 : SQLite/PDF.js déjà utilisés).

---

## 3. Tâches par zone

### 3.1 Topbar (header)
- **760px et moins** :
  - Réduire ou masquer le texte `.lede` (ou le mettre dans un “en savoir plus” / tooltip) pour garder titre + sous-titre courts.
  - Logo + titre sur une ligne ; boutons “Thème” et “Réinitialiser” soit en icônes + labels courts, soit dans un menu “⋮” (overflow) pour libérer de la place.
- **CSS** : `.topbar` en `flex-wrap`, `.brand-wrap` avec `min-width: 0` pour que le titre puisse tronquer avec `ellipsis` si besoin.
- **Accessibilité** : garder `aria-label` sur le bouton thème ; si menu overflow, prévoir focus et fermeture au clic extérieur / Escape.

### 3.2 Sidebar et navigation
- **Option A — Drawer (recommandé)**  
  - Sur ≤ 760px : sidebar masquée par défaut.  
  - Bouton “Menu” ou “Navigation” dans le header ou en flottant ouvre un panneau (drawer) qui slide depuis la gauche (ou du bas) et contient : Accueil, Progression, liste d’onglets (Navigation), Résumé.  
  - Overlay sombre pour fermer au clic.  
  - Fermeture automatique après sélection d’un onglet (navigation vers la section).  
  - **JS** : ajouter un état “drawer open/closed” et un bouton togglé dans le DOM (ex. dans `.topbar` ou avant `main`). Classes CSS `.sidebar-drawer`, `.sidebar-drawer--open`, `.sidebar-overlay`.

- **Option B — Barre d’onglets en bas**  
  - Sur mobile, afficher une barre fixe en bas avec 4–5 icônes + labels (Accueil, Moi, Recherche, … Suivi).  
  - Le contenu principal scroll au-dessus ; la sidebar actuelle peut être masquée ou fortement réduite (ex. seulement indicateur de progression + résumé compact).  
  - Implémentation : dupliquer la logique d’onglets dans un bloc `.bottom-nav` visible uniquement en `@media (max-width: 760px)`.

- **Recommandation** : Option A (drawer) pour rester proche du layout actuel et éviter de dupliquer la liste d’onglets. Option B possible en phase 2 si besoin d’un accès encore plus rapide aux sections.

### 3.3 Contenu principal (content-column)
- **Panel “Actions rapides”** : sur petit écran, garder la grille en 1 colonne ; s’assurer que les cartes ont un padding confortable (déjà `var(--space-5)`) et que le texte ne déborde pas.
- **Formulaires** : les grilles `.form-grid`, `.dual-grid`, `.triple-grid`, etc. passent déjà en 1 colonne à 760px ; vérifier les cas où un `min-width` pourrait provoquer un scroll horizontal.
- **Tableau de suivi** : conserver `overflow-x: auto` ; ajouter un indicateur visuel (ombre ou “scroll →”) si utile, et s’assurer que les cellules ont un `min-width` raisonnable pour la lisibilité.
- **Modales / panneaux** : s’il existe des contenus type “modal” ou “flyout” en JS, ils doivent en mobile occuper tout l’écran ou une grande partie, avec bouton de fermeture bien visible et zone tactile suffisante.

### 3.4 Footer
- Sur ≤ 760px : texte explicatif raccourci ou masqué (classe `.footer-details` visible seulement au-dessus de 760px), et version courte “App locale · Données stockées localement” + statut connexion.
- Toujours en `flex-wrap` pour que le statut passe en dessous si besoin.

### 3.5 Input fichier et imports
- Ne pas bloquer le `input[type="file"]` sur mobile : le `.click()` programmatique ouvre bien le sélecteur natif.
- S’assurer que le libellé “Importer” (ou équivalent) est bien visible et que la zone de drop (si présente) a une hauteur minimale tactile sur mobile.
- Conserver `accept=".pdf,.docx,.txt,.html,.htm"` pour guider le sélecteur.

### 3.6 Scroll et ancres
- `scrollToElement(id)` : garder `behavior: "smooth"` ; sur les navigateurs qui ne le supportent pas bien, pas de régression fonctionnelle (le scroll reste instantané).
- Vérifier que les ancres tiennent compte d’une éventuelle barre de navigation fixe (padding-top ou scroll-margin-top sur les sections cibles) pour éviter que le titre soit caché sous une barre fixe.

---

## 4. Touch et ergonomie

- **Cibles tactiles** : tous les boutons et liens déjà à 44px min-height ; vérifier les `.option-chip`, `.tag button`, liens dans les tableaux.
- **Pas de hover-only** : aucune information critique ou action uniquement au survol ; les états actifs (ex. `.tab-button.active`) restent visibles.
- **Zoom** : ne pas désactiver le zoom utilisateur (`user-scalable=yes` ou pas de `maximum-scale=1` dans le viewport).
- **Safe area** : si l’app est utilisée en PWA ou en plein écran, ajouter si besoin `padding-bottom: env(safe-area-inset-bottom)` sur la barre du bas et `padding-top: env(safe-area-inset-top)` sur le header pour les encoches.

---

## 5. Bugs potentiels à éviter

| Risque | Mitigation |
|--------|------------|
| Double déclenchement (click + touch) | Utiliser des événements standards (`click`), pas de duplication `touchstart`/`click`. |
| Scroll bloqué quand le drawer est ouvert | Sur `body` ou `.app-shell`, ajouter `overflow: hidden` quand le drawer est ouvert (et le retirer à la fermeture). |
| Clavier virtuel qui pousse le contenu | Pas de `position: fixed` sur des formulaires pleine page sans prévoir le resize ; préférer un layout qui scroll. |
| Tables trop larges | Déjà géré par `overflow-x: auto` ; pas de `overflow: hidden` sur le conteneur parent. |
| Focus perdu après fermeture du drawer | Au moment de la fermeture, remettre le focus sur le bouton “Menu” (accessibilité). |

---

## 6. Ordre d’implémentation suggéré

1. **CSS uniquement**  
   - Ajuster topbar (masquer/réduire lede, boutons) à 760px.  
   - Ajuster footer (version courte).  
   - Vérifier grilles et formulaires en 1 colonne, pas de débordement horizontal.  
   - Ajouter safe-area si PWA prévu.

2. **Drawer sidebar (HTML + CSS + JS)**  
   - Ajouter le bouton “Menu”, l’overlay et les classes pour le drawer.  
   - En 760px et moins : sidebar dans le drawer, masquée dans le flux principal.  
   - JS : ouvrir/fermer drawer, fermer sur overlay et après navigation, gestion du focus.

3. **Tests manuels**  
   - Tester sur vrais appareils ou DevTools (responsive + throttling).  
   - Vérifier import de fichier, navigation par onglets, formulaire long, tableau de suivi en scroll horizontal.

4. **Ajustements finaux**  
   - Espacements, tailles de police, contrastes si besoin.  
   - Raccourcis clavier : s’assurer qu’aucune fonction essentielle n’est uniquement au clavier (Échap pour annuler peut rester pour les utilisateurs clavier).

---

## 7. Fichiers à modifier (résumé)

| Fichier | Modifications |
|---------|----------------|
| `index.html` | Bouton “Menu” pour le drawer, conteneur overlay, structure éventuelle pour le drawer (ou sidebar déplacée dans un `aside` dédié drawer). |
| `style.css` | Media queries 760px et 400px : topbar, lede, footer, drawer (position fixed, transition), overlay, bottom safe-area. Vérification overflow et grilles. |
| `app.js` | Logique d’ouverture/fermeture du drawer, liaison du bouton Menu, fermeture sur navigation (changement d’onglet), focus management, optionnellement `scroll-margin-top` pour les ancres. |

---

## 8. Critères de succès

- [ ] Utilisation confortable sur 320px–428px de large (iPhone SE à Pro Max).
- [ ] Aucun scroll horizontal non voulu.
- [ ] Navigation entre sections possible sans frustration (drawer ou barre d’onglets).
- [ ] Import de fichiers (CV, etc.) fonctionnel depuis le mobile.
- [ ] Formulaires et tableaux lisibles et utilisables.
- [ ] Pas de régression sur desktop (≥ 1120px).
- [ ] Thème clair/sombre et préférence `prefers-reduced-motion` toujours respectées.

Ce document peut servir de base pour les issues / tâches (par ex. “Topbar mobile”, “Drawer sidebar”, “Footer mobile”, “Tests manuels mobile”).
