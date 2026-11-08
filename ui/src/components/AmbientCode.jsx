import { useEffect, useRef } from 'react';
import { rustCodeBlocks } from '../data/rustCodeBlocks.js';

export default function AmbientCode() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const codeBlocks = rustCodeBlocks;
    const scrambleGlyphs = "01abcdefXYZ<>/\\{}[]!@#$%^&*+-=:?;_";
    const colors = ["#b9d89f", "#a8c7ff", "#c7a9f4", "#9bd8d0", "#e5cf9a"];
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let width = 0;
    let height = 0;
    let lastTime = 0;
    let lastDraw = 0;
    let animationFrame = 0;
    let fragments = [];
    let pointerPosition = null;
    let pointerSwayX = 0;
    let pointerSwayY = 0;
    let pointerVelocityX = 0;
    let pointerVelocityY = 0;

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function desiredFragmentCount() {
      return Math.max(3, Math.min(24, Math.floor((width * height) / 60000)));
    }

    function createFragment() {
      const lines = codeBlocks[Math.floor(Math.random() * codeBlocks.length)];
      const size = Math.min(10, Math.max(7.5, width / 78));
      const lineHeight = size * 1.42;
      context.font = String(size) + 'px Consolas, "Courier New", monospace';
      const blockWidth = Math.max(...lines.map((line) => context.measureText(line).width));
      const blockHeight = lines.length * lineHeight;
      const maxX = Math.max(12, width - blockWidth - 12);
      const maxY = Math.max(12, height - blockHeight - 12);
      return {
        lines,
        x: 12 + Math.random() * Math.max(0, maxX - 12),
        y: 12 + Math.random() * Math.max(0, maxY - 12),
        blockWidth,
        blockHeight,
        lineHeight,
        size,
        age: 0,
        lifetime: 8 + Math.random() * 5,
        fadeInDuration: 0.35 + Math.random() * 0.25,
        fadeOutDuration: 0.8 + Math.random() * 0.5,
        decodeDuration: 0.9 + Math.random() * 0.8,
        seed: Math.random() * 10000,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        amplitudeX: 8 + Math.random() * 20,
        amplitudeY: 6 + Math.random() * 17,
        frequencyX: 0.00035 + Math.random() * 0.0005,
        frequencyY: 0.0003 + Math.random() * 0.00045,
        pointerWeight: 0.7 + Math.random() * 0.55,
        alpha: 0.1 + Math.random() * 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    }

    function resize() {
      const previousWidth = width;
      const previousHeight = height;
      const scale = Math.min(window.devicePixelRatio || 1, 1.25);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);

      const isInitialSize = fragments.length === 0;
      if (isInitialSize) {
        for (let index = 0; index < desiredFragmentCount(); index += 1) {
          fragments.push(createFragment());
        }
        if (prefersReducedMotion) {
          fragments.forEach((fragment) => {
            fragment.age = fragment.decodeDuration;
          });
        }
      } else {
        const scaleX = previousWidth ? width / previousWidth : 1;
        const scaleY = previousHeight ? height / previousHeight : 1;
        fragments.forEach((fragment) => {
          fragment.x *= scaleX;
          fragment.y *= scaleY;
          fragment.x = clamp(fragment.x, 12, Math.max(12, width - fragment.blockWidth - 12));
          fragment.y = clamp(fragment.y, 12, Math.max(12, height - fragment.blockHeight - 12));
        });
        fragments.length = Math.min(fragments.length, desiredFragmentCount());
        while (fragments.length < desiredFragmentCount()) {
          fragments.push(createFragment());
        }
      }

      if (prefersReducedMotion) {
        draw(0);
      } else {
        cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(animate);
      }
    }

    function draw(time) {
      const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.04) : 0;
      lastTime = time;
      context.clearRect(0, 0, width, height);

      if (!prefersReducedMotion) {
        pointerVelocityX += (-pointerSwayX * 12 - pointerVelocityX * 5) * delta;
        pointerVelocityY += (-pointerSwayY * 12 - pointerVelocityY * 5) * delta;
        pointerSwayX = clamp(pointerSwayX + pointerVelocityX * delta, -54, 54);
        pointerSwayY = clamp(pointerSwayY + pointerVelocityY * delta, -40, 40);
      }

      for (let fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex += 1) {
        let fragment = fragments[fragmentIndex];
        fragment.age += delta;
        if (fragment.age >= fragment.lifetime) {
          fragment = createFragment();
          fragments[fragmentIndex] = fragment;
        }

        const ambientX = Math.sin(time * fragment.frequencyX + fragment.phaseX) * fragment.amplitudeX;
        const ambientY = Math.cos(time * fragment.frequencyY + fragment.phaseY) * fragment.amplitudeY;
        const x = clamp(
          fragment.x + ambientX + pointerSwayX * fragment.pointerWeight,
          8,
          Math.max(8, width - fragment.blockWidth - 8),
        );
        const y = clamp(
          fragment.y + ambientY + pointerSwayY * fragment.pointerWeight,
          8,
          Math.max(8, height - fragment.blockHeight - 8),
        );
        const fadeIn = Math.min(1, fragment.age / fragment.fadeInDuration);
        const fadeOut = Math.min(
          1,
          Math.max(0, (fragment.lifetime - fragment.age) / fragment.fadeOutDuration),
        );
        const progress = Math.min(1, fragment.age / fragment.decodeDuration);
        const shimmer = 0.85 + Math.sin(time * 0.001 + fragment.phaseX) * 0.15;

        context.save();
        context.globalAlpha = fragment.alpha * fadeIn * fadeOut * shimmer;
        context.font = String(fragment.size) + 'px Consolas, "Courier New", monospace';
        context.fillStyle = fragment.color;
        context.shadowColor = fragment.color;
        context.shadowBlur = 2;

        fragment.lines.forEach((line, lineIndex) => {
          const lineStagger = 0.025;
          const lineProgress = clamp(
            progress * (1 + (fragment.lines.length - 1) * lineStagger) -
              lineIndex * lineStagger,
            0,
            1,
          );
          const resolved = Math.floor(line.length * lineProgress);
          let displayLine = "";
          const tick = Math.floor(time / 55);

          for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
            const character = line[charIndex];
            if (/\s/.test(character) || charIndex < resolved) {
              displayLine += character;
            } else {
              const value = Math.sin(
                fragment.seed + lineIndex * 91 + charIndex * 17 + tick * 13,
              ) * 43758.5453;
              let glyph = scrambleGlyphs[Math.abs(Math.floor(value)) % scrambleGlyphs.length];
              if (glyph === character) {
                glyph = scrambleGlyphs[(scrambleGlyphs.indexOf(glyph) + 1) % scrambleGlyphs.length];
              }
              displayLine += glyph;
            }
          }

          context.fillText(
            displayLine,
            x,
            y + (lineIndex + 1) * fragment.lineHeight,
          );
        });
        context.restore();
      }
    }

    function animate(time) {
      if (!lastDraw || time - lastDraw >= 1000 / 30) {
        draw(time);
        lastDraw = time;
      }
      animationFrame = requestAnimationFrame(animate);
    }

    function handlePointerMove(event) {
      if (event.pointerType === "touch") return;
      if (!pointerPosition) {
        pointerPosition = { x: event.clientX, y: event.clientY };
        return;
      }

      const deltaX = event.clientX - pointerPosition.x;
      const deltaY = event.clientY - pointerPosition.y;
      pointerPosition = { x: event.clientX, y: event.clientY };
      pointerVelocityX = clamp(pointerVelocityX - deltaX * 1.2, -220, 220);
      pointerVelocityY = clamp(pointerVelocityY - deltaY * 1.2, -180, 180);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className="ambient-code" aria-hidden="true" />;
}

