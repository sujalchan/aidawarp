import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";

if (window.__TAURI__ && /Macintosh|Mac OS X/.test(navigator.userAgent)) {
  document.documentElement.classList.add("macos-window");
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
