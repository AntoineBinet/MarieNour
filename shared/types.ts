// Types partagés entre le front (React) et l'API (Hono/Workers).

export type Visibility = "private" | "friends" | "public";
export type Role = "member" | "admin";

export interface PublicUser {
  id: string;
  email?: string; // présent uniquement pour soi-même
  display_name: string;
  handle: string | null;
  role: Role;
  avatar_url: string | null;
  bio: string | null;
  accent: string;
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
  kind: TripKind;
  created_at: number;
  updated_at: number;
  items?: TripItem[];
  participants?: TripParticipant[];
  participant_count?: number;
  expense_group_id?: string | null;
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
  created_at: number;
  updated_at: number;
}

export interface Board {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  visibility: Visibility;
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
  created_at: number;
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

/* ── Invitations / QR ─────────────────────────────────────────────────────── */
export type InviteKind = "friend" | "trip" | "group";

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
