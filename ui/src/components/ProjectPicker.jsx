import { useState } from "react";

export default function ProjectPicker({
  chooseProject,
  isChoosingProject,
  isDownloadingProject,
  isReloadingProject,
  isFinishingDownload,
  downloadProgress,
  scratchLink,
  onScratchLinkChange,
  onLoadScratchLink,
  statusMessage,
}) {
  const [activeTab, setActiveTab] = useState("file");

  return (
    <section className="project-picker" aria-labelledby="open-title">
      <div className="picker-copy">
        <h1 id="open-title">OPEN A PROJECT</h1>
        <p className="directory-instruction">
          SELECT A PROJECT TO CONTINUE
        </p>
        <div className="project-load-tabs" role="group" aria-label="Project source">
          <button
            className={`project-load-tab${activeTab === "file" ? " active" : ""}`}
            type="button"
            aria-pressed={activeTab === "file"}
            onClick={() => setActiveTab("file")}
          >
            LOAD FROM FILE
          </button>
          <button
            className={`project-load-tab${activeTab === "link" ? " active" : ""}`}
            type="button"
            aria-pressed={activeTab === "link"}
            onClick={() => setActiveTab("link")}
          >
            LOAD FROM LINK
          </button>
        </div>
        <button
          className="choose-project-button"
          type="button"
          onClick={chooseProject}
          disabled={isChoosingProject}
          hidden={activeTab !== "file"}
        >
          OPEN FILE
        </button>
        <form
          className="scratch-link-form"
          onSubmit={onLoadScratchLink}
          hidden={activeTab !== "link"}
        >
          <input
            className="scratch-link-input"
            type="text"
            inputMode="url"
            aria-label="Scratch or TurboWarp project link"
            placeholder="Scratch or TurboWarp link"
            value={scratchLink}
                disabled={isChoosingProject}
            onChange={(event) => onScratchLinkChange(event.target.value)}
          />
          <button
            className="scratch-link-submit"
            type="submit"
            aria-label="Load Scratch project"
            disabled={isChoosingProject}
          >
            <span aria-hidden="true">↵</span>
          </button>
        </form>
        {(isDownloadingProject || isReloadingProject || isFinishingDownload) && (
          <div
            className={`project-download-progress${isFinishingDownload ? " finishing" : ""}`}
            role="progressbar"
            aria-label="Loading Scratch project"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={isFinishingDownload ? 100 : Math.min(downloadProgress, 95)}
          >
            <span
              style={{ width: `${isFinishingDownload ? 100 : Math.min(downloadProgress, 95)}%` }}
            />
          </div>
        )}
        <p className="project-selection-status" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </div>
    </section>
  );
}
