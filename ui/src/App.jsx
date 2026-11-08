import { useState } from "react";
import AmbientCode from "./components/AmbientCode.jsx";
import ProjectPicker from "./components/ProjectPicker.jsx";
import RecentProjects from "./components/RecentProjects.jsx";
import Wordmark from "./components/Wordmark.jsx";
import { readRecentProjects, saveRecentProjects } from "./utils/projectStorage.js";

export default function App() {
  const [recentProjects, setRecentProjects] = useState(readRecentProjects);
  const [statusMessage, setStatusMessage] = useState("");
  const [isChoosingDirectory, setIsChoosingDirectory] = useState(false);

  function openProject(path) {
    const updatedProjects = [
      path,
      ...recentProjects.filter((projectPath) => projectPath !== path),
    ].slice(0, 8);

    saveRecentProjects(updatedProjects);
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
    <>
      <AmbientCode />
      <main className="launcher-frame">
        <header className="launcher-header">
          <div className="brand-lockup">
            <Wordmark />
            <div className="launcher-subtitle">SCRATCH TO RUST CONVERTER</div>
          </div>
        </header>

        <ProjectPicker
          chooseDirectory={chooseDirectory}
          isChoosingDirectory={isChoosingDirectory}
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
