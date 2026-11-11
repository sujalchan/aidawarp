const STORAGE_KEY = "aidawarp.recent-projects";
const PROJECT_NAMES_KEY = "aidawarp.recent-project-names";
const PROJECT_CREATORS_KEY = "aidawarp.recent-project-creators";

export function readRecentProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored)
      ? stored.filter((path) => typeof path === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveRecentProjects(projects) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Keep the launcher usable when persistent storage is unavailable.
  }
}

export function readRecentProjectNames() {
  try {
    const stored = JSON.parse(localStorage.getItem(PROJECT_NAMES_KEY) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored)
        .filter(([, name]) => typeof name === "string")
        // Older versions appended Scratch IDs to names; keep those out of the UI.
        .map(([path, name]) => [path, name.replace(/\s+\(\d+\)$/, "")]),
    );
  } catch {
    return {};
  }
}

export function saveRecentProjectNames(names) {
  try {
    localStorage.setItem(PROJECT_NAMES_KEY, JSON.stringify(names));
  } catch {
    // Keep the launcher usable when persistent storage is unavailable.
  }
}

export function readRecentProjectCreators() {
  try {
    const stored = JSON.parse(localStorage.getItem(PROJECT_CREATORS_KEY) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter(([, creator]) => typeof creator === "string"),
    );
  } catch {
    return {};
  }
}

export function saveRecentProjectCreators(creators) {
  try {
    localStorage.setItem(PROJECT_CREATORS_KEY, JSON.stringify(creators));
  } catch {
    // Keep the launcher usable when persistent storage is unavailable.
  }
}

export function projectName(path) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}
