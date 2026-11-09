const STORAGE_KEY = "aidawarp.recent-projects";
const PROJECT_NAMES_KEY = "aidawarp.recent-project-names";

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
      Object.entries(stored).filter(([, name]) => typeof name === "string"),
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

export function projectName(path) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}
