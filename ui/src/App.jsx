import { useState } from "react";
import AmbientCode from "./components/AmbientCode.jsx";
import ProjectPicker from "./components/ProjectPicker.jsx";
import RecentProjects from "./components/RecentProjects.jsx";
import Wordmark from "./components/Wordmark.jsx";
import WindowControls from "./components/WindowControls.jsx";
import {
  readRecentProjectNames,
  readRecentProjects,
  saveRecentProjectNames,
  saveRecentProjects,
} from "./utils/projectStorage.js";
import { getProjectIdFromLink } from "./utils/scratchProjectId.js";

export default function App() {
  const [recentProjects, setRecentProjects] = useState(readRecentProjects);
  const [recentProjectNames, setRecentProjectNames] = useState(readRecentProjectNames);
  const [statusMessage, setStatusMessage] = useState("");
  const [isChoosingProject, setIsChoosingProject] = useState(false);
  const [scratchLink, setScratchLink] = useState("");
  const [backgroundEffectsEnabled, setBackgroundEffectsEnabled] = useState(true);

  function openProject(path, projectTitle = recentProjectNames[path]) {
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
    const scratchProjectId = getProjectIdFromLink(path);
    const projectLabel = projectTitle
      ? projectTitle + (scratchProjectId ? " (" + scratchProjectId + ")" : "")
      : scratchProjectId ?? path;
    setStatusMessage("PROJECT SELECTED: " + projectLabel);
  }

  function removeRecentProject(path) {
    const updatedProjects = recentProjects.filter((projectPath) => projectPath !== path);
    saveRecentProjects(updatedProjects);
    setRecentProjects(updatedProjects);
    const updatedNames = { ...recentProjectNames };
    delete updatedNames[path];
    saveRecentProjectNames(updatedNames);
    setRecentProjectNames(updatedNames);
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
        openProject(project);
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
    setStatusMessage("LOADING PROJECT NAME…");
    try {
      const project = await window.__TAURI__.core.invoke("fetch_scratch_project", {
        projectId,
      });
      if (String(project.id) !== projectId || !project.title) {
        throw new Error("Scratch returned different project metadata");
      }
      openProject("https://scratch.mit.edu/projects/" + projectId + "/", project.title);
    } catch {
      setStatusMessage("COULD NOT LOAD PROJECT");
    } finally {
      setIsChoosingProject(false);
    }
  }

  return (
    <>
      {backgroundEffectsEnabled && <AmbientCode />}
      <main className="launcher-frame">
        <div className="window-titlebar" data-tauri-drag-region>
          <WindowControls />
        </div>
        <header className="launcher-header">
          <div className="brand-lockup">
            <Wordmark />
            <div className="launcher-subtitle">SCRATCH TO RUST CONVERTER</div>
          </div>
        </header>

        <ProjectPicker
          chooseProject={chooseProject}
          isChoosingProject={isChoosingProject}
          scratchLink={scratchLink}
          onScratchLinkChange={setScratchLink}
          onLoadScratchLink={loadScratchLink}
          statusMessage={statusMessage}
        />
        <RecentProjects
          projects={recentProjects}
          projectNames={recentProjectNames}
          onOpen={openProject}
          onRemove={removeRecentProject}
        />

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
