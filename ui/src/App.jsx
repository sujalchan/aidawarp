import { useState } from "react";

const STORAGE_KEY = "aidawarp.recent-projects";

const glyphs = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
};

function readRecentProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored)
      ? stored.filter((path) => typeof path === "string")
      : [];
  } catch {
    return [];
  }
}

function projectName(path) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}

function Wordmark() {
  return (
    <svg
      className="brand-wordmark"
      viewBox="0 0 376 56"
      role="img"
      aria-label="AidaWarp"
    >
      <g className="wordmark-dots" aria-hidden="true">
        {[..."AIDAWARP"].flatMap((letter, letterIndex) =>
          glyphs[letter].flatMap((row, y) =>
            [...row].flatMap((pixel, x) =>
              pixel === "1"
                ? [
                    <circle
                      key={`${letterIndex}-${x}-${y}`}
                      cx={4 + letterIndex * 48 + x * 8}
                      cy={4 + y * 8}
                      r="2.15"
                    />,
                  ]
                : [],
            ),
          ),
        )}
      </g>
    </svg>
  );
}

function RecentProject({ path, onOpen }) {
  return (
    <button
      className="recent-project-button"
      type="button"
      title={`Open ${path}`}
      onClick={() => onOpen(path)}
    >
      <span className="project-folder-label" aria-hidden="true">
        [DIR]
      </span>
      <span className="recent-project-details">
        <span className="recent-project-name">{projectName(path)}</span>
        <span className="recent-project-path">{path}</span>
      </span>
      <span className="recent-project-action" aria-hidden="true">
        OPEN &gt;
      </span>
    </button>
  );
}

export default function App() {
  const [recentProjects, setRecentProjects] = useState(readRecentProjects);
  const [statusMessage, setStatusMessage] = useState("");
  const [isChoosingDirectory, setIsChoosingDirectory] = useState(false);

  function openProject(path) {
    const updatedProjects = [
      path,
      ...recentProjects.filter((projectPath) => projectPath !== path),
    ].slice(0, 8);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
    } catch {
      // Keep the launcher usable when persistent storage is unavailable.
    }

    setRecentProjects(updatedProjects);
    setStatusMessage(`PROJECT SELECTED: ${path}`);
  }

  async function chooseDirectory() {
    setIsChoosingDirectory(true);
    setStatusMessage("SELECT A PROJECT DIRECTORY…");

    try {
      const directory = await window.__TAURI__.dialog.open({
        directory: true,
        multiple: false,
        title: "Open Scratch Project Directory",
      });

      if (typeof directory === "string") {
        openProject(directory);
      } else {
        setStatusMessage("SELECTION CANCELLED");
      }
    } catch (error) {
      setStatusMessage(`COULD NOT OPEN DIRECTORY: ${String(error)}`);
    } finally {
      setIsChoosingDirectory(false);
    }
  }

  return (
    <main className="launcher-frame">
      <header className="launcher-header">
        <Wordmark />
        <div className="launcher-subtitle">SCRATCH TO RUST CONVERTER</div>
      </header>

      <section className="project-picker" aria-labelledby="open-title">
        <h1 id="open-title">OPEN A PROJECT</h1>
        <p className="directory-instruction">
          SELECT A DIRECTORY TO CONTINUE{" "}
          <i className="prompt-cursor" aria-hidden="true" />
        </p>
        <button
          className="choose-project-button"
          type="button"
          onClick={chooseDirectory}
          disabled={isChoosingDirectory}
        >
          <span className="button-symbol" aria-hidden="true">
            [ + ]
          </span>
          CHOOSE PROJECT DIRECTORY
        </button>
        <p className="project-selection-status" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </section>

      <section className="recent-projects" aria-labelledby="recent-title">
        <div className="recent-projects-heading">
          <h2 id="recent-title">RECENT PROJECTS</h2>
          <span className="recent-project-count">
            {String(recentProjects.length).padStart(2, "0")}
          </span>
        </div>
        <div className="recent-project-list">
          {recentProjects.map((path) => (
            <RecentProject key={path} path={path} onOpen={openProject} />
          ))}
        </div>
        {recentProjects.length === 0 && (
          <p className="recent-projects-empty">NO PROJECTS IN MEMORY</p>
        )}
      </section>

      <footer>
        <span>STATIC TALENT GROUP</span>
      </footer>
    </main>
  );
}
