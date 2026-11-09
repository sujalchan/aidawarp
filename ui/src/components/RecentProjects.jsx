import FolderIcon from "./FolderIcon.jsx";
import { projectName } from "../utils/projectStorage.js";

function RecentProject({ path, onOpen, onRemove }) {
  return (
    <div className="recent-project-row">
      <button
        className="recent-project-button"
        type="button"
        title={`Open ${path}`}
        onClick={() => onOpen(path)}
      >
        <span className="recent-project-details">
          <span className="recent-project-name">{projectName(path)}</span>
          <span className="recent-project-path">{path}</span>
        </span>
        <span className="recent-project-action" aria-hidden="true">
          OPEN &gt;
        </span>
      </button>
      <button
        className="remove-recent-project"
        type="button"
        aria-label={`Remove ${projectName(path)} from recent projects`}
        onClick={() => onRemove(path)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export default function RecentProjects({ projects, onOpen, onRemove }) {
  return (
    <section className="recent-projects" aria-labelledby="recent-title">
      <div className="recent-projects-heading">
        <h2 id="recent-title">RECENT PROJECTS</h2>
      </div>
      <div className="recent-project-list">
        {projects.map((path) => (
          <RecentProject
            key={path}
            path={path}
            onOpen={onOpen}
            onRemove={onRemove}
          />
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
