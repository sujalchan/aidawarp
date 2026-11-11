import { useCallback, useEffect, useRef, useState } from "react";
import AmbientCode from "./components/AmbientCode.jsx";
import ProjectPicker from "./components/ProjectPicker.jsx";
import RecentProjects from "./components/RecentProjects.jsx";
import Wordmark from "./components/Wordmark.jsx";
import WindowControls from "./components/WindowControls.jsx";
import {
  readRecentProjectNames,
  readRecentProjectCreators,
  readRecentProjects,
  saveRecentProjectCreators,
  saveRecentProjectNames,
  saveRecentProjects,
} from "./utils/projectStorage.js";
import {
  getCachedScratchProjectId,
  getProjectIdFromLink,
} from "./utils/scratchProjectId.js";

export default function App() {
  const [recentProjects, setRecentProjects] = useState(readRecentProjects);
  const [recentProjectNames, setRecentProjectNames] = useState(readRecentProjectNames);
  const [recentProjectCreators, setRecentProjectCreators] = useState(readRecentProjectCreators);
  const [statusMessage, setStatusMessage] = useState("");
  const [isChoosingProject, setIsChoosingProject] = useState(false);
  const [isDownloadingProject, setIsDownloadingProject] = useState(false);
  const [isReloadingProject, setIsReloadingProject] = useState(false);
  const [isFinishingDownload, setIsFinishingDownload] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const downloadBarTimer = useRef(null);
  const [scratchLink, setScratchLink] = useState("");
  const [backgroundEffectsEnabled, setBackgroundEffectsEnabled] = useState(true);

  // Persist creator names separately so Scratch API data does not affect project titles.
  useEffect(() => {
    saveRecentProjectCreators(recentProjectCreators);
  }, [recentProjectCreators]);

  const rememberProjectCreator = useCallback((path, creator) => {
    if (typeof creator !== "string" || !creator.trim()) return;
    const normalizedCreator = creator.trim();
    setRecentProjectCreators((currentCreators) =>
      currentCreators[path] === normalizedCreator
        ? currentCreators
        : { ...currentCreators, [path]: normalizedCreator },
    );
  }, []);

  function openProject(
    path,
    projectTitle = recentProjectNames[path],
    projectCreator = recentProjectCreators[path],
  ) {
    const updatedProjects = [
      path,
      ...recentProjects.filter((projectPath) => projectPath !== path),
    ].slice(0, 8);

    saveRecentProjects(updatedProjects);
    setRecentProjects(updatedProjects);
    if (projectTitle) {
      const updatedNames = { ...recentProjectNames, [path]: projectTitle };
      saveRecentProjectNames(updatedNames);
      setRecentProjectNames(updatedNames);
    }
    rememberProjectCreator(path, projectCreator);
    setStatusMessage("");
  }

  async function removeRecentProject(path) {
    setIsChoosingProject(true);
    try {
      // The Rust command deletes only paths inside the app-data project cache.
      await window.__TAURI__.core.invoke("delete_cached_scratch_project", { path });

      const updatedProjects = recentProjects.filter((projectPath) => projectPath !== path);
      saveRecentProjects(updatedProjects);
      setRecentProjects(updatedProjects);
      const updatedNames = { ...recentProjectNames };
      delete updatedNames[path];
      saveRecentProjectNames(updatedNames);
      setRecentProjectNames(updatedNames);
      setRecentProjectCreators((currentCreators) => {
        if (!(path in currentCreators)) return currentCreators;
        const updatedCreators = { ...currentCreators };
        delete updatedCreators[path];
        return updatedCreators;
      });
    } catch (error) {
      setStatusMessage(`COULD NOT REMOVE PROJECT: ${String(error)}`);
    } finally {
      setIsChoosingProject(false);
    }
  }

  async function reloadRecentProject(path) {
    const projectId = getCachedScratchProjectId(path);
    if (!projectId) return;

    setIsChoosingProject(true);
    setIsReloadingProject(true);
    setIsFinishingDownload(false);
    window.clearTimeout(downloadBarTimer.current);
    downloadBarTimer.current = null;
    setDownloadProgress(0);
    setStatusMessage("RELOADING SCRATCH PROJECT…");
    let unlistenProgress;
    try {
      unlistenProgress = await window.__TAURI__.event.listen(
        "scratch-download-progress",
        ({ payload }) => {
          if (Number.isInteger(payload)) {
            setDownloadProgress(Math.max(0, Math.min(100, payload)));
          }
        },
      );
      // Refresh the archive in place, then update its stored display title.
      const project = await window.__TAURI__.core.invoke("reload_cached_scratch_project", {
        path,
      });
      if (String(project.id) !== projectId || !project.title || !project.path) {
        throw new Error("Scratch project reload returned incomplete data");
      }
      setDownloadProgress(100);
      const acceptedPath = await window.__TAURI__.core.invoke("accept_project_file", {
        path: project.path,
      });
      openProject(acceptedPath, project.title, project.creator);
      setStatusMessage("PROJECT RELOADED: " + project.title);
      setIsFinishingDownload(true);
      downloadBarTimer.current = window.setTimeout(() => {
        setIsFinishingDownload(false);
        downloadBarTimer.current = null;
      }, 600);
    } catch (error) {
      setStatusMessage(`COULD NOT RELOAD PROJECT: ${String(error)}`);
    } finally {
      unlistenProgress?.();
      setIsReloadingProject(false);
      setIsChoosingProject(false);
    }
  }

  async function chooseProject() {
    setIsChoosingProject(true);
    setStatusMessage("SELECT A PROJECT…");

    try {
      const project = await window.__TAURI__.dialog.open({
        directory: false,
        multiple: false,
        filters: [{ name: "Scratch Project", extensions: ["sb3"] }],
        title: "Open Scratch Project",
      });

      if (typeof project === "string") {
        // Validate and normalize the native file-dialog path in Rust before storing it.
        const acceptedPath = await window.__TAURI__.core.invoke("accept_project_file", {
          path: project,
        });
        openProject(acceptedPath);
      } else {
        setStatusMessage("SELECTION CANCELLED");
      }
    } catch (error) {
      setStatusMessage(`COULD NOT OPEN PROJECT: ${String(error)}`);
    } finally {
      setIsChoosingProject(false);
    }
  }

  async function loadScratchLink(event) {
    event.preventDefault();
    const projectId = getProjectIdFromLink(scratchLink);
    if (!projectId) {
      setStatusMessage("INVALID PROJECT LINK");
      return;
    }

    setIsChoosingProject(true);
    setIsDownloadingProject(true);
    setIsFinishingDownload(false);
    window.clearTimeout(downloadBarTimer.current);
    downloadBarTimer.current = null;
    setDownloadProgress(0);
    setStatusMessage("DOWNLOADING SCRATCH PROJECT…");
    let unlistenProgress;
    try {
      unlistenProgress = await window.__TAURI__.event.listen(
        "scratch-download-progress",
        ({ payload }) => {
          if (Number.isInteger(payload)) {
            setDownloadProgress(Math.max(0, Math.min(100, payload)));
          }
        },
      );
      // Rust downloads the archive into app data and returns its local path.
      const project = await window.__TAURI__.core.invoke("download_scratch_project", {
        projectId,
      });
      if (String(project.id) !== projectId || !project.title || !project.path) {
        throw new Error("Scratch project download returned incomplete data");
      }
      setDownloadProgress(100);
      const acceptedPath = await window.__TAURI__.core.invoke("accept_project_file", {
        path: project.path,
      });
      openProject(acceptedPath, project.title, project.creator);
      setIsFinishingDownload(true);
      downloadBarTimer.current = window.setTimeout(() => {
        setIsFinishingDownload(false);
        downloadBarTimer.current = null;
      }, 600);
    } catch (error) {
      setStatusMessage("COULD NOT DOWNLOAD PROJECT: " + String(error));
    } finally {
      unlistenProgress?.();
      setIsDownloadingProject(false);
      setIsChoosingProject(false);
    }
  }

  return (
    <>
      <AmbientCode enabled={backgroundEffectsEnabled} />
      <main className="launcher-frame">
        <div className="window-titlebar" data-tauri-drag-region>
          <WindowControls />
        </div>
        <div className="launcher-layout">
          <div className="launcher-primary">
            <header className="launcher-header">
              <div className="brand-lockup">
                <Wordmark />
                <div className="launcher-subtitle">SCRATCH TO RUST CONVERTER</div>
              </div>
            </header>

            <ProjectPicker
              chooseProject={chooseProject}
              isChoosingProject={isChoosingProject}
              isDownloadingProject={isDownloadingProject}
              isReloadingProject={isReloadingProject}
              isFinishingDownload={isFinishingDownload}
              downloadProgress={downloadProgress}
              scratchLink={scratchLink}
              onScratchLinkChange={setScratchLink}
              onLoadScratchLink={loadScratchLink}
              statusMessage={statusMessage}
            />
          </div>

          <RecentProjects
            projects={recentProjects}
            projectNames={recentProjectNames}
            projectCreators={recentProjectCreators}
            onOpen={openProject}
            onReload={reloadRecentProject}
            onRemove={removeRecentProject}
            onCreatorResolved={rememberProjectCreator}
            isBusy={isChoosingProject}
          />
        </div>

        <footer className="launcher-footer">
          <span>STATIC TALENT GROUP</span>
          <div className="background-effects-control">
            <span>BACKGROUND EFFECTS</span>
            <button
              className="background-effects-toggle"
              type="button"
              role="switch"
              aria-label="Background effects"
              aria-checked={backgroundEffectsEnabled}
              onClick={() => setBackgroundEffectsEnabled((enabled) => !enabled)}
            >
              <span className="background-effects-toggle-thumb" />
            </button>
          </div>
        </footer>
      </main>
    </>
  );
}
