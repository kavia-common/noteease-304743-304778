import { makeId, nowIso } from "../utils";

const LS_KEY = "noteease.notes.v1";

function getApiBase() {
  return process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "";
}

function hasApi() {
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

/**
 * Local adapter
 */
function readLocal() {
  const existing = safeJsonParse(localStorage.getItem(LS_KEY), null);
  if (existing && Array.isArray(existing)) return existing;
  const seeded = seedNotes();
  localStorage.setItem(LS_KEY, JSON.stringify(seeded));
  return seeded;
}

function writeLocal(notes) {
  localStorage.setItem(LS_KEY, JSON.stringify(notes));
}

/**
 * API adapter (placeholder: implements interface, but expects a compatible backend).
 * We keep it simple and fail gracefully to local when API errors occur.
 */
async function apiRequest(path, options = {}) {
  const base = getApiBase().replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`API error ${res.status}: ${text || res.statusText}`);
    err.status = res.status;
    throw err;
  }

  // Allow empty responses
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return null;
}

// PUBLIC_INTERFACE
export function getNotesStore() {
  /**
   * Returns the active notes store implementation.
   * Default is localStorage. If REACT_APP_API_BASE or REACT_APP_BACKEND_URL is set,
   * uses API adapter with graceful fallback to local if the API is unreachable.
   */
  if (hasApi()) {
    return apiNotesStoreWithFallback();
  }
  return localNotesStore();
}

function localNotesStore() {
  return {
    kind: "local",
    async list() {
      const notes = readLocal();
      // Sort newest first
      return [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },
    async get(id) {
      const notes = readLocal();
      return notes.find((n) => n.id === id) || null;
    },
    async upsert(note) {
      const notes = readLocal();
      const now = nowIso();
      const existsIdx = notes.findIndex((n) => n.id === note.id);
      if (existsIdx >= 0) {
        notes[existsIdx] = { ...notes[existsIdx], ...note, updatedAt: now };
      } else {
        notes.push({
          id: note.id || makeId(),
          title: note.title || "Untitled",
          body: note.body || "",
          tags: Array.isArray(note.tags) ? note.tags : [],
          createdAt: now,
          updatedAt: now
        });
      }
      writeLocal(notes);
      return note.id;
    },
    async remove(id) {
      const notes = readLocal().filter((n) => n.id !== id);
      writeLocal(notes);
      return true;
    }
  };
}

function apiNotesStoreWithFallback() {
  const local = localNotesStore();

  return {
    kind: "api",
    async list() {
      try {
        // Expected: GET /notes -> array
        const data = await apiRequest("/notes", { method: "GET" });
        if (Array.isArray(data)) return data;
        return local.list();
      } catch {
        return local.list();
      }
    },
    async get(id) {
      try {
        const data = await apiRequest(`/notes/${encodeURIComponent(id)}`, { method: "GET" });
        return data || null;
      } catch {
        return local.get(id);
      }
    },
    async upsert(note) {
      try {
        // Expected: PUT /notes/:id or POST /notes
        if (note.id) {
          await apiRequest(`/notes/${encodeURIComponent(note.id)}`, {
            method: "PUT",
            body: JSON.stringify(note)
          });
          return note.id;
        }
        const created = await apiRequest("/notes", { method: "POST", body: JSON.stringify(note) });
        return created?.id || null;
      } catch {
        return local.upsert(note);
      }
    },
    async remove(id) {
      try {
        await apiRequest(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
        return true;
      } catch {
        return local.remove(id);
      }
    }
  };
}
