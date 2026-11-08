import { useState } from "react";
import AmbientCode from "./components/AmbientCode.jsx";
import ProjectPicker from "./components/ProjectPicker.jsx";
import RecentProjects from "./components/RecentProjects.jsx";
import Wordmark from "./components/Wordmark.jsx";
import WindowControls from "./components/WindowControls.jsx";
import { readRecentProjects, saveRecentProjects } from "./utils/projectStorage.js";

export default function App() {
  const [recentProjects, setRecentProjects] = useState(readRecentProjects);
  const [statusMessage, setStatusMessage] = useState("");
  const [isChoosingProject, setIsChoosingProject] = useState(false);

  function openProject(path) {
    const updatedProjects = [
      path,
      ...recentProjects.filter((projectPath) => projectPath !== path),
    ].slice(0, 8);

    saveRecentProjects(updatedProjects);
    setRecentProjects(updatedProjects);
    setStatusMessage(`PROJECT SELECTED: ${path}`);
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

  return (
    <>
      <AmbientCode />
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
          statusMessage={statusMessage}
        />
        <RecentProjects projects={recentProjects} onOpen={openProject} />

        <footer className="launcher-footer">
          <span>STATIC TALENT GROUP</span>
        </footer>
      </main>
    </>
  );
}
