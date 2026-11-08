const STORAGE_KEY = "aidawarp.recent-projects";

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

export function projectName(path) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}
