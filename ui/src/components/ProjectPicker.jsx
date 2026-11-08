export default function ProjectPicker({
  chooseProject,
  isChoosingProject,
  statusMessage,
}) {
  return (
    <section className="project-picker" aria-labelledby="open-title">
      <div className="picker-copy">
        <h1 id="open-title">OPEN A PROJECT</h1>
        <p className="directory-instruction">
          SELECT A PROJECT TO CONTINUE{" "}
          <i className="prompt-cursor" aria-hidden="true" />
        </p>
        <button
          className="choose-project-button"
          type="button"
          onClick={chooseProject}
          disabled={isChoosingProject}
        >
          <span className="button-symbol" aria-hidden="true">
            [ + ]
          </span>
          <span>CHOOSE PROJECT</span>
        </button>
        <p className="project-selection-status" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </div>
    </section>
  );
}
