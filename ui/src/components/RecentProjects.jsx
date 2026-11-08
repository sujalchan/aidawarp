import FolderIcon from "./FolderIcon.jsx";
import { projectName } from "../utils/projectStorage.js";

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

export default function RecentProjects({ projects, onOpen }) {
  return (
    <section className="recent-projects" aria-labelledby="recent-title">
      <div className="recent-projects-heading">
        <h2 id="recent-title">RECENT PROJECTS</h2>
        <span className="recent-project-count">
          {String(projects.length).padStart(2, "0")}
        </span>
      </div>
      <div className="recent-project-list">
        {projects.map((path) => (
          <RecentProject key={path} path={path} onOpen={onOpen} />
        ))}
      </div>
      {projects.length === 0 && (
        <div className="recent-projects-empty">
          <span className="empty-folder-icon">
            <FolderIcon />
          </span>
          <span className="empty-state-copy">NO PROJECTS IN MEMORY</span>
        </div>
      )}
    </section>
  );
}
