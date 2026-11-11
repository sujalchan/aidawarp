import FolderIcon from "./FolderIcon.jsx";
import { projectName } from "../utils/projectStorage.js";
import { getCachedScratchProjectId } from "../utils/scratchProjectId.js";

function RecentProject({ path, name, onOpen, onReload, onRemove, isBusy }) {
  const cachedProjectId = getCachedScratchProjectId(path);
  const displayName = name || projectName(path);

  return (
    <div className="recent-project-row">
      <button
        className="recent-project-button"
        type="button"
        title={`Open ${path}`}
        onClick={() => onOpen(path)}
      >
        <span className="recent-project-details">
          <span className="recent-project-name">{name || projectName(path)}</span>
          <span className="recent-project-path">{path}</span>
        </span>
        <span className="recent-project-action" aria-hidden="true">
          OPEN &gt;
        </span>
      </button>
      {/* Only cached Scratch archives have an ID that can be refreshed. */}
      {cachedProjectId && (
        <button
          className="reload-recent-project"
          type="button"
          aria-label={`Reload latest Scratch version of ${displayName}`}
          title="Download the latest Scratch version"
          disabled={isBusy}
          onClick={() => onReload(path)}
        >
          <span aria-hidden="true">↻</span>
        </button>
      )}
      <button
        className="remove-recent-project"
        type="button"
        aria-label={`Remove ${displayName} from recent projects`}
        disabled={isBusy}
        onClick={() => onRemove(path)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export default function RecentProjects({
  projects,
  projectNames,
  onOpen,
  onReload,
  onRemove,
  isBusy,
}) {
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
            name={projectNames[path]}
            onOpen={onOpen}
            onReload={onReload}
            onRemove={onRemove}
            isBusy={isBusy}
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
