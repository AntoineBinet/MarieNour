# MarieNour · refonte visuelle et couche d'effets (octobre 2026)

> **Demande d'Antoine.** « Upgrade visuel de l'app, sur le modèle de Vinyles. Je veux
> l'impression d'une app iOS dernier cri, fluide, dynamique et fun, visible dès la première
> seconde, en gardant le design et l'esprit Azur Tech (épuré, jamais "fait par une IA").
> Pense à l'utilisation mobile et refais les designs qui ne sont pas beaux, vas à fond. »
>
> Ce document est le **contrat** entre les lots d'implémentation. Il a été écrit à partir de
> l'état des lieux au navigateur (dix agents, 320 / 390 / 1280 px, clair et sombre, plus de
> 1 500 captures, données de démonstration complètes) et du modèle Vinyles
> (`ProjetPortefolio/Vinyles/static/{anim,vol,lumiere,vivant,flux,verre,feuille,platine,scene}.js`).

## 1. Ce que l'audit a établi

- **L'app fonctionne, techniquement soignée pour iOS** (zones sûres, feuille basse glissable,
  verrou de défilement, suivi du clavier, tirer-pour-rafraîchir), **mais elle est immobile et
  générique** : 8 keyframes, aucun ressort, **aucune animation de sortie** (toute surface qui
  se ferme est un démontage React à l'image suivante), chaque navigation est une coupe franche.
- **La silhouette « générée »** se répète sur 18 pages : sur-titre en capitales + gros titre
  serif + slogan gris de deux lignes (souvent avec un cadratin) + gros bouton en pastille ;
  cartes à tuile d'icône teintée ; bord gauche coloré posé sur une carte arrondie (la
  « parenthèse ») ; état vide « tuile + titre + phrase grise + bouton » identique partout ;
  emojis à côté d'icônes monolignes ; chips partout ; corbeille rouge sur chaque carte.
- **Contrastes sous AA, systémiques** : `--muted` à 3,2 à 3,9:1 en clair ; texte blanc sur
  l'accent à 3,76:1 (clair) et 2,96:1 (sombre) sur TOUS les boutons principaux, le « + » et le
  badge de cloche ; soldes « On te doit » à 1,45:1 / 1,29:1 ; revenus à 2,16:1 en sombre
  (jeton `--sage-ink` inexistant) ; barres pastel invisibles (1,08 à 1,33:1).
- **Aucune règle `:hover` n'est gardée par `@media (hover: hover)`** (38 règles) : sur iPhone,
  le survol colle après un tap (liens soulignés, boutons qui restent foncés).
- **Bugs fonctionnels mesurés** (corrigés par les lots, cf. §8) : archives des listes qui
  montrent les listes actives ; conversion d'une note qui la supprime avant de créer la liste ;
  panneau de notifications hors écran au-delà de 560 px ; QR illisible en sombre ; anneaux de
  stories ovales qui débordent ; titres des collections masqués par les photos ; suppression
  d'un souvenir impossible au téléphone ; « Qui apporte quoi » qui se chevauche ; boutons de
  vote hors carte à 320 px ; modales qui défilent à l'horizontale à 320 px ; spinner plein
  écran à chaque changement de mois en Finances ; vol du focus après chaque ajout d'élément
  (le clavier iOS se ferme) ; double tap perdu sur une case ; co-hôte qui « supprime » un
  événement (toast mensonger) ; flash crème au démarrage en thème sombre.

## 2. La direction artistique

**On garde** : la palette terracotta et les pastels (sand, sage, sky, blush, lilac, butter),
Fraunces pour les titres et les chiffres héros, Inter pour le texte, le crème chaud en clair et
le brun chaud en sombre, le logo floral, la salutation par prénom, la feuille basse à poignée.

**On change** : la coquille devient celle d'une app iOS 26 (verre liquide, capsule flottante,
grand titre qui se replie), les écrans de gestion deviennent des **listes groupées** (« inset
grouped » des Réglages et de Rappels) et des **cartes de contenu** (photo d'abord), les
formulaires deviennent des feuilles composées (montant héros, pastilles, sections repliées).

### Les règles anti-« IA » (verrouillées par les tests de doctrine)

1. **Pas de sur-titre en capitales au-dessus d'un titre de page.** Le titre de page est un
   grand titre (`PageHeader`), éventuellement suivi d'UNE ligne utile (une information, pas un
   slogan).
2. **Pas de bord gauche coloré sur un élément arrondi.** La gravité se dit par un point de
   couleur et un mot.
3. **Pas de tuile d'icône teintée devant chaque titre de carte.** Une icône nue suffit.
4. **Pas d'emoji dans le chrome de l'app** (le contenu saisi par le membre en garde le droit).
5. **Pas de tiret cadratin dans un texte affiché.** Reformuler (deux points, virgule, point,
   parenthèses). Placeholder de valeur vide : « – » (demi-cadratin).
6. **Pas d'étincelle « magique »** (`sparkle`) comme icône par défaut ou décorative.
7. **Une seule action principale par écran** ; les actions destructrices vivent dans un menu
   « … » ou un balayage, jamais en bouton rouge sur chaque carte.
8. **Chiffres en `font-variant-numeric: tabular-nums`**, montants formatés fr-FR (« 1 800,00 € »),
   jamais « 1800 EUR » ni « 13.5 ».
9. **Pluriels accordés** (« 1 attendu », « 4 attendus »).
10. **Un état vide est un aperçu fantôme** de ce qui viendra (contours en pointillés de la
    forme du contenu), avec une seule action ; jamais le gabarit « tuile + titre + phrase ».

### Lisibilité (jetons posés par le socle, cf. §6)

- Tout texte ≥ 4,5:1 sur son fond, dans les deux thèmes, toutes ambiances et accents compris.
- Texte posé sur l'accent : `--on-accent` (encre sombre `#1d1916` sur les accents clairs du
  thème sombre, blanc seulement là où le blanc tient 4,5:1). L'accent plein des boutons
  principaux est assombri au besoin (`--accent-strong`).
- Argent : `--money-in` / `--money-out` (≥ 4,5:1 dans les deux thèmes) ; catégories et
  graphiques : `--<pastel>-strong` (≥ 3:1 sur la piste).
- Tout `:hover` est sous `@media (hover: hover)`.
- Cible tactile ≥ 44 px (≥ 38 px pour une micro-action en grappe), champ ≥ 16 px au téléphone.

## 3. L'architecture de la couche d'effets (`src/fx/`)

Calquée sur Vinyles, adaptée à React (cf. le brief de portage de l'audit).

- **Une couche posée par-dessus.** `src/fx/` (TypeScript, bundlé par Vite). Un point d'entrée :
  `import { demarrerFx } from "./fx"; demarrerFx();` dans `src/main.tsx`, **avant**
  `createRoot().render`. Retirer cette ligne rend l'app d'avant : c'est le test « couche posée
  par-dessus ». Aucun fichier de `src/pages` ou `src/components` n'importe `src/fx` ; l'app
  ne connaît pas la couche, la couche ne connaît de l'app que son DOM et le contrat du §4.
- **Un module par famille d'effets**, un fichier `src/fx/<module>.ts` + sa feuille
  `src/fx/<module>.css` (importée par le module), un objet public figé exposé en
  `window.MnFx.<module>` (débogage et tests ; jamais appelé par l'app).
- **Un arbitre unique du mouvement** : `reduit()` de `src/fx/core.ts`, relu à CHAQUE geste.
  `html[data-motion="off"]` ⇒ vrai, `html[data-motion="on"]` ⇒ faux, sinon
  `prefers-reduced-motion`. Aucun module ne lit `prefers-reduced-motion` lui-même (sauf
  `scene`, qui veut savoir ce que demande l'APPAREIL pour proposer « Toujours »).
- **Rien n'est tenu à la fin** : WAAPI avec `fill: "none"` (jamais `forwards`/`both`) ;
  l'animation est annulée à la fin (`jouer()` du cœur) pour sortir de `getAnimations()`.
- **Le geste d'abord** : aucune action n'attend une animation ; aucun `await` sur une animation.
- **Ce que fx a le droit d'écrire** : des animations WAAPI ; des éléments qu'il crée (lentille,
  éclats, clones, voile, coulisse, interrupteur haptique, pétales) ; des nœuds que React a DÉJÀ
  retirés (fantômes de sortie) ; des attributs `data-fx-*` et des variables `--fx-*` sur des
  nœuds React ; les propriétés individuelles `translate` / `scale` / `rotate`.
- **Ce que fx n'a PAS le droit de faire** : `classList` sur un nœud dont React calcule
  `className` (une classe ajoutée disparaît au rendu suivant, mesuré) ; `style.transform` sur
  un nœud qui porte un style React (Modal pendant son glissé, StoryViewer, `.ptr-indicator`,
  widgets dnd-kit) ; déplacer, retirer, réordonner ou insérer dans un nœud que React possède
  encore ; `innerHTML` ; `fetch` ; `eval`.
- **`composite: "add"`** dès qu'un élément porte déjà un transform de mise en page (feuille
  centrée, toast, `.bottomnav` en `translateZ(0)`) ; l'opacité, elle, jamais en `add`.
- **Sorties par fantôme** : le nœud que React vient de retirer (gardé par le MutationObserver),
  ou un clone sans `id`, posé dans `#mn-fx` (conteneur hors de l'app), `inert`,
  `aria-hidden`, `pointer-events: none`, retiré à la fin. Un nœud que Suspense MASQUE
  (`display: none !important`) n'est pas parti : ni fantôme ni sortie.
- **Montage paresseux** : `src/fx/montage.ts` tient UN MutationObserver (childList, subtree)
  sur `#root` et `#mn-couches`, et un registre `surveiller(selecteur, { entre, sort })`.
  Les entrées sont regroupées par `requestAnimationFrame` ; les sorties sont traitées dans le
  rappel même (une image plus tard, le fantôme arriverait après un trou).
- **Geste frais** : react-query re-rend au refetch sans geste ; un module de liste n'anime un
  réordonnancement que si un geste a été relevé dans les 600 ms.
- **Idempotence** : StrictMode double les effets en dev et HMR réévalue les modules :
  `demarrerFx()` ne s'installe qu'une fois (`window.__mnFx`), chaque module rend une fonction
  d'arrêt, `import.meta.hot?.dispose`.
- **Boucles d'ambiance** : une seule par écran, portée par un élément `.fx-ambiant`, sur le
  compositeur, suspendue hors écran (IntersectionObserver) et à `document.hidden`, arrêtée en
  moins de 5 s (WCAG 2.2.2), annulée (pas mise en pause) à l'arrêt.
- **Mesure au geste**, jamais dans une boucle ; une lecture de géométrie par geste.
- **Haptique** : Android `navigator.vibrate` ; iPhone Safari 17.4+ par la bascule d'un
  `<input type="checkbox" switch>` caché hors écran (jamais `display: none`) via le clic de son
  `<label>` différé d'un `setTimeout(0)` (jamais pendant la distribution du vrai clic : il
  repasserait par tous les écouteurs de capture). Tout écouteur de capture qui retient un état
  ignore `.fx-haptique`. Le focus n'est jamais volé.

## 4. Le contrat DOM (ce que les pages posent, ce que fx lit)

Posé par le socle et par chaque lot de refonte ; c'est la SEULE interface entre l'app et fx.

| Crochet | Où | Lu par |
| --- | --- | --- |
| `#mn-couches` (frère de `#root` dans `index.html`) | portail de TOUTES les couches : `Modal`, palette ⌘K, StoryViewer, IntroTour, InstallApp, QuickAdd, toasts, panneau de notifications au téléphone | feuille, vol |
| `#mn-fx` (frère de `#root`) | conteneur des fantômes, éclats, pétales, voiles, créé par fx s'il manque | tous |
| `.shell[data-fx-app]` | la coque de l'app (ce qui recule sous une feuille) | feuille |
| `.page[data-page="<pathname>"][data-nav="PUSH|POP|REPLACE"][data-depth="0|1"]` | enveloppe de page posée par `Layout` autour de `children` (`data-depth="1"` pour un détail : voyage, événement, profil public) | navigation, scene |
| `.page-header` (composant `PageHeader`) avec `h1.page-title` | grand titre de chaque page | navigation (repli dans la barre) |
| `.topbar` / `.topbar-title` | barre du haut | navigation, verre |
| `.bottomnav` > `a.bottomnav-item` (+ `.active`) + `button.quickadd-btn[aria-expanded]` | capsule du bas | verre |
| `.sidebar .nav-link(.active)` | barre latérale desktop | verre (indicateur glissant) |
| `.overlay > .modal[role=dialog]` dans `#mn-couches`, `data-state="open"` | toute feuille / modale | feuille |
| `.toast[data-kind="success|error|info"]` dans `.toast-wrap` | île | feuille |
| `[data-fx-list]` sur un conteneur de liste ou de grille ; `[data-fx-key="<id>"]` sur chaque élément | listes, grilles, rangées | flux |
| `[data-fx-count]` sur un nombre entier ; `[data-fx-amount]` sur un montant formaté | chiffres | vivant |
| `[data-fx-progress="0..1"]` sur une barre ou un anneau (`.ring`) | jauges | vivant |
| `button[data-fx-check][aria-pressed]` sur une case à cocher | coches | vivant |
| `[data-fx-done]` posé sur la carte ou la liste quand tout est coché | célébration | vivant, eclosion |
| `[data-fx-like][aria-pressed]` sur un « j'aime » | cœur | vivant |
| `[data-fx-hero="<type>:<id>"]` sur une source ET sa destination | élément partagé (vignette → visionneuse, carte voyage → couverture, anneau → story) | vol |
| `[data-fx-lumiere]` sur un héros photo | couleur dominante | vol (lumière) |
| `[data-fx-press]` (facultatif) sur une carte tappable | appui en ressort | scene |
| `.skeleton` / `.is-loading` | squelettes | navigation (fondu vers le contenu) |
| `.fx-ambiant` | toute boucle | tests |

## 5. Les modules d'effets (famille → fichier → ce qu'on voit)

1. **`core.ts` + `montage.ts`** (socle) : arbitre, `DUR`/`EASE` relus des jetons `--fx-*`,
   `ressort()` (oscillateur amorti échantillonné, avec vitesse initiale), `valeurA()`,
   `jouer()`, `lancer()`, `entreeComposee()`, `fantome()`, `flip()`, haptique, observateur
   unique, registre, `geste frais`. Pur au chargement (importable sous vitest node).
2. **`eclosion.ts` — L'EFFET SIGNATURE (cf. §7).**
3. **`navigation.ts`** : deux vocabulaires de transition de page (onglet = fondu enchaîné
   court, scale .985 → 1, sans direction ; détail = poussée iOS depuis la droite, ancienne page
   décalée de -30 % et assombrie, retour inverse) ; repli du grand titre dans la barre du haut
   (le logo se réduit, le titre centré apparaît) ; barre de progression de 2 px sous la barre du
   haut pendant un chargement de page ; re-toucher l'onglet actif = remonter en haut (doux) ;
   squelette qui fond vers le contenu.
4. **`verre.ts`** : capsule de verre flottante du bas, lentille qui glisse en ressort sous
   l'onglet actif, s'étire selon la vitesse et suit le doigt le long de la barre ; capsule qui se
   contracte au défilement vers le bas et revient en remontant ; barre du haut en verre dès que du
   contenu passe dessous ; « + » qui tourne en « × » quand son menu est ouvert ; indicateur actif
   qui glisse dans la barre latérale desktop.
5. **`feuille.ts`** : feuilles iOS (montée en ressort, **l'app recule** : scale .94, coins
   arrondis, coulisse sombre ; voile en fondu ; glisser l'en-tête pour fermer avec élastique et
   vitesse ; sortie par fantôme qui redescend) ; modales desktop (scale .96 → 1 en ressort,
   sortie 140 ms) ; pile de deux feuilles (la première recule d'un cran au lieu d'un second
   voile) ; popovers (notifications, menu « … ») qui naissent de leur bouton ; palette ⌘K ;
   **île** : les toasts naissent en haut sous l'encoche en pastille noire qui se déploie
   (coche qui se trace, alerte qui secoue), se rétractent à la sortie.
6. **`flux.ts`** : cascade d'entrée des éléments d'une liste au premier rendu (bornée à 24,
   écart 28 ms) ; FLIP au tri, filtre, recherche, épinglage, coche qui déplace l'élément
   (l'élément reste 600 ms en place puis glisse) ; sortie d'un élément retiré en fantôme et
   resserrement des voisins ; insertion qui pousse les voisins.
7. **`vivant.ts`** : entiers qui comptent, montants qui roulent, jauges et anneaux qui se
   remplissent en ressort (jamais en animant `width`), case qui rebondit + coche qui se trace +
   texte barré de gauche à droite, cœur qui bat et éclate, onde au succès, célébration de
   « tout est coché » (pétales, cf. §7).
8. **`vol.ts`** : élément partagé (la vignette s'agrandit jusqu'à la visionneuse et y revient ;
   la carte de voyage devient la couverture du détail ; l'anneau du récap devient la story) +
   lumière (couleur dominante de l'image qui baigne le héros, par canvas 12×12).
9. **`scene.ts`** : arrivée une fois par séance (le logo éclot, la barre du haut et la capsule
   montent, la première page arrive « de plus loin ») ; révélation au défilement (un seul
   IntersectionObserver, trois gardes de Vinyles) ; appui en ressort sur les cartes et boutons ;
   haptique ; **« Animations : toujours »** (retournement CSSOM des règles
   `prefers-reduced-motion` + bandeau proposé une fois quand l'appareil réduit et que le membre
   n'a rien choisi, avec « Garder les animations »).

## 6. Le socle (lot F, avant tout le reste)

### F1 · moteur et réglage
- `src/fx/{index,core,montage}.ts` + `fx.css` (jetons `--fx-dur-xs/s/m/l`, `--fx-ease-out`,
  `--fx-ease-in-out`, `--fx-ease-spring` en `linear()` avec repli) + **les huit modules en
  bouchons** (`export function installer(): () => void { return () => {}; }`) que les lots
  remplacent ; `index.ts` les importe tous dans un ordre fixe (eclosion d'abord).
- Réglage : `UserPrefs.motion?: "system" | "reduce" | "always"` (le booléen `reduce_motion`
  reste lu : `true` ⇒ `"reduce"`) ; serveur (`server/auth.ts` mergePrefs/parsePrefs) ;
  `theme.ts` pose `data-motion="off" | "on"` (absent pour « système ») et expose
  `window.MNMotion` ; `Appearance.tsx` : trois choix « Comme l'appareil · Réduites ·
  Toujours » SORTIS du pli avancé, avec la note quand l'appareil réduit.
- Tests : `test/fx.core.test.ts` (ressort, valeurA, clés, lireEntier, gerbe…),
  `test/fx.doctrine.test.ts` (lit les fichiers : aucun `innerHTML`/`fetch`/`eval`/`fill:
  "forwards"` dans `src/fx`, chaque module importe `reduit` de `core`, `main.tsx` seul
  importeur de `src/fx`, aucun fichier de `src/pages`/`src/components` n'importe `src/fx`,
  chaque module a sa feuille, les règles anti-IA du §2 sur `src/**/*.tsx`).
- Banc navigateur : `playwright-core` en devDependency (aucun téléchargement de navigateur),
  `test/e2e/` lancé par `npm run test:e2e` (config vitest séparée, sautée sans
  `MN_CHROMIUM`), serveur démarré par un globalSetup sur un dossier de données temporaire,
  aides portées de Vinyles (`auRepos`, `ANIMATIONS_HORS_AMBIANCE`, `figerProchain`,
  enregistreur d'`animate`, iPhone simulé avec `switch`, toucher par CDP, `pasDeDebordement`,
  `emulateMedia({ reducedMotion })`).

### F2 · système de design et primitives
- `styles.css` : jetons de lisibilité (§2), `--on-accent`, `--accent-strong`,
  `--money-in/out`, `--<pastel>-strong`, `--ok`/`--danger` redéfinis en sombre, jeton fantôme
  `--sage-ink` défini, `--muted` relevé ; TOUT `:hover` sous `@media (hover: hover)` ; règles
  `prefers-reduced-motion` préfixées `:root:not([data-motion="on"])` ; `[data-motion="on"]`
  rejoue ce que le média coupait ; `.field` espacés uniformément dans les formulaires de
  feuille ; flash crème au démarrage en sombre corrigé (`:root:not([data-theme])` sous
  `prefers-color-scheme: dark`).
- `index.html` : `#mn-couches` et `#mn-fx` après `#root`.
- `ui.tsx` (primitives partagées, toutes avec leur CSS dans `styles.css`) :
  - `Modal` rendue en **portail** dans `#mn-couches`, `data-state="open"`, `inert` posé sur
    `#root` tant qu'une modale est ouverte (compteur réentrant, levé AVANT de rendre le focus),
    en-tête aligné, focus initial sur le premier CHAMP (sinon le dialogue, jamais la croix),
    pied de feuille collant (`.sheet-foot`) au téléphone ; glisser pour fermer conservé.
  - `ToastProvider` : portail, `data-kind`, icône, action facultative (`push(msg, { kind,
    action: { label, onClick } })`, l'ancienne signature `push(msg, true)` reste valide),
    largeur `min(92vw, 420px)` (plus de centrage par `translateX(-50%)` qui bridait à 50 %).
  - `useConfirm(message, { title, confirmLabel, danger })` en **feuille d'action iOS** (bouton
    pleine largeur, rouge quand `danger`, « Annuler » séparé).
  - `PageHeader({ title, subtitle?, actions? })` : grand titre iOS (Fraunces 34 px au
    téléphone), pas de sur-titre ; `actions` = boutons ronds icône au téléphone.
  - `EmptyState` redessiné en **aperçu fantôme** (`variant`: `list | cards | grid | text`),
    une seule action.
  - `Skeleton` (ligne, carte, avatar, vignette), `Ring` (anneau de progression SVG, porte
    `data-fx-progress`), `Seg` (contrôle segmenté avec pastille glissante, `role=tablist`),
    `ListGroup` / `ListRow` (liste groupée iOS : icône, titre, sous-titre, accessoire, chevron),
    `AvatarStack`, `IconButton`, `Sheet`-friendly `MenuButton` (« … » qui ouvre une feuille
    d'actions au téléphone et un popover au bureau).
- `Layout.tsx` : SEULEMENT l'enveloppe `.page[data-page][data-nav][data-depth]` et
  `data-fx-app` sur `.shell` (la refonte de la coquille est le lot R1).
- `App.tsx` : `className="page-fallback"` sur le repli de Suspense.
- `Icon.tsx` : ajoute en une fois les icônes demandées par l'audit (`arrowDownLeft`,
  `arrowUpRight`, `pause`, `minus`, `pin`, `mail`, `chevronDown`, `chevronUp`,
  `chevronRight`, `more`, `swap`, `drag`, `undo`, `cart`, `ticket`, `pulse`, `ring`…) et une
  icône `flower` (le motif du logo) ; les lots de la vague 2 ne touchent PAS `Icon.tsx`.

## 7. L'effet signature : « L'éclosion »

La fleur du logo MarieNour (cinq pétales aux couleurs blush, terracotta et sauge, un cœur
au-dessus) devient le geste propre à l'app. Le module `eclosion.ts` construit la fleur en SVG
(`createElementNS`, pétales en tracés monolignes remplis des jetons, aucun fichier image) et
l'anime pétale par pétale en ressort :

1. **Au lancement** (une fois par séance) : le splash est la fleur qui éclot au centre, puis se
   réduit et vole jusqu'à sa place dans la barre du haut pendant que l'app se pose.
2. **Tirer pour rafraîchir** : sous la barre du haut, la fleur s'ouvre pétale par pétale au
   prorata de la distance (cinq pétales = seuil, un rebond et une haptique au seuil), tourne
   doucement pendant le rechargement, se referme au retour.
3. **Le chargement de marque** : `.spinner`, le repli de page et les attentes deviennent la
   fleur dont les pétales pulsent en décalé (boucle d'ambiance marquée).
4. **La célébration** : terminer une checklist, atteindre un objectif d'épargne, publier un
   souvenir, accepter un ami : une gerbe de pétales jaillit du geste (bornée, déterministe,
   couleurs de la liste ou de l'accent) et se pose.
5. **Le « + »** : la feuille « Créer rapidement » éclot depuis le bouton, ses tuiles sortent en
   éventail comme des pétales.

`window.MnFx.eclosion` expose `fleur(taille)`, `eclore(el, progression)`, `gerbe(x, y, opts)`
et `charger(el)` pour les autres modules ; les lots de refonte posent seulement les crochets
(`data-fx-done`, `.spinner`, etc.).

## 8. Les lots de la vague 2 (en parallèle, chacun dans son worktree)

Règle de propriété : **un fichier n'appartient qu'à un lot**. Personne ne modifie
`styles.css`, `ui.tsx`, `Icon.tsx`, `theme.ts` ni `src/fx/core.ts`/`montage.ts` dans la
vague 2 (ils sont au socle) ; un lot qui a besoin d'y toucher le DIT dans son rapport. Chaque
lot de refonte écrit son CSS dans `src/styles/<lot>.css` importé par ses composants (les
feuilles de pages paresseuses arrivent après `styles.css` et gagnent à spécificité égale), et
liste les règles de `styles.css` devenues mortes pour le nettoyage final.

| Lot | Fichiers possédés | Contenu |
| --- | --- | --- |
| **E1 eclosion** | `src/fx/eclosion.{ts,css}` | §7 |
| **E2 navigation** | `src/fx/navigation.{ts,css}` | §5.3 |
| **E3 verre** | `src/fx/verre.{ts,css}` | §5.4 |
| **E4 feuille** | `src/fx/feuille.{ts,css}` | §5.5 |
| **E5 flux** | `src/fx/flux.{ts,css}` | §5.6 |
| **E6 vivant** | `src/fx/vivant.{ts,css}` | §5.7 |
| **E7 vol** | `src/fx/vol.{ts,css}` | §5.8 |
| **E8 scene** | `src/fx/scene.{ts,css}` | §5.9 |
| **R1 coquille** | `Layout.tsx`, `NotificationBell`, `CommandPalette`, `QuickAdd`, `IntroTour`, `InstallApp`, `PwaUpdatePrompt`, `src/styles/shell.css` | capsule de verre du bas (CSS), barre du haut en grille 3 colonnes, feuille « Tout MarieNour » à la place du tiroir au téléphone, barre latérale compacte, panneau de notifications ancré et groupé, palette ⌘K en écran de recherche iOS, QuickAdd hiérarchisé, IntroTour en pages glissables, InstallApp avec pied collant, pied de page déplacé |
| **R2 accueil** | `Dashboard.tsx`, `src/widgets/*`, `AssistantCard`, `FirstSteps`, `greeting.ts`, `server/routes/onboarding.ts`, `src/styles/accueil.css` | grand titre daté, pile du jour (3 rangées), grille de widgets sans trou (tailles S/M/L fixes), widgets redessinés (anneaux, post-it, compte à rebours, mosaïque photo), mode édition façon iOS (ondulation, badge « − », toute la carte poignée au doigt, contenu inerte), galerie d'ajout, squelettes, compte neuf |
| **R3 listes et notes** | `Lists.tsx`, `Notes.tsx`, `NoteSuggestions`, `noteIntel.ts`, `server/routes/{lists,notes}.ts`, `src/styles/listes.css` | listes groupées avec anneau, détail en feuille à en-tête collant, rangées 48 px à case ronde, coche optimiste, ajout en rafale sans perte de focus, balayer pour supprimer + annuler, célébration, archives réparées, notes en grille 2 colonnes compactes, éditeur plein écran teinté à sauvegarde auto, suggestions dans l'éditeur seulement, conversion réparée |
| **R4 voyages et événements** | `Trips.tsx`, `TripDetail.tsx`, `Events.tsx`, `EventDetail.tsx`, `eventMeta.ts`, `InviteQr`, `InviteLink`, `QrCode`, `server/routes/{trips,events}.ts`, `src/styles/sorties.css` | carte héros « Prochain départ », hero bord à bord avec couverture, timeline de l'itinéraire, cartes invitation, réponse en grand segmenté, invités groupés, sondage de dates en rangées, « Qui apporte quoi » réparé, QR toujours encre sur blanc, onglets collants |
| **R5 argent** | `Finance.tsx`, `src/pages/finance/*`, `Expenses.tsx`, `server/routes/{finance,expenses}.ts`, `src/styles/argent.css` | héros patrimoine en Fraunces, comptes façon Wallet, anneau de budget, graphe SVG responsive, donut, liste d'opérations groupée par jour, modale « calculette », Tricount en segments avec barres divergentes, `keepPreviousData` au changement de mois, contrastes argent |
| **R6 souvenirs** | `Fil.tsx`, `Feed.tsx`, `StoryViewer.tsx`, `Photos.tsx`, `Inspiration.tsx`, `Recipes.tsx`, `ImageField`, `VisibilityField`, `src/styles/souvenirs.css` | anneaux de stories ronds, mosaïque de vignettes, collections façon albums, visionneuse plein écran (balayage, glisser pour fermer), grille Photos iOS, moodboard Inspiration, recettes en grille avec lecture « mode cuisine », un seul composant de visibilité |
| **R7 compte** | `Friends.tsx`, `PollsPanel.tsx`, `Profile.tsx`, `PublicProfile.tsx`, `Appearance.tsx` (hors réglage motion posé par F1), `Help.tsx`, `Admin.tsx`, `src/styles/compte.css` | amis en liste groupée, sondages réparés, profil iOS, personnalisation avec aperçu collant et changement en direct (View Transition circulaire), aide qui cherche partout, admin en tuiles |
| **R8 porte** | `Login.tsx`, `Legal.tsx`, `Invite.tsx`, `public/og-image.png` (facultatif), `src/styles/porte.css` | écran « Bon retour » sur appareil connu, segmenté glissant, états de formulaire, écran « Regarde ta boîte mail », carton d'invitation, pages légales plein écran, débordements à 320 px |

Chaque lot : ses propres tests (vitest pour le pur, e2e Playwright pour le rendu), mesure au
navigateur à 320 / 390 / 1280 px en clair et en sombre, aucune régression de `npm run
typecheck && npm test && npm run build:all`, et un rapport : ce qui est fait, ce qui ne l'est
pas, les crochets posés, les règles mortes de `styles.css`, les besoins hors périmètre.

## 9. Vérification finale

Revue adversariale au navigateur par lentilles (cohérence, iPhone 320 à 430 clair et sombre,
mouvement et « moins de mouvement », accessibilité et contrastes, performance, régressions
fonctionnelles), chaque constat reproduit avant correction ; suite complète verte ; CLAUDE.md.
