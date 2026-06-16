import type {
  Board,
  Comment,
  Expense,
  ExpenseGroup,
  ExpenseGroupDetail,
  FeedItem,
  FinanceAccount,
  FinanceCategory,
  FinanceGoal,
  FinanceOverview,
  FinancePartner,
  FinanceRecurring,
  FinanceTransaction,
  Friendship,
  Inspiration,
  Invite,
  InviteKind,
  InvitePreview,
  List,
  ListItem,
  MediaItem,
  Note,
  Poll,
  PublicUser,
  Recipe,
  SplitMode,
  Trip,
  TripParticipant,
  Visibility,
  Widget,
} from "@shared/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Statut d'une mise à jour in-app (runtime Node / VM uniquement). */
export interface UpdateStatus {
  phase: "idle" | "running" | "done" | "error";
  step: string;
  startedAt: number | null;
  finishedAt: number | null;
  fromCommit: string | null;
  toCommit: string | null;
  upToDate: boolean;
  error: string | null;
  log: string[];
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, credentials: "include", headers: {} };
  if (body !== undefined) {
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(data?.error || `Erreur ${res.status}`, res.status);
  return data as T;
}

const get = <T>(p: string) => request<T>("GET", p);
const post = <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {});
const patch = <T>(p: string, b?: unknown) => request<T>("PATCH", p, b ?? {});
const del = <T>(p: string) => request<T>("DELETE", p);

export const api = {
  // Auth
  me: () => get<{ user: PublicUser | null }>("/auth/me"),
  login: (email: string, password: string) => post<{ user: PublicUser }>("/auth/login", { email, password }),
  register: (email: string, password: string, display_name: string) =>
    post<{ user: PublicUser }>("/auth/register", { email, password, display_name }),
  logout: () => post<{ ok: true }>("/auth/logout"),
  updateMe: (patch_: Partial<{ display_name: string; bio: string; avatar_url: string; accent: string }>) =>
    patch<{ user: PublicUser }>("/auth/me", patch_),

  // Widgets
  widgets: () => get<{ widgets: Widget[] }>("/widgets"),
  addWidget: (type: string, opts?: { title?: string; size?: string; config?: unknown }) =>
    post<{ id: string }>("/widgets", { type, ...opts }),
  updateWidget: (id: string, b: Partial<{ title: string; size: string; config: unknown }>) =>
    patch<{ ok: true }>(`/widgets/${id}`, b),
  removeWidget: (id: string) => del<{ ok: true }>(`/widgets/${id}`),
  reorderWidgets: (ids: string[]) => post<{ ok: true }>("/widgets/reorder", { ids }),

  // Lists
  lists: (archived = false) => get<{ lists: List[] }>(`/lists${archived ? "?archived=1" : ""}`),
  list: (id: string) => get<{ list: List & { items: ListItem[] } }>(`/lists/${id}`),
  createList: (b: Partial<List>) => post<{ id: string }>("/lists", b),
  updateList: (id: string, b: Partial<List>) => patch<{ ok: true }>(`/lists/${id}`, b),
  deleteList: (id: string) => del<{ ok: true }>(`/lists/${id}`),
  addListItem: (id: string, b: Partial<ListItem>) => post<{ id: string }>(`/lists/${id}/items`, b),
  updateListItem: (id: string, itemId: string, b: Partial<ListItem>) =>
    patch<{ ok: true }>(`/lists/${id}/items/${itemId}`, b),
  deleteListItem: (id: string, itemId: string) => del<{ ok: true }>(`/lists/${id}/items/${itemId}`),
  reorderListItems: (id: string, ids: string[]) => post<{ ok: true }>(`/lists/${id}/items/reorder`, { ids }),

  // Notes
  notes: (q?: string) => get<{ notes: Note[] }>(`/notes${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createNote: (b: Partial<Note>) => post<{ id: string }>("/notes", b),
  updateNote: (id: string, b: Partial<Note>) => patch<{ ok: true }>(`/notes/${id}`, b),
  deleteNote: (id: string) => del<{ ok: true }>(`/notes/${id}`),

  // Trips
  trips: () => get<{ trips: Trip[] }>("/trips"),
  trip: (id: string) => get<{ trip: Trip }>(`/trips/${id}`),
  createTrip: (b: Partial<Trip>) => post<{ id: string }>("/trips", b),
  updateTrip: (id: string, b: Partial<Trip>) => patch<{ ok: true }>(`/trips/${id}`, b),
  deleteTrip: (id: string) => del<{ ok: true }>(`/trips/${id}`),
  addTripItem: (id: string, b: Partial<import("@shared/types").TripItem>) =>
    post<{ id: string }>(`/trips/${id}/items`, b),
  updateTripItem: (id: string, itemId: string, b: Partial<import("@shared/types").TripItem>) =>
    patch<{ ok: true }>(`/trips/${id}/items/${itemId}`, b),
  deleteTripItem: (id: string, itemId: string) => del<{ ok: true }>(`/trips/${id}/items/${itemId}`),

  // Recipes
  recipes: (q?: string) => get<{ recipes: Recipe[] }>(`/recipes${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  recipe: (id: string) => get<{ recipe: Recipe }>(`/recipes/${id}`),
  createRecipe: (b: Partial<Recipe>) => post<{ id: string }>("/recipes", b),
  updateRecipe: (id: string, b: Partial<Recipe>) => patch<{ ok: true }>(`/recipes/${id}`, b),
  deleteRecipe: (id: string) => del<{ ok: true }>(`/recipes/${id}`),

  // Inspiration
  boards: () => get<{ boards: Board[] }>("/inspiration/boards"),
  createBoard: (b: Partial<Board>) => post<{ id: string }>("/inspiration/boards", b),
  updateBoard: (id: string, b: Partial<Board>) => patch<{ ok: true }>(`/inspiration/boards/${id}`, b),
  deleteBoard: (id: string) => del<{ ok: true }>(`/inspiration/boards/${id}`),
  inspirations: (opts?: { status?: string; board?: string }) => {
    const params = new URLSearchParams();
    if (opts?.status) params.set("status", opts.status);
    if (opts?.board) params.set("board", opts.board);
    const q = params.toString();
    return get<{ items: Inspiration[] }>(`/inspiration/items${q ? `?${q}` : ""}`);
  },
  createInspiration: (b: Partial<Inspiration>) => post<{ id: string }>("/inspiration/items", b),
  updateInspiration: (id: string, b: Partial<Inspiration>) => patch<{ ok: true }>(`/inspiration/items/${id}`, b),
  deleteInspiration: (id: string) => del<{ ok: true }>(`/inspiration/items/${id}`),

  // Media
  media: () => get<{ media: MediaItem[] }>("/media"),
  uploadMedia: async (file: File, caption?: string, visibility?: Visibility) => {
    const form = new FormData();
    form.append("file", file);
    if (caption) form.append("caption", caption);
    if (visibility) form.append("visibility", visibility);
    const res = await fetch("/api/media", { method: "POST", body: form, credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new ApiError(data?.error || "Upload échoué", res.status);
    return data as { media: MediaItem };
  },
  updateMedia: (id: string, b: Partial<{ caption: string; visibility: Visibility }>) =>
    patch<{ ok: true }>(`/media/${id}`, b),
  deleteMedia: (id: string) => del<{ ok: true }>(`/media/${id}`),

  // Friends / social
  friends: () => get<{ friends: Friendship[]; incoming: Friendship[]; outgoing: Friendship[] }>("/friends"),
  searchUsers: (q: string) => get<{ results: PublicUser[] }>(`/friends/search?q=${encodeURIComponent(q)}`),
  requestFriend: (user_id: string) => post<{ status: string }>("/friends/request", { user_id }),
  acceptFriend: (id: string) => post<{ status: string }>(`/friends/${id}/accept`),
  removeFriend: (id: string) => del<{ ok: true }>(`/friends/${id}`),
  feed: () => get<{ feed: FeedItem[] }>("/social/feed"),
  like: (entity_type: string, entity_id: string) => post<{ liked: boolean }>("/social/like", { entity_type, entity_id }),
  comments: (entity_type: string, entity_id: string) =>
    get<{ comments: Comment[] }>(`/social/comments?entity_type=${entity_type}&entity_id=${entity_id}`),
  addComment: (entity_type: string, entity_id: string, body: string) =>
    post<{ id: string }>("/social/comments", { entity_type, entity_id, body }),
  profile: (handle: string) =>
    get<{
      user: PublicUser;
      is_self: boolean;
      is_friend: boolean;
      recipes: unknown[];
      trips: unknown[];
      boards: unknown[];
    }>(`/social/profile/${handle}`),

  // Trips — participants & votes (planificateur de groupe)
  tripParticipants: (id: string) => get<{ participants: TripParticipant[] }>(`/trips/${id}/participants`),
  addTripParticipant: (id: string, b: { name: string; user_id?: string; role?: string }) =>
    post<{ id: string }>(`/trips/${id}/participants`, b),
  removeTripParticipant: (id: string, pid: string) => del<{ ok: true }>(`/trips/${id}/participants/${pid}`),
  voteTripItem: (id: string, itemId: string) => post<{ voted: boolean; votes: number }>(`/trips/${id}/items/${itemId}/vote`),

  // Invitations / QR codes
  createInvite: (b: { kind: InviteKind; target_id?: string; member_id?: string; label?: string; expires_in_days?: number }) =>
    post<{ invite: Invite }>("/invites", b),
  inviteInfo: (token: string) => get<{ invite: InvitePreview }>(`/invites/${token}`),
  acceptInvite: (token: string) => post<{ kind: InviteKind; target_id: string | null }>(`/invites/${token}/accept`),

  // Sondages
  polls: () => get<{ polls: Poll[] }>("/polls"),
  createPoll: (b: { question: string; options: string[]; multi?: boolean; closes_at?: number | null; visibility?: Visibility }) =>
    post<{ id: string }>("/polls", b),
  votePoll: (id: string, option_ids: string[]) => post<{ ok: true }>(`/polls/${id}/vote`, { option_ids }),
  closePoll: (id: string) => post<{ ok: true }>(`/polls/${id}/close`),
  deletePoll: (id: string) => del<{ ok: true }>(`/polls/${id}`),

  // Dépenses partagées (Tricount)
  expenseGroups: () => get<{ groups: ExpenseGroup[] }>("/expenses"),
  expenseGroup: (id: string) => get<{ group: ExpenseGroupDetail }>(`/expenses/${id}`),
  createExpenseGroup: (b: { title: string; icon?: string; currency?: string; trip_id?: string; members?: string[] }) =>
    post<{ id: string }>("/expenses", b),
  updateExpenseGroup: (id: string, b: Partial<{ title: string; icon: string; currency: string; archived: boolean }>) =>
    patch<{ ok: true }>(`/expenses/${id}`, b),
  deleteExpenseGroup: (id: string) => del<{ ok: true }>(`/expenses/${id}`),
  addExpenseMember: (id: string, b: { name: string; user_id?: string; weight?: number }) =>
    post<{ id: string }>(`/expenses/${id}/members`, b),
  removeExpenseMember: (id: string, memberId: string) => del<{ ok: true }>(`/expenses/${id}/members/${memberId}`),
  addExpense: (
    id: string,
    b: {
      title: string;
      amount: number;
      payer_id: string;
      category?: string;
      split_mode?: SplitMode;
      spent_at?: string;
      note?: string;
      shares?: Array<{ member_id: string; value: number }>;
    },
  ) => post<{ id: string }>(`/expenses/${id}/expenses`, b),
  updateExpense: (id: string, expenseId: string, b: Partial<Expense> & { shares?: Array<{ member_id: string; value: number }> }) =>
    patch<{ ok: true }>(`/expenses/${id}/expenses/${expenseId}`, b),
  deleteExpense: (id: string, expenseId: string) => del<{ ok: true }>(`/expenses/${id}/expenses/${expenseId}`),
  settleExpense: (id: string, b: { from_id: string; to_id: string; amount: number; note?: string }) =>
    post<{ id: string }>(`/expenses/${id}/settle`, b),
  deleteSettlement: (id: string, settlementId: string) => del<{ ok: true }>(`/expenses/${id}/settle/${settlementId}`),

  // Finances personnelles (budget)
  financeOverview: (month?: string, owner?: string) => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    if (owner) p.set("owner", owner);
    const q = p.toString();
    return get<{ overview: FinanceOverview }>(`/finance/overview${q ? `?${q}` : ""}`);
  },
  financeAccounts: () => get<{ accounts: FinanceAccount[] }>("/finance/accounts"),
  createAccount: (b: Partial<FinanceAccount>) => post<{ id: string }>("/finance/accounts", b),
  updateAccount: (id: string, b: Partial<FinanceAccount>) => patch<{ ok: true }>(`/finance/accounts/${id}`, b),
  deleteAccount: (id: string) => del<{ ok: true }>(`/finance/accounts/${id}`),
  financeCategories: () => get<{ categories: FinanceCategory[] }>("/finance/categories"),
  createCategory: (b: Partial<FinanceCategory>) => post<{ id: string }>("/finance/categories", b),
  updateCategory: (id: string, b: Partial<FinanceCategory>) => patch<{ ok: true }>(`/finance/categories/${id}`, b),
  deleteCategory: (id: string) => del<{ ok: true }>(`/finance/categories/${id}`),
  financeTransactions: (opts?: { month?: string; account?: string; category?: string; type?: string; q?: string; owner?: string }) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(opts ?? {})) if (v) p.set(k, v);
    const q = p.toString();
    return get<{ transactions: FinanceTransaction[] }>(`/finance/transactions${q ? `?${q}` : ""}`);
  },
  createTransaction: (b: Partial<FinanceTransaction> & { owner?: string }) => post<{ id: string }>("/finance/transactions", b),
  updateTransaction: (id: string, b: Partial<FinanceTransaction>) => patch<{ ok: true }>(`/finance/transactions/${id}`, b),
  deleteTransaction: (id: string) => del<{ ok: true }>(`/finance/transactions/${id}`),
  financeRecurring: () => get<{ recurring: FinanceRecurring[] }>("/finance/recurring"),
  createRecurring: (b: Partial<FinanceRecurring>) => post<{ id: string }>("/finance/recurring", b),
  updateRecurring: (id: string, b: Partial<FinanceRecurring>) => patch<{ ok: true }>(`/finance/recurring/${id}`, b),
  deleteRecurring: (id: string) => del<{ ok: true }>(`/finance/recurring/${id}`),
  runRecurring: (id: string) => post<{ id: string }>(`/finance/recurring/${id}/run`),
  financeGoals: () => get<{ goals: FinanceGoal[] }>("/finance/goals"),
  createGoal: (b: Partial<FinanceGoal>) => post<{ id: string }>("/finance/goals", b),
  updateGoal: (id: string, b: Partial<FinanceGoal>) => patch<{ ok: true }>(`/finance/goals/${id}`, b),
  contributeGoal: (id: string, amount: number) => post<{ ok: true }>(`/finance/goals/${id}/contribute`, { amount }),
  deleteGoal: (id: string) => del<{ ok: true }>(`/finance/goals/${id}`),
  financePartners: () => get<{ partners: FinancePartner[] }>("/finance/partners"),
  addFinancePartner: (user_id: string, can_edit: boolean) => post<{ ok: true }>("/finance/partners", { user_id, can_edit }),
  removeFinancePartner: (user_id: string) => del<{ ok: true }>(`/finance/partners/${user_id}`),

  // Onboarding (contenu de démarrage)
  seedStarter: () => post<{ ok: true; created: Record<string, number> }>("/onboarding/seed"),

  // Admin
  adminStats: () => get<{ stats: Record<string, number>; app_name: string }>("/admin/stats"),
  adminUsers: () =>
    get<{ users: Array<Record<string, unknown>> }>("/admin/users"),
  adminResetPassword: (id: string, password: string) =>
    post<{ ok: true }>(`/admin/users/${id}/reset-password`, { password }),
  adminSetRole: (id: string, role: "admin" | "member") => patch<{ ok: true }>(`/admin/users/${id}`, { role }),
  adminDeleteUser: (id: string) => del<{ ok: true }>(`/admin/users/${id}`),

  // Mise à jour in-app (présente uniquement sur le runtime Node de la VM)
  adminUpdateStatus: () =>
    get<{ status: UpdateStatus; current_commit: string | null }>("/admin/update/status"),
  adminUpdate: () => post<{ ok: boolean; error?: string; status: UpdateStatus }>("/admin/update"),
};
