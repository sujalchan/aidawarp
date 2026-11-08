import FolderIcon from "./FolderIcon.jsx";

export default function ProjectPicker({
  chooseDirectory,
  isChoosingDirectory,
  statusMessage,
}) {
  return (
    <section className="project-picker" aria-labelledby="open-title">
      <div className="picker-copy">
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
          <span>CHOOSE PROJECT DIRECTORY</span>
        </button>
        <p className="project-selection-status" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </div>

      <div className="picker-art" aria-hidden="true">
        <div className="art-center">
          <div className="folder-halo">
            <FolderIcon className="folder-illustration" />
          </div>
          <span className="art-crosshair art-crosshair-one" />
          <span className="art-crosshair art-crosshair-two" />
        </div>
      </div>
    </section>
  );
}
