export default function WindowControls() {
  const appWindow = window.__TAURI__?.window?.getCurrentWindow();

  return (
    <div className="window-controls">
      <button
        className="window-control window-control-maximize"
        type="button"
        aria-label="Maximize window"
        onClick={() => appWindow?.toggleMaximize()}
      />
      <button
        className="window-control window-control-minimize"
        type="button"
        aria-label="Minimize window"
        onClick={() => appWindow?.minimize()}
      />
      <button
        className="window-control window-control-close"
        type="button"
        aria-label="Close window"
        onClick={() => appWindow?.close()}
      />
    </div>
  );
}
