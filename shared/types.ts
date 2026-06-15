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
  created_at: number;
  updated_at: number;
  items?: TripItem[];
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
}
