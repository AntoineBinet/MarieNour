// Types partagés entre le front (React) et l'API (Hono/Workers).

// Visibilité d'un contenu partageable :
//  - 'private'  : visible par moi seul
//  - 'friends'  : visible par tous mes amis
//  - 'public'   : visible par tout le monde
//  - 'shared'   : visible uniquement par les amis explicitement choisis
//    (la liste des amis est portée par `shared_with`, stockée côté serveur dans
//    la table `shares`).
export type Visibility = "private" | "friends" | "public" | "shared";
export type Role = "member" | "admin";

/* ── Personnalisation (apparence & accueil) ───────────────────────────────────
   Toutes les préférences d'un membre, stockées côté serveur dans un blob JSON
   (colonne users.prefs). Synchronisées sur tous ses appareils. Tous les champs
   sont optionnels : une valeur absente = la valeur par défaut de l'app. */
export type ThemeMode = "system" | "light" | "dark";
/** Style d'interface global (« pack » d'apparence coordonné). Neutre, sans
 *  aucune notion de genre côté UI : 'default' = l'esprit chaleureux d'origine,
 *  les autres sont des ambiances coordonnées (palette, contraste, géométrie). */
export type DesignStyle = "default" | "graphite" | "editorial";
export type RadiusStyle = "sharp" | "soft" | "round";
export type DensityStyle = "compact" | "cozy" | "comfortable";
export type FontChoice = "default" | "serif" | "sans" | "rounded" | "mono" | "humanist";
export type BackgroundStyle = "default" | "plain" | "warm" | "cool" | "dawn" | "mesh";
export type GreetingStyle = "time" | "custom" | "simple" | "none";

/** Les clés d'accent préréglées proposées dans l'interface. */
export const ACCENT_PRESETS = [
  "terracotta",
  "plum",
  "sage",
  "ocean",
  "berry",
  "rose",
  "amber",
  "teal",
  "indigo",
  "forest",
  "coral",
  "slate",
] as const;
export type AccentPreset = (typeof ACCENT_PRESETS)[number];

export interface UserPrefs {
  /** Prénom/surnom par lequel l'app s'adresse à toi (accueil, messages…). */
  nickname?: string;
  /** Style d'interface coordonné (palette, contraste, géométrie). 'default' =
   *  l'ambiance d'origine. Posé par défaut à l'inscription selon le profil,
   *  puis librement modifiable. */
  design?: DesignStyle;
  /** Mode de thème, synchronisé entre appareils ('system' = suit l'appareil). */
  theme_mode?: ThemeMode;
  /** Couleur d'accent personnalisée (hex), utilisée quand accent === 'custom'. */
  accent_custom?: string;
  /** Échelle de la typographie (1 = normal). Bornée ~0.85–1.3. */
  font_scale?: number;
  /** Arrondi des coins de l'interface. */
  radius?: RadiusStyle;
  /** Densité (espacement) de l'interface. */
  density?: DensityStyle;
  /** Police des titres. */
  font_display?: FontChoice;
  /** Police du corps de texte. */
  font_body?: FontChoice;
  /** Contraste renforcé (bordures/texte plus marqués). */
  contrast?: boolean;
  /** Réduit les animations et transitions. */
  reduce_motion?: boolean;
  /** Ambiance de l'arrière-plan. */
  background?: BackgroundStyle;
  /** Style du message d'accueil sur la page d'accueil. */
  greeting_style?: GreetingStyle;
  /** Message d'accueil personnalisé (placeholder {prenom}). */
  greeting_custom?: string;
  /** Affiche un petit emoji à côté du message d'accueil. */
  greeting_emoji?: string;
}

/** Sexe (optionnel) — demandé à l'inscription pour proposer un style de départ. */
export type Gender = "female" | "male" | "other";

export interface PublicUser {
  id: string;
  email?: string; // présent uniquement pour soi-même
  display_name: string;
  handle: string | null;
  role: Role;
  avatar_url: string | null;
  bio: string | null;
  accent: string;
  prefs: UserPrefs; // préférences d'apparence (vide {} pour les autres membres)
  gender?: Gender | null; // exposé uniquement pour soi-même
  created_at: number;
}

export type FriendStatus = "pending" | "accepted" | "blocked";

export interface Friendship {
  id: string;
  user: PublicUser; // l'autre personne
  status: FriendStatus;
  direction: "incoming" | "outgoing" | "mutual";
  created_at: number;
}

export type WidgetSize = "sm" | "md" | "lg";

export interface Widget {
  id: string;
  type: string;
  title: string | null;
  config: Record<string, unknown>;
  size: WidgetSize;
  position: number;
}

export interface List {
  id: string;
  title: string;
  emoji: string;
  color: string;
  kind: "checklist" | "list";
  archived: boolean;
  visibility: Visibility;
  /** Amis choisis quand visibility === 'shared' (ids). Présent pour le propriétaire. */
  shared_with?: string[];
  position: number;
  created_at: number;
  updated_at: number;
  items?: ListItem[];
  item_count?: number;
  done_count?: number;
}

export interface ListItem {
  id: string;
  list_id: string;
  content: string;
  note: string | null;
  done: boolean;
  due_date: string | null;
  position: number;
}

export interface Note {
  id: string;
  title: string | null;
  body: string | null;
  color: string;
  pinned: boolean;
  tags: string[];
  visibility: Visibility;
  shared_with?: string[];
  created_at: number;
  updated_at: number;
}

export interface Trip {
  id: string;
  title: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_url: string | null;
  notes: string | null;
  budget: number | null;
  currency: string;
  visibility: Visibility;
  shared_with?: string[];
  kind: TripKind;
  created_at: number;
  updated_at: number;
  items?: TripItem[];
  participants?: TripParticipant[];
  participant_count?: number;
  expense_group_id?: string | null;
  is_owner?: boolean; // false = voyage partagé (je suis participant, pas créateur)
  owner?: TripOwner | null; // créateur du voyage (mis en avant côté « Partagé »)
}

/** Aperçu du créateur d'un voyage partagé (avatar + nom). */
export interface TripOwner {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
}

export interface TripItem {
  id: string;
  trip_id: string;
  day_date: string | null;
  time: string | null;
  title: string;
  kind: "activity" | "food" | "lodging" | "transport" | "note";
  location: string | null;
  url: string | null;
  notes: string | null;
  cost: number | null;
  done: boolean;
  position: number;
  votes?: number;
  voted_by_me?: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  source_url: string | null;
  favorite: boolean;
  visibility: Visibility;
  shared_with?: string[];
  created_at: number;
  updated_at: number;
}

export interface Board {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  visibility: Visibility;
  shared_with?: string[];
  position: number;
  created_at: number;
  updated_at: number;
  item_count?: number;
}

export interface Inspiration {
  id: string;
  board_id: string | null;
  title: string | null;
  url: string | null;
  image_url: string | null;
  note: string | null;
  source: string;
  tags: string[];
  status: "inbox" | "kept" | "done";
  visibility: Visibility;
  shared_with?: string[];
  created_at: number;
  updated_at: number;
}

export interface MediaItem {
  id: string;
  url: string;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  caption: string | null;
  visibility: Visibility;
  shared_with?: string[];
  created_at: number;
}

/* ── Albums photo (regroupement + partage) ────────────────────────────────── */
export interface Album {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null; // dérivé de cover_media_id (ou 1re photo)
  visibility: Visibility;
  position: number;
  created_at: number;
  updated_at: number;
  photo_count: number;
  is_owner: boolean; // false = album partagé avec moi
  owner?: PublicUser | null; // créateur (mis en avant côté « Partagé avec moi »)
  shared_count?: number; // nb d'amis avec qui je l'ai partagé (vue propriétaire)
}

export interface AlbumDetail extends Album {
  photos: MediaItem[];
  shared_with: PublicUser[]; // amis destinataires (vue propriétaire)
}

export interface FeedItem {
  entity_type: string;
  entity_id: string;
  author: PublicUser;
  title: string | null;
  preview: string | null;
  image_url: string | null;
  visibility: Visibility;
  created_at: number;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

export interface Comment {
  id: string;
  body: string;
  author: PublicUser;
  created_at: number;
}

// Catalogue des widgets disponibles (côté UI).
export interface WidgetDef {
  type: string;
  name: string;
  description: string;
  emoji: string;
  icon?: string;
}

/* ── Voyages : participants & votes ───────────────────────────────────────── */
export type TripKind = "trip" | "roadtrip" | "weekend" | "solo";
export type ParticipantRole = "owner" | "editor" | "traveller";

export interface TripParticipant {
  id: string;
  user_id: string | null; // null = invité hors-app (réclamable via QR)
  name: string;
  role: ParticipantRole;
  color: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_me: boolean;
}

/* ── Événements (week-end, EVG/EVJF, soirée, anniv…) ──────────────────────── */
export type EventKind =
  | "weekend"
  | "evg"
  | "evjf"
  | "party"
  | "birthday"
  | "dinner"
  | "aperitif"
  | "wedding"
  | "trip"
  | "other";
export type EventStatus = "planning" | "confirmed" | "cancelled" | "done";
export type Rsvp = "pending" | "yes" | "no" | "maybe";
export type GuestRole = "owner" | "cohost" | "guest";
export type EventItemKind = "activity" | "food" | "transport" | "break" | "other";
export type BringCategory = "food" | "drink" | "material" | "other";
export type DateVote = "yes" | "maybe" | "no";

export interface EventGuest {
  id: string;
  user_id: string | null; // null = invité hors-app (réclamable via QR/lien)
  name: string;
  role: GuestRole;
  rsvp: Rsvp;
  plus_ones: number;
  note: string | null;
  color: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_me: boolean;
}

export interface EventDateOption {
  id: string;
  day_date: string;
  start_time: string | null;
  end_time: string | null;
  position: number;
  yes: number;
  maybe: number;
  no: number;
  my_vote: DateVote | null;
}

export interface EventTask {
  id: string;
  title: string;
  assignee_id: string | null;
  done: boolean;
  due_date: string | null;
  position: number;
}

export interface EventAgendaItem {
  id: string;
  day_date: string | null;
  time: string | null;
  title: string;
  kind: EventItemKind;
  location: string | null;
  notes: string | null;
  position: number;
}

export interface EventBringItem {
  id: string;
  title: string;
  qty_needed: number;
  category: BringCategory;
  claimed_by: string | null; // guest id
  note: string | null;
  position: number;
}

export interface EventSummary {
  id: string;
  title: string;
  kind: EventKind;
  description: string | null;
  location: string | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  cover_url: string | null;
  budget: number | null;
  currency: string;
  capacity: number | null;
  rsvp_deadline: string | null;
  status: EventStatus;
  date_decided: boolean;
  visibility: Visibility;
  shared_with?: string[];
  created_at: number;
  updated_at: number;
  is_host: boolean; // suis-je organisateur/co-hôte ?
  my_rsvp: Rsvp | null; // ma réponse si je suis invité
  guest_count: number; // nb d'invités (lignes)
  going_count: number; // nb de personnes attendues (oui + accompagnants)
}

export interface EventDetail extends EventSummary {
  address: string | null;
  guests: EventGuest[];
  date_options: EventDateOption[];
  tasks: EventTask[];
  agenda: EventAgendaItem[];
  bring: EventBringItem[];
  expense_group_id: string | null;
}

/* ── « Mon fil » : souvenirs & collections ────────────────────────────────── */
// Un fil semi-privé de souvenirs (photos, vidéos, liens réseaux sociaux),
// rangés en collections au partage choisi, avec récap hebdo « stories ».
export type CollectionVisibility = "private" | "friends" | "custom" | "public";
export type MemoryKind = "photo" | "video" | "link" | "text";

export interface MemoryCollection {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null; // couverture explicite (sinon dérivée)
  accent: string;
  visibility: CollectionVisibility;
  position: number;
  created_at: number;
  updated_at: number;
  memory_count: number;
  preview_urls: string[]; // jusqu'à 4 vignettes (souvenirs récents) pour la carte
  is_owner: boolean;
  owner: TripOwner | null; // créateur (mis en avant pour les collections partagées)
  members?: PublicUser[]; // amis autorisés (visibilité 'custom'), seulement pour le propriétaire
}

export interface Memory {
  id: string;
  collection_id: string;
  collection_title: string | null;
  collection_accent: string;
  kind: MemoryKind;
  caption: string | null;
  media_url: string | null; // photo/vidéo importée (servie depuis R2)
  content_type: string | null;
  url: string | null; // lien externe
  link_title: string | null;
  link_image: string | null; // vignette d'aperçu
  link_provider: string | null; // youtube|tiktok|instagram|…
  taken_at: number;
  created_at: number;
  updated_at: number;
  author: PublicUser;
  is_mine: boolean;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

/** Un « reel » de stories : tous les souvenirs récents d'un même auteur. */
export interface MemoryReel {
  author: PublicUser;
  is_mine: boolean;
  count: number;
  latest_at: number;
  cover_url: string | null;
  memories: Memory[];
}

/** Aperçu d'un lien collé (métadonnées OpenGraph, best-effort côté serveur). */
export interface LinkPreview {
  url: string;
  title: string | null;
  image: string | null;
  provider: string | null;
  kind: MemoryKind; // 'video' pour les liens vidéo, sinon 'link'
}

/* ── Notifications (cloche en haut de l'app) ──────────────────────────────── */
// Flux dérivé des données existantes (demandes d'amis, invitations à un voyage /
// événement, événements à venir). Chaque notif a une clé stable pour pouvoir
// être « écartée » (table notification_dismissals).
export type NotificationType =
  | "friend_request" // quelqu'un veut t'ajouter en ami
  | "event_invite" // tu es invité·e à un événement (RSVP en attente)
  | "event_upcoming" // un événement auquel tu participes approche
  | "trip_shared"; // on t'a partagé un voyage

export interface AppNotification {
  key: string; // clé stable, ex. "friend:<id>" / "trip:<id>" / "event-soon:<id>"
  type: NotificationType;
  title: string;
  body: string | null;
  icon: string;
  link: string; // route in-app vers l'élément concerné
  actor: PublicUser | null; // émetteur (pour l'avatar), si pertinent
  created_at: number;
}

/* ── Invitations / QR ─────────────────────────────────────────────────────── */
export type InviteKind = "friend" | "trip" | "group" | "event" | "album";

export interface Invite {
  token: string;
  url: string;
  kind: InviteKind;
  target_id: string | null;
  label: string | null;
  expires_at: number | null;
  uses: number;
}

export interface InvitePreview {
  kind: InviteKind;
  inviter: PublicUser;
  target_title: string | null;
  valid: boolean;
  reason?: string;
}

/* ── Sondages ─────────────────────────────────────────────────────────────── */
export interface PollOption {
  id: string;
  label: string;
  votes: number;
  voters: PublicUser[];
}

export interface Poll {
  id: string;
  question: string;
  multi: boolean;
  closes_at: number | null;
  closed: boolean;
  visibility: Visibility;
  shared_with?: string[];
  author: PublicUser;
  created_at: number;
  options: PollOption[];
  total_votes: number;
  my_votes: string[]; // option ids
}

/* ── Dépenses partagées (Tricount) ────────────────────────────────────────── */
export type SplitMode = "equal" | "shares" | "amounts";

export interface ExpenseMember {
  id: string;
  user_id: string | null;
  name: string;
  weight: number;
  handle: string | null;
  avatar_url: string | null;
  is_me: boolean;
}

export interface ExpenseShare {
  member_id: string;
  amount: number;
}

export interface Expense {
  id: string;
  group_id: string;
  payer_id: string;
  title: string;
  amount: number;
  category: string;
  split_mode: SplitMode;
  spent_at: string | null;
  note: string | null;
  created_at: number;
  shares: ExpenseShare[];
}

export interface Settlement {
  id: string;
  group_id: string;
  from_id: string;
  to_id: string;
  amount: number;
  note: string | null;
  created_at: number;
}

export interface MemberBalance {
  member_id: string;
  paid: number;
  owed: number;
  balance: number; // paid - owed (+ remboursements). >0 = on lui doit
}

export interface SettlePlanStep {
  from_id: string;
  to_id: string;
  amount: number;
}

export interface ExpenseGroup {
  id: string;
  title: string;
  icon: string;
  currency: string;
  trip_id: string | null;
  event_id: string | null;
  archived: boolean;
  created_at: number;
  updated_at: number;
  member_count?: number;
  total_spent?: number;
  my_balance?: number;
}

export interface ExpenseGroupDetail extends ExpenseGroup {
  members: ExpenseMember[];
  expenses: Expense[];
  settlements: Settlement[];
  balances: MemberBalance[];
  settle_plan: SettlePlanStep[];
}

/* ── Gestion de budget personnel (« Mes finances ») ───────────────────────── */
export type AccountKind = "checking" | "savings" | "cash" | "card" | "investment";
export type CategoryKind = "expense" | "income";
export type TxType = "expense" | "income" | "transfer";
export type Cadence = "weekly" | "monthly" | "yearly";

export interface FinanceAccount {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  start_balance: number;
  icon: string;
  color: string;
  archived: boolean;
  position: number;
  balance: number; // start_balance + flux des transactions
}

export interface FinanceCategory {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  monthly_budget: number | null;
  position: number;
  archived: boolean;
  spent?: number; // dépensé ce mois (rempli par l'aperçu)
}

export interface FinanceTransaction {
  id: string;
  account_id: string;
  category_id: string | null;
  type: TxType;
  amount: number;
  date: string;
  payee: string | null;
  note: string | null;
  transfer_account_id: string | null;
  recurring_id: string | null;
  created_at: number;
}

export interface FinanceRecurring {
  id: string;
  account_id: string;
  category_id: string | null;
  type: TxType;
  amount: number;
  label: string;
  cadence: Cadence;
  next_date: string;
  active: boolean;
}

export interface FinanceGoal {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  target_date: string | null;
  account_id: string | null;
  icon: string;
  color: string;
}

export interface FinancePartner {
  user: PublicUser;
  can_edit: boolean;
  direction: "shared_by_me" | "shared_with_me";
}

export interface BudgetLine {
  category: FinanceCategory;
  budget: number;
  spent: number;
}

export interface CategorySpend {
  category_id: string | null;
  name: string;
  color: string;
  icon: string;
  amount: number;
}

export interface FinanceOverview {
  currency: string;
  net_worth: number;
  accounts: FinanceAccount[];
  month: string; // 'YYYY-MM'
  month_income: number;
  month_expense: number;
  prev_month_expense: number;
  budget_total: number;
  budget_spent: number;
  budgets: BudgetLine[];
  by_category: CategorySpend[]; // dépenses du mois par catégorie
  goals: FinanceGoal[];
  recent: FinanceTransaction[];
  upcoming: FinanceRecurring[];
}

/* ── Statistiques (suivi visuel des dépenses sur plusieurs mois) ──────────── */
export interface FinanceMonthPoint {
  month: string; // 'YYYY-MM'
  income: number;
  expense: number;
}

export interface FinanceStats {
  currency: string;
  months: FinanceMonthPoint[]; // chronologique, N derniers mois
  by_category: CategorySpend[]; // dépenses sur toute la période, triées desc
  total_income: number;
  total_expense: number;
  avg_expense: number; // moyenne mensuelle des dépenses sur la période
}
