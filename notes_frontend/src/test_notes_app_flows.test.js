import React from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

/**
 * A tiny localStorage mock that behaves like the real API (string values only),
 * and is easily reset per-test to keep tests deterministic.
 */
function createLocalStorageMock() {
  let store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => {
      store = new Map();
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    }
  };
}

const LS_NOTES_KEY = "noteease.notes.v1";
const LS_THEME_KEY = "noteease.theme";

function makeSeedNotes() {
  const createdAt = new Date("2024-01-01T00:00:00.000Z").toISOString();
  return [
    {
      id: "note_a",
      title: "Alpha",
      body: "Alpha body",
      tags: ["work"],
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "note_b",
      title: "Beta",
      body: "Beta body with tag: personal",
      tags: ["personal"],
      createdAt,
      updatedAt: createdAt
    }
  ];
}

function setLocalNotes(notes) {
  window.localStorage.setItem(LS_NOTES_KEY, JSON.stringify(notes));
}

function getLocalNotesRaw() {
  return window.localStorage.getItem(LS_NOTES_KEY);
}

function getLocalNotesParsed() {
  const raw = getLocalNotesRaw();
  return raw ? JSON.parse(raw) : null;
}

/**
 * App uses <BrowserRouter>, so to test /notes/:id routes we set window.history before render.
 */
async function renderAtRoute(pathname) {
  window.history.pushState({}, "Test", pathname);
  const utils = render(<App />);
  await waitForAppToSettle();
  return utils;
}

async function waitForAppToSettle() {
  // Always wait for the stable "shell" element that exists in all states.
  // This ensures initial effects (refresh, route selection, etc.) have had a chance to run.
  await screen.findByLabelText(/notes sidebar/i);
}

async function waitForLoadingToFinish() {
  // Kept for semantic clarity in tests; but internally relies on the same settle helper.
  await waitForAppToSettle();
}

beforeEach(() => {
  // Ensure environment chooses local store (no API configured).
  process.env.REACT_APP_API_BASE = "";
  process.env.REACT_APP_BACKEND_URL = "";

  // Fresh localStorage per test.
  Object.defineProperty(window, "localStorage", {
    value: createLocalStorageMock(),
    configurable: true
  });

  // Default matchMedia: not small screen unless overridden.
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false
  });

});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe("NoteEase core flows (localStorage-backed)", () => {
  test("Create note flow: create draft -> edit -> save -> appears in list and persists to localStorage", async () => {
    // Start with empty notes to cover the (a) no notes at all empty state.
    setLocalNotes([]);

    const user = userEvent.setup();
    await renderAtRoute("/notes");

    // Empty state when no notes exist.
    expect(await screen.findByRole("heading", { name: /your notes, organized/i })).toBeInTheDocument();

    // Create first draft via empty state CTA.
    await user.click(screen.getByRole("button", { name: /create your first note/i }));

    // Draft editor shows.
    expect(await screen.findByRole("heading", { name: /draft note/i })).toBeInTheDocument();
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
    // Draft should NOT be persisted until save.
    expect(getLocalNotesParsed()).toEqual([]);

    // Fill fields
    await user.type(screen.getByLabelText(/^title$/i), "My first note");
    await user.type(screen.getByLabelText(/body \(markdown\)/i), "Hello world");
    await user.type(screen.getByLabelText(/tags/i), "ideas, personal");

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    // Toast appears
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Your note is up to date.")).toBeInTheDocument();

    // New note is persisted to localStorage
    const stored = getLocalNotesParsed();
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("My first note");
    expect(stored[0].body).toBe("Hello world");
    expect(stored[0].tags).toEqual(["ideas", "personal"]);

    // Note appears in list (title visible as a list item button)
    const sidebar = screen.getByLabelText(/notes sidebar/i);
    const list = within(sidebar).getByRole("list", { name: /notes list/i });
    expect(within(list).getByText("My first note")).toBeInTheDocument();

    // Smoke-check toast auto-dismiss uses timers; but ensure it doesn't block interactions
    // (Dismiss manually to avoid time flakiness.)
    await user.click(screen.getByRole("button", { name: /dismiss notification/i }));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  test("Save existing note updates persist and show success toast", async () => {
    setLocalNotes(makeSeedNotes());

    const user = userEvent.setup();
    await renderAtRoute("/notes/note_a");

    // Ensure editor loaded for correct note
    expect(await screen.findByDisplayValue("Alpha")).toBeInTheDocument();

    // Modify body and save
    const body = screen.getByLabelText(/body \(markdown\)/i);
    await user.clear(body);
    await user.type(body, "Updated Alpha body");

    // Unsaved chip visible, Save enabled
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    // Toast success
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    // Persisted content
    const stored = getLocalNotesParsed();
    const updated = stored.find((n) => n.id === "note_a");
    expect(updated.body).toBe("Updated Alpha body");
  });

  test("Delete note flow with confirmation: removes from list and navigates to /notes (no selection)", async () => {
    setLocalNotes(makeSeedNotes());

    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

    await renderAtRoute("/notes/note_a");
    expect(await screen.findByDisplayValue("Alpha")).toBeInTheDocument();

    // Delete
    await user.click(screen.getByRole("button", { name: /delete note/i }));
    expect(confirmSpy).toHaveBeenCalledWith("Delete this note? This cannot be undone.");

    // Success toast
    expect(await screen.findByText("Deleted")).toBeInTheDocument();

    // Removed from localStorage
    const stored = getLocalNotesParsed();
    expect(stored.map((n) => n.id)).toEqual(["note_b"]);

    // Sidebar no longer shows "Alpha"
    const sidebar = screen.getByLabelText(/notes sidebar/i);
    const list = within(sidebar).getByRole("list", { name: /notes list/i });
    expect(within(list).queryByText("Alpha")).not.toBeInTheDocument();

    // Selection behavior: at /notes, should show empty state "Select a note..." because there is still at least 1 note
    expect(await screen.findByRole("heading", { name: /select a note to get started/i })).toBeInTheDocument();
  });

  test("Search filtering: filters list, shows 'No results' empty state, and Clear search resets results", async () => {
    setLocalNotes(makeSeedNotes());

    const user = userEvent.setup();
    await renderAtRoute("/notes");

    await waitForLoadingToFinish();

    const searchInput = screen.getByRole("textbox", { name: /search notes/i });

    // Search for something that matches nothing
    await user.type(searchInput, "zzz-nope");

    const sidebar = screen.getByLabelText(/notes sidebar/i);
    expect(within(sidebar).getByLabelText(/no search results empty state/i)).toBeInTheDocument();
    expect(within(sidebar).getByRole("heading", { name: /no results/i })).toBeInTheDocument();

    // Clear search CTA
    await user.click(within(sidebar).getByRole("button", { name: /clear search/i }));
    expect(searchInput).toHaveValue("");

    // Notes list should show at least one known title again.
    const list = within(sidebar).getByRole("list", { name: /notes list/i });
    expect(within(list).getByText("Alpha")).toBeInTheDocument();
    expect(within(list).getByText("Beta")).toBeInTheDocument();
  });

  test("Routing: /notes selects first note by default; /notes/:noteId loads correct note", async () => {
    setLocalNotes(makeSeedNotes());

    // /notes should auto-select first (newest) note; seed updatedAt equal -> order stable enough for this test
    await renderAtRoute("/notes");

    // Editor should load something, not empty state.
    expect(await screen.findByLabelText(/note editor/i)).toBeInTheDocument();

    // Do not mount multiple App instances without cleanup.
    cleanup();

    // Now render directly to /notes/note_b
    await renderAtRoute("/notes/note_b");
    expect(await screen.findByDisplayValue("Beta")).toBeInTheDocument();
  });

  test("Dirty-state prompt on route change when unsaved changes exist (cancel keeps same note; accept navigates)", async () => {
    setLocalNotes(makeSeedNotes());

    const user = userEvent.setup();

    // First render on note_a
    await renderAtRoute("/notes/note_a");
    expect(await screen.findByDisplayValue("Alpha")).toBeInTheDocument();

    // Make unsaved change
    const title = screen.getByLabelText(/^title$/i);
    await user.type(title, " changed");
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();

    const confirmSpy = jest.spyOn(window, "confirm");

    // Attempt to navigate to note_b using sidebar list click.
    // First attempt: cancel.
    confirmSpy.mockReturnValueOnce(false);

    const sidebar = screen.getByLabelText(/notes sidebar/i);
    const list = within(sidebar).getByRole("list", { name: /notes list/i });
    await user.click(within(list).getByRole("button", { name: /open note: beta/i }));

    expect(confirmSpy).toHaveBeenCalledWith("You have unsaved changes. Discard them?");
    // Should still be on Alpha note.
    expect(screen.getByDisplayValue(/alpha/i)).toBeInTheDocument();

    // Second attempt: accept.
    confirmSpy.mockReturnValueOnce(true);
    await user.click(within(list).getByRole("button", { name: /open note: beta/i }));

    // Now editor should show Beta.
    expect(await screen.findByDisplayValue("Beta")).toBeInTheDocument();
  });

  test("Theme toggle: toggles light/dark and persists preference", async () => {
    setLocalNotes(makeSeedNotes());

    const user = userEvent.setup();
    await renderAtRoute("/notes");

    await waitForLoadingToFinish();

    // Default theme should be light (data-theme=light).
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(LS_THEME_KEY)).toBe("light");

    await user.click(screen.getByRole("button", { name: /switch to dark mode/i }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(LS_THEME_KEY)).toBe("dark");

    // Toggle back
    await user.click(screen.getByRole("button", { name: /switch to light mode/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(LS_THEME_KEY)).toBe("light");
  });

  test("Sidebar responsive behavior: small screen shows 'Show notes' toggle and it expands/collapses (smoke)", async () => {
    setLocalNotes(makeSeedNotes());

    // Make matchMedia return small screen.
    window.matchMedia = (query) => ({
      matches: query.includes("max-width: 860px"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false
    });

    const user = userEvent.setup();
    await renderAtRoute("/notes");

    await waitForLoadingToFinish();

    // Toggle should be visible on small screens.
    const showHideButton = screen.getByRole("button", { name: /show notes list/i });
    expect(showHideButton).toBeInTheDocument();
    expect(showHideButton).toHaveTextContent(/show notes/i);

    // Expand
    await user.click(showHideButton);
    expect(screen.getByRole("button", { name: /hide notes list/i })).toBeInTheDocument();
  });

  test("Empty states: (b) no note selected but notes exist shows 'Select a note to get started'", async () => {
    setLocalNotes(makeSeedNotes());

    await renderAtRoute("/notes");

    await waitForLoadingToFinish();

    // Create a selection by ensuring editor is present, then delete selection by routing to /notes and confirm
    // This app auto-selects first note, so to reach "no selection", delete the active note then land on /notes.
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    // Delete currently selected note.
    await user.click(await screen.findByRole("button", { name: /delete note/i }));
    expect(confirmSpy).toHaveBeenCalled();

    // With one note remaining, /notes should show empty selection state.
    expect(await screen.findByRole("heading", { name: /select a note to get started/i })).toBeInTheDocument();
  });

  test("Empty states: (c) no search results state is shown when query returns nothing", async () => {
    setLocalNotes(makeSeedNotes());

    const user = userEvent.setup();
    await renderAtRoute("/notes");

    await waitForLoadingToFinish();

    await user.type(screen.getByRole("textbox", { name: /search notes/i }), "nonexistent-query");

    const sidebar = screen.getByLabelText(/notes sidebar/i);
    expect(within(sidebar).getByLabelText(/no search results empty state/i)).toBeInTheDocument();
  });

  test("Unsaved changes prompt also wires browser beforeunload handler when dirty", async () => {
    setLocalNotes(makeSeedNotes());

    const user = userEvent.setup();
    await renderAtRoute("/notes/note_a");
    expect(await screen.findByDisplayValue("Alpha")).toBeInTheDocument();

    // Make dirty
    await user.type(screen.getByLabelText(/^title$/i), " x");

    // Ensure dirty UI state has propagated (this also implies the hook's effect has run at least once).
    await screen.findByText(/unsaved/i);

    // Trigger beforeunload event and ensure returnValue is set.
    const evt = new Event("beforeunload");
    // JSDOM doesn't implement returnValue on Event by default, so define it.
    Object.defineProperty(evt, "returnValue", { writable: true, value: "" });

    act(() => {
      window.dispatchEvent(evt);
    });

    expect(evt.returnValue).toBe("You have unsaved changes. Discard them?");
  });
});
