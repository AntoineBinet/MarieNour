/*
  Règles d’éthique pour toutes les futures générations branchées à cette app :
  - L’IA doit toujours rester honnête.
  - Ne jamais inventer d’expériences, diplômes, dates, niveaux ou résultats.
  - Ne pas copier mot à mot les phrases des annonces.
  - Garder un ton naturel en français, sans langage trop marketing.
  - L’IA peut reformuler, simplifier et réordonner les informations pour mieux correspondre à une offre,
    mais sans modifier les faits.

  Points de branchement skills Computer prévus dans cette v2 locale :
  - cv-vers-userprofile : parsing de CV vers userProfile à partir du texte extrait d’un document importé.
  - company-job-enrichment : enrichissement d’entreprise / annonce à partir d’un nom, d’un lien et du contexte Marie-Nour.
  - local-job-search-userprofile : recherche guidée d’offres à partir de userProfile.jobSearch + targeting.
*/

const STORAGE_KEY = "marieNourJobSearchProfile_v3";
// URL relative pour que l’app fonctionne en local (127.0.0.1) et via le domaine (marienour.work)
const API_BASE = "";
const MAX_STORED_IMPORT_TEXT = 24000;
const APP_STATE = {
  activeTab: "dashboard",
  onboardingStarted: false,
  onboardingStep: 0,
  profileCompleted: false,
  viewMode: "welcome",
  importMessage: "",
  importLevel: "muted",
  editingApplicationId: null,
  loadedFromServer: false,
  offlineMode: false,
  lastServerUpdatedAt: null,
  serverReachable: false,
  pendingConflict: null,
  attachKind: null,
  briefs: {
    offers: "",
    cv: "",
    letter: "",
    diagnostic: "",
    parsing: "",
    enrichment: ""
  }
};

const TAB_DEFINITIONS = [
  { id: "dashboard", label: "Accueil", description: "Vue d’ensemble et actions rapides" },
  { id: "moi", label: "Moi", description: "Identité, imports et règles d’honnêteté" },
  { id: "recherche", label: "Ce que je cherche", description: "Titres, secteurs, localisation et contrat" },
  { id: "experiences", label: "Compétences & expériences", description: "Compétences, missions, formations et langues" },
  { id: "targeting", label: "Ciblage & annonces", description: "Entreprises, mots-clés et enrichissement" },
  { id: "cv", label: "CV sur mesure", description: "Paramètres du CV et brief IA" },
  { id: "letter", label: "Lettre de motivation", description: "Paramètres de lettre et brief IA" },
  { id: "tracking", label: "Suivi des candidatures", description: "Pipeline, relance et diagnostic" }
];

const ONBOARDING_STEPS = [
  { key: "moi", title: "Étape 1 — Moi", subtitle: "Identité, style, imports réels et règles d’honnêteté" },
  { key: "recherche", title: "Étape 2 — Ce que je cherche", subtitle: "Postes visés, secteurs, mobilité, salaire et contrats" },
  { key: "experiences", title: "Étape 3 — Compétences & expériences", subtitle: "Compétences, expériences, diplômes et langues" },
  { key: "targeting", title: "Étape 4 — Ciblage & annonces", subtitle: "Entreprises cibles, job idéal, exclusions et mots-clés" },
  { key: "cv", title: "Étape 5 — CV sur mesure", subtitle: "Réglages du CV cible et limites de transformation" },
  { key: "letter", title: "Étape 6 — Lettre de motivation", subtitle: "Ton, structure, forces et sujets sensibles" },
  { key: "tracking", title: "Étape 7 — Suivi", subtitle: "Suivi local, relance, stats et diagnostic" }
];

const STATUS_OPTIONS = [
  ["a_envoyer", "À envoyer"],
  ["envoyee", "Envoyée"],
  ["relance_prevue", "Relance prévue"],
  ["entretien", "Entretien"],
  ["refus", "Refus"],
  ["offre", "Offre"],
  ["acceptee", "Acceptée"]
];

const SKILL_LEVEL_OPTIONS = [
  ["", "Sélectionner"],
  ["debutant", "Débutant"],
  ["intermediaire", "Intermédiaire"],
  ["avance", "Avancé"],
  ["expert", "Expert"]
];

const LANGUAGE_LEVEL_OPTIONS = [
  ["", "Sélectionner"],
  ["A1", "A1"],
  ["A2", "A2"],
  ["B1", "B1"],
  ["B2", "B2"],
  ["C1", "C1"],
  ["C2", "C2"],
  ["maternelle", "Langue maternelle"]
];

const SOURCE_OPTIONS = [
  ["LinkedIn", "LinkedIn"],
  ["WTTJ", "WTTJ"],
  ["Indeed", "Indeed"],
  ["Site entreprise", "Site entreprise"],
  ["Autre", "Autre"]
];

const LETTER_TEMPLATES = [
  {
    id: "spontanee",
    label: "Candidature spontanée",
    patch: {
      tone: "naturel",
      maxLength: "standard",
      structure: "classique",
      keyStrengths: ["Adaptation rapide", "Sens du relationnel", "Rigueur"],
      topicsToAvoid: [],
      avoidOverMarketing: true,
      allowLearningStatements: true
    }
  },
  {
    id: "annonce",
    label: "Réponse à une annonce",
    patch: {
      tone: "professionnel",
      maxLength: "standard",
      structure: "projets",
      keyStrengths: ["Correspondance avec l'offre", "Expériences ciblées", "Motivation"],
      topicsToAvoid: [],
      avoidOverMarketing: true,
      allowLearningStatements: true
    }
  },
  {
    id: "relance",
    label: "Relance",
    patch: {
      tone: "naturel",
      maxLength: "courte",
      structure: "classique",
      keyStrengths: ["Rappel de la candidature", "Disponibilité", "Intérêt maintenu"],
      topicsToAvoid: [],
      avoidOverMarketing: true,
      allowLearningStatements: false
    }
  }
];

const APP_IDS = {
  offersPanel: "offers-panel"
};

function createDefaultProfile() {
  return {
    identity: {
      fullName: "",
      currentCity: "",
      currentCountry: "",
      targetCities: [],
      email: "",
      phone: "",
      linkedinUrl: "",
      portfolioUrl: ""
    },
    situation: {
      status: "",
      currentOrLastTitle: "",
      currentOrTargetSector: ""
    },
    writingStyle: {
      tone: "",
      languages: [],
      coverLetterLength: ""
    },
    honestyRules: {
      allowRephrasing: true,
      allowTitleAdjustment: true
    },
    sourceDocuments: {
      importCategoryDraft: "cv",
      imports: []
    },
    jobSearch: {
      targetTitles: [],
      preferredSectors: [],
      avoidedSectors: [],
      locations: [],
      workMode: "",
      maxCommuteMinutes: null,
      seniority: "",
      salaryRange: {
        min: null,
        max: null,
        unit: "brut_annuel"
      },
      salaryFlexibility: "",
      contractTypes: []
    },
    skillsAndExperience: {
      skills: [],
      experiences: [],
      education: [],
      languages: []
    },
    targeting: {
      dreamCompanies: [],
      idealJobBullets: [],
      avoidJobBullets: [],
      searchKeywords: [],
      excludeKeywords: [],
      preferredJobSites: [],
      localSearchResults: [],
      favoriteResultIds: []
    },
    cvRules: {
      baseCvName: "",
      pages: 1,
      style: "",
      allowReorderExperiences: true,
      allowHideIrrelevant: true,
      allowMergeSmallJobs: true,
      forbiddenChanges: [],
      outputPreference: "prete_a_envoyer"
    },
    coverLetterRules: {
      tone: "",
      maxLength: "",
      structure: "",
      keyStrengths: [],
      topicsToAvoid: [],
      avoidOverMarketing: true,
      allowLearningStatements: true
    },
    tracking: {
      trackApplications: true,
      wantDiagnostics: true,
      followUpDays: 7,
      statsWindowDays: 30,
      filters: {
        status: "all",
        company: "",
        source: ""
      },
      applicationDraft: {
        company: "",
        title: "",
        adUrl: "",
        city: "",
        country: "",
        source: "LinkedIn",
        status: "a_envoyer",
        appliedDate: todayIso(),
        nextAction: "",
        followUpDate: "",
        notes: "",
        cvFileId: "",
        cvFilename: "",
        letterFileId: "",
        letterFilename: ""
      },
      applications: []
    }
  };
}

let userProfile = createDefaultProfile();
const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  userProfile = await loadUserProfile();
  APP_STATE.profileCompleted = hasSavedProfile();
  APP_STATE.activeTab = APP_STATE.profileCompleted ? "dashboard" : "moi";
  APP_STATE.viewMode = APP_STATE.profileCompleted ? "dashboard" : "welcome";
  bindElements();
  initTheme();
  renderTabList();
  bindGlobalEvents();
  await checkServerReachable();
  renderApp();
  setInterval(checkServerReachable, 30000);
  if (APP_STATE.offlineMode) {
    console.warn("MNWork : mode hors-ligne (données dans le navigateur). Lancez l’application via le raccourci pour synchroniser avec la base.");
  }
});

function bindElements() {
  els.contentArea = document.getElementById("content-area");
  els.tabList = document.getElementById("tab-list");
  els.progressBar = document.getElementById("progress-bar");
  els.progressText = document.getElementById("progress-text");
  els.progressStepLabel = document.getElementById("progress-step-label");
  els.primaryEntryBtn = document.getElementById("primary-entry-btn");
  els.secondaryEntryBtn = document.getElementById("secondary-entry-btn");
  els.liveSummary = document.getElementById("live-summary");
  els.homeStatus = document.getElementById("home-status");
  els.welcomeMessage = document.getElementById("welcome-message");
  els.profileStateBadge = document.getElementById("profile-state-badge");
  els.dashboardActions = document.getElementById("dashboard-actions");
  els.resetProfileBtn = document.getElementById("reset-profile-btn");
  els.themeToggle = document.getElementById("theme-toggle");
  els.connectionStatus = document.getElementById("connection-status");
  els.applicationAttachInput = document.getElementById("application-attach-input");
  els.menuDrawerBtn = document.getElementById("menu-drawer-btn");
  els.drawerOverlay = document.getElementById("drawer-overlay");
  els.appShell = document.querySelector(".app-shell");
}

function initTheme() {
  if (!document.documentElement.dataset.theme) {
    document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
}

function openDrawer() {
  if (!els.appShell || !els.menuDrawerBtn || !els.drawerOverlay) return;
  els.appShell.classList.add("drawer-open");
  document.body.classList.add("drawer-open");
  els.menuDrawerBtn.setAttribute("aria-expanded", "true");
  els.drawerOverlay.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  if (!els.appShell || !els.menuDrawerBtn || !els.drawerOverlay) return;
  els.appShell.classList.remove("drawer-open");
  document.body.classList.remove("drawer-open");
  els.menuDrawerBtn.setAttribute("aria-expanded", "false");
  els.drawerOverlay.setAttribute("aria-hidden", "true");
  els.menuDrawerBtn.focus();
}

function bindGlobalEvents() {
  els.primaryEntryBtn.addEventListener("click", () => {
    if (!hasMinimumIdentity()) {
      startOnboarding();
      closeDrawer();
      return;
    }
    APP_STATE.viewMode = "dashboard";
    APP_STATE.activeTab = "dashboard";
    closeDrawer();
    renderApp();
  });

  els.secondaryEntryBtn.addEventListener("click", () => {
    if (hasMinimumIdentity()) {
      APP_STATE.viewMode = "dashboard";
      APP_STATE.activeTab = "dashboard";
      closeDrawer();
      renderApp();
    } else {
      startOnboarding();
      closeDrawer();
    }
  });

  els.resetProfileBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Supprimer le profil local, les imports et le suivi des candidatures ?");
    if (!confirmed) return;
    clearProfile();
    userProfile = createDefaultProfile();
    APP_STATE.activeTab = "moi";
    APP_STATE.viewMode = "welcome";
    APP_STATE.onboardingStarted = false;
    APP_STATE.onboardingStep = 0;
    APP_STATE.editingApplicationId = null;
    APP_STATE.importMessage = "";
    APP_STATE.importLevel = "muted";
    APP_STATE.briefs = {
      offers: "",
      cv: "",
      letter: "",
      diagnostic: "",
      parsing: "",
      enrichment: ""
    };
    renderApp();
  });

  els.themeToggle.addEventListener("click", () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  });

  if (els.menuDrawerBtn && els.drawerOverlay) {
    els.menuDrawerBtn.addEventListener("click", () => {
      const isOpen = els.appShell && els.appShell.classList.contains("drawer-open");
      if (isOpen) closeDrawer();
      else openDrawer();
    });
    els.drawerOverlay.addEventListener("click", closeDrawer);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.appShell && els.appShell.classList.contains("drawer-open")) {
      closeDrawer();
    }
  });

  document.body.addEventListener("click", handleActionClick);
  els.contentArea.addEventListener("submit", handleContentSubmit);
  els.contentArea.addEventListener("change", handleContentChange);
  els.contentArea.addEventListener("input", handleContentInput);

  if (els.applicationAttachInput) {
    els.applicationAttachInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      const kind = APP_STATE.attachKind;
      e.target.value = "";
      if (!file || !kind) return;
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", kind);
        const res = await fetch(`${API_BASE}/api/documents`, { method: "POST", body: fd });
        if (res.ok) {
          const j = await res.json();
          if (kind === "cv") {
            userProfile.tracking.applicationDraft.cvFileId = j.id;
            userProfile.tracking.applicationDraft.cvFilename = j.filename;
          } else {
            userProfile.tracking.applicationDraft.letterFileId = j.id;
            userProfile.tracking.applicationDraft.letterFilename = j.filename;
          }
          persistProfile(false);
          renderApp();
        }
      } catch (_) {}
    });
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      persistProfile();
      renderApp();
      return;
    }
    if (e.key === "Escape") {
      if (APP_STATE.editingApplicationId) {
        APP_STATE.editingApplicationId = null;
        userProfile.tracking.applicationDraft = createDefaultProfile().tracking.applicationDraft;
        persistProfile(false);
        renderApp();
      }
    }
  });
}

function startOnboarding() {
  APP_STATE.onboardingStarted = true;
  APP_STATE.onboardingStep = 0;
  APP_STATE.activeTab = ONBOARDING_STEPS[0].key;
  APP_STATE.viewMode = "onboarding";
  renderApp();
}

function renderApp() {
  APP_STATE.profileCompleted = hasMinimumIdentity();
  renderHomeState();
  renderSummary();
  renderTabList();
  renderCurrentView();
  updateProgress();
  revealCopyButtons();
  updateConnectionStatus();
}

async function checkServerReachable() {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: "GET", credentials: "same-origin" });
    APP_STATE.serverReachable = res.ok;
    if (res.ok) APP_STATE.offlineMode = false;
  } catch (_) {
    APP_STATE.serverReachable = false;
  }
  updateConnectionStatus();
}

function updateConnectionStatus() {
  if (!els.connectionStatus) return;
  if (APP_STATE.serverReachable) {
    els.connectionStatus.textContent = "Synchronisé";
    els.connectionStatus.className = "connection-status connection-ok";
  } else {
    els.connectionStatus.textContent = "Hors ligne";
    els.connectionStatus.className = "connection-status connection-offline";
  }
}

function renderHomeState() {
  if (APP_STATE.profileCompleted) {
    els.welcomeMessage.textContent = "Re-bonjour Marie-Nour. Tu peux modifier ton profil, ré-importer un CV, piloter le suivi local et préparer les briefs IA pour cv-vers-userprofile, company-job-enrichment et local-job-search-userprofile.";
    els.homeStatus.textContent = "Profil enregistré localement. Les imports parsés et le tableau de candidatures restent disponibles dans ce navigateur.";
    els.primaryEntryBtn.textContent = "Accéder à mon espace";
    els.secondaryEntryBtn.textContent = "Modifier mon profil";
    els.profileStateBadge.textContent = "Profil actif";
    els.dashboardActions.classList.toggle("hidden", APP_STATE.viewMode === "onboarding");
  } else {
    els.welcomeMessage.textContent = "Bienvenue Marie-Nour, on va d’abord configurer ton profil, importer ton CV et structurer ta recherche d’emploi.";
    els.homeStatus.textContent = "Aucun profil local détecté. Lance le questionnaire complet pour construire la base de travail.";
    els.primaryEntryBtn.textContent = "Lancer le questionnaire complet";
    els.secondaryEntryBtn.textContent = "Accéder à mon espace";
    els.profileStateBadge.textContent = APP_STATE.onboardingStarted ? "Profil en cours" : "Profil vide";
    els.dashboardActions.classList.add("hidden");
  }
}

function renderTabList() {
  els.tabList.innerHTML = "";
  TAB_DEFINITIONS.forEach((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button ${APP_STATE.activeTab === tab.id ? "active" : ""}`;
    button.dataset.action = "switch-tab";
    button.dataset.tab = tab.id;
    button.dataset.testid = `button-tab-${tab.id}`;
    button.innerHTML = `<strong>${escapeHtml(tab.label)}</strong><br><span class="small-note">${escapeHtml(tab.description)}</span>`;
    els.tabList.appendChild(button);
  });
}

function renderSummary() {
  const items = [
    { label: "Identité", value: userProfile.identity.fullName || "Nom non renseigné" },
    { label: "Situation", value: userProfile.situation.currentOrLastTitle || userProfile.situation.status || "Situation non renseignée" },
    { label: "Postes ciblés", value: userProfile.jobSearch.targetTitles.length ? userProfile.jobSearch.targetTitles.map((item) => item.title).slice(0, 3).join(", ") : "Aucun poste cible" },
    { label: "Mobilité", value: uniqueList([...userProfile.identity.targetCities, ...userProfile.jobSearch.locations]).length ? uniqueList([...userProfile.identity.targetCities, ...userProfile.jobSearch.locations]).slice(0, 4).join(", ") : "Zone cible non définie" },
    { label: "Compétences", value: userProfile.skillsAndExperience.skills.length ? userProfile.skillsAndExperience.skills.map((item) => item.name).slice(0, 4).join(", ") : "Compétences à compléter" },
    { label: "Sources importées", value: userProfile.sourceDocuments.imports.length ? `${userProfile.sourceDocuments.imports.length} document(s)` : "Aucun document importé" },
    { label: "Suivi", value: userProfile.tracking.applications.length ? `${userProfile.tracking.applications.length} candidature(s)` : "Aucune candidature suivie" }
  ];

  els.liveSummary.innerHTML = items.map((item) => `
    <article class="summary-item">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${escapeHtml(item.value)}</span>
    </article>
  `).join("");
}

function renderConflictBanner() {
  if (!APP_STATE.pendingConflict) return "";
  return `
    <div class="conflict-banner" role="alert">
      <p>Une version plus récente existe sur le serveur. Choisis quelle version garder.</p>
      <div class="inline-actions">
        <button class="secondary-btn" type="button" data-action="resolve-conflict-server">Charger depuis le serveur</button>
        <button class="primary-btn" type="button" data-action="resolve-conflict-local">Garder mes données et les envoyer au serveur</button>
      </div>
    </div>
  `;
}

function renderCurrentView() {
  let content = "";
  if (APP_STATE.viewMode === "welcome") {
    APP_STATE.activeTab = "moi";
    content = renderWelcomePanel();
  } else if (APP_STATE.viewMode === "onboarding") {
    content = renderOnboardingStep(APP_STATE.onboardingStep);
  } else if (APP_STATE.viewMode === "dashboard" && APP_STATE.activeTab === "dashboard") {
    content = renderDashboard();
  } else if (APP_STATE.viewMode === "tab") {
    switch (APP_STATE.activeTab) {
      case "dashboard": content = renderDashboard(); break;
      case "moi": content = renderIdentityTab(); break;
      case "recherche": content = renderJobSearchTab(); break;
      case "experiences": content = renderSkillsTab(); break;
      case "targeting": content = renderTargetingTab(); break;
      case "cv": content = renderCvTab(); break;
      case "letter": content = renderLetterTab(); break;
      case "tracking": content = renderTrackingTab(); break;
      default: content = renderDashboard(); break;
    }
  }
  els.contentArea.innerHTML = renderConflictBanner() + content;
}

function resolveConflictUseServer() {
  const pc = APP_STATE.pendingConflict;
  if (!pc) return;
  userProfile = mergeDeep(createDefaultProfile(), pc.serverData);
  localStorage.removeItem(STORAGE_KEY);
  if (pc.updated_at) try { localStorage.setItem("mnwork_last_sync", String(pc.updated_at)); } catch (_) {}
  APP_STATE.pendingConflict = null;
  renderApp();
}

async function resolveConflictUseLocal() {
  const pc = APP_STATE.pendingConflict;
  if (!pc) return;
  try {
    await fetch(`${API_BASE}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mergeDeep(createDefaultProfile(), pc.localData))
    });
  } catch (_) {}
  localStorage.removeItem(STORAGE_KEY);
  try { localStorage.setItem("mnwork_last_sync", new Date().toISOString()); } catch (_) {}
  userProfile = mergeDeep(createDefaultProfile(), pc.localData);
  APP_STATE.pendingConflict = null;
  renderApp();
}

function updateProgress() {
  const completed = countCompletedSteps();
  const total = ONBOARDING_STEPS.length;
  const percent = Math.round((completed / total) * 100);
  els.progressBar.style.width = `${percent}%`;
  els.progressText.textContent = `${percent}%`;
  if (APP_STATE.onboardingStarted && ONBOARDING_STEPS[APP_STATE.onboardingStep]) {
    els.progressStepLabel.textContent = ONBOARDING_STEPS[APP_STATE.onboardingStep].title;
  } else if (APP_STATE.profileCompleted) {
    els.progressStepLabel.textContent = `${completed}/${total} sections renseignées`;
  } else {
    els.progressStepLabel.textContent = "Onboarding non démarré";
  }
}

function countCompletedSteps() {
  if (!hasMinimumIdentity()) return 0;
  return [
    validateIdentityStep(false),
    validateJobSearchStep(false),
    validateSkillsStep(false),
    validateTargetingStep(false),
    validateCvStep(false),
    validateLetterStep(false),
    validateTrackingStep(false)
  ].filter(Boolean).length;
}

function renderWelcomePanel() {
  return `
    <div class="content-intro">
      <div>
        <h2>Premier passage</h2>
        <p>Cette mini-app locale commence par un questionnaire guidé, puis permet d’importer réellement des fichiers PDF, DOCX, TXT et HTML, de contrôler les données extraites et de préparer les briefs pour cv-vers-userprofile, company-job-enrichment et local-job-search-userprofile.</p>
      </div>
    </div>
    <section class="onboarding-card">
      <h3>Ce que l’app va préparer</h3>
      <ul class="mini-list">
        <li>Un profil structuré enregistré localement dans le navigateur</li>
        <li>Des imports réels avec extraction de texte et pré-mapping vers userProfile</li>
        <li>Une vue de contrôle avant fusion ou remplacement des données</li>
        <li>Un tableau de suivi local complet des candidatures</li>
        <li>Des briefs IA prêts pour parsing CV, enrichissement et recherche d’offres</li>
      </ul>
      <div class="step-actions">
        <button class="primary-btn" type="button" data-action="start-onboarding" data-testid="button-start-onboarding">Commencer le questionnaire</button>
      </div>
    </section>
  `;
}

function renderDashboard() {
  return `
    <div class="content-intro">
      <div>
        <h2>Espace candidature local</h2>
        <p>Utilise les onglets pour enrichir le profil, parser réellement les fichiers, enrichir des entreprises, suivre des candidatures et lancer les briefs pour Computer.</p>
      </div>
      <span class="badge">${hasMinimumIdentity() ? "Profil prêt à exploiter" : "Profil incomplet"}</span>
    </div>

    <section class="section-block">
      <div class="kpi-grid">
        <article class="kpi-card">
          <span class="meta-line">Documents importés</span>
          <strong>${userProfile.sourceDocuments.imports.length}</strong>
          <span class="small-note">CV, profil, portfolio ou notes</span>
        </article>
        <article class="kpi-card">
          <span class="meta-line">Candidatures suivies</span>
          <strong>${userProfile.tracking.applications.length}</strong>
          <span class="small-note">Tableau local éditable</span>
        </article>
        <article class="kpi-card">
          <span class="meta-line">Résultats d’offres en cache</span>
          <strong>${userProfile.targeting.localSearchResults.length}</strong>
          <span class="small-note">Après collage d’une réponse Computer</span>
        </article>
      </div>

      ${(function () {
        const due = getFollowUpDueApplications();
        if (!due.length) return "";
        return `
      <article class="form-card">
        <h3>Relances à faire</h3>
        <ul class="follow-up-list">
          ${due.map((item) => `
            <li>
              <strong>${escapeHtml(item.company)}</strong> — ${escapeHtml(item.title || "")}
              <span class="muted">Relance prévue : ${escapeHtml(item.followUpDate || "")}</span>
              <button class="small-btn" type="button" data-action="edit-application" data-id="${escapeHtml(item.id)}">Éditer</button>
            </li>
          `).join("")}
        </ul>
        <div class="inline-actions">
          <button class="inline-btn" type="button" data-action="jump-tab" data-tab="tracking">Ouvrir le suivi</button>
        </div>
      </article>
        `;
      })()}

      <div class="summary-grid dual-grid">
        <article class="status-card">
          <h3>Importer et contrôler les données</h3>
          <p class="muted">Ajoute un CV ou un profil local, prévisualise les champs détectés puis fusionne ou remplace les données dans userProfile.</p>
          <div class="inline-actions">
            <button class="inline-btn" type="button" data-action="jump-tab" data-tab="moi" data-testid="button-jump-moi">Ouvrir les imports</button>
          </div>
        </article>
        <article class="status-card">
          <h3>Enrichir des entreprises</h3>
          <p class="muted">Prépare un brief IA par entreprise ou annonce pour mieux adapter le CV et la lettre.</p>
          <div class="inline-actions">
            <button class="inline-btn" type="button" data-action="jump-tab" data-tab="targeting" data-testid="button-jump-targeting">Ouvrir le ciblage</button>
          </div>
        </article>
        <article class="status-card">
          <h3>CV sur mesure</h3>
          <p class="muted">Prépare un brief complet en réutilisant le profil et les imports réellement parsés.</p>
          <div class="inline-actions">
            <button class="inline-btn" type="button" data-action="jump-tab" data-tab="cv" data-testid="button-jump-cv">Préparer un brief CV</button>
          </div>
        </article>
        <article class="status-card">
          <h3>Suivi avancé</h3>
          <p class="muted">Ajoute, édite, filtre et diagnostique les candidatures localement.</p>
          <div class="inline-actions">
            <button class="inline-btn" type="button" data-action="jump-tab" data-tab="tracking" data-testid="button-jump-tracking">Ouvrir le suivi</button>
          </div>
        </article>
      </div>

      ${renderOffersActionPanel(true)}
      ${renderSearchResultsPanel()}
    </section>
  `;
}

function renderOnboardingStep(index) {
  const step = ONBOARDING_STEPS[index];
  const body = {
    moi: renderIdentityForm(true),
    recherche: renderJobSearchForm(true),
    experiences: renderSkillsForm(true),
    targeting: renderTargetingForm(true),
    cv: renderCvForm(true),
    letter: renderLetterForm(true),
    tracking: renderTrackingSettingsForm(true)
  }[step.key];

  return `
    <div class="content-intro">
      <div>
        <h2>${escapeHtml(step.title)}</h2>
        <p>${escapeHtml(step.subtitle)}</p>
      </div>
      <span class="badge">${index + 1} / ${ONBOARDING_STEPS.length}</span>
    </div>
    <form id="onboarding-form" data-step-key="${escapeHtml(step.key)}">
      ${body}
      <div class="step-actions">
        ${index > 0 ? `<button class="secondary-btn" type="button" data-action="prev-step" data-testid="button-prev-step">Précédent</button>` : ""}
        <button class="primary-btn" type="submit" data-testid="button-next-step">${index === ONBOARDING_STEPS.length - 1 ? "Terminer le questionnaire" : "Suivant"}</button>
      </div>
    </form>
  `;
}

function renderStandalone(title, description, content) {
  return `
    <div class="content-intro">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="inline-actions">
        <button class="secondary-btn" type="button" data-action="save-profile" data-testid="button-save-profile">Sauvegarder</button>
        <button class="ghost-btn" type="button" data-action="start-onboarding" data-testid="button-start-onboarding-inline">Relancer l’onboarding</button>
      </div>
    </div>
    <form class="section-form">
      ${content}
      <div class="step-actions">
        <button class="primary-btn" type="button" data-action="save-profile" data-testid="button-save-profile-bottom">Enregistrer les modifications</button>
      </div>
    </form>
  `;
}

function renderIdentityTab() {
  return renderStandalone(
    "Moi",
    "Complète ou modifie l’identité, les imports réels, la situation actuelle, le style d’écriture et les règles de transformation autorisées.",
    renderIdentityForm(false)
  );
}

function renderIdentityForm(isOnboarding) {
  return `
    <section class="section-block">
      <article class="form-card">
        <h3>Informations personnelles</h3>
        <div class="form-grid">
          ${textField("Nom complet", "identity.fullName", userProfile.identity.fullName, true, "Ex. Marie-Nour Salibi")}
          ${textField("Ville actuelle", "identity.currentCity", userProfile.identity.currentCity, true, "Ex. Lyon")}
          ${textField("Pays actuel", "identity.currentCountry", userProfile.identity.currentCountry, true, "Ex. France")}
          ${textField("Email", "identity.email", userProfile.identity.email, false, "prenom.nom@email.com", "email")}
          ${textField("Téléphone", "identity.phone", userProfile.identity.phone, false, "+33 ...", "tel")}
          ${textField("URL LinkedIn", "identity.linkedinUrl", userProfile.identity.linkedinUrl, false, "https://www.linkedin.com/in/...", "text")}
          ${textField("Portfolio", "identity.portfolioUrl", userProfile.identity.portfolioUrl, false, "https://...", "text")}
          ${textField("Intitulé actuel ou dernier poste", "situation.currentOrLastTitle", userProfile.situation.currentOrLastTitle, true, "Ex. Chargée de projet")}
          ${textField("Secteur actuel ou cible", "situation.currentOrTargetSector", userProfile.situation.currentOrTargetSector, true, "Ex. marketing, RH, conseil")}
          ${textField("Villes acceptées", "identity.targetCitiesInput", userProfile.identity.targetCities.join(", "), false, "Sépare par des virgules", "text", "Les villes sont converties en tags automatiquement.")}
        </div>
        ${renderTagsSection("Villes acceptées", userProfile.identity.targetCities, "identity.targetCities")}
      </article>

      <article class="form-card">
        <h3>Situation et style</h3>
        <div class="dual-grid">
          ${radioGroup("Situation actuelle", "situation.status", userProfile.situation.status, [["etudiante", "Étudiante"], ["en_poste", "En poste"], ["recherche_active", "Recherche active"], ["reconversion", "Reconversion"]], true)}
          ${radioGroup("Ton préféré", "writingStyle.tone", userProfile.writingStyle.tone, [["tres_formel", "Très formel"], ["professionnel", "Professionnel"], ["naturel", "Naturel"]], true)}
          ${checkboxGroup("Langues des documents", "writingStyle.languages", userProfile.writingStyle.languages, [["fr", "FR"], ["en", "EN"], ["autre", "Autre"]], true)}
          ${radioGroup("Longueur de lettre", "writingStyle.coverLetterLength", userProfile.writingStyle.coverLetterLength, [["courte", "Courte"], ["standard", "Standard"]], true)}
        </div>
      </article>

      ${renderImportPanel()}

      <article class="form-card">
        <h3>Règles d’honnêteté</h3>
        <div class="dual-grid">
          ${radioGroup("Autoriser la reformulation sans invention", "honestyRules.allowRephrasing", String(userProfile.honestyRules.allowRephrasing), [["true", "Oui"], ["false", "Non"]], true)}
          ${radioGroup("Autoriser un léger ajustement des intitulés de poste", "honestyRules.allowTitleAdjustment", String(userProfile.honestyRules.allowTitleAdjustment), [["true", "Oui"], ["false", "Non"]], true)}
        </div>
        ${isOnboarding ? `<p class="helper-callout">Les champs essentiels doivent être remplis pour passer à l’étape suivante.</p>` : ""}
      </article>

      <article class="form-card">
        <h3>Sauvegarde</h3>
        <p class="muted">Exporte une copie complète du profil et des candidatures dans le dossier data/marie-nour/backups/.</p>
        <button class="secondary-btn" type="button" data-action="export-backup">Exporter une sauvegarde</button>
      </article>

      ${renderParsingBriefPanel()}
    </section>
  `;
}

function renderImportPanel() {
  const hasCvImport = userProfile.sourceDocuments.imports.some((doc) => doc.category === "cv");
  return `
    <article class="form-card">
      <div class="dynamic-header">
        <h3>Import & parsing réels des fichiers</h3>
        <div class="inline-actions">
          <button class="inline-btn" type="button" data-action="prepare-reimport-cv" data-testid="button-prepare-reimport-cv">Ré-importer un CV</button>
        </div>
      </div>
      <div class="imports-grid">
        <div class="import-drop">
          ${selectField("Catégorie du document", "sourceDocuments.importCategoryDraft", userProfile.sourceDocuments.importCategoryDraft, [["cv", "CV"], ["linkedin", "Profil LinkedIn"], ["portfolio", "Portfolio / bio"], ["notes", "Notes / autres sources"]])}
          <div class="field">
            <label for="source-import-input">Fichier local</label>
            <input id="source-import-input" name="sourceDocuments.fileInput" type="file" accept=".pdf,.docx,.txt,.html,.htm" data-testid="input-source-import" />
            <span class="field-help">Formats minimum supportés : PDF, DOCX, TXT, HTML. Le parsing est réalisé côté client dans le navigateur.</span>
          </div>
          ${APP_STATE.importMessage ? `<div class="status-box ${APP_STATE.importLevel === "error" ? "error-text" : APP_STATE.importLevel === "success" ? "success-text" : "warning-text"}" data-testid="status-import-message">${escapeHtml(APP_STATE.importMessage)}</div>` : ""}
        </div>
        <article class="list-card">
          <h4>Comportement attendu</h4>
          <ul class="mini-list">
            <li>Extraction de texte réelle côté client</li>
            <li>Pré-mapping vers userProfile sans invention</li>
            <li>Vue de contrôle avant fusion ou remplacement</li>
            <li>Valeurs incertaines laissées vides ou marquées a_confirmer</li>
            <li>${hasCvImport ? "Un CV est déjà importé. La ré-importation peut fusionner ou remplacer proprement les données." : "Aucun CV importé pour l’instant."}</li>
          </ul>
        </article>
      </div>
      ${renderImportedDocuments()}
    </article>
  `;
}

function renderImportedDocuments() {
  const docs = userProfile.sourceDocuments.imports;
  if (!docs.length) {
    return `<div class="empty-state">Aucun document importé pour le moment.</div>`;
  }

  return `
    <div class="dynamic-list">
      ${docs.map((doc) => `
        <article class="document-card">
          <div class="dynamic-header">
            <div>
              <h4>${escapeHtml(doc.name)}</h4>
              <div class="document-meta">
                <span>${escapeHtml(doc.category.toUpperCase())}</span>
                <span>${escapeHtml(doc.format)}</span>
                <span>${escapeHtml(formatBytes(doc.size))}</span>
                <span>${escapeHtml(doc.addedAt)}</span>
              </div>
            </div>
            <div class="document-actions">
              <button class="small-btn" type="button" data-action="apply-import-hints" data-id="${doc.id}" data-testid="button-apply-hints-${doc.id}">Appliquer les indices</button>
              <button class="small-btn" type="button" data-action="apply-import-merge" data-id="${doc.id}" data-testid="button-merge-import-${doc.id}">Fusionner dans le profil</button>
              <button class="small-btn" type="button" data-action="apply-import-replace" data-id="${doc.id}" data-testid="button-replace-import-${doc.id}">${doc.category === "cv" ? "Ré-importer ce CV en remplacement" : "Remplacer par les données importées"}</button>
              <button class="small-btn" type="button" data-action="generate-parsing-brief" data-id="${doc.id}" data-testid="button-parsing-brief-${doc.id}">Brief cv-vers-userprofile</button>
              <button class="danger-btn" type="button" data-action="remove-import" data-id="${doc.id}" data-testid="button-remove-import-${doc.id}">Supprimer</button>
            </div>
          </div>

          <div class="tag-cloud">
            ${renderTagsNoDelete([`emails ${doc.hints.emails.length}`, `téléphones ${doc.hints.phones.length}`, `linkedin ${doc.hints.linkedinUrls.length}`, `expériences ${doc.structuredPatch.skillsAndExperience.experiences.length}`, `compétences ${doc.structuredPatch.skillsAndExperience.skills.length}`])}
          </div>

          <div class="dual-grid">
            <article class="list-card">
              <h4>Texte extrait</h4>
              <div class="preview-box">${escapeHtml(doc.parsedText)}</div>
            </article>
            <article class="list-card">
              <h4>Vue de contrôle après parsing</h4>
              <p class="small-note">Vérifie les informations détectées avant de fusionner ou remplacer les données du profil.</p>
              ${renderStructuredPatchSummary(doc.structuredPatch)}
            </article>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderStructuredPatchSummary(patch) {
  return `
    <div class="summary-list">
      <div class="summary-item"><strong>Nom détecté</strong><span>${escapeHtml(patch.identity.fullName || "À confirmer")}</span></div>
      <div class="summary-item"><strong>Titre détecté</strong><span>${escapeHtml(patch.situation.currentOrLastTitle || "À confirmer")}</span></div>
      <div class="summary-item"><strong>Expériences</strong><span>${patch.skillsAndExperience.experiences.length}</span></div>
      <div class="summary-item"><strong>Compétences</strong><span>${patch.skillsAndExperience.skills.length}</span></div>
      <div class="summary-item"><strong>Formations</strong><span>${patch.skillsAndExperience.education.length}</span></div>
      <div class="summary-item"><strong>Langues</strong><span>${patch.skillsAndExperience.languages.length}</span></div>
    </div>
  `;
}

function renderParsingBriefPanel() {
  return `
    <article class="form-card ${APP_STATE.briefs.parsing ? "" : "hidden"}" id="parsing-brief-panel">
      <h3>Brief cv-vers-userprofile — Parsing CV vers userProfile</h3>
      <div class="brief-output">
        <textarea readonly data-testid="textarea-parsing-brief">${escapeHtml(APP_STATE.briefs.parsing)}</textarea>
        <div class="dashboard-form-actions">
          <button class="secondary-btn" type="button" data-action="copy-parsing-brief" data-testid="button-copy-parsing-brief">Copier</button>
          <button class="secondary-btn" type="button" data-action="save-brief-export" data-type="parsing">Enregistrer dans le dossier</button>
        </div>
      </div>
    </article>
  `;
}

function renderJobSearchTab() {
  return renderStandalone(
    "Ce que je cherche",
    "Définis les postes, secteurs, modes de travail, salaire et types de contrat acceptés.",
    renderJobSearchForm(false)
  );
}

function renderJobSearchForm() {
  return `
    <section class="section-block">
      <article class="form-card">
        <div class="dynamic-header">
          <h3>Postes ciblés</h3>
          <button class="inline-btn" type="button" data-action="add-target-title" data-testid="button-add-target-title">Ajouter un intitulé</button>
        </div>
        <div class="dynamic-list">
          ${userProfile.jobSearch.targetTitles.length ? userProfile.jobSearch.targetTitles.map((item, index) => `
            <div class="dynamic-item">
              <div class="dynamic-header">
                <h4>Poste cible ${index + 1}</h4>
                <button class="danger-btn" type="button" data-action="remove-target-title" data-index="${index}">Supprimer</button>
              </div>
              <div class="dual-grid">
                ${textField("Intitulé", `jobSearch.targetTitles.${index}.title`, item.title, true, "Ex. Chargée de communication")}
                ${selectField("Priorité", `jobSearch.targetTitles.${index}.priority`, item.priority, [["haute", "Haute"], ["moyenne", "Moyenne"], ["basse", "Basse"]], true)}
              </div>
            </div>
          `).join("") : `<div class="empty-state">Ajoute au moins un intitulé de poste recherché.</div>`}
        </div>
      </article>

      <article class="form-card">
        <h3>Préférences de recherche</h3>
        <div class="form-grid">
          ${textField("Secteurs qui t’intéressent", "jobSearch.preferredSectorsInput", userProfile.jobSearch.preferredSectors.join(", "), false, "Sépare par des virgules")}
          ${textField("Secteurs à éviter", "jobSearch.avoidedSectorsInput", userProfile.jobSearch.avoidedSectors.join(", "), false, "Sépare par des virgules")}
          ${textField("Villes / zones cibles", "jobSearch.locationsInput", userProfile.jobSearch.locations.join(", "), false, "Sépare par des virgules")}
          ${textField("Temps de trajet max (minutes)", "jobSearch.maxCommuteMinutes", valueOrEmpty(userProfile.jobSearch.maxCommuteMinutes), false, "Ex. 45", "number")}
          ${selectField("Mode de travail", "jobSearch.workMode", userProfile.jobSearch.workMode, [["", "Choisir"], ["site", "Sur site"], ["hybride", "Hybride"], ["remote", "Remote"]], true)}
          ${selectField("Niveau visé", "jobSearch.seniority", userProfile.jobSearch.seniority, [["", "Choisir"], ["stage", "Stage"], ["junior", "Junior"], ["confirmee", "Confirmée"], ["senior", "Senior"]], true)}
          ${textField("Salaire minimum", "jobSearch.salaryRange.min", valueOrEmpty(userProfile.jobSearch.salaryRange.min), false, "Ex. 32000", "number")}
          ${textField("Salaire maximum", "jobSearch.salaryRange.max", valueOrEmpty(userProfile.jobSearch.salaryRange.max), false, "Ex. 42000", "number")}
          ${selectField("Unité salariale", "jobSearch.salaryRange.unit", userProfile.jobSearch.salaryRange.unit, [["brut_annuel", "Brut annuel"], ["brut_mensuel", "Brut mensuel"], ["net_mensuel", "Net mensuel"]], false)}
          ${selectField("Flexibilité salariale", "jobSearch.salaryFlexibility", userProfile.jobSearch.salaryFlexibility, [["", "Choisir"], ["faible", "Faible"], ["moyenne", "Moyenne"], ["forte", "Forte"]], false)}
        </div>
        ${checkboxGroup("Types de contrat acceptés", "jobSearch.contractTypes", userProfile.jobSearch.contractTypes, [["CDI", "CDI"], ["CDD", "CDD"], ["stage", "Stage"], ["alternance", "Alternance"], ["freelance", "Freelance"]], true)}
        <div class="rules-grid dual-grid">
          ${renderTagsSection("Secteurs préférés", userProfile.jobSearch.preferredSectors, "jobSearch.preferredSectors")}
          ${renderTagsSection("Secteurs à éviter", userProfile.jobSearch.avoidedSectors, "jobSearch.avoidedSectors")}
          ${renderTagsSection("Zones ciblées", userProfile.jobSearch.locations, "jobSearch.locations")}
        </div>
      </article>
    </section>
  `;
}

function renderSkillsTab() {
  return renderStandalone(
    "Compétences & expériences",
    "Renseigne les compétences, expériences, formations et langues utiles pour préparer un CV ciblé.",
    renderSkillsForm(false)
  );
}

function renderSkillsForm() {
  return `
    <section class="section-block">
      <article class="form-card">
        <div class="dynamic-header">
          <h3>Compétences</h3>
          <button class="inline-btn" type="button" data-action="add-skill">Ajouter une compétence</button>
        </div>
        <div class="dynamic-list">
          ${userProfile.skillsAndExperience.skills.length ? userProfile.skillsAndExperience.skills.map((item, index) => `
            <div class="dynamic-item">
              <div class="dynamic-header">
                <h4>Compétence ${index + 1}</h4>
                <button class="danger-btn" type="button" data-action="remove-skill" data-index="${index}">Supprimer</button>
              </div>
              <div class="triple-grid">
                ${textField("Nom", `skillsAndExperience.skills.${index}.name`, item.name, true, "Ex. Gestion de projet")}
                ${selectField("Niveau", `skillsAndExperience.skills.${index}.level`, item.level, SKILL_LEVEL_OPTIONS, true)}
                ${textField("Exemple", `skillsAndExperience.skills.${index}.example`, item.example, true, "Ex. pilotage d’un projet")}
              </div>
            </div>
          `).join("") : `<div class="empty-state">Ajoute les compétences avec un niveau et un exemple concret.</div>`}
        </div>
      </article>

      <article class="form-card">
        <div class="dynamic-header">
          <h3>Expériences</h3>
          <button class="inline-btn" type="button" data-action="add-experience">Ajouter une expérience</button>
        </div>
        <div class="dynamic-list">
          ${userProfile.skillsAndExperience.experiences.length ? userProfile.skillsAndExperience.experiences.map((item, index) => `
            <div class="dynamic-item">
              <div class="dynamic-header">
                <h4>Expérience ${index + 1}</h4>
                <button class="danger-btn" type="button" data-action="remove-experience" data-index="${index}">Supprimer</button>
              </div>
              <div class="form-grid">
                ${textField("Intitulé", `skillsAndExperience.experiences.${index}.title`, item.title, true, "Ex. Assistante marketing")}
                ${textField("Entreprise", `skillsAndExperience.experiences.${index}.company`, item.company, true, "Entreprise")}
                ${textField("Ville", `skillsAndExperience.experiences.${index}.city`, item.city, false, "Ville")}
                ${textField("Pays", `skillsAndExperience.experiences.${index}.country`, item.country, false, "Pays")}
                ${textField("Date de début", `skillsAndExperience.experiences.${index}.startDate`, item.startDate, true, "Ex. 09/2023")}
                ${textField("Date de fin", `skillsAndExperience.experiences.${index}.endDate`, item.endDate, false, "Ex. 03/2025 ou En cours")}
              </div>
              <div class="dual-grid">
                ${textareaField("Missions", `skillsAndExperience.experiences.${index}.missions`, item.missions, true, "Décris les missions principales")}
                ${textareaField("Résultats", `skillsAndExperience.experiences.${index}.achievements`, item.achievements, false, "Décris les résultats concrets")}
              </div>
              ${textareaField("Outils", `skillsAndExperience.experiences.${index}.tools`, item.tools, false, "Ex. Excel, HubSpot, Figma")}
            </div>
          `).join("") : `<div class="empty-state">Ajoute au moins une expérience détaillée.</div>`}
        </div>
      </article>

      <article class="form-card">
        <div class="dynamic-header">
          <h3>Diplômes</h3>
          <button class="inline-btn" type="button" data-action="add-education">Ajouter un diplôme</button>
        </div>
        <div class="dynamic-list">
          ${userProfile.skillsAndExperience.education.length ? userProfile.skillsAndExperience.education.map((item, index) => `
            <div class="dynamic-item">
              <div class="dynamic-header">
                <h4>Diplôme ${index + 1}</h4>
                <button class="danger-btn" type="button" data-action="remove-education" data-index="${index}">Supprimer</button>
              </div>
              <div class="triple-grid">
                ${textField("Diplôme", `skillsAndExperience.education.${index}.degree`, item.degree, true, "Ex. Master Marketing")}
                ${textField("École", `skillsAndExperience.education.${index}.school`, item.school, true, "École")}
                ${textField("Année", `skillsAndExperience.education.${index}.year`, item.year, true, "Ex. 2024")}
              </div>
              ${textareaField("Projets", `skillsAndExperience.education.${index}.projects`, item.projects, false, "Mémoire, projet, spécialisation")}
            </div>
          `).join("") : `<div class="empty-state">Ajoute les diplômes principaux utiles au ciblage.</div>`}
        </div>
      </article>

      <article class="form-card">
        <div class="dynamic-header">
          <h3>Langues</h3>
          <button class="inline-btn" type="button" data-action="add-language">Ajouter une langue</button>
        </div>
        <div class="dynamic-list">
          ${userProfile.skillsAndExperience.languages.length ? userProfile.skillsAndExperience.languages.map((item, index) => `
            <div class="dynamic-item">
              <div class="dynamic-header">
                <h4>Langue ${index + 1}</h4>
                <button class="danger-btn" type="button" data-action="remove-language" data-index="${index}">Supprimer</button>
              </div>
              <div class="dual-grid">
                ${textField("Nom", `skillsAndExperience.languages.${index}.name`, item.name, true, "Ex. Français")}
                ${selectField("Niveau", `skillsAndExperience.languages.${index}.level`, item.level, LANGUAGE_LEVEL_OPTIONS, true)}
              </div>
            </div>
          `).join("") : `<div class="empty-state">Ajoute les langues parlées et leur niveau.</div>`}
        </div>
      </article>
    </section>
  `;
}

function renderTargetingTab() {
  return renderStandalone(
    "Ciblage & annonces",
    "Ajoute les entreprises cibles, les formulations du job idéal, les mots-clés de recherche et les briefs d’enrichissement.",
    `${renderTargetingForm()}${renderEnrichmentBriefPanel()}`
  );
}

function renderTargetingForm() {
  return `
    <section class="section-block">
      <article class="form-card">
        <div class="dynamic-header">
          <h3>Entreprises rêvées</h3>
          <button class="inline-btn" type="button" data-action="add-dream-company">Ajouter une entreprise</button>
        </div>
        <div class="dynamic-list">
          ${userProfile.targeting.dreamCompanies.length ? userProfile.targeting.dreamCompanies.map((item, index) => `
            <div class="dynamic-item">
              <div class="dynamic-header">
                <h4>Entreprise cible ${index + 1}</h4>
                <div class="inline-actions">
                  <button class="small-btn" type="button" data-action="generate-company-enrichment-brief" data-index="${index}">Enrichir cette entreprise / annonce</button>
                  <button class="danger-btn" type="button" data-action="remove-dream-company" data-index="${index}">Supprimer</button>
                </div>
              </div>
              <div class="triple-grid">
                ${textField("Nom", `targeting.dreamCompanies.${index}.name`, item.name, true, "Entreprise")}
                ${textField("Ville", `targeting.dreamCompanies.${index}.city`, item.city, false, "Ville")}
                ${textField("Pays", `targeting.dreamCompanies.${index}.country`, item.country, false, "Pays")}
              </div>
              ${textField("Lien site / offre", `targeting.dreamCompanies.${index}.url`, item.url || "", false, "https://...", "url")}
              ${textareaField("Raisons", `targeting.dreamCompanies.${index}.reasons`, item.reasons, true, "Pourquoi cette entreprise t’attire ?")}
            </div>
          `).join("") : `<div class="empty-state">Ajoute une ou plusieurs entreprises rêvées avec les raisons associées.</div>`}
        </div>
      </article>

      <article class="form-card">
        <h3>Job idéal et exclusions</h3>
        <div class="form-grid">
          ${textField("Bullet points du job idéal", "targeting.idealJobBulletsInput", userProfile.targeting.idealJobBullets.join(", "), false, "Sépare par des virgules")}
          ${textField("Bullet points du job à éviter", "targeting.avoidJobBulletsInput", userProfile.targeting.avoidJobBullets.join(", "), false, "Sépare par des virgules")}
          ${textField("Mots-clés de recherche", "targeting.searchKeywordsInput", userProfile.targeting.searchKeywords.join(", "), false, "Sépare par des virgules")}
          ${textField("Mots-clés à exclure", "targeting.excludeKeywordsInput", userProfile.targeting.excludeKeywords.join(", "), false, "Sépare par des virgules")}
          ${textField("Sites favoris", "targeting.preferredJobSitesInput", userProfile.targeting.preferredJobSites.join(", "), false, "LinkedIn, WTTJ, Indeed")}
        </div>
        <div class="rules-grid dual-grid">
          ${renderTagsSection("Job idéal", userProfile.targeting.idealJobBullets, "targeting.idealJobBullets")}
          ${renderTagsSection("Job à éviter", userProfile.targeting.avoidJobBullets, "targeting.avoidJobBullets")}
          ${renderTagsSection("Mots-clés", userProfile.targeting.searchKeywords, "targeting.searchKeywords")}
          ${renderTagsSection("Exclusions", userProfile.targeting.excludeKeywords, "targeting.excludeKeywords")}
          ${renderTagsSection("Sites favoris", userProfile.targeting.preferredJobSites, "targeting.preferredJobSites")}
        </div>
      </article>
    </section>
  `;
}

function renderEnrichmentBriefPanel() {
  return `
    <article class="form-card ${APP_STATE.briefs.enrichment ? "" : "hidden"}" id="enrichment-brief-panel">
      <h3>Brief company-job-enrichment — Enrichissement entreprise / annonce</h3>
      <div class="brief-output">
        <textarea readonly data-testid="textarea-enrichment-brief">${escapeHtml(APP_STATE.briefs.enrichment)}</textarea>
        <div class="dashboard-form-actions">
          <button class="secondary-btn" type="button" data-action="copy-enrichment-brief">Copier</button>
          <button class="secondary-btn" type="button" data-action="save-brief-export" data-type="enrichment">Enregistrer dans le dossier</button>
        </div>
      </div>
    </article>
  `;
}

function renderCvTab() {
  return renderStandalone(
    "CV sur mesure",
    "Règle le comportement attendu du futur générateur de CV et prépare un brief IA à partir d’une annonce et des sources réelles importées.",
    `${renderCvForm()}${renderCvActionPanel()}`
  );
}

function renderCvForm() {
  const cvImports = userProfile.sourceDocuments.imports.filter((doc) => doc.category === "cv");
  const sourceOptions = [["", "Choisir un CV importé"]].concat(cvImports.map((doc) => [doc.name, doc.name]));
  return `
    <section class="section-block">
      <article class="form-card">
        <h3>Règles de CV</h3>
        <div class="form-grid">
          ${cvImports.length ? selectField("CV source", "cvRules.baseCvName", userProfile.cvRules.baseCvName, sourceOptions, true) : textField("Nom du CV source", "cvRules.baseCvName", userProfile.cvRules.baseCvName, true, "Importe un CV dans l’onglet Moi")}
          ${selectField("Nombre de pages", "cvRules.pages", String(userProfile.cvRules.pages), [["1", "1"], ["2", "2"]], true)}
          ${selectField("Style", "cvRules.style", userProfile.cvRules.style, [["", "Choisir"], ["sobre", "Sobre"], ["moderne", "Moderne"], ["creatif", "Créatif"]], true)}
          ${selectField("Version souhaitée", "cvRules.outputPreference", userProfile.cvRules.outputPreference, [["prete_a_envoyer", "Prête à envoyer"], ["annotee", "Annotée avec explications"]], true)}
        </div>
        <div class="dual-grid">
          ${radioGroup("Réordonner les expériences", "cvRules.allowReorderExperiences", String(userProfile.cvRules.allowReorderExperiences), [["true", "Oui"], ["false", "Non"]], true)}
          ${radioGroup("Masquer les expériences peu pertinentes", "cvRules.allowHideIrrelevant", String(userProfile.cvRules.allowHideIrrelevant), [["true", "Oui"], ["false", "Non"]], true)}
          ${radioGroup("Fusionner de petits jobs", "cvRules.allowMergeSmallJobs", String(userProfile.cvRules.allowMergeSmallJobs), [["true", "Oui"], ["false", "Non"]], true)}
        </div>
        ${textField("Choses interdites", "cvRules.forbiddenChangesInput", userProfile.cvRules.forbiddenChanges.join(", "), false, "Ex. ne pas modifier les dates, ne pas inventer")}
      </article>
    </section>
  `;
}

function renderCvActionPanel() {
  return `
    <section class="section-block">
      <article class="form-card">
        <h3>Générer un CV pour une annonce</h3>
        ${textareaField("Offre d’emploi ou lien", "action.cv.jobAd", "", false, "Colle ici le texte de l’offre ou une URL.")}
        <div class="dashboard-form-actions">
          <button class="primary-btn" type="button" data-action="generate-cv-brief">Préparer le brief pour l’IA</button>
          <button class="secondary-btn hidden" type="button" data-action="copy-cv-brief">Copier</button>
          <button class="secondary-btn hidden" type="button" data-action="save-brief-export" data-type="cv">Enregistrer dans le dossier</button>
        </div>
        <div class="brief-output ${APP_STATE.briefs.cv ? "" : "hidden"}" id="cv-brief-output">
          <h4>Brief CV prêt à utiliser</h4>
          <textarea readonly data-testid="textarea-cv-brief">${escapeHtml(APP_STATE.briefs.cv)}</textarea>
          <p class="small-note">Usage conseillé : enrichir d’abord l’entreprise ou l’annonce avec company-job-enrichment, puis utiliser ce brief comme base de travail dans Computer.</p>
        </div>
      </article>
    </section>
  `;
}

function renderLetterTab() {
  return renderStandalone(
    "Lettre de motivation",
    "Règle le ton et la structure attendus, puis prépare un brief IA pour une annonce donnée.",
    `${renderLetterForm()}${renderLetterActionPanel()}`
  );
}

function renderLetterForm() {
  return `
    <section class="section-block">
      <article class="form-card">
        <h3>Modèle de lettre</h3>
        <p class="muted">Applique un jeu de réglages prédéfini selon le type de candidature.</p>
        <div class="inline-actions">
          ${LETTER_TEMPLATES.map((t) => `<button class="secondary-btn" type="button" data-action="apply-letter-template" data-template-id="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`).join("")}
        </div>
      </article>
      <article class="form-card">
        <h3>Règles de lettre</h3>
        <div class="form-grid">
          ${selectField("Ton", "coverLetterRules.tone", userProfile.coverLetterRules.tone, [["", "Choisir"], ["tres_formel", "Très formel"], ["standard", "Standard"], ["naturel", "Naturel"]], true)}
          ${selectField("Longueur", "coverLetterRules.maxLength", userProfile.coverLetterRules.maxLength, [["", "Choisir"], ["courte", "Courte"], ["standard", "Standard"], ["complete", "Complète"]], true)}
          ${selectField("Structure", "coverLetterRules.structure", userProfile.coverLetterRules.structure, [["", "Choisir"], ["classique", "Classique"], ["projets", "Projets"], ["auto", "Laisser l’outil choisir"]], true)}
          ${textField("Forces principales", "coverLetterRules.keyStrengthsInput", userProfile.coverLetterRules.keyStrengths.join(", "), false, "Sépare par des virgules")}
          ${textField("Sujets sensibles à éviter", "coverLetterRules.topicsToAvoidInput", userProfile.coverLetterRules.topicsToAvoid.join(", "), false, "Sépare par des virgules")}
        </div>
        <div class="dual-grid">
          ${radioGroup("Éviter le style trop marketing", "coverLetterRules.avoidOverMarketing", String(userProfile.coverLetterRules.avoidOverMarketing), [["true", "Oui"], ["false", "Non"]], true)}
          ${radioGroup("Autoriser “j’apprends X”", "coverLetterRules.allowLearningStatements", String(userProfile.coverLetterRules.allowLearningStatements), [["true", "Oui"], ["false", "Non"]], true)}
        </div>
      </article>
    </section>
  `;
}

function renderLetterActionPanel() {
  return `
    <section class="section-block">
      <article class="form-card">
        <h3>Générer une lettre de motivation pour une annonce</h3>
        ${textareaField("Offre d’emploi ou lien", "action.letter.jobAd", "", false, "Colle ici le texte de l’offre ou une URL.")}
        <div class="dashboard-form-actions">
          <button class="primary-btn" type="button" data-action="generate-letter-brief">Préparer le brief pour l’IA</button>
          <button class="secondary-btn hidden" type="button" data-action="copy-letter-brief">Copier</button>
          <button class="secondary-btn hidden" type="button" data-action="save-brief-export" data-type="letter">Enregistrer dans le dossier</button>
        </div>
        <div class="brief-output ${APP_STATE.briefs.letter ? "" : "hidden"}" id="letter-brief-output">
          <h4>Brief lettre prêt à utiliser</h4>
          <textarea readonly data-testid="textarea-letter-brief">${escapeHtml(APP_STATE.briefs.letter)}</textarea>
          <p class="small-note">Usage conseillé : enrichir d’abord l’entreprise ou l’annonce avec company-job-enrichment, puis utiliser ce brief comme base de travail dans Computer.</p>
        </div>
      </article>
    </section>
  `;
}

function renderTrackingTab() {
  return renderStandalone(
    "Suivi des candidatures",
    "Active le suivi local, édite les candidatures, filtre le pipeline, calcule des stats et prépare des briefs de diagnostic ou d’enrichissement.",
    `${renderTrackingSettingsForm(false)}${renderApplicationEditor()}${renderTrackingManager()}${renderDiagnosticBriefPanel()}${renderEnrichmentBriefPanel()}`
  );
}

function renderTrackingSettingsForm(isOnboarding) {
  return `
    <section class="section-block">
      <article class="form-card">
        <h3>Réglages de suivi</h3>
        <div class="triple-grid">
          ${radioGroup("Suivre les candidatures dans l’app", "tracking.trackApplications", String(userProfile.tracking.trackApplications), [["true", "Oui"], ["false", "Non"]], true)}
          ${radioGroup("Vouloir un mini-diagnostic après refus", "tracking.wantDiagnostics", String(userProfile.tracking.wantDiagnostics), [["true", "Oui"], ["false", "Non"]], true)}
          ${textField("Délai de relance auto (jours)", "tracking.followUpDays", valueOrEmpty(userProfile.tracking.followUpDays), true, "Ex. 7", "number")}
          ${textField("Fenêtre stats (jours)", "tracking.statsWindowDays", valueOrEmpty(userProfile.tracking.statsWindowDays), true, "Ex. 30", "number")}
        </div>
        ${isOnboarding ? `<p class="helper-callout">Le tableau détaillé sera disponible après l’onboarding.</p>` : ""}
      </article>
    </section>
  `;
}

function renderApplicationEditor() {
  const draft = userProfile.tracking.applicationDraft;
  const isEdit = Boolean(APP_STATE.editingApplicationId);
  return `
    <section class="section-block">
      <article class="form-card">
        <div class="dynamic-header">
          <h3>${isEdit ? "Éditer une candidature" : "Ajouter une candidature"}</h3>
          <div class="inline-actions">
            <button class="inline-btn" type="button" data-action="save-application">${isEdit ? "Enregistrer les modifications" : "Ajouter une candidature"}</button>
            ${isEdit ? `<button class="ghost-btn" type="button" data-action="cancel-edit-application">Annuler</button>` : ""}
          </div>
        </div>
        <div class="form-grid">
          ${textField("Date de candidature", "tracking.applicationDraft.appliedDate", draft.appliedDate, true, "", "date")}
          ${textField("Entreprise", "tracking.applicationDraft.company", draft.company, true, "Ex. Société X")}
          ${textField("Titre du poste", "tracking.applicationDraft.title", draft.title, true, "Ex. Chargée de communication")}
          ${textField("Lien de l’annonce", "tracking.applicationDraft.adUrl", draft.adUrl, false, "https://...", "url")}
          ${textField("Ville", "tracking.applicationDraft.city", draft.city, false, "Ex. Lyon")}
          ${textField("Pays", "tracking.applicationDraft.country", draft.country, false, "Ex. France")}
          ${selectField("Source", "tracking.applicationDraft.source", draft.source, SOURCE_OPTIONS, true)}
          ${selectField("Statut", "tracking.applicationDraft.status", draft.status, STATUS_OPTIONS, true)}
          ${textField("Prochaine action", "tracking.applicationDraft.nextAction", draft.nextAction, false, "Ex. relancer RH")}
          ${textField("Date de relance", "tracking.applicationDraft.followUpDate", draft.followUpDate, false, "", "date")}
        </div>
        <div class="form-grid">
          <div class="field">
            <label>CV envoyé</label>
            ${draft.cvFilename ? `<p class="small-note">${escapeHtml(draft.cvFilename)} <a href="${API_BASE}/api/documents/${escapeHtml(draft.cvFileId)}/file" target="_blank" rel="noopener noreferrer">Télécharger</a></p>` : ""}
            <button type="button" class="small-btn" data-action="attach-application-file" data-kind="cv">${draft.cvFileId ? "Remplacer le fichier" : "Associer un fichier"}</button>
          </div>
          <div class="field">
            <label>Lettre envoyée</label>
            ${draft.letterFilename ? `<p class="small-note">${escapeHtml(draft.letterFilename)} <a href="${API_BASE}/api/documents/${escapeHtml(draft.letterFileId)}/file" target="_blank" rel="noopener noreferrer">Télécharger</a></p>` : ""}
            <button type="button" class="small-btn" data-action="attach-application-file" data-kind="letter">${draft.letterFileId ? "Remplacer le fichier" : "Associer un fichier"}</button>
          </div>
        </div>
        ${textareaField("Notes libres", "tracking.applicationDraft.notes", draft.notes, false, "Notes, contexte, retour entretien, axes de progression")}
      </article>
    </section>
  `;
}

function renderTrackingManager() {
  const filtered = getFilteredApplications();
  const stats = computeTrackingStats();
  const statsBySource = computeTrackingStatsBySource();
  const followUpDue = getFollowUpDueApplications();
  return `
    <section class="section-block">
      ${followUpDue.length ? `
      <article class="form-card">
        <h3>Relances à faire</h3>
        <ul class="follow-up-list">
          ${followUpDue.map((item) => `
            <li>
              <strong>${escapeHtml(item.company)}</strong> — ${escapeHtml(item.title || "")}
              <span class="muted">Relance : ${escapeHtml(item.followUpDate || "")}</span>
              <button class="small-btn" type="button" data-action="edit-application" data-id="${escapeHtml(item.id)}">Éditer</button>
            </li>
          `).join("")}
        </ul>
      </article>
      ` : ""}
      <article class="form-card">
        <h3>Stats locales</h3>
        <div class="kpi-grid">
          <article class="kpi-card"><span class="meta-line">Total</span><strong>${stats.total}</strong><span class="small-note">Toutes candidatures</span></article>
          <article class="kpi-card"><span class="meta-line">Derniers ${userProfile.tracking.statsWindowDays} jours</span><strong>${stats.recent}</strong><span class="small-note">Selon la date de candidature</span></article>
          <article class="kpi-card"><span class="meta-line">Entretiens / offres</span><strong>${stats.byStatus.entretien + stats.byStatus.offre + stats.byStatus.acceptee}</strong><span class="small-note">Étapes positives</span></article>
          <article class="kpi-card"><span class="meta-line">Taux de réponses</span><strong>${statsBySource.responseRate}%</strong><span class="small-note">Sur ${statsBySource.sent} envoyées, ${statsBySource.withResponse} réponses</span></article>
        </div>
        <div class="tag-cloud">
          ${STATUS_OPTIONS.map(([value, label]) => `<span class="status-pill" data-status="${escapeHtml(value)}">${escapeHtml(label)} : ${stats.byStatus[value] || 0}</span>`).join("")}
        </div>
        ${Object.keys(statsBySource.bySource).length ? `
        <h4 class="stats-by-source-title">Par source (derniers ${userProfile.tracking.statsWindowDays} j)</h4>
        <div class="tag-cloud">
          ${Object.entries(statsBySource.bySource).map(([src, o]) => `<span class="status-pill">${escapeHtml(src)} : ${o.total} candidatures, ${o.responses} réponses</span>`).join("")}
        </div>
        ` : ""}
      </article>

      <article class="form-card">
        <h3>Filtres</h3>
        <div class="form-grid">
          ${selectField("Statut", "tracking.filters.status", userProfile.tracking.filters.status, [["all", "Tous"], ...STATUS_OPTIONS])}
          ${textField("Entreprise", "tracking.filters.company", userProfile.tracking.filters.company, false, "Filtrer par entreprise")}
          ${textField("Source", "tracking.filters.source", userProfile.tracking.filters.source, false, "Filtrer par source")}
        </div>
      </article>

      <article class="form-card">
        <h3>Tableau de suivi</h3>
        ${renderApplicationsTable(filtered)}
      </article>
    </section>
  `;
}

function renderApplicationsTable(applications) {
  if (!applications.length) {
    return `<div class="empty-state">Aucune candidature ne correspond aux filtres actuels.</div>`;
  }

  return `
    <div class="tracking-table-wrap">
      <table class="tracking-table" data-testid="table-applications">
        <thead>
          <tr>
            <th>Date de candidature</th>
            <th>Entreprise</th>
            <th>Titre du poste</th>
            <th>Lien de l’annonce</th>
            <th>Ville / pays</th>
            <th>Source</th>
            <th>Statut</th>
            <th>Prochaine action / relance</th>
            <th>Pièces jointes</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${applications.map((item) => `
            <tr>
              <td>${escapeHtml(item.appliedDate || "-")}</td>
              <td>${escapeHtml(item.company)}</td>
              <td>${escapeHtml(item.title)}</td>
              <td>${item.adUrl ? `<a href="${escapeHtml(item.adUrl)}" target="_blank" rel="noopener noreferrer">Annonce</a>` : "-"}</td>
              <td>${escapeHtml([item.city, item.country].filter(Boolean).join(", ") || "-")}</td>
              <td>${escapeHtml(item.source || "-")}</td>
              <td><span class="status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td>
              <td>${escapeHtml([item.nextAction, item.followUpDate].filter(Boolean).join(" · ") || "-")}</td>
              <td>${item.cvFileId ? `<a href="${API_BASE}/api/documents/${escapeHtml(item.cvFileId)}/file" target="_blank" rel="noopener noreferrer">CV</a>` : ""} ${item.letterFileId ? ` <a href="${API_BASE}/api/documents/${escapeHtml(item.letterFileId)}/file" target="_blank" rel="noopener noreferrer">Lettre</a>` : ""} ${!item.cvFileId && !item.letterFileId ? "-" : ""}</td>
              <td>${escapeHtml(truncate(item.notes || "", 120) || "-")}</td>
              <td>
                <div class="table-actions">
                  <button class="small-btn" type="button" data-action="edit-application" data-id="${item.id}">Éditer</button>
                  <button class="small-btn" type="button" data-action="generate-application-enrichment-brief" data-id="${item.id}">Enrichir cette entreprise / annonce</button>
                  ${userProfile.tracking.wantDiagnostics && item.status === "refus" ? `<button class="small-btn" type="button" data-action="generate-diagnostic" data-id="${item.id}">Diagnostic</button>` : ""}
                  <button class="danger-btn" type="button" data-action="remove-application" data-id="${item.id}">Supprimer</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDiagnosticBriefPanel() {
  return `
    <article class="form-card ${APP_STATE.briefs.diagnostic ? "" : "hidden"}" id="diagnostic-brief-panel">
      <h3>Brief diagnostic après refus</h3>
      <div class="brief-output">
        <textarea readonly data-testid="textarea-diagnostic-brief">${escapeHtml(APP_STATE.briefs.diagnostic)}</textarea>
        <div class="dashboard-form-actions">
          <button class="secondary-btn" type="button" data-action="copy-diagnostic-brief">Copier</button>
          <button class="secondary-btn" type="button" data-action="save-brief-export" data-type="diagnostic">Enregistrer dans le dossier</button>
        </div>
      </div>
    </article>
  `;
}

function renderOffersActionPanel(embedded = false) {
  return `
    <article class="form-card" id="${APP_IDS.offersPanel}">
      <h3>Chercher des offres</h3>
      <p class="muted">Prépare le brief local-job-search-userprofile, puis colle si besoin la réponse de Computer pour alimenter un tableau local de résultats.</p>
      <div class="form-grid">
        ${textField("Ville ou toutes les villes cibles", "action.offers.location", "", false, "Laisse vide pour toutes les villes cibles")}
        ${textField("Mots-clés", "action.offers.keywords", "", false, "Ex. communication, contenus, B2B")}
        ${textField("Types de contrat", "action.offers.contractTypes", userProfile.jobSearch.contractTypes.join(", "), false, "Ex. CDI, CDD")}
        ${textField("Jobboards à prioriser", "action.offers.jobboards", userProfile.targeting.preferredJobSites.join(", "), false, "LinkedIn, WTTJ, Indeed, sites carrières")}
        ${textField("Nombre d’offres souhaitées", "action.offers.count", "12", false, "Ex. 10", "number")}
      </div>
      <div class="dashboard-form-actions">
        <button class="primary-btn" type="button" data-action="generate-offers-brief">Préparer le brief local-job-search-userprofile</button>
        <button class="secondary-btn hidden" type="button" data-action="copy-offers-brief">Copier</button>
        <button class="secondary-btn hidden" type="button" data-action="save-brief-export" data-type="offers">Enregistrer dans le dossier</button>
      </div>
      <div class="brief-output ${APP_STATE.briefs.offers ? "" : "hidden"}" id="offers-brief-output">
        <h4>Brief recherche d’offres prêt à utiliser</h4>
        <textarea readonly data-testid="textarea-offers-brief">${escapeHtml(APP_STATE.briefs.offers)}</textarea>
      </div>
      ${embedded ? "" : renderSearchResultsPanel()}
    </article>
  `;
}

function renderSearchResultsPanel() {
  const favoriteIds = userProfile.targeting.favoriteResultIds || [];
  const favorites = favoriteIds.map((id) => userProfile.targeting.localSearchResults.find((r) => r.id === id)).filter(Boolean);
  return `
    <article class="form-card">
      <h3>Coller une réponse Computer</h3>
      ${textareaField("Réponse Computer à parser", "action.offers.responsePaste", "", false, "Colle ici un JSON de résultats ou un texte structuré renvoyé par Computer.")}
      <div class="dashboard-form-actions">
        <button class="inline-btn" type="button" data-action="parse-offers-response">Parser la réponse collée</button>
      </div>
      ${favorites.length ? `
      <h4>À postuler</h4>
      <ul class="follow-up-list">
        ${favorites.map((item) => `
          <li>
            <strong>${escapeHtml(item.company || "")}</strong> — ${escapeHtml(item.title || "")}
            <button class="small-btn" type="button" data-action="toggle-favorite-result" data-id="${escapeHtml(item.id)}">Retirer</button>
            <button class="small-btn" type="button" data-action="add-search-result-to-tracking" data-id="${escapeHtml(item.id)}">Ajouter au suivi</button>
          </li>
        `).join("")}
      </ul>
      ` : ""}
      ${renderLocalSearchResultsTable()}
    </article>
  `;
}

function renderLocalSearchResultsTable() {
  const results = userProfile.targeting.localSearchResults;
  if (!results.length) {
    return `<div class="empty-state">Aucun résultat d’offre importé localement pour le moment.</div>`;
  }
  return `
    <div class="tracking-table-wrap">
      <table class="tracking-table">
        <thead>
          <tr>
            <th>Titre</th>
            <th>Entreprise</th>
            <th>Ville</th>
            <th>Lien</th>
            <th>Résumé</th>
            <th>Score</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${results.map((item) => `
            <tr>
              <td>${escapeHtml(item.title || "-")}</td>
              <td>${escapeHtml(item.company || "-")}</td>
              <td>${escapeHtml(item.city || item.location || "-")}</td>
              <td>${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">Voir</a>` : "-"}</td>
              <td>${escapeHtml(truncate(item.summary || "", 140) || "-")}</td>
              <td>${escapeHtml(String(item.score || "-"))}</td>
              <td>
                <div class="table-actions">
                  <button class="small-btn" type="button" data-action="toggle-favorite-result" data-id="${item.id}">${(userProfile.targeting.favoriteResultIds || []).includes(item.id) ? "Retirer des à postuler" : "Marquer à postuler"}</button>
                  <button class="small-btn" type="button" data-action="add-search-result-to-tracking" data-id="${item.id}">Ajouter au suivi</button>
                  <button class="small-btn" type="button" data-action="generate-search-result-enrichment-brief" data-id="${item.id}">Enrichir</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function toggleFavoriteResult(id) {
  const ids = userProfile.targeting.favoriteResultIds || [];
  const idx = ids.indexOf(id);
  if (idx === -1) ids.push(id);
  else ids.splice(idx, 1);
  userProfile.targeting.favoriteResultIds = ids;
}

function applyLetterTemplate(templateId) {
  const t = LETTER_TEMPLATES.find((x) => x.id === templateId);
  if (!t || !t.patch) return;
  Object.assign(userProfile.coverLetterRules, t.patch);
}

function handleActionClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const index = button.dataset.index;
  const id = button.dataset.id;
  const tab = button.dataset.tab;
  const path = button.dataset.path;
  const value = button.dataset.value;

  switch (action) {
    case "switch-tab":
      APP_STATE.activeTab = tab;
      APP_STATE.viewMode = tab === "dashboard" ? "dashboard" : "tab";
      if (APP_STATE.onboardingStarted && ONBOARDING_STEPS.some((step) => step.key === tab)) {
        APP_STATE.onboardingStep = ONBOARDING_STEPS.findIndex((step) => step.key === tab);
      }
      closeDrawer();
      renderApp();
      return;
    case "jump-tab":
      APP_STATE.activeTab = tab;
      APP_STATE.viewMode = tab === "dashboard" ? "dashboard" : "tab";
      closeDrawer();
      renderApp();
      return;
    case "offers":
      APP_STATE.activeTab = "dashboard";
      APP_STATE.viewMode = "dashboard";
      renderApp();
      scrollToElement(APP_IDS.offersPanel);
      return;
    case "cv":
      APP_STATE.activeTab = "cv";
      APP_STATE.viewMode = "tab";
      renderApp();
      return;
    case "letter":
      APP_STATE.activeTab = "letter";
      APP_STATE.viewMode = "tab";
      renderApp();
      return;
    case "start-onboarding":
      startOnboarding();
      return;
    case "prev-step":
      APP_STATE.onboardingStep = Math.max(0, APP_STATE.onboardingStep - 1);
      APP_STATE.activeTab = ONBOARDING_STEPS[APP_STATE.onboardingStep].key;
      renderApp();
      return;
    case "save-profile":
      persistProfile();
      renderApp();
      return;
    case "prepare-reimport-cv":
      userProfile.sourceDocuments.importCategoryDraft = "cv";
      APP_STATE.importMessage = "Choisis maintenant un nouveau fichier CV. Tu pourras ensuite fusionner ou remplacer proprement les données extraites.";
      APP_STATE.importLevel = "warning";
      renderApp();
      setTimeout(() => document.getElementById("source-import-input")?.click(), 50);
      return;
    case "apply-import-hints":
      applyImportHints(id);
      persistProfile(false);
      renderApp();
      return;
    case "apply-import-merge":
      applyStructuredPatchToProfile(id, "merge");
      persistProfile(false);
      renderApp();
      return;
    case "apply-import-replace":
      applyStructuredPatchToProfile(id, "replace");
      persistProfile(false);
      renderApp();
      return;
    case "generate-parsing-brief":
      APP_STATE.briefs.parsing = buildParsingSkillBrief(id);
      renderApp();
      scrollToElement("parsing-brief-panel");
      return;
    case "copy-parsing-brief":
      copyBrief(APP_STATE.briefs.parsing);
      return;
    case "save-brief-export":
      saveBriefToExport(button.dataset.type).catch(() => {});
      return;
    case "export-backup":
      exportBackup().catch(() => {});
      return;
    case "resolve-conflict-server":
      resolveConflictUseServer();
      return;
    case "resolve-conflict-local":
      resolveConflictUseLocal().catch(() => {});
      return;
    case "apply-letter-template":
      applyLetterTemplate(button.dataset.templateId);
      persistProfile(false);
      renderApp();
      return;
    case "attach-application-file":
      APP_STATE.attachKind = button.dataset.kind;
      els.applicationAttachInput?.click();
      return;
    case "remove-import":
      removeImport(id);
      persistProfile(false);
      renderApp();
      return;
    case "remove-tag":
      removeTag(path, value);
      persistProfile(false);
      renderApp();
      return;
    case "add-target-title":
      userProfile.jobSearch.targetTitles.push({ title: "", priority: "haute" });
      persistProfile(false);
      renderApp();
      return;
    case "remove-target-title":
      userProfile.jobSearch.targetTitles.splice(Number(index), 1);
      persistProfile(false);
      renderApp();
      return;
    case "add-skill":
      userProfile.skillsAndExperience.skills.push({ name: "", level: "", example: "" });
      persistProfile(false);
      renderApp();
      return;
    case "remove-skill":
      userProfile.skillsAndExperience.skills.splice(Number(index), 1);
      persistProfile(false);
      renderApp();
      return;
    case "add-experience":
      userProfile.skillsAndExperience.experiences.push({ title: "", company: "", city: "", country: "", startDate: "", endDate: "", missions: "", achievements: "", tools: "" });
      persistProfile(false);
      renderApp();
      return;
    case "remove-experience":
      userProfile.skillsAndExperience.experiences.splice(Number(index), 1);
      persistProfile(false);
      renderApp();
      return;
    case "add-education":
      userProfile.skillsAndExperience.education.push({ degree: "", school: "", year: "", projects: "" });
      persistProfile(false);
      renderApp();
      return;
    case "remove-education":
      userProfile.skillsAndExperience.education.splice(Number(index), 1);
      persistProfile(false);
      renderApp();
      return;
    case "add-language":
      userProfile.skillsAndExperience.languages.push({ name: "", level: "" });
      persistProfile(false);
      renderApp();
      return;
    case "remove-language":
      userProfile.skillsAndExperience.languages.splice(Number(index), 1);
      persistProfile(false);
      renderApp();
      return;
    case "add-dream-company":
      userProfile.targeting.dreamCompanies.push({ name: "", city: "", country: "", url: "", reasons: "" });
      persistProfile(false);
      renderApp();
      return;
    case "remove-dream-company":
      userProfile.targeting.dreamCompanies.splice(Number(index), 1);
      persistProfile(false);
      renderApp();
      return;
    case "generate-company-enrichment-brief":
      APP_STATE.briefs.enrichment = buildCompanyEnrichmentBrief(Number(index));
      renderApp();
      scrollToElement("enrichment-brief-panel");
      return;
    case "copy-enrichment-brief":
      copyBrief(APP_STATE.briefs.enrichment);
      return;
    case "generate-cv-brief":
      APP_STATE.briefs.cv = buildCvBrief(getFieldValue("action.cv.jobAd"));
      renderApp();
      scrollToElement("cv-brief-output");
      return;
    case "copy-cv-brief":
      copyBrief(APP_STATE.briefs.cv);
      return;
    case "generate-letter-brief":
      APP_STATE.briefs.letter = buildLetterBrief(getFieldValue("action.letter.jobAd"));
      renderApp();
      scrollToElement("letter-brief-output");
      return;
    case "copy-letter-brief":
      copyBrief(APP_STATE.briefs.letter);
      return;
    case "generate-offers-brief":
      APP_STATE.briefs.offers = buildOffersBrief();
      renderApp();
      scrollToElement("offers-brief-output");
      return;
    case "copy-offers-brief":
      copyBrief(APP_STATE.briefs.offers);
      return;
    case "parse-offers-response":
      parseOffersResponse(getFieldValue("action.offers.responsePaste"));
      persistProfile(false);
      renderApp();
      return;
    case "toggle-favorite-result":
      toggleFavoriteResult(id);
      persistProfile(false);
      renderApp();
      return;
    case "add-search-result-to-tracking":
      addSearchResultToTracking(id);
      persistProfile(false);
      renderApp();
      return;
    case "generate-search-result-enrichment-brief":
      APP_STATE.briefs.enrichment = buildSearchResultEnrichmentBrief(id);
      renderApp();
      scrollToElement("enrichment-brief-panel");
      return;
    case "save-application":
      saveApplicationDraft();
      persistProfile(false);
      renderApp();
      return;
    case "edit-application":
      loadApplicationIntoDraft(id);
      APP_STATE.activeTab = "tracking";
      APP_STATE.viewMode = "tab";
      renderApp();
      return;
    case "cancel-edit-application":
      APP_STATE.editingApplicationId = null;
      userProfile.tracking.applicationDraft = createDefaultProfile().tracking.applicationDraft;
      persistProfile(false);
      renderApp();
      return;
    case "remove-application":
      userProfile.tracking.applications = userProfile.tracking.applications.filter((item) => item.id !== id);
      if (APP_STATE.editingApplicationId === id) {
        APP_STATE.editingApplicationId = null;
        userProfile.tracking.applicationDraft = createDefaultProfile().tracking.applicationDraft;
      }
      persistProfile(false);
      renderApp();
      return;
    case "generate-diagnostic":
      APP_STATE.briefs.diagnostic = buildDiagnosticBrief(id);
      renderApp();
      scrollToElement("diagnostic-brief-panel");
      return;
    case "copy-diagnostic-brief":
      copyBrief(APP_STATE.briefs.diagnostic);
      return;
    case "generate-application-enrichment-brief":
      APP_STATE.briefs.enrichment = buildApplicationEnrichmentBrief(id);
      renderApp();
      scrollToElement("enrichment-brief-panel");
      return;
    default:
      return;
  }
}

function handleContentSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();

  if (form.id === "onboarding-form") {
    const stepKey = form.dataset.stepKey;
    form.querySelectorAll(".field-invalid").forEach((el) => el.classList.remove("field-invalid"));
    if (!validateStep(stepKey, true)) {
      form.querySelectorAll(".field input[required], .field select[required], .field textarea[required]").forEach((el) => {
        const val = (el.value || "").trim();
        if (!val) el.closest(".field")?.classList.add("field-invalid");
      });
      return;
    }
    if (APP_STATE.onboardingStep === ONBOARDING_STEPS.length - 1) {
      APP_STATE.onboardingStarted = false;
      APP_STATE.viewMode = "dashboard";
      APP_STATE.activeTab = "dashboard";
      persistProfile();
      renderApp();
      return;
    }
    APP_STATE.onboardingStep += 1;
    APP_STATE.activeTab = ONBOARDING_STEPS[APP_STATE.onboardingStep].key;
    persistProfile(false);
    renderApp();
  }
}

async function handleContentChange(event) {
  const target = event.target;
  if (!target.name) return;

  if (target.type === "file") {
    await handleFileInput(target);
    target.value = "";
    return;
  }

  if (target.type === "checkbox") {
    updateCheckboxPath(target.name, target.value, target.checked);
  } else {
    setValueByPath(userProfile, target.name, normalizeValue(target));
  }

  syncArrayInputs(target.name, target.value);
  if (target.name === "tracking.applicationDraft.appliedDate" && !getValueByPath(userProfile, "tracking.applicationDraft.followUpDate")) {
    setValueByPath(userProfile, "tracking.applicationDraft.followUpDate", addDaysToDate(normalizeValue(target) || todayIso(), Number(userProfile.tracking.followUpDays) || 7));
  }
  persistProfile(false);
  renderSummary();
}

function handleContentInput(event) {
  const target = event.target;
  if (!target.name || ["checkbox", "radio", "file"].includes(target.type)) return;
  setValueByPath(userProfile, target.name, normalizeValue(target));
  syncArrayInputs(target.name, target.value);
  persistProfile(false);
  renderSummary();
}

async function handleFileInput(target) {
  const file = target.files?.[0];
  if (!file) return;
  const category = userProfile.sourceDocuments.importCategoryDraft || "cv";

  try {
    const parsed = await parseFile(file);
    const parsedText = truncate(parsed.text, MAX_STORED_IMPORT_TEXT);
    const structuredPatch = extractStructuredProfile(parsedText, category);
    const doc = {
      id: makeId(),
      name: file.name,
      category,
      format: parsed.format,
      size: file.size,
      parsedText,
      structuredPatch,
      hints: extractHints(parsedText),
      addedAt: new Date().toLocaleString("fr-FR")
    };

    if (category === "cv") {
      userProfile.sourceDocuments.imports = userProfile.sourceDocuments.imports.filter((item) => item.category !== "cv");
    }

    userProfile.sourceDocuments.imports.unshift(doc);
    if (category === "cv") userProfile.cvRules.baseCvName = file.name;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", category);
      const r = await fetch(`${API_BASE}/api/documents`, { method: "POST", body: fd });
      if (r.ok) {
        const j = await r.json();
        doc.storedId = j.id;
        doc.storedPath = j.path;
      }
    } catch (_) {}
    APP_STATE.importMessage = `${file.name} importé et analysé localement. Vérifie maintenant la vue de contrôle, puis fusionne ou remplace les données.`;
    APP_STATE.importLevel = "success";
    persistProfile(false);
    renderApp();
  } catch (error) {
    console.error(error);
    APP_STATE.importMessage = `Impossible de parser ${file.name}. Formats supportés : PDF, DOCX, TXT, HTML.`;
    APP_STATE.importLevel = "error";
    renderApp();
  }
}

async function parseFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return { text: await parsePdf(file), format: "PDF" };
  if (ext === "docx") return { text: await parseDocx(file), format: "DOCX" };
  if (ext === "txt") return { text: await readFileAsText(file), format: "TXT" };
  if (ext === "html" || ext === "htm") return { text: await parseHtml(file), format: "HTML" };
  throw new Error("unsupported_format");
}

async function parsePdf(file) {
  if (!window.pdfjsLib) throw new Error("pdfjs_missing");
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    text += `${content.items.map((item) => item.str).join(" ")}\n`;
  }
  return text.trim();
}

async function parseDocx(file) {
  if (!window.mammoth) throw new Error("mammoth_missing");
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

async function parseHtml(file) {
  const raw = await readFileAsText(file);
  const doc = new DOMParser().parseFromString(raw, "text/html");
  return (doc.body?.innerText || raw).trim();
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function extractStructuredProfile(text, category) {
  const lines = normalizeLines(text);
  const sections = segmentSections(lines);
  const contact = extractHints(text);
  const name = extractFullName(lines, contact) || "a_confirmer";
  const title = extractHeadline(lines, name, contact) || "a_confirmer";
  const experiences = extractExperiences(lines, sections.experience || []);
  const skills = extractSkills(sections.skills || [], text);
  const education = extractEducation(sections.education || []);
  const languages = extractLanguages(sections.languages || [], text);

  return {
    identity: {
      fullName: name,
      currentCity: "",
      currentCountry: "",
      targetCities: [],
      email: contact.emails[0] || "",
      phone: contact.phones[0] || "",
      linkedinUrl: contact.linkedinUrls[0] || "",
      portfolioUrl: contact.urls.find((url) => !/linkedin/i.test(url)) || ""
    },
    situation: {
      status: "",
      currentOrLastTitle: title,
      currentOrTargetSector: detectSector(text)
    },
    writingStyle: {
      tone: "",
      languages: [],
      coverLetterLength: ""
    },
    honestyRules: {
      allowRephrasing: true,
      allowTitleAdjustment: true
    },
    sourceDocuments: {
      importCategoryDraft: category,
      imports: []
    },
    jobSearch: {
      targetTitles: title && title !== "a_confirmer" ? [{ title, priority: "haute" }] : [],
      preferredSectors: [],
      avoidedSectors: [],
      locations: [],
      workMode: "",
      maxCommuteMinutes: null,
      seniority: detectSeniority(text),
      salaryRange: { min: null, max: null, unit: "brut_annuel" },
      salaryFlexibility: "",
      contractTypes: []
    },
    skillsAndExperience: {
      skills,
      experiences,
      education,
      languages
    },
    targeting: {
      dreamCompanies: [],
      idealJobBullets: [],
      avoidJobBullets: [],
      searchKeywords: [],
      excludeKeywords: [],
      preferredJobSites: [],
      localSearchResults: []
    },
    cvRules: {
      baseCvName: "",
      pages: 1,
      style: "",
      allowReorderExperiences: true,
      allowHideIrrelevant: true,
      allowMergeSmallJobs: true,
      forbiddenChanges: [],
      outputPreference: "prete_a_envoyer"
    },
    coverLetterRules: {
      tone: "",
      maxLength: "",
      structure: "",
      keyStrengths: [],
      topicsToAvoid: [],
      avoidOverMarketing: true,
      allowLearningStatements: true
    },
    tracking: createDefaultProfile().tracking
  };
}

function normalizeLines(text) {
  return String(text || "")
    .replace(/\u00A0/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function segmentSections(lines) {
  const sectionMap = { skills: [], experience: [], education: [], languages: [] };
  let currentKey = "";
  lines.forEach((line) => {
    const lower = line.toLowerCase();
    if (/comp[eé]tences|skills|expertises|technologies|outils/.test(lower)) {
      currentKey = "skills";
      return;
    }
    if (/exp[eé]riences|experience professionnelle|professional experience|parcours professionnel/.test(lower)) {
      currentKey = "experience";
      return;
    }
    if (/formation|education|dipl[oô]mes|studies/.test(lower)) {
      currentKey = "education";
      return;
    }
    if (/langues|languages|idiomas/.test(lower)) {
      currentKey = "languages";
      return;
    }
    if (currentKey) sectionMap[currentKey].push(line);
  });
  return sectionMap;
}

function extractFullName(lines, contact) {
  const topLines = lines.slice(0, 8);
  const candidate = topLines.find((line) => /^[A-Za-zÀ-ÿ'’ -]{4,60}$/.test(line) && line.split(" ").length >= 2 && line.split(" ").length <= 4 && !/@/.test(line));
  if (candidate) return candidate;
  if (contact.emails[0]) {
    const local = contact.emails[0].split("@")[0].replace(/[._-]+/g, " ");
    if (local.split(" ").length >= 2) return titleCase(local);
  }
  return "";
}

function extractHeadline(lines, detectedName, contact) {
  const topLines = lines.slice(0, 12);
  const candidate = topLines.find((line) => {
    if (line === detectedName) return false;
    if (/@/.test(line) || /(https?:\/\/)|linkedin/i.test(line)) return false;
    if (/^\+?\d/.test(line)) return false;
    if (line.length > 80) return false;
    return /chef|charg[eé]|consult|engineer|manager|marketing|communication|project|business|sales|data|designer|developer|responsable|assistant|coordin|recrut/i.test(line);
  });
  if (candidate) return candidate;
  const fallback = topLines.find((line) => line !== detectedName && line !== contact.emails[0] && line.length > 4 && line.length < 70);
  return fallback || "";
}

function extractExperiences(lines, sectionLines) {
  const source = sectionLines.length ? sectionLines : lines;
  const ranges = [];
  for (let i = 0; i < source.length; i += 1) {
    const line = source[i];
    if (containsDateRange(line)) {
      ranges.push({ index: i, line });
    }
  }
  const experiences = [];
  ranges.slice(0, 8).forEach((range, idx) => {
    const prev = source[range.index - 1] || "";
    const next = source[range.index + 1] || "";
    const next2 = source[range.index + 2] || "";
    const titleCompany = prev || next || "a_confirmer";
    const parsedTitleCompany = parseTitleCompany(titleCompany);
    const dates = splitDateRange(range.line);
    experiences.push({
      title: parsedTitleCompany.title || "a_confirmer",
      company: parsedTitleCompany.company || "a_confirmer",
      city: extractLocationFromLine(range.line).city || extractLocationFromLine(next).city || "",
      country: extractLocationFromLine(range.line).country || extractLocationFromLine(next).country || "",
      startDate: dates.start || "a_confirmer",
      endDate: dates.end || "a_confirmer",
      missions: [next, next2].filter(Boolean).join(" \n") || "a_confirmer",
      achievements: "",
      tools: ""
    });
  });
  return uniqueObjectArray(experiences, (item) => `${item.title}|${item.company}|${item.startDate}`);
}

function containsDateRange(line) {
  return /(\b\d{2}[\/.-]\d{4}\b|\b\d{4}\b).{0,12}(à|to|-|–|—).{0,12}(aujourd'hui|present|présent|en cours|\b\d{2}[\/.-]\d{4}\b|\b\d{4}\b)/i.test(line);
}

function splitDateRange(line) {
  const match = line.match(/(\b\d{2}[\/.-]\d{4}\b|\b\d{4}\b)\s*(?:à|to|-|–|—)\s*(aujourd'hui|present|présent|en cours|\b\d{2}[\/.-]\d{4}\b|\b\d{4}\b)/i);
  return { start: match?.[1] || "", end: match?.[2] || "" };
}

function parseTitleCompany(line) {
  if (/ chez /i.test(line)) {
    const [title, company] = line.split(/ chez /i);
    return { title: title.trim(), company: company.trim() };
  }
  const separators = [" | ", " - ", " @ "];
  for (const separator of separators) {
    if (line.includes(separator)) {
      const [title, company] = line.split(separator);
      return { title: title.trim(), company: company.trim() };
    }
  }
  return { title: line.trim(), company: "a_confirmer" };
}

function extractLocationFromLine(line) {
  const countries = ["France", "Belgique", "Suisse", "Canada", "Maroc", "Tunisie", "Espagne", "Italie", "Germany", "United Kingdom", "UK", "USA"];
  const cityCountry = line.split(",").map((item) => item.trim());
  if (cityCountry.length >= 2 && countries.includes(cityCountry[cityCountry.length - 1])) {
    return { city: cityCountry[0], country: cityCountry[cityCountry.length - 1] };
  }
  return { city: "", country: "" };
}

function extractSkills(sectionLines, text) {
  const raw = sectionLines.length ? sectionLines.join("\n") : text;
  const tokens = raw
    .split(/[\n,;•·]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.length <= 50)
    .filter((item) => /[A-Za-zÀ-ÿ]/.test(item));
  const cleaned = uniqueList(tokens).slice(0, 12);
  return cleaned.map((name) => ({ name, level: "a_confirmer", example: "" }));
}

function extractEducation(sectionLines) {
  const joined = sectionLines.join("\n");
  const lines = sectionLines.length ? sectionLines : [];
  const results = [];
  lines.forEach((line, index) => {
    if (/master|licence|bachelor|mba|dipl[oô]me|ingenieur|ingénieur|certificat|doctorat|phd/i.test(line)) {
      const yearMatch = (line + " " + (lines[index + 1] || "")).match(/\b(19|20)\d{2}\b/);
      results.push({
        degree: line,
        school: lines[index + 1] && !/\b(19|20)\d{2}\b/.test(lines[index + 1]) ? lines[index + 1] : "a_confirmer",
        year: yearMatch ? yearMatch[0] : "a_confirmer",
        projects: ""
      });
    }
  });
  if (!results.length && joined) {
    const year = joined.match(/\b(19|20)\d{2}\b/)?.[0] || "";
    return year ? [{ degree: "a_confirmer", school: "a_confirmer", year, projects: "" }] : [];
  }
  return uniqueObjectArray(results, (item) => `${item.degree}|${item.school}|${item.year}`).slice(0, 6);
}

function extractLanguages(sectionLines, text) {
  const blob = `${sectionLines.join("\n")}\n${text}`.toLowerCase();
  const known = [
    ["français", "Français"],
    ["anglais", "Anglais"],
    ["arab", "Arabe"],
    ["espagnol", "Espagnol"],
    ["italien", "Italien"],
    ["allemand", "Allemand"]
  ];
  const levels = ["natif", "native", "bilingue", "courant", "professionnel", "intermédiaire", "débutant", "c1", "c2", "b2", "b1", "a2", "a1"];
  const results = [];
  known.forEach(([needle, name]) => {
    if (blob.includes(needle)) {
      const line = sectionLines.find((item) => item.toLowerCase().includes(needle)) || text.split(/\n+/).find((item) => item.toLowerCase().includes(needle)) || "";
      const level = levels.find((candidate) => line.toLowerCase().includes(candidate)) || "a_confirmer";
      results.push({ name, level });
    }
  });
  return uniqueObjectArray(results, (item) => `${item.name}|${item.level}`);
}

function detectSector(text) {
  const patterns = [
    [/(marketing|communication|contenu|brand)/i, "marketing / communication"],
    [/(sales|business development|commercial)/i, "business development / sales"],
    [/(rh|recrutement|talent|hr)/i, "RH / recrutement"],
    [/(data|analytics|bi)/i, "data / analytics"],
    [/(software|product|saas|tech)/i, "tech / logiciel"],
    [/(event|événement|culture)/i, "événementiel / culture"]
  ];
  const found = patterns.find(([regex]) => regex.test(text));
  return found ? found[1] : "";
}

function detectSeniority(text) {
  if (/stage|stagiaire/i.test(text)) return "stage";
  if (/alternance/i.test(text)) return "junior";
  if (/junior|entry/i.test(text)) return "junior";
  if (/senior/i.test(text)) return "senior";
  if (/confirm/i.test(text)) return "confirmee";
  return "";
}

function extractHints(text) {
  return {
    emails: uniqueList(String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []),
    phones: uniqueList((String(text).match(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?)?(?:\d[\s.-]?){7,12}/g) || []).map((item) => item.trim()).filter((item) => item.replace(/\D/g, "").length >= 9)),
    linkedinUrls: uniqueList(String(text).match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/gi) || []),
    urls: uniqueList(String(text).match(/https?:\/\/[^\s)]+/gi) || [])
  };
}

function applyImportHints(id) {
  const doc = userProfile.sourceDocuments.imports.find((item) => item.id === id);
  if (!doc) return;
  const hints = doc.hints;
  if (!userProfile.identity.email && hints.emails[0]) userProfile.identity.email = hints.emails[0];
  if (!userProfile.identity.phone && hints.phones[0]) userProfile.identity.phone = hints.phones[0];
  if (!userProfile.identity.linkedinUrl && hints.linkedinUrls[0]) userProfile.identity.linkedinUrl = hints.linkedinUrls[0];
  if (!userProfile.identity.portfolioUrl && hints.urls.find((url) => !/linkedin/i.test(url))) {
    userProfile.identity.portfolioUrl = hints.urls.find((url) => !/linkedin/i.test(url));
  }
  APP_STATE.importMessage = `Indices utiles appliqués depuis ${doc.name}. Vérifie les champs du formulaire avant de sauvegarder.`;
  APP_STATE.importLevel = "success";
}

function applyStructuredPatchToProfile(id, mode) {
  const doc = userProfile.sourceDocuments.imports.find((item) => item.id === id);
  if (!doc) return;
  userProfile = mergeProfile(createDefaultProfile(), userProfile, doc.structuredPatch, mode);
  if (doc.category === "cv") userProfile.cvRules.baseCvName = doc.name;
  APP_STATE.importMessage = mode === "merge"
    ? `Les données extraites de ${doc.name} ont été fusionnées dans le profil. Vérifie et ajuste si nécessaire.`
    : `Les sections extraites de ${doc.name} ont remplacé les données correspondantes dans le profil.`;
  APP_STATE.importLevel = "success";
}

function mergeProfile(baseProfile, current, patch, mode) {
  const next = mergeDeep(baseProfile, current);
  mergeScalars(next.identity, patch.identity, mode);
  mergeScalars(next.situation, patch.situation, mode);

  next.jobSearch.targetTitles = mergeArrayObjects(next.jobSearch.targetTitles, patch.jobSearch.targetTitles, mode, (item) => `${item.title}|${item.priority}`);
  next.skillsAndExperience.skills = mergeArrayObjects(next.skillsAndExperience.skills, patch.skillsAndExperience.skills, mode, (item) => `${item.name}|${item.level}`);
  next.skillsAndExperience.experiences = mergeArrayObjects(next.skillsAndExperience.experiences, patch.skillsAndExperience.experiences, mode, (item) => `${item.title}|${item.company}|${item.startDate}`);
  next.skillsAndExperience.education = mergeArrayObjects(next.skillsAndExperience.education, patch.skillsAndExperience.education, mode, (item) => `${item.degree}|${item.school}|${item.year}`);
  next.skillsAndExperience.languages = mergeArrayObjects(next.skillsAndExperience.languages, patch.skillsAndExperience.languages, mode, (item) => `${item.name}|${item.level}`);
  return next;
}

function mergeScalars(target, patch, mode) {
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) return;
    if (value === undefined || value === null || value === "") return;
    if (mode === "replace" || !target[key] || target[key] === "") {
      target[key] = value;
    }
  });
}

function mergeArrayObjects(current, incoming, mode, signatureFn) {
  if (!incoming?.length) return current || [];
  if (mode === "replace") return incoming.filter(Boolean);
  return uniqueObjectArray([...(current || []), ...incoming.filter(Boolean)], signatureFn);
}

function removeImport(id) {
  const removed = userProfile.sourceDocuments.imports.find((doc) => doc.id === id);
  userProfile.sourceDocuments.imports = userProfile.sourceDocuments.imports.filter((doc) => doc.id !== id);
  if (removed && userProfile.cvRules.baseCvName === removed.name) userProfile.cvRules.baseCvName = "";
  APP_STATE.importMessage = "Document supprimé du stockage local.";
  APP_STATE.importLevel = "success";
}

function buildParsingSkillBrief(id) {
  const doc = userProfile.sourceDocuments.imports.find((item) => item.id === id);
  if (!doc) return "";
  const schema = JSON.stringify(createDefaultProfile(), null, 2);
  return [
    "SKILL CIBLE — cv-vers-userprofile",
    "",
    "Voici le texte brut d’un CV ou d’un profil.",
    "Analyse-le et renvoie un JSON strictement conforme au schéma suivant.",
    "Ne jamais inventer d’informations. Laisser les champs inconnus vides ou avec la mention 'a_confirmer'.",
    "Utilise explicitement le skill cv-vers-userprofile.",
    "",
    "Schéma userProfile :",
    schema,
    "",
    "Texte brut à analyser :",
    doc.parsedText
  ].join("\n");
}

function buildCompanyEnrichmentBrief(index) {
  const company = userProfile.targeting.dreamCompanies[index];
  if (!company) return "";
  return [
    "SKILL CIBLE — company-job-enrichment",
    "",
    `Entreprise : ${company.name || "Non renseignée"}`,
    `Ville : ${company.city || ""}`,
    `Pays : ${company.country || ""}`,
    `Lien : ${company.url || "Non renseigné"}`,
    `Pourquoi cette entreprise attire Marie-Nour : ${company.reasons || "Non renseigné"}`,
    "",
    "Contexte Marie-Nour :",
    buildShortProfileSummary(),
    "",
    "Objectif : Donne un résumé en 5–10 bullet points de ce qu’il faut comprendre de cette entreprise ou de cette annonce pour adapter un CV et une lettre. Couvre si possible : secteur, taille approximative, localisation principale, technologies / compétences clés, culture, attentes implicites, angle de candidature utile.",
    "Utilise explicitement le skill company-job-enrichment.",
    "Ne rien inventer sans signaler l’incertitude."
  ].join("\n");
}

function buildApplicationEnrichmentBrief(id) {
  const application = userProfile.tracking.applications.find((item) => item.id === id);
  if (!application) return "";
  return [
    "SKILL CIBLE — company-job-enrichment",
    "",
    `Entreprise : ${application.company}`,
    `Titre du poste : ${application.title}`,
    `Lien de l’annonce : ${application.adUrl || "Non renseigné"}`,
    `Ville / pays : ${[application.city, application.country].filter(Boolean).join(", ") || "Non renseigné"}`,
    `Source : ${application.source || "Non renseignée"}`,
    "",
    "Contexte Marie-Nour :",
    buildShortProfileSummary(),
    "",
    "Objectif : Donne un résumé en 5–10 bullet points de ce qu’il faut comprendre de cette entreprise ou de cette annonce pour adapter un CV et une lettre.",
    "Utilise explicitement le skill company-job-enrichment."
  ].join("\n");
}

function buildSearchResultEnrichmentBrief(id) {
  const result = userProfile.targeting.localSearchResults.find((item) => item.id === id);
  if (!result) return "";
  return [
    "SKILL CIBLE — company-job-enrichment",
    "",
    `Entreprise : ${result.company || "Non renseignée"}`,
    `Titre du poste : ${result.title || "Non renseigné"}`,
    `Ville : ${result.city || result.location || "Non renseignée"}`,
    `Lien : ${result.link || "Non renseigné"}`,
    `Résumé actuel : ${result.summary || "Non renseigné"}`,
    "",
    "Contexte Marie-Nour :",
    buildShortProfileSummary(),
    "",
    "Objectif : Donne un résumé en 5–10 bullet points de ce qu’il faut comprendre de cette entreprise ou de cette annonce pour adapter un CV et une lettre.",
    "Utilise explicitement le skill company-job-enrichment."
  ].join("\n");
}

function buildOffersBrief() {
  const location = getFieldValue("action.offers.location") || joinOrFallback(uniqueList([...userProfile.identity.targetCities, ...userProfile.jobSearch.locations]), "toutes les villes cibles");
  const keywords = getFieldValue("action.offers.keywords") || joinOrFallback(userProfile.targeting.searchKeywords);
  const contractTypes = getFieldValue("action.offers.contractTypes") || joinOrFallback(userProfile.jobSearch.contractTypes);
  const jobboards = getFieldValue("action.offers.jobboards") || joinOrFallback(userProfile.targeting.preferredJobSites);
  const count = getFieldValue("action.offers.count") || "12";
  return [
    "SKILL CIBLE — local-job-search-userprofile",
    "",
    `À partir des préférences suivantes (userProfile.jobSearch + targeting), trouve ${count} offres récentes correspondant au profil de Marie-Nour.`,
    `Villes : ${location}`,
    `Mots-clés : ${keywords}`,
    `Types de contrat : ${contractTypes}`,
    `Jobboards à prioriser : ${jobboards}`,
    `Postes cibles : ${formatTargetTitles()}`,
    `Exclusions : ${joinOrFallback(userProfile.targeting.excludeKeywords)}`,
    `Secteurs recherchés : ${joinOrFallback(userProfile.jobSearch.preferredSectors)}`,
    `Secteurs à éviter : ${joinOrFallback(userProfile.jobSearch.avoidedSectors)}`,
    "",
    "Pour chaque annonce, donne : titre, entreprise, ville, lien, 3–5 bullet points de résumé, et un score de pertinence par rapport au profil de Marie-Nour.",
    "Utilise explicitement le skill local-job-search-userprofile.",
    "Si possible, renvoie le résultat au format JSON array."
  ].join("\n");
}

function parseOffersResponse(raw) {
  if (!raw.trim()) {
    alert("Colle d’abord une réponse Computer à parser.");
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const array = Array.isArray(parsed) ? parsed : Array.isArray(parsed.results) ? parsed.results : [];
    if (!array.length) throw new Error("empty_json_results");
    userProfile.targeting.localSearchResults = array.map(normalizeSearchResult);
    return;
  } catch (error) {
    const blocks = raw.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
    const results = blocks.map(parseOfferBlock).filter(Boolean);
    if (!results.length) {
      alert("Impossible de parser la réponse collée. Préfère un JSON array ou des blocs texte structurés.");
      return;
    }
    userProfile.targeting.localSearchResults = results;
  }
}

function normalizeSearchResult(item) {
  return {
    id: makeId(),
    title: item.title || item.poste || item.role || "",
    company: item.company || item.entreprise || "",
    city: item.city || item.ville || item.location || "",
    location: item.location || item.ville || item.city || "",
    link: item.link || item.url || item.lien || "",
    summary: Array.isArray(item.summary) ? item.summary.join(" · ") : item.summary || item.resume || item.description || "",
    score: item.score || item.pertinence || ""
  };
}

function parseOfferBlock(block) {
  const result = { id: makeId(), title: "", company: "", city: "", location: "", link: "", summary: "", score: "" };
  block.split(/\n+/).forEach((line) => {
    const [rawKey, ...rest] = line.split(":");
    if (!rest.length) return;
    const key = rawKey.toLowerCase().trim();
    const value = rest.join(":").trim();
    if (/titre|poste|title|role/.test(key)) result.title = value;
    if (/entreprise|company/.test(key)) result.company = value;
    if (/ville|city|location/.test(key)) {
      result.city = value;
      result.location = value;
    }
    if (/lien|url|link/.test(key)) result.link = value;
    if (/r[eé]sum[eé]|summary|description/.test(key)) result.summary = value;
    if (/score|pertinence/.test(key)) result.score = value;
  });
  if (!result.title && !result.company) return null;
  return result;
}

function addSearchResultToTracking(id) {
  const result = userProfile.targeting.localSearchResults.find((item) => item.id === id);
  if (!result) return;
  userProfile.tracking.applications.unshift({
    id: makeId(),
    appliedDate: todayIso(),
    company: result.company || "",
    title: result.title || "",
    adUrl: result.link || "",
    city: result.city || result.location || "",
    country: "",
    source: "Autre",
    status: "a_envoyer",
    nextAction: "Analyser l’offre et adapter le CV",
    followUpDate: addDaysToDate(todayIso(), Number(userProfile.tracking.followUpDays) || 7),
    notes: result.summary || "",
    cvFileId: "",
    cvFilename: "",
    letterFileId: "",
    letterFilename: ""
  });
}

function buildCvBrief(jobAdText) {
  return [
    "BRIEF CV SUR MESURE",
    "",
    "Mission : préparer une version ciblée du CV sans rien inventer.",
    "Skill conseillé en amont : company-job-enrichment pour résumer l’entreprise et l’annonce avant adaptation.",
    `Candidate : ${userProfile.identity.fullName || "Marie-Nour Salibi"}`,
    `Ville / pays : ${joinOrFallback([userProfile.identity.currentCity, userProfile.identity.currentCountry].filter(Boolean))}`,
    `LinkedIn : ${userProfile.identity.linkedinUrl || "Non renseigné"}`,
    `CV source : ${userProfile.cvRules.baseCvName || "Non renseigné"}`,
    `Nombre de pages : ${userProfile.cvRules.pages}`,
    `Style souhaité : ${userProfile.cvRules.style || "Non renseigné"}`,
    `Version attendue : ${userProfile.cvRules.outputPreference === "annotee" ? "Version annotée" : "Version prête à envoyer"}`,
    `Postes cibles : ${formatTargetTitles()}`,
    `Compétences disponibles : ${joinOrFallback(userProfile.skillsAndExperience.skills.map((item) => `${item.name} (${item.level})`))}`,
    `Expériences disponibles : ${joinOrFallback(userProfile.skillsAndExperience.experiences.map((item) => `${item.title} chez ${item.company}`))}`,
    `Diplômes : ${joinOrFallback(userProfile.skillsAndExperience.education.map((item) => `${item.degree} - ${item.school}`))}`,
    `Langues : ${joinOrFallback(userProfile.skillsAndExperience.languages.map((item) => `${item.name} (${item.level})`))}`,
    "",
    "Documents importés utilisables :",
    buildImportedDocsForBrief(),
    "",
    "Règles de transformation autorisées :",
    `- Reformulation autorisée : ${booleanToOuiNon(userProfile.honestyRules.allowRephrasing)}`,
    `- Ajustement léger des intitulés : ${booleanToOuiNon(userProfile.honestyRules.allowTitleAdjustment)}`,
    `- Réordonner les expériences : ${booleanToOuiNon(userProfile.cvRules.allowReorderExperiences)}`,
    `- Masquer les expériences peu pertinentes : ${booleanToOuiNon(userProfile.cvRules.allowHideIrrelevant)}`,
    `- Fusionner de petits jobs : ${booleanToOuiNon(userProfile.cvRules.allowMergeSmallJobs)}`,
    `- Changements interdits : ${joinOrFallback(userProfile.cvRules.forbiddenChanges)}`,
    "- Ne jamais inventer d’expérience, diplôme, date, niveau, technologie ou résultat.",
    "- Ne pas copier mot à mot l’annonce.",
    "",
    "Annonce cible :",
    jobAdText?.trim() || "Aucune annonce fournie. L’utilisatrice doit coller une offre ou un lien.",
    "",
    "Livrable attendu :",
    userProfile.cvRules.outputPreference === "annotee"
      ? "Une version annotée expliquant les choix d’ordre, d’élagage et de reformulation, sans modifier les faits."
      : "Une version prête à envoyer, concise, ciblée et parfaitement honnête.",
    "Si besoin, utiliser aussi company-job-enrichment pour compléter le contexte avant génération finale."
  ].join("\n");
}

function buildLetterBrief(jobAdText) {
  const tone = userProfile.coverLetterRules.tone || userProfile.writingStyle.tone || "professionnel";
  return [
    "BRIEF LETTRE DE MOTIVATION",
    "",
    "Mission : rédiger une lettre sur mesure, honnête et naturelle à partir du profil, des documents importés et de l’annonce.",
    "Skill conseillé en amont : company-job-enrichment pour comprendre l’entreprise et l’annonce avant rédaction.",
    `Candidate : ${userProfile.identity.fullName || "Marie-Nour Salibi"}`,
    `Postes cibles : ${formatTargetTitles()}`,
    `Secteurs d’intérêt : ${joinOrFallback(userProfile.jobSearch.preferredSectors)}`,
    `Ton souhaité : ${tone}`,
    `Longueur souhaitée : ${userProfile.coverLetterRules.maxLength || userProfile.writingStyle.coverLetterLength || "standard"}`,
    `Structure souhaitée : ${userProfile.coverLetterRules.structure || "auto"}`,
    `Forces principales : ${joinOrFallback(userProfile.coverLetterRules.keyStrengths)}`,
    `Sujets à éviter : ${joinOrFallback(userProfile.coverLetterRules.topicsToAvoid)}`,
    `Éviter le style trop marketing : ${booleanToOuiNon(userProfile.coverLetterRules.avoidOverMarketing)}`,
    `Autoriser les formulations d’apprentissage : ${booleanToOuiNon(userProfile.coverLetterRules.allowLearningStatements)}`,
    "",
    "Documents importés utilisables :",
    buildImportedDocsForBrief(),
    "",
    "Règles d’honnêteté :",
    `- Reformulation autorisée : ${booleanToOuiNon(userProfile.honestyRules.allowRephrasing)}`,
    `- Ajustement léger des intitulés : ${booleanToOuiNon(userProfile.honestyRules.allowTitleAdjustment)}`,
    "- Ne jamais inventer de compétence, mission, diplôme, date ou niveau.",
    "- Ne pas copier mot à mot les phrases de l’annonce.",
    "- Préserver un ton naturel en français.",
    "",
    "Annonce cible :",
    jobAdText?.trim() || "Aucune annonce fournie. L’utilisatrice doit coller une offre ou un lien.",
    "",
    "Livrable attendu : Une lettre fluide, spécifique à l’offre, crédible, concise et cohérente avec le profil réel de la candidate.",
    "Si besoin, utiliser aussi company-job-enrichment pour compléter le contexte avant génération finale."
  ].join("\n");
}

function buildDiagnosticBrief(id) {
  const app = userProfile.tracking.applications.find((item) => item.id === id);
  if (!app) return "";
  return [
    "BRIEF DIAGNOSTIC APRÈS REFUS",
    "",
    `Entreprise : ${app.company}`,
    `Titre du poste : ${app.title}`,
    `Date de candidature : ${app.appliedDate || "Non renseignée"}`,
    `Lien de l’annonce : ${app.adUrl || "Non renseigné"}`,
    `Ville / pays : ${[app.city, app.country].filter(Boolean).join(", ") || "Non renseigné"}`,
    `Source : ${app.source || "Non renseignée"}`,
    `Notes : ${app.notes || "Aucune"}`,
    "",
    "Contexte Marie-Nour :",
    buildShortProfileSummary(),
    "",
    "Demande : analyser les causes probables du refus, identifier les points à corriger dans le ciblage, le CV ou la lettre, puis proposer des améliorations concrètes sans inventer d’informations nouvelles."
  ].join("\n");
}

function buildShortProfileSummary() {
  return [
    `Nom : ${userProfile.identity.fullName || "Non renseigné"}`,
    `Titre actuel / dernier poste : ${userProfile.situation.currentOrLastTitle || "Non renseigné"}`,
    `Postes cibles : ${formatTargetTitles()}`,
    `Secteurs : ${joinOrFallback(userProfile.jobSearch.preferredSectors)}`,
    `Villes cibles : ${joinOrFallback(uniqueList([...userProfile.identity.targetCities, ...userProfile.jobSearch.locations]))}`,
    `Compétences clés : ${joinOrFallback(userProfile.skillsAndExperience.skills.map((item) => item.name).slice(0, 10))}`
  ].join("\n");
}

function buildImportedDocsForBrief() {
  if (!userProfile.sourceDocuments.imports.length) return "Aucun document importé.";
  return userProfile.sourceDocuments.imports.slice(0, 4).map((doc) => `- ${doc.name} [${doc.category}/${doc.format}]\n${truncate(doc.parsedText, 1000)}`).join("\n\n");
}

function saveApplicationDraft() {
  const draft = userProfile.tracking.applicationDraft;
  if (!draft.company.trim() || !draft.title.trim()) {
    alert("Renseigne au minimum l’entreprise et le titre du poste.");
    return;
  }

  const payload = {
    id: APP_STATE.editingApplicationId || makeId(),
    appliedDate: draft.appliedDate || todayIso(),
    company: draft.company.trim(),
    title: draft.title.trim(),
    adUrl: draft.adUrl.trim(),
    city: draft.city.trim(),
    country: draft.country.trim(),
    source: draft.source,
    status: draft.status,
    nextAction: draft.nextAction.trim(),
    followUpDate: draft.followUpDate || addDaysToDate(draft.appliedDate || todayIso(), Number(userProfile.tracking.followUpDays) || 7),
    notes: draft.notes.trim(),
    cvFileId: draft.cvFileId || "",
    cvFilename: draft.cvFilename || "",
    letterFileId: draft.letterFileId || "",
    letterFilename: draft.letterFilename || ""
  };

  if (APP_STATE.editingApplicationId) {
    userProfile.tracking.applications = userProfile.tracking.applications.map((item) => item.id === APP_STATE.editingApplicationId ? payload : item);
  } else {
    userProfile.tracking.applications.unshift(payload);
  }

  APP_STATE.editingApplicationId = null;
  userProfile.tracking.applicationDraft = createDefaultProfile().tracking.applicationDraft;
}

function loadApplicationIntoDraft(id) {
  const app = userProfile.tracking.applications.find((item) => item.id === id);
  if (!app) return;
  APP_STATE.editingApplicationId = id;
  userProfile.tracking.applicationDraft = { ...app };
}

function getFilteredApplications() {
  return [...userProfile.tracking.applications].filter((item) => {
    const statusOk = userProfile.tracking.filters.status === "all" || item.status === userProfile.tracking.filters.status;
    const companyOk = !userProfile.tracking.filters.company.trim() || item.company.toLowerCase().includes(userProfile.tracking.filters.company.trim().toLowerCase());
    const sourceOk = !userProfile.tracking.filters.source.trim() || item.source.toLowerCase().includes(userProfile.tracking.filters.source.trim().toLowerCase());
    return statusOk && companyOk && sourceOk;
  }).sort((a, b) => String(b.appliedDate).localeCompare(String(a.appliedDate)));
}

function computeTrackingStats() {
  const total = userProfile.tracking.applications.length;
  const windowDays = Number(userProfile.tracking.statsWindowDays) || 30;
  const limit = new Date();
  limit.setDate(limit.getDate() - windowDays);
  const recent = userProfile.tracking.applications.filter((item) => new Date(item.appliedDate) >= limit).length;
  const byStatus = STATUS_OPTIONS.reduce((acc, [value]) => ({ ...acc, [value]: userProfile.tracking.applications.filter((item) => item.status === value).length }), {});
  return { total, recent, byStatus };
}

function getFollowUpDueApplications() {
  const today = new Date().toISOString().slice(0, 10);
  return userProfile.tracking.applications.filter((item) => {
    if (!item.followUpDate) return false;
    const statusOk = item.status === "envoyee" || item.status === "relance_prevue";
    return statusOk && String(item.followUpDate).slice(0, 10) <= today;
  }).sort((a, b) => String(a.followUpDate).localeCompare(String(b.followUpDate)));
}

function computeTrackingStatsBySource() {
  const windowDays = Number(userProfile.tracking.statsWindowDays) || 30;
  const limit = new Date();
  limit.setDate(limit.getDate() - windowDays);
  const recent = userProfile.tracking.applications.filter((item) => new Date(item.appliedDate) >= limit);
  const bySource = {};
  const responseStatuses = ["entretien", "refus", "offre", "acceptee"];
  recent.forEach((item) => {
    const src = item.source || "Autre";
    if (!bySource[src]) bySource[src] = { total: 0, responses: 0 };
    bySource[src].total += 1;
    if (responseStatuses.includes(item.status)) bySource[src].responses += 1;
  });
  const sent = recent.filter((item) => item.status === "envoyee").length;
  const withResponse = recent.filter((item) => responseStatuses.includes(item.status)).length;
  const responseRate = sent > 0 ? Math.round((withResponse / sent) * 100) : 0;
  return { bySource, responseRate, sent, withResponse };
}

function revealCopyButtons() {
  toggleCopyButton("offers", APP_STATE.briefs.offers);
  toggleCopyButton("cv", APP_STATE.briefs.cv);
  toggleCopyButton("letter", APP_STATE.briefs.letter);
}

function toggleCopyButton(type, text) {
  const button = document.querySelector(`[data-action="copy-${type}-brief"]`);
  const saveBtn = document.querySelector(`[data-action="save-brief-export"][data-type="${type}"]`);
  const panel = document.getElementById(`${type}-brief-output`);
  if (button) button.classList.toggle("hidden", !text);
  if (saveBtn) saveBtn.classList.toggle("hidden", !text);
  if (panel) panel.classList.toggle("hidden", !text);
}

function validateStep(stepKey, showAlert) {
  const validators = {
    moi: validateIdentityStep,
    recherche: validateJobSearchStep,
    experiences: validateSkillsStep,
    targeting: validateTargetingStep,
    cv: validateCvStep,
    letter: validateLetterStep,
    tracking: validateTrackingStep
  };
  return validators[stepKey] ? validators[stepKey](showAlert) : true;
}

function validateIdentityStep(showAlert) {
  const valid = Boolean(
    userProfile.identity.fullName.trim() &&
    userProfile.identity.currentCity.trim() &&
    userProfile.identity.currentCountry.trim() &&
    userProfile.situation.currentOrLastTitle.trim() &&
    userProfile.situation.currentOrTargetSector.trim() &&
    userProfile.situation.status &&
    userProfile.writingStyle.tone &&
    userProfile.writingStyle.languages.length &&
    userProfile.writingStyle.coverLetterLength
  );
  if (!valid && showAlert) alert("Étape 1 incomplète : complète l’identité, la situation et le style d’écriture.");
  return valid;
}

function validateJobSearchStep(showAlert) {
  const hasTitle = userProfile.jobSearch.targetTitles.some((item) => item.title?.trim() && item.priority);
  const valid = Boolean(hasTitle && userProfile.jobSearch.workMode && userProfile.jobSearch.seniority && userProfile.jobSearch.contractTypes.length);
  if (!valid && showAlert) alert("Étape 2 incomplète : ajoute au moins un poste cible, un mode de travail, un niveau et un type de contrat.");
  return valid;
}

function validateSkillsStep(showAlert) {
  const valid = Boolean(
    userProfile.skillsAndExperience.skills.some((item) => item.name?.trim() && item.level?.trim()) &&
    userProfile.skillsAndExperience.experiences.some((item) => item.title?.trim() && item.company?.trim()) &&
    userProfile.skillsAndExperience.education.some((item) => item.degree?.trim() && item.school?.trim()) &&
    userProfile.skillsAndExperience.languages.some((item) => item.name?.trim() && item.level?.trim())
  );
  if (!valid && showAlert) alert("Étape 3 incomplète : ajoute au moins une compétence, une expérience, un diplôme et une langue.");
  return valid;
}

function validateTargetingStep(showAlert) {
  const valid = Boolean(
    userProfile.targeting.searchKeywords.length &&
    userProfile.targeting.preferredJobSites.length &&
    (userProfile.targeting.idealJobBullets.length || userProfile.targeting.dreamCompanies.length)
  );
  if (!valid && showAlert) alert("Étape 4 incomplète : renseigne des mots-clés, des sites favoris et au moins un élément de job idéal ou une entreprise cible.");
  return valid;
}

function validateCvStep(showAlert) {
  const valid = Boolean(userProfile.cvRules.baseCvName.trim() && userProfile.cvRules.style && userProfile.cvRules.pages);
  if (!valid && showAlert) alert("Étape 5 incomplète : renseigne le CV source, le style et le nombre de pages.");
  return valid;
}

function validateLetterStep(showAlert) {
  const valid = Boolean(userProfile.coverLetterRules.tone && userProfile.coverLetterRules.maxLength && userProfile.coverLetterRules.structure);
  if (!valid && showAlert) alert("Étape 6 incomplète : renseigne le ton, la longueur et la structure de la lettre.");
  return valid;
}

function validateTrackingStep(showAlert) {
  const valid = Number(userProfile.tracking.followUpDays) > 0 && Number(userProfile.tracking.statsWindowDays) > 0;
  if (!valid && showAlert) alert("Étape 7 incomplète : indique des délais valides pour la relance et les stats.");
  return valid;
}

function updateCheckboxPath(path, value, checked) {
  const current = Array.isArray(getValueByPath(userProfile, path)) ? [...getValueByPath(userProfile, path)] : [];
  if (checked) {
    if (!current.includes(value)) current.push(value);
  } else {
    const index = current.indexOf(value);
    if (index >= 0) current.splice(index, 1);
  }
  setValueByPath(userProfile, path, current);
}

function syncArrayInputs(name, rawValue) {
  const mapping = {
    "identity.targetCitiesInput": "identity.targetCities",
    "jobSearch.preferredSectorsInput": "jobSearch.preferredSectors",
    "jobSearch.avoidedSectorsInput": "jobSearch.avoidedSectors",
    "jobSearch.locationsInput": "jobSearch.locations",
    "targeting.idealJobBulletsInput": "targeting.idealJobBullets",
    "targeting.avoidJobBulletsInput": "targeting.avoidJobBullets",
    "targeting.searchKeywordsInput": "targeting.searchKeywords",
    "targeting.excludeKeywordsInput": "targeting.excludeKeywords",
    "targeting.preferredJobSitesInput": "targeting.preferredJobSites",
    "cvRules.forbiddenChangesInput": "cvRules.forbiddenChanges",
    "coverLetterRules.keyStrengthsInput": "coverLetterRules.keyStrengths",
    "coverLetterRules.topicsToAvoidInput": "coverLetterRules.topicsToAvoid"
  };
  if (mapping[name]) setValueByPath(userProfile, mapping[name], splitToArray(rawValue));
}

function persistProfile(log = true) {
  saveUserProfile(userProfile);
  APP_STATE.profileCompleted = hasMinimumIdentity();
  if (log) console.info("Profil sauvegardé.");
}

async function loadUserProfile() {
  try {
    const res = await fetch(`${API_BASE}/api/profile`, { method: "GET", credentials: "same-origin" });
    if (res.status === 404) {
      APP_STATE.loadedFromServer = true;
      APP_STATE.offlineMode = false;
      APP_STATE.serverReachable = true;
      APP_STATE.pendingConflict = null;
      return createDefaultProfile();
    }
    if (res.ok) {
      const json = await res.json();
      const data = json.data != null ? json.data : json;
      const updatedAt = json.updated_at || null;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const local = JSON.parse(raw);
          const lastSync = localStorage.getItem("mnwork_last_sync");
          if (lastSync && updatedAt && String(updatedAt) > lastSync) {
            APP_STATE.pendingConflict = { serverData: data, localData: local, updated_at: updatedAt };
            APP_STATE.loadedFromServer = true;
            APP_STATE.serverReachable = true;
            APP_STATE.lastServerUpdatedAt = updatedAt;
            return mergeDeep(createDefaultProfile(), local);
          }
          await fetch(`${API_BASE}/api/profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mergeDeep(createDefaultProfile(), local)),
            credentials: "same-origin"
          });
        } catch (_) {}
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem("marieNourJobSearchProfile_v1");
        localStorage.removeItem("marieNourJobSearchProfile_v2");
      }
      APP_STATE.pendingConflict = null;
      APP_STATE.loadedFromServer = true;
      APP_STATE.offlineMode = false;
      APP_STATE.serverReachable = true;
      APP_STATE.lastServerUpdatedAt = updatedAt;
      if (updatedAt) try { localStorage.setItem("mnwork_last_sync", String(updatedAt)); } catch (_) {}
      return mergeDeep(createDefaultProfile(), data);
    }
  } catch (_) {}
  APP_STATE.offlineMode = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProfile();
    return mergeDeep(createDefaultProfile(), JSON.parse(raw));
  } catch (error) {
    console.error("Impossible de charger le profil.", error);
    return createDefaultProfile();
  }
}

function saveUserProfile(profile) {
  fetch(`${API_BASE}/api/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  }).catch(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.error("Impossible de sauvegarder le profil.", e);
    }
  });
}

function clearProfile() {
  fetch(`${API_BASE}/api/profile`, { method: "DELETE" }).catch(() => {});
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("marieNourJobSearchProfile_v1");
  localStorage.removeItem("marieNourJobSearchProfile_v2");
}

function hasSavedProfile() {
  return Boolean(localStorage.getItem(STORAGE_KEY)) || APP_STATE.loadedFromServer;
}

function hasMinimumIdentity() {
  return Boolean(userProfile.identity.fullName.trim());
}

function mergeDeep(base, incoming) {
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
  if (typeof base !== "object" || base === null) return incoming ?? base;
  const result = { ...base };
  Object.keys(incoming || {}).forEach((key) => {
    if (key in base) result[key] = mergeDeep(base[key], incoming[key]);
  });
  return result;
}

function setValueByPath(object, path, value) {
  const keys = path.split(".");
  let current = object;
  for (let i = 0; i < keys.length - 1; i += 1) {
    current = current[isFinite(keys[i]) ? Number(keys[i]) : keys[i]];
    if (current === undefined) return;
  }
  current[isFinite(keys[keys.length - 1]) ? Number(keys[keys.length - 1]) : keys[keys.length - 1]] = value;
}

function getValueByPath(object, path) {
  return path.split(".").reduce((acc, key) => (acc ? acc[isFinite(key) ? Number(key) : key] : undefined), object);
}

function getFieldValue(name) {
  const field = document.querySelector(`[name="${CSS.escape(name)}"]`);
  return field ? field.value : "";
}

function normalizeValue(target) {
  if (target.type === "number") return target.value === "" ? null : Number(target.value);
  if (target.type === "radio" && ["true", "false"].includes(target.value)) return target.value === "true";
  return target.value;
}

function splitToArray(value) {
  return uniqueList((value || "").split(",").map((item) => item.trim()).filter(Boolean));
}

function uniqueList(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function uniqueObjectArray(values, signatureFn) {
  const map = new Map();
  values.filter(Boolean).forEach((item) => {
    const signature = signatureFn(item);
    if (signature && !map.has(signature)) map.set(signature, item);
  });
  return [...map.values()];
}

function removeTag(path, value) {
  const current = getValueByPath(userProfile, path);
  if (!Array.isArray(current)) return;
  setValueByPath(userProfile, path, current.filter((item) => item !== value));
}

function copyBrief(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => alert("Brief copié dans le presse-papiers."));
}

async function saveBriefToExport(type) {
  const content = APP_STATE.briefs[type];
  if (!content) return;
  try {
    const res = await fetch(`${API_BASE}/api/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: `brief-${type}`, content })
    });
    if (res.ok) alert("Brief enregistré dans data/marie-nour/exports/.");
    else alert("Erreur lors de l’enregistrement.");
  } catch (_) {
    alert("Impossible de contacter le serveur. Lance l’app via le raccourci.");
  }
}

async function exportBackup() {
  try {
    const res = await fetch(`${API_BASE}/api/backup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userProfile)
    });
    if (res.ok) alert("Sauvegarde enregistrée dans data/marie-nour/backups/.");
    else alert("Erreur lors de l’export.");
  } catch (_) {
    alert("Impossible de contacter le serveur. Lance l’app via le raccourci.");
  }
}

function joinOrFallback(list, fallback = "Non renseigné") {
  return list && list.length ? list.join(", ") : fallback;
}

function valueOrEmpty(value) {
  return value ?? "";
}

function booleanToOuiNon(value) {
  return value ? "Oui" : "Non";
}

function statusLabel(value) {
  return Object.fromEntries(STATUS_OPTIONS)[value] || value;
}

function requiredMark() {
  return '<span class="required-mark" aria-hidden="true"> *</span>';
}

function textField(label, name, value, required = false, placeholder = "", type = "text", help = "") {
  return `
    <div class="field">
      <label for="${name}">${escapeHtml(label)}${required ? requiredMark() : ""}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeHtml(String(value ?? ""))}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} data-testid="input-${slugify(name)}" />
      ${help ? `<span class="field-help">${escapeHtml(help)}</span>` : ""}
    </div>
  `;
}

function textareaField(label, name, value, required = false, placeholder = "") {
  return `
    <div class="field">
      <label for="${name}">${escapeHtml(label)}${required ? requiredMark() : ""}</label>
      <textarea id="${name}" name="${name}" rows="5" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} data-testid="textarea-${slugify(name)}">${escapeHtml(value || "")}</textarea>
    </div>
  `;
}

function selectField(label, name, value, options, required = false) {
  return `
    <div class="field">
      <label for="${name}">${escapeHtml(label)}${required ? requiredMark() : ""}</label>
      <select id="${name}" name="${name}" ${required ? "required" : ""} data-testid="select-${slugify(name)}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${String(value) === String(optionValue) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </div>
  `;
}

function radioGroup(label, name, selectedValue, options, required = false) {
  return `
    <fieldset class="radio-group">
      <legend class="group-label">${escapeHtml(label)}${required ? requiredMark() : ""}</legend>
      <div class="radio-options">
        ${options.map(([value, labelText], index) => `
          <label class="option-chip" for="${slugify(name)}-${index}">
            <input id="${slugify(name)}-${index}" name="${name}" type="radio" value="${value}" ${String(selectedValue) === String(value) ? "checked" : ""} ${required ? "required" : ""} />
            <span>${escapeHtml(labelText)}</span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function checkboxGroup(label, name, selectedValues, options, required = false) {
  const selected = Array.isArray(selectedValues) ? selectedValues : [];
  return `
    <fieldset class="checkbox-group">
      <legend class="group-label">${escapeHtml(label)}${required ? requiredMark() : ""}</legend>
      <div class="checkbox-options">
        ${options.map(([value, labelText], index) => `
          <label class="option-chip" for="${slugify(name)}-${index}">
            <input id="${slugify(name)}-${index}" name="${name}" type="checkbox" value="${value}" ${selected.includes(value) ? "checked" : ""} />
            <span>${escapeHtml(labelText)}</span>
          </label>
        `).join("")}
      </div>
      ${required ? `<span class="field-help">Sélectionne au moins une option.</span>` : ""}
    </fieldset>
  `;
}

function renderTagsSection(label, items, path) {
  return `
    <article class="list-card">
      <h4>${escapeHtml(label)}</h4>
      ${items.length ? `<div class="tag-cloud">${items.map((item) => `<span class="tag">${escapeHtml(item)} <button type="button" data-action="remove-tag" data-path="${path}" data-value="${escapeHtml(item)}">×</button></span>`).join("")}</div>` : `<p class="empty-state">Aucun élément pour l’instant.</p>`}
    </article>
  `;
}

function renderTagsNoDelete(items) {
  return items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");
}

function truncate(value, max = 400) {
  const text = String(value || "").trim();
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function titleCase(value) {
  return value.split(" ").map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part).join(" ");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToDate(dateString, days) {
  const base = new Date(dateString);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function makeId() {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function scrollToElement(id) {
  const element = document.getElementById(id);
  if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
}
