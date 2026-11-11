import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import FolderIcon from "./FolderIcon.jsx";
import { getCachedScratchProjectId, getProjectIdFromLink } from "../utils/scratchProjectId.js";
import { projectName } from "../utils/projectStorage.js";

// Keep fetched thumbnail URLs and loaded image sources available across card switches.
const scratchThumbnailRequests = new Map();
const scratchThumbnailUrls = new Map();
const loadedThumbnailUrls = new Set();

function requestScratchThumbnail(projectId) {
  if (scratchThumbnailUrls.has(projectId)) {
    return Promise.resolve(scratchThumbnailUrls.get(projectId));
  }
  if (scratchThumbnailRequests.has(projectId)) {
    return scratchThumbnailRequests.get(projectId);
  }

  const tauriCore = window.__TAURI__?.core;
  if (typeof tauriCore?.invoke !== "function") {
    return Promise.reject(new Error("Scratch thumbnail loading requires the desktop app"));
  }

  const request = tauriCore
    .invoke("fetch_scratch_project_thumbnail", { projectId })
    .then((bytes) => {
      if (!Array.isArray(bytes) && !(bytes instanceof ArrayBuffer)) {
        throw new Error("Scratch returned invalid thumbnail data");
      }
      const thumbnailBytes = new Uint8Array(bytes);
      const url = URL.createObjectURL(new Blob([thumbnailBytes], { type: "image/png" }));
      scratchThumbnailUrls.set(projectId, url);
      const image = new Image();
      image.src = url;
      return (image.decode ? image.decode() : Promise.resolve())
        .catch(() => {})
        .then(() => {
          loadedThumbnailUrls.add(url);
          return url;
        });
    })
    .catch((error) => {
      scratchThumbnailRequests.delete(projectId);
      throw error;
    });

  scratchThumbnailRequests.set(projectId, request);
  return request;
}

// Convert image brightness into a grayscale depth map for displacement and lighting.
function createDepthMapCanvas(image) {
  const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
  const depthCanvas = document.createElement("canvas");
  depthCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  depthCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = depthCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create the thumbnail depth map");

  context.drawImage(image, 0, 0, depthCanvas.width, depthCanvas.height);
  const depth = context.getImageData(0, 0, depthCanvas.width, depthCanvas.height);
  for (let offset = 0; offset < depth.data.length; offset += 4) {
    const luminance =
      (depth.data[offset] * 0.2126 + depth.data[offset + 1] * 0.7152 + depth.data[offset + 2] * 0.0722) / 255;
    const height = Math.max(0, Math.min(1, (luminance - 0.5) * 1.6 + 0.5));
    const channel = Math.round(height * 255);
    depth.data[offset] = channel;
    depth.data[offset + 1] = channel;
    depth.data[offset + 2] = channel;
    depth.data[offset + 3] = 255;
  }
  context.putImageData(depth, 0, 0);
  return depthCanvas;
}

// Set up the GPU pipeline that displaces the PNG and lights the generated depth map.
function createDepthRenderer(canvas, image) {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
  if (!gl) return null;

  const vertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = (aPosition + 1.0) * 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform sampler2D uImage;
    uniform sampler2D uDepth;
    uniform vec2 uLight;
    uniform vec2 uDepthTexel;
    uniform float uDepthScale;
    varying vec2 vUv;
    void main() {
      float rawDepth = texture2D(uDepth, vUv).r;
      vec2 displacedUv = clamp(
        vUv + uLight * ((rawDepth - 0.5) * uDepthScale),
        vec2(0.002),
        vec2(0.998)
      );
      float leftDepth = texture2D(uDepth, displacedUv - vec2(uDepthTexel.x, 0.0)).r;
      float rightDepth = texture2D(uDepth, displacedUv + vec2(uDepthTexel.x, 0.0)).r;
      float topDepth = texture2D(uDepth, displacedUv + vec2(0.0, uDepthTexel.y)).r;
      float bottomDepth = texture2D(uDepth, displacedUv - vec2(0.0, uDepthTexel.y)).r;
      vec3 surfaceDirection = normalize(vec3(
        (leftDepth - rightDepth) * 20.0,
        (bottomDepth - topDepth) * 20.0,
        1.0
      ));
      vec3 lightDirection = normalize(vec3(uLight * 0.72, 1.0));
      float diffuse = max(dot(surfaceDirection, lightDirection), 0.0);
      vec3 halfDirection = normalize(lightDirection + vec3(0.0, 0.0, 1.0));
      float specular = pow(max(dot(surfaceDirection, halfDirection), 0.0), 24.0) * 0.08;
      vec4 color = texture2D(uImage, displacedUv);
      float brightness = min(1.0, 0.78 + diffuse * 0.18 + specular * 0.9);
      color.rgb *= brightness;
      gl_FragColor = color;
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create thumbnail shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader) || "Thumbnail shader failed to compile";
      gl.deleteShader(shader);
      throw new Error(error);
    }
    return shader;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create thumbnail lighting program");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Thumbnail lighting program failed to link");
  }

  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const depthCanvas = createDepthMapCanvas(image);
  const imageTexture = gl.createTexture();
  const depthTexture = gl.createTexture();
  if (!imageTexture || !depthTexture) throw new Error("Could not create thumbnail textures");

  function configureTexture(texture, unit, source) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  configureTexture(imageTexture, 0, image);
  configureTexture(depthTexture, 1, depthCanvas);
  const imageUniform = gl.getUniformLocation(program, "uImage");
  const depthUniform = gl.getUniformLocation(program, "uDepth");
  const depthTexelUniform = gl.getUniformLocation(program, "uDepthTexel");
  const depthScaleUniform = gl.getUniformLocation(program, "uDepthScale");
  const lightUniform = gl.getUniformLocation(program, "uLight");
  gl.uniform1i(imageUniform, 0);
  gl.uniform1i(depthUniform, 1);
  gl.uniform2f(
    depthTexelUniform,
    1 / depthCanvas.width,
    1 / depthCanvas.height,
  );
  gl.uniform1f(depthScaleUniform, 0.008);

  return {
    render(lightX, lightY) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(lightUniform, lightX, lightY);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    destroy() {
      gl.deleteTexture(imageTexture);
      gl.deleteTexture(depthTexture);
      gl.deleteBuffer(vertices);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    },
  };
}

function ProjectThumbnail({ projectId, title, interactiveLight = false }) {
  // Scratch-hosted projects have CDN thumbnails; local files fall back to Aida's cover art.
  const thumbnailUrl = projectId
    ? `https://cdn2.scratch.mit.edu/get_image/project/${projectId}_480x360.png`
    : null;
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const lightPosition = useRef(null);
  const [thumbnailBlobUrl, setThumbnailBlobUrl] = useState(() =>
    projectId ? scratchThumbnailUrls.get(projectId) || null : null,
  );
  const [corsFallback, setCorsFallback] = useState(false);
  const [loadedImageKey, setLoadedImageKey] = useState(null);
  const [failedImageKey, setFailedImageKey] = useState(null);
  const [depthMapSourceKey, setDepthMapSourceKey] = useState(null);
  const thumbnailSource = thumbnailBlobUrl || thumbnailUrl;
  const corsEnabled = interactiveLight && !thumbnailBlobUrl && !corsFallback;
  const imageSourceKey = `${thumbnailSource}:${corsEnabled ? "cors" : "plain"}`;

  useEffect(() => {
    if (!interactiveLight || !projectId) return;

    let active = true;
    requestScratchThumbnail(projectId)
      .then((url) => {
        if (active) setThumbnailBlobUrl(url);
      })
      .catch(() => {
        // Keep the direct thumbnail visible if the native image fetch is unavailable.
      });

    return () => {
      active = false;
    };
  }, [interactiveLight, projectId]);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (
      !interactiveLight ||
      !thumbnailSource ||
      loadedImageKey !== imageSourceKey ||
      failedImageKey === imageSourceKey ||
      !image?.naturalWidth ||
      !canvas
    ) {
      return;
    }

    let renderer;
    try {
      renderer = createDepthRenderer(canvas, image);
    } catch {
      // Retry with a plain image if browser pixel access is restricted.
      if (corsEnabled) setCorsFallback(true);
      return;
    }
    if (!renderer) return;

    setDepthMapSourceKey(imageSourceKey);
    let animationFrame = 0;
    let previousFrame = performance.now();
    const animationStart = previousFrame;
    const light = { x: 0, y: 0 };

    // Keep the depth motion visible at rest and blend to the pointer when hovered.
    function animate(now) {
      const delta = Math.min(now - previousFrame, 80);
      previousFrame = now;
      const seconds = (now - animationStart) / 1000;
      const pointer = lightPosition.current;
      const targetX = pointer ? pointer.x : Math.sin(seconds * 0.72) * 0.58;
      const targetY = pointer ? pointer.y : Math.cos(seconds * 0.58) * 0.42;
      const easing = 1 - Math.exp(-delta / (pointer ? 85 : 420));
      light.x += (targetX - light.x) * easing;
      light.y += (targetY - light.y) * easing;

      renderer.render(light.x, light.y);
      animationFrame = requestAnimationFrame(animate);
    }

    animationFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrame);
      renderer.destroy();
    };
  }, [
    corsEnabled,
    failedImageKey,
    imageSourceKey,
    interactiveLight,
    loadedImageKey,
    thumbnailSource,
  ]);

  function updateLight(event) {
    if (!interactiveLight || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    lightPosition.current = {
      x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      y: 1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    };
  }

  function resetLight() {
    if (!interactiveLight) return;
    lightPosition.current = null;
  }

  return (
    <span
      className="recent-project-thumbnail"
      onPointerMove={updateLight}
      onPointerLeave={resetLight}
    >
      <span
        className="recent-project-thumbnail-placeholder"
        aria-hidden="true"
        style={{ opacity: thumbnailSource && loadedThumbnailUrls.has(thumbnailSource) ? 0 : 1 }}
      >
        <span className="thumbnail-placeholder-mark">AIDA</span>
        <span className="thumbnail-placeholder-title">{title}</span>
        <span className="thumbnail-placeholder-code">
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>
      {thumbnailSource && (
        <img
          key={imageSourceKey}
          ref={imageRef}
          className="recent-project-thumbnail-image"
          src={thumbnailSource}
          alt=""
          crossOrigin={corsEnabled ? "anonymous" : undefined}
          loading="eager"
          draggable="false"
          hidden={failedImageKey === imageSourceKey}
          onLoad={() => {
            loadedThumbnailUrls.add(thumbnailSource);
            setLoadedImageKey(imageSourceKey);
          }}
          onError={(event) => {
            if (corsEnabled) setCorsFallback(true);
            else setFailedImageKey(imageSourceKey);
          }}
        />
      )}
      {interactiveLight && thumbnailUrl && (
        <canvas
          ref={canvasRef}
          className="recent-project-depth-render"
          aria-hidden="true"
          style={{ opacity: depthMapSourceKey === imageSourceKey ? 1 : 0 }}
        />
      )}
      <span className="recent-project-thumbnail-glare" aria-hidden="true" />
    </span>
  );
}

export default function RecentProjects({
  projects,
  projectNames,
  projectCreators = {},
  onOpen,
  onReload,
  onRemove,
  onCreatorResolved,
  isBusy,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cycleMotion, setCycleMotion] = useState({ direction: 1, sequence: 0 });
  const carouselRef = useRef(null);
  const stageRef = useRef(null);
  const titleRef = useRef(null);
  const pendingCycleRef = useRef(null);
  const wheelState = useRef({ delta: 0, changedAt: 0 });
  const pointerPosition = useRef(null);
  const creatorLookupCache = useRef(new Map());
  const [creatorLookup, setCreatorLookup] = useState({
    projectId: null,
    creator: null,
    loading: false,
  });

  useEffect(() => {
    setSelectedIndex((currentIndex) =>
      projects.length === 0 ? 0 : Math.min(currentIndex, projects.length - 1),
    );
  }, [projects.length]);

  const selectedPath = projects[selectedIndex];
  const selectedName = selectedPath
    ? projectNames[selectedPath] || projectName(selectedPath)
    : "";
  const scratchProjectId = selectedPath
    ? getCachedScratchProjectId(selectedPath) || getProjectIdFromLink(selectedPath)
    : null;
  const savedCreator = selectedPath ? projectCreators[selectedPath] : null;
  const cachedCreator = scratchProjectId
    ? creatorLookupCache.current.get(scratchProjectId)
    : null;
  const selectedCreator = savedCreator || cachedCreator || (
    creatorLookup.projectId === scratchProjectId ? creatorLookup.creator : null
  );
  // Keep adjacent selections available on both ends, wrapping only when multiple projects exist.
  const previousIndex = projects.length > 1
    ? (selectedIndex - 1 + projects.length) % projects.length
    : null;
  const nextIndex = projects.length > 1
    ? (selectedIndex + 1) % projects.length
    : null;

  useEffect(() => {
    if (!scratchProjectId || savedCreator) return;

    const cached = creatorLookupCache.current.get(scratchProjectId);
    if (cached) {
      setCreatorLookup({ projectId: scratchProjectId, creator: cached, loading: false });
      onCreatorResolved?.(selectedPath, cached);
      return;
    }

    const tauriCore = window.__TAURI__?.core;
    if (typeof tauriCore?.invoke !== "function") {
      setCreatorLookup({ projectId: scratchProjectId, creator: null, loading: false });
      return;
    }

    let active = true;
    setCreatorLookup({ projectId: scratchProjectId, creator: null, loading: true });
    tauriCore.invoke("get_scratch_project_creator", { projectId: scratchProjectId })
      .then((creator) => {
        if (!active) return;
        if (typeof creator !== "string" || !creator.trim()) {
          setCreatorLookup({ projectId: scratchProjectId, creator: null, loading: false });
          return;
        }

        const normalizedCreator = creator.trim();
        creatorLookupCache.current.set(scratchProjectId, normalizedCreator);
        setCreatorLookup({
          projectId: scratchProjectId,
          creator: normalizedCreator,
          loading: false,
        });
        onCreatorResolved?.(selectedPath, normalizedCreator);
      })
      .catch(() => {
        if (active) {
          setCreatorLookup({ projectId: scratchProjectId, creator: null, loading: false });
        }
      });

    return () => {
      active = false;
    };
  }, [scratchProjectId, savedCreator, selectedPath, onCreatorResolved]);

  const creatorLoading =
    scratchProjectId && creatorLookup.projectId === scratchProjectId && creatorLookup.loading;
  const cardAttribution = scratchProjectId
    ? selectedCreator || (creatorLoading ? "LOOKING UP CREATOR…" : "CREATOR UNAVAILABLE")
    : selectedPath;

  // Keep a visual copy of each slot so it can travel with its project after the state changes.
  const captureCycle = useCallback((direction) => {
    const stage = stageRef.current;
    if (!stage) return;

    const stageBounds = stage.getBoundingClientRect();
    const slots = [
      ["previous", ".recent-project-preview-previous"],
      ["main", ".recent-project-card"],
      ["next", ".recent-project-preview-next"],
    ];
    const snapshots = slots.flatMap(([role, selector]) => {
      const element = stage.querySelector(selector);
      if (!element) return [];
      const bounds = element.getBoundingClientRect();
      const visual = element.cloneNode(true);
      visual.classList.add("recent-project-swap-copy");
      visual.setAttribute("aria-hidden", "true");
      visual.querySelectorAll("canvas").forEach((canvas) => canvas.remove());
      visual.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
        button.tabIndex = -1;
      });
      return [{
        role,
        visual,
        bounds: {
          left: bounds.left - stageBounds.left,
          top: bounds.top - stageBounds.top,
          width: bounds.width,
          height: bounds.height,
        },
      }];
    });

    pendingCycleRef.current = {
      direction,
      stageWidth: stageBounds.width,
      stageHeight: stageBounds.height,
      snapshots,
    };
  }, []);

  useLayoutEffect(() => {
    const title = titleRef.current;
    if (!title) return;

    function fitTitle() {
      const maxSize =
        Number.parseFloat(getComputedStyle(title).getPropertyValue("--title-max-size")) || 26;
      const width = title.clientWidth;
      if (!width) return;

      const previousWhiteSpace = title.style.whiteSpace;
      title.style.whiteSpace = "nowrap";
      title.style.fontSize = `${maxSize}px`;
      let size = maxSize;
      while (size > 12 && title.scrollWidth > width) {
        size -= 1;
        title.style.fontSize = `${size}px`;
      }
      title.style.whiteSpace = previousWhiteSpace;
    }

    fitTitle();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitTitle);
    observer?.observe(title.parentElement || title);
    if (!observer) window.addEventListener("resize", fitTitle);
    document.fonts?.ready?.then(fitTitle);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", fitTitle);
    };
  }, [selectedName]);

  function moveSelection(direction) {
    if (projects.length < 2) return;
    captureCycle(direction);
    setCycleMotion((current) => ({ direction, sequence: current.sequence + 1 }));
    setSelectedIndex((currentIndex) => (currentIndex + direction + projects.length) % projects.length);
  }

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || projects.length < 2) return;

    // Use a non-passive wheel listener so vertical scrolling selects cards rather than moving the page.
    function handleWheel(event) {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();

      const state = wheelState.current;
      const normalizedDelta = event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * carousel.clientHeight
          : event.deltaY;
      state.delta += normalizedDelta;
      const now = performance.now();
      if (Math.abs(state.delta) < 35 || now - state.changedAt < 260) return;

      const step = state.delta > 0 ? 1 : -1;
      state.delta = 0;
      state.changedAt = now;
      captureCycle(step);
      setCycleMotion((current) => ({ direction: step, sequence: current.sequence + 1 }));
      setSelectedIndex((currentIndex) => (currentIndex + step + projects.length) % projects.length);
    }

    carousel.addEventListener("wheel", handleWheel, { passive: false });
    return () => carousel.removeEventListener("wheel", handleWheel);
  }, [captureCycle, projects.length]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const pending = pendingCycleRef.current;
    if (!stage || !pending || cycleMotion.sequence === 0) return;
    pendingCycleRef.current = null;

    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 480;
    const easing = "cubic-bezier(0.22, 0.8, 0.2, 1)";
    const layer = document.createElement("div");
    layer.className = "recent-project-swap-layer";
    layer.setAttribute("aria-hidden", "true");
    stage.appendChild(layer);
    const animations = [];
    const restoredTargets = [];

    function animate(element, frames) {
      if (!element?.animate) return;
      animations.push(element.animate(frames, { duration, easing, fill: "both" }));
    }

    const forward = pending.direction > 0;
    const targetForRole = forward
      ? { next: ".recent-project-card", main: ".recent-project-preview-previous" }
      : { previous: ".recent-project-card", main: ".recent-project-preview-next" };

    pending.snapshots.forEach(({ role, visual, bounds }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "recent-project-swap-snapshot";
      Object.assign(wrapper.style, {
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        zIndex: role === "main" || (forward ? role === "next" : role === "previous") ? "4" : "2",
      });
      wrapper.appendChild(visual);
      layer.appendChild(wrapper);

      const targetSelector = targetForRole[role];
      const target = targetSelector ? stage.querySelector(targetSelector) : null;
      const targetBounds = target?.getBoundingClientRect();
      const endOpacity = target ? Number.parseFloat(getComputedStyle(target).opacity) || 1 : 0;
      if (target) {
        restoredTargets.push([target, target.style.opacity]);
        target.style.opacity = "0";
      }

      const exitTarget = {
        left: pending.stageWidth / 2 - bounds.width * 0.35,
        top: pending.stageHeight / 2 - bounds.height * 0.35,
        width: bounds.width * 0.7,
        height: bounds.height * 0.7,
      };
      const destination = targetBounds
        ? {
            left: targetBounds.left - stage.getBoundingClientRect().left,
            top: targetBounds.top - stage.getBoundingClientRect().top,
            width: targetBounds.width,
            height: targetBounds.height,
          }
        : exitTarget;

      animate(wrapper, [
        { ...bounds, opacity: 1 },
        { ...destination, opacity: 0 },
      ]);
      if (target) animate(target, [{ opacity: 0 }, { opacity: endOpacity }]);
    });

    const enteringSelector = forward
      ? ".recent-project-preview-next"
      : ".recent-project-preview-previous";
    const entering = stage.querySelector(enteringSelector);
    if (entering) {
      const originalOpacity = entering.style.opacity;
      const restingOpacity = Number.parseFloat(getComputedStyle(entering).opacity) || 0.72;
      restoredTargets.push([entering, originalOpacity]);
      entering.style.opacity = "0";
      animate(entering, [
        { translate: `0 ${forward ? "100%" : "-100%"}`, opacity: 0 },
        { translate: `0 ${forward ? "-50%" : "50%"}`, opacity: restingOpacity },
      ]);
    }

    let cleanupTimer = window.setTimeout(cleanup, duration + 40);
    function cleanup() {
      window.clearTimeout(cleanupTimer);
      animations.forEach((animation) => animation.cancel());
      restoredTargets.forEach(([element, opacity]) => {
        element.style.opacity = opacity;
      });
      layer.remove();
    }

    return cleanup;
  }, [cycleMotion]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    // Animate gentle idle motion and smoothly blend toward pointer tilt near each card.
    let previousFrame = performance.now();
    const animationStart = previousFrame;
    const tiltByCard = new WeakMap();
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const smoothStep = (value) => value * value * (3 - 2 * value);
    let frameId = 0;

    function animate(now) {
      const delta = Math.min(now - previousFrame, 80);
      previousFrame = now;
      const seconds = (now - animationStart) / 1000;
      const pointer = pointerPosition.current;

      carousel
        .querySelectorAll(".recent-project-card, .recent-project-preview")
        .forEach((card) => {
          const isMainCard = card.classList.contains("recent-project-card");
          const isPrevious = card.classList.contains("recent-project-preview-previous");
          const phase = isMainCard ? 0 : isPrevious ? 0.7 : 2.1;
          const ambientX = Math.sin(seconds * 0.9 + phase) * (isMainCard ? 2 : 3.2);
          const ambientY = isMainCard
            ? Math.cos(seconds * 0.72) * 3.6
            : (isPrevious ? -4 : 4) + Math.sin(seconds * 0.8 + phase) * 1.4;
          let pointerWeight = 0;
          let pointerX = 0;
          let pointerY = 0;

          if (pointer) {
            const bounds = card.getBoundingClientRect();
            const closestX = clamp(pointer.x, bounds.left, bounds.right);
            const closestY = clamp(pointer.y, bounds.top, bounds.bottom);
            const distance = Math.hypot(pointer.x - closestX, pointer.y - closestY);
            const radius = isMainCard ? 230 : 145;
            const proximity = clamp(1 - distance / radius, 0, 1);
            pointerWeight = smoothStep(proximity);
            const normalizedX = clamp((pointer.x - (bounds.left + bounds.width / 2)) / (bounds.width / 2), -1, 1);
            const normalizedY = clamp((pointer.y - (bounds.top + bounds.height / 2)) / (bounds.height / 2), -1, 1);
            pointerX = -normalizedY * (isMainCard ? 11 : 9);
            pointerY = normalizedX * (isMainCard ? 14 : 12);
            card.style.setProperty("--card-pointer-x", `${(normalizedX + 1) * 50}%`);
            card.style.setProperty("--card-pointer-y", `${(normalizedY + 1) * 50}%`);
          }

          const targetX = ambientX * (1 - pointerWeight) + pointerX * pointerWeight;
          const targetY = ambientY * (1 - pointerWeight) + pointerY * pointerWeight;
          const current = tiltByCard.get(card) || { x: ambientX, y: ambientY };
          const easing = 1 - Math.exp(-delta / (pointerWeight > 0 ? 100 : 280));
          const nextX = current.x + (targetX - current.x) * easing;
          const nextY = current.y + (targetY - current.y) * easing;

          tiltByCard.set(card, { x: nextX, y: nextY });
          card.style.setProperty("--card-rotate-x", `${nextX}deg`);
          card.style.setProperty("--card-rotate-y", `${nextY}deg`);
        });

      frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [selectedPath]);

  function selectPrevious() {
    moveSelection(-1);
  }

  function selectNext() {
    moveSelection(1);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      selectPrevious();
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      selectNext();
    }
  }

  function handleCarouselPointerMove(event) {
    if (event.pointerType === "touch") return;
    pointerPosition.current = { x: event.clientX, y: event.clientY };
  }

  function handleCarouselPointerLeave() {
    pointerPosition.current = null;
  }

  return (
    <section className="recent-projects" aria-labelledby="recent-title">
      <div className="recent-projects-heading">
        <h2 id="recent-title">RECENT PROJECTS</h2>
      </div>

      {selectedPath ? (
        <div
          className="recent-project-carousel"
          ref={carouselRef}
          role="region"
          tabIndex={0}
          aria-label="Recent project selector. Scroll or use arrow keys to change projects."
          onKeyDown={handleKeyDown}
          onPointerMove={handleCarouselPointerMove}
          onPointerLeave={handleCarouselPointerLeave}
        >
          {/* Layer the 4:3 neighbor cards behind the selected card so half of each peeks out. */}
          <div className="recent-project-stage" ref={stageRef}>
            {previousIndex !== null && (
              <button
                className="recent-project-preview recent-project-preview-previous"
                type="button"
                aria-label={`Select ${projectNames[projects[previousIndex]] || projectName(projects[previousIndex])}`}
                disabled={isBusy}
                onClick={selectPrevious}
              >
                <ProjectThumbnail
                  key={projects[previousIndex]}
                  projectId={getCachedScratchProjectId(projects[previousIndex]) || getProjectIdFromLink(projects[previousIndex])}
                  title={projectNames[projects[previousIndex]] || projectName(projects[previousIndex])}
                />
                <span>{projectNames[projects[previousIndex]] || projectName(projects[previousIndex])}</span>
              </button>
            )}

            <div className="recent-project-card">
              <ProjectThumbnail
                key={selectedPath}
                projectId={scratchProjectId}
                title={selectedName}
                interactiveLight
              />
              <span className="recent-project-card-info">
                <span className="recent-project-card-copy">
                  <span className="recent-project-card-title" ref={titleRef}>{selectedName}</span>
                  <span className="recent-project-card-kicker">
                    <span title={cardAttribution}>{cardAttribution}</span>
                  </span>
                </span>
                <button
                  className="recent-project-card-open"
                  type="button"
                  disabled={isBusy}
                  aria-label={`Open ${selectedName}`}
                  onClick={() => onOpen(selectedPath)}
                >
                  →
                </button>
              </span>
            </div>

            {nextIndex !== null && (
              <button
                className="recent-project-preview recent-project-preview-next"
                type="button"
                aria-label={`Select ${projectNames[projects[nextIndex]] || projectName(projects[nextIndex])}`}
                disabled={isBusy}
                onClick={selectNext}
              >
                <ProjectThumbnail
                  key={projects[nextIndex]}
                  projectId={getCachedScratchProjectId(projects[nextIndex]) || getProjectIdFromLink(projects[nextIndex])}
                  title={projectNames[projects[nextIndex]] || projectName(projects[nextIndex])}
                />
                <span>{projectNames[projects[nextIndex]] || projectName(projects[nextIndex])}</span>
              </button>
            )}
          </div>

          <div className="recent-project-controls">
            <button
              className="recent-project-nav"
              type="button"
              aria-label="Previous recent project"
              disabled={isBusy || projects.length < 2}
              onClick={selectPrevious}
            >
              ↑
            </button>
            <span className="recent-project-position" aria-live="polite">
              {selectedIndex + 1} / {projects.length}
            </span>
            <button
              className="recent-project-nav"
              type="button"
              aria-label="Next recent project"
              disabled={isBusy || projects.length < 2}
              onClick={selectNext}
            >
              ↓
            </button>
            <span className="recent-project-control-spacer" />
            {getCachedScratchProjectId(selectedPath) && (
              <button
                className="reload-recent-project"
                type="button"
                aria-label={`Reload latest Scratch version of ${selectedName}`}
                title="Download the latest Scratch version"
                disabled={isBusy}
                onClick={() => onReload(selectedPath)}
              >
                ↻
              </button>
            )}
            <button
              className="remove-recent-project"
              type="button"
              aria-label={`Remove ${selectedName} from recent projects`}
              disabled={isBusy}
              onClick={() => onRemove(selectedPath)}
            >
              ×
            </button>
          </div>
        </div>
      ) : (
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
