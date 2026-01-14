import { makeId, nowIso } from "../utils";

const LS_KEY = "noteease.notes.v1";

/**
 * Notes schema (as used by app UI)
 * Required keys for storage validation:
 * - id: string
 * - title: string
 * - body: string
 * - tags: string[]
 * - updatedAt: ISO string
 *
 * We also preserve createdAt if present/repairable, but we do not require it.
 */

function getApiBase() {
  return process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "";
}

function hasApiConfigured() {
  return Boolean(getApiBase());
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function seedNotes() {
  const createdAt = nowIso();
  return [
    {
      id: makeId(),
      title: "Welcome to NoteEase",
      body: "## Getting started\n\n- Create a new note from the sidebar\n- Use *markdown* for quick formatting\n- Add tags like `work`, `ideas`, `personal`\n\nTip: This app stores notes locally by default, but can switch to an API when configured.",
      tags: ["welcome", "tips"],
      createdAt,
      updatedAt: createdAt
    },
    {
      id: makeId(),
      title: "Ocean Professional theme",
      body: "This UI uses a clean blue primary (#2563EB) with amber accents (#F59E0B).\n\n**Try** toggling light/dark mode from the header.",
      tags: ["design"],
      createdAt,
      updatedAt: createdAt
    }
  ];
}

function toIsoOrNull(value) {
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return null;
}

function ensureString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .slice(0, 24);
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * Validate/repair a single note object.
 * - Coerce/repair when possible
 * - Return null for irreparable/corrupt entries (to be dropped safely)
 */
function coerceNote(input, { allowGenerateId = true } = {}) {
  if (!isPlainObject(input)) return null;

  const idRaw = input.id;
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw : allowGenerateId ? makeId() : null;
  if (!id) return null;

  const title = ensureString(input.title, "").trim();
  const body = ensureString(input.body, "");

  // tags[] is required in our schema contract; default to []
  const tags = normalizeTags(input.tags);

  // updatedAt is required; attempt to repair from updatedAt/createdAt/now
  const updatedAt =
    toIsoOrNull(input.updatedAt) || toIsoOrNull(input.createdAt) || nowIso();

  // createdAt is optional but helpful; attempt to keep/repair it.
  const createdAt = toIsoOrNull(input.createdAt) || updatedAt;

  // If updatedAt is still not a valid ISO (shouldn't happen), drop entry.
  if (!updatedAt) return null;

  return {
    id,
    title: title || "Untitled",
    body,
    tags,
    createdAt,
    updatedAt
  };
}

function coerceNotesArray(maybeArray) {
  if (!Array.isArray(maybeArray)) return null;

  const repaired = [];
  const seen = new Set();

  for (const item of maybeArray) {
    const n = coerceNote(item, { allowGenerateId: true });
    if (!n) continue;

    // De-dupe by id: keep most recently updated entry.
    if (seen.has(n.id)) {
      const idx = repaired.findIndex((x) => x.id === n.id);
      if (idx >= 0) {
        const a = repaired[idx];
        const aT = Date.parse(a.updatedAt || "") || 0;
        const bT = Date.parse(n.updatedAt || "") || 0;
        if (bT > aT) repaired[idx] = n;
      }
      continue;
    }

    seen.add(n.id);
    repaired.push(n);
  }

  return repaired;
}

function sortNotesNewestFirst(notes) {
  return [...notes].sort((a, b) => {
    const aT = Date.parse(a.updatedAt || "") || 0;
    const bT = Date.parse(b.updatedAt || "") || 0;
    return bT - aT;
  });
}

/**
 * Lightweight event emitter to broadcast connectivity changes.
 * No external deps; used by Header for status/toasts.
 */
function emitStoreEvent(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // ignore (SSR or older browsers)
  }
}

// PUBLIC_INTERFACE
export function getNotesStore() {
  /**
   * Returns the active notes store implementation.
   * Default is localStorage.
   *
   * If REACT_APP_API_BASE or REACT_APP_BACKEND_URL is set, returns an API adapter
   * that uses standardized responses and gracefully falls back to local adapter
   * without breaking the UI.
   */
  if (hasApiConfigured()) {
    return apiNotesStoreWithFallback();
  }
  return localNotesStore();
}

// PUBLIC_INTERFACE
export function getConfiguredApiBase() {
  /** Returns configured API base URL (empty string if none). */
  return getApiBase();
}

// PUBLIC_INTERFACE
export async function checkApiReachable({ timeoutMs = 1200 } = {}) {
  /**
   * Checks if configured API base appears reachable. Non-throwing.
   * Returns:
   * { reachable: boolean, base: string, error?: string }
   */
  const base = getApiBase().trim();
  if (!base) return { reachable: false, base: "" };

  const normalizedBase = base.replace(/\/+$/, "");
  const url = `${normalizedBase}/notes`;

  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    // We consider *any* response as reachability (including 401/403/404/500),
    // because the server is alive and the app can attempt API mode. Data parsing
    // and contract validation are handled elsewhere.
    return { reachable: true, base: normalizedBase };
  } catch (e) {
    return { reachable: false, base: normalizedBase, error: e?.message || "Network error" };
  } finally {
    window.clearTimeout(t);
  }
}

/**
 * Local adapter
 */
function readLocalRaw() {
  return safeJsonParse(localStorage.getItem(LS_KEY), null);
}

function writeLocalValidated(notes) {
  // notes are assumed already coerced; still ensure array shape before writing
  const list = Array.isArray(notes) ? notes : [];
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

/**
 * Read local and validate/repair. If corruption is found, it is repaired and persisted.
 */
function readLocalValidated() {
  const existing = readLocalRaw();

  const coerced = coerceNotesArray(existing);
  if (coerced && coerced.length >= 0) {
    // If we had any corruption/drops, normalize by writing back.
    // We conservatively write back anytime parsed array exists but differs in validity
    // (we can't cheaply diff, so we write back if existing is array).
    writeLocalValidated(coerced);
    return coerced;
  }

  // Not an array or unreadable => reseed.
  const seeded = seedNotes().map((n) => coerceNote(n)).filter(Boolean);
  writeLocalValidated(seeded);
  return seeded;
}

function localNotesStore() {
  return {
    kind: "local",

    async list() {
      const notes = readLocalValidated();
      return sortNotesNewestFirst(notes);
    },

    async get(id) {
      const notes = readLocalValidated();
      const note = notes.find((n) => n.id === id) || null;
      return note ? coerceNote(note, { allowGenerateId: false }) : null;
    },

    async upsert(note) {
      // Validate/repair on write
      const cleanIncoming = coerceNote(
        { ...note, id: note?.id || makeId(), updatedAt: note?.updatedAt || nowIso() },
        { allowGenerateId: true }
      );
      if (!cleanIncoming) {
        throw new Error("Invalid note: cannot save.");
      }

      const notes = readLocalValidated();

      const now = nowIso();
      const existsIdx = notes.findIndex((n) => n.id === cleanIncoming.id);

      if (existsIdx >= 0) {
        notes[existsIdx] = {
          ...notes[existsIdx],
          ...cleanIncoming,
          updatedAt: toIsoOrNull(cleanIncoming.updatedAt) || now
        };
      } else {
        notes.push({
          ...cleanIncoming,
          createdAt: toIsoOrNull(cleanIncoming.createdAt) || now,
          updatedAt: toIsoOrNull(cleanIncoming.updatedAt) || now
        });
      }

      writeLocalValidated(notes);
      return cleanIncoming.id;
    },

    async remove(id) {
      const notes = readLocalValidated().filter((n) => n.id !== id);
      writeLocalValidated(notes);
      return true;
    }
  };
}

/**
 * API adapter contract:
 * All methods return { ok, data?, error?, usedFallback?: boolean }
 * - ok=true => data is present (list/get may return null data for missing)
 * - ok=false => error has { code, message, status? }
 */
function normalizeApiError(err) {
  const message = err?.message || "API request failed";
  const status = err?.status;
  const code =
    err?.name === "AbortError"
      ? "TIMEOUT"
      : status === 401 || status === 403
        ? "UNAUTHORIZED"
        : status === 404
          ? "NOT_FOUND"
          : "API_ERROR";

  return { code, message, status };
}

async function apiRequest(path, options = {}, { timeoutMs = 3500 } = {}) {
  const base = getApiBase().replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal,
      ...options
    });

    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");

    if (!res.ok) {
      const text = isJson ? JSON.stringify(await res.json().catch(() => ({}))) : await res.text().catch(() => "");
      const err = new Error(`API error ${res.status}: ${text || res.statusText}`);
      err.status = res.status;
      throw err;
    }

    // Allow empty responses
    if (isJson) return await res.json();
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

function wrapAdapterForUI({ kind, adapter, fallbackAdapter }) {
  // This wrapper preserves the old UI contract (list/get/upsert/remove),
  // while internally standardizing responses & mapping errors.
  return {
    kind,

    async list() {
      const r = await adapter.list();
      if (r.ok) return sortNotesNewestFirst(r.data || []);
      // fallback should already have happened inside adapter; if not, ensure safe output
      return sortNotesNewestFirst((await fallbackAdapter.list()) || []);
    },

    async get(id) {
      const r = await adapter.get(id);
      if (r.ok) return r.data || null;
      return (await fallbackAdapter.get(id)) || null;
    },

    async upsert(note) {
      const r = await adapter.upsert(note);
      if (r.ok) return r.data?.id || note?.id || null;
      // last resort local write
      return fallbackAdapter.upsert(note);
    },

    async remove(id) {
      const r = await adapter.remove(id);
      if (r.ok) return true;
      return fallbackAdapter.remove(id);
    }
  };
}

function apiNotesStoreWithFallback() {
  const local = localNotesStore();

  const adapter = {
    async list() {
      try {
        // Expected: GET /notes -> array
        const data = await apiRequest("/notes", { method: "GET" });
        const coerced = coerceNotesArray(data);
        if (!coerced) {
          // Contract mismatch; fallback
          const fb = await local.list();
          emitStoreEvent("noteease:connectivity", {
            mode: "local",
            state: "error",
            message: "API response format mismatch. Falling back to Local."
          });
          return { ok: true, data: fb, usedFallback: true };
        }
        emitStoreEvent("noteease:connectivity", { mode: "api", state: "ok" });
        return { ok: true, data: coerced };
      } catch (e) {
        const fb = await local.list();
        emitStoreEvent("noteease:connectivity", {
          mode: "local",
          state: "error",
          message: "API unreachable. Using Local notes."
        });
        return { ok: true, data: fb, usedFallback: true, error: normalizeApiError(e) };
      }
    },

    async get(id) {
      try {
        const data = await apiRequest(`/notes/${encodeURIComponent(id)}`, { method: "GET" });
        const coerced = data ? coerceNote(data, { allowGenerateId: false }) : null;
        if (data && !coerced) {
          // corrupt note from API -> fallback to local (do not crash UI)
          const fb = await local.get(id);
          emitStoreEvent("noteease:connectivity", {
            mode: "local",
            state: "error",
            message: "API note data invalid. Falling back to Local."
          });
          return { ok: true, data: fb, usedFallback: true };
        }
        emitStoreEvent("noteease:connectivity", { mode: "api", state: "ok" });
        return { ok: true, data: coerced };
      } catch (e) {
        const fb = await local.get(id);
        emitStoreEvent("noteease:connectivity", {
          mode: "local",
          state: "error",
          message: "API unreachable. Using Local note."
        });
        return { ok: true, data: fb, usedFallback: true, error: normalizeApiError(e) };
      }
    },

    async upsert(note) {
      // Validate/repair on write (before sending to API or saving locally)
      const clean = coerceNote(
        { ...note, id: note?.id || makeId(), updatedAt: note?.updatedAt || nowIso() },
        { allowGenerateId: true }
      );
      if (!clean) return { ok: false, error: { code: "INVALID_NOTE", message: "Invalid note: cannot save." } };

      try {
        // Expected: PUT /notes/:id or POST /notes
        if (clean.id) {
          await apiRequest(`/notes/${encodeURIComponent(clean.id)}`, {
            method: "PUT",
            body: JSON.stringify(clean)
          });
          emitStoreEvent("noteease:connectivity", { mode: "api", state: "ok" });
          return { ok: true, data: { id: clean.id } };
        }

        const created = await apiRequest("/notes", { method: "POST", body: JSON.stringify(clean) });
        const createdId = typeof created?.id === "string" ? created.id : clean.id;
        emitStoreEvent("noteease:connectivity", { mode: "api", state: "ok" });
        return { ok: true, data: { id: createdId } };
      } catch (e) {
        // Fallback to local; never break UI save path
        const id = await local.upsert(clean);
        emitStoreEvent("noteease:connectivity", {
          mode: "local",
          state: "error",
          message: "Could not sync to API. Saved locally."
        });
        return { ok: true, data: { id }, usedFallback: true, error: normalizeApiError(e) };
      }
    },

    async remove(id) {
      try {
        await apiRequest(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
        emitStoreEvent("noteease:connectivity", { mode: "api", state: "ok" });
        return { ok: true, data: true };
      } catch (e) {
        await local.remove(id);
        emitStoreEvent("noteease:connectivity", {
          mode: "local",
          state: "error",
          message: "Could not delete via API. Deleted locally."
        });
        return { ok: true, data: true, usedFallback: true, error: normalizeApiError(e) };
      }
    }
  };

  return wrapAdapterForUI({ kind: "api", adapter, fallbackAdapter: local });
}
