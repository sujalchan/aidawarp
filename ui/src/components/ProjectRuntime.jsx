import { useEffect, useRef, useState } from "react";
import "../styles/project-runtime.css";

export default function ProjectRuntime({ title, creator, onBack }) {
  const stageRef = useRef(null);
  const [stageWidth, setStageWidth] = useState(480);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onBack();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const context = stage?.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, stage.width, stage.height);
    context.fillStyle = "#111111";
    context.beginPath();
    context.moveTo(240, 82);
    context.lineTo(132, 278);
    context.lineTo(348, 278);
    context.closePath();
    context.fill();
  }, []);

  return (
    <section className="runtime-view" aria-label={`${title} project runtime`}>
      <button className="runtime-back" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> BACK TO PROJECTS
      </button>
      <div className="runtime-stage-wrap">
        <canvas
          ref={stageRef}
          className="runtime-stage"
          width={480}
          height={360}
          aria-label="480 by 360 white project stage"
        />
      </div>
      <div className="runtime-project-info" style={{ width: `${stageWidth}px` }}>
        <h1>{title}</h1>
        <p>{creator || "Unknown creator"}</p>
      </div>
    </section>
  );
}
