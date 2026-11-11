export function getProjectIdFromLink(value) {
  const input = value.trim();
  if (!input) return null;

  let url;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : "https://" + input);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (!["http:", "https:"].includes(url.protocol)) return null;

  if (["scratch.mit.edu", "www.scratch.mit.edu"].includes(hostname)) {
    return url.pathname.match(/^\/projects\/(\d+)(?:\/|$)/)?.[1] ?? null;
  }

  if (["turbowarp.org", "www.turbowarp.org"].includes(hostname)) {
    return url.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1] ?? null;
  }

  return null;
}

// Cached Scratch downloads use the app-data path `projects/{id}.sb3`.
export function getCachedScratchProjectId(path) {
  const normalizedPath = path.replace(/\\/g, "/");
  return normalizedPath.match(/(?:^|\/)projects\/(\d+)\.sb3$/i)?.[1] ?? null;
}
