const STORAGE_KEY = "aidawarp.recent-projects";
const chooseButton = document.querySelector("#choose-directory");
const recentList = document.querySelector("#recent-list");
const emptyState = document.querySelector("#empty-state");
const recentCount = document.querySelector("#recent-count");
const message = document.querySelector("#message");
const wordmarkDots = document.querySelector("#wordmark-dots");

const glyphs = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
};

function renderWordmark() {
  const svg = "http://www.w3.org/2000/svg";
  const dots = [];
  [..."AIDAWARP"].forEach((letter, letterIndex) => {
    glyphs[letter].forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel === "1") {
          const dot = document.createElementNS(svg, "circle");
          dot.setAttribute("cx", String(4 + letterIndex * 48 + x * 8));
          dot.setAttribute("cy", String(4 + y * 8));
          dot.setAttribute("r", "2.15");
          dots.push(dot);
        }
      });
    });
  });
  wordmarkDots.replaceChildren(...dots);
}

function loadProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((path) => typeof path === "string") : [];
  } catch {
    return [];
  }
}

function projectName(path) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}

function renderProjects() {
  const projects = loadProjects();
  recentList.replaceChildren();
  emptyState.hidden = projects.length > 0;
  recentCount.textContent = String(projects.length).padStart(2, "0");

  for (const path of projects) {
    const button = document.createElement("button");
    button.className = "recent-project-button";
    button.type = "button";
    button.title = `Open ${path}`;

    const folder = document.createElement("span");
    folder.className = "project-folder-label";
    folder.textContent = "[DIR]";
    folder.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "recent-project-details";
    const name = document.createElement("span");
    name.className = "recent-project-name";
    name.textContent = projectName(path);
    const location = document.createElement("span");
    location.className = "recent-project-path";
    location.textContent = path;
    copy.append(name, location);

    const arrow = document.createElement("span");
    arrow.className = "recent-project-action";
    arrow.textContent = "OPEN >";
    arrow.setAttribute("aria-hidden", "true");
    button.append(folder, copy, arrow);
    button.addEventListener("click", () => openProject(path));
    recentList.append(button);
  }
}

function openProject(path) {
  const projects = loadProjects().filter((item) => item !== path);
  projects.unshift(path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.slice(0, 8)));
  renderProjects();
  message.textContent = `PROJECT SELECTED: ${path}`;
}

chooseButton.addEventListener("click", async () => {
  chooseButton.disabled = true;
  message.textContent = "SELECT A PROJECT DIRECTORY…";
  try {
    const directory = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: "Open Scratch Project Directory" });
    if (typeof directory === "string") openProject(directory);
    else message.textContent = "SELECTION CANCELLED";
  } catch (error) {
    message.textContent = `COULD NOT OPEN DIRECTORY: ${String(error)}`;
  } finally {
    chooseButton.disabled = false;
  }
});

renderWordmark();
renderProjects();
