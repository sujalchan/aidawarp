import { useEffect, useRef } from 'react';
import { rustCodeBlocks } from '../data/rustCodeBlocks.js';

export default function AmbientCode() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const codeBlocks = rustCodeBlocks;
    const uniqueSnippets = Array.from(
      new Map(codeBlocks.map((snippet) => [snippet.join("\n"), snippet])).entries(),
    );
    const scrambleGlyphs = "01abcdefXYZ<>/\\{}[]!@#$%^&*+-=:?;_";
    const syntaxColors = {
      plain: "#c3d5bd",
      keyword: "#e6a77b",
      function: "#e5cf9a",
      type: "#9bd8d0",
      string: "#a8c7a0",
      number: "#a8c7ff",
      comment: "#81917d",
      macro: "#c7a9f4",
      lifetime: "#c7a9f4",
      attribute: "#d6b889",
      literal: "#d7a0c7",
    };
    const rustKeywords = new Set(
      "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self static struct super trait type unsafe use where while".split(" "),
    );
    const rustTypes = new Set(
      "bool char str i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64".split(" "),
    );
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let width = 0;
    let height = 0;
    let lastTime = 0;
    let lastDraw = 0;
    let animationFrame = 0;
    let fragments = [];
    const activeSnippets = new Map();
    let ripples = [];
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

    function releaseSnippet(fragment) {
      if (!fragment?.snippetKey) return;
      const activeCount = activeSnippets.get(fragment.snippetKey) ?? 0;
      if (activeCount <= 1) activeSnippets.delete(fragment.snippetKey);
      else activeSnippets.set(fragment.snippetKey, activeCount - 1);
    }

    function getSyntaxColors(line) {
      const characterColors = Array(line.length).fill(syntaxColors.plain);
      const tokenPattern =
        /\/\/.*$|#\[[^\]]*\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])'|'[A-Za-z_]\w*|\b[A-Za-z_]\w*!?|\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?\b/g;
      let match;

      while ((match = tokenPattern.exec(line)) !== null) {
        const token = match[0];
        let color = syntaxColors.plain;

        if (token.startsWith("//")) color = syntaxColors.comment;
        else if (token.startsWith("#[")) color = syntaxColors.attribute;
        else if (token.startsWith('"')) color = syntaxColors.string;
        else if (token.startsWith("'") && token.endsWith("'")) color = syntaxColors.literal;
        else if (token.startsWith("'")) color = syntaxColors.lifetime;
        else if (token.endsWith("!")) color = syntaxColors.macro;
        else if (rustKeywords.has(token)) color = syntaxColors.keyword;
        else if (token === "true" || token === "false") color = syntaxColors.literal;
        else if (rustTypes.has(token) || /^[A-Z]/.test(token)) color = syntaxColors.type;
        else if (/^\d/.test(token)) color = syntaxColors.number;
        else if (/^\s*\(/.test(line.slice(match.index + token.length))) {
          color = syntaxColors.function;
        }

        for (let index = match.index; index < match.index + token.length; index += 1) {
          characterColors[index] = color;
        }
      }

      return characterColors;
    }

    function createFragment(exclude = null) {
      releaseSnippet(exclude);
      let availableSnippet = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = uniqueSnippets[Math.floor(Math.random() * uniqueSnippets.length)];
        if (!activeSnippets.has(candidate[0])) {
          availableSnippet = candidate;
          break;
        }
      }
      availableSnippet ??= uniqueSnippets.find(([key]) => !activeSnippets.has(key));
      const [snippetKey, lines] = availableSnippet;
      activeSnippets.set(snippetKey, (activeSnippets.get(snippetKey) ?? 0) + 1);
      const size = Math.min(10, Math.max(7.5, width / 78));
      const lineHeight = size * 1.42;
      context.font = String(size) + 'px Consolas, "Courier New", monospace';
      const characterWidth = context.measureText("M").width;
      const blockWidth = Math.max(...lines.map((line) => context.measureText(line).width));
      const blockHeight = lines.length * lineHeight;
      const maxX = Math.max(12, width - blockWidth - 12);
      const maxY = Math.max(12, height - blockHeight - 12);
      const phaseX = Math.random() * Math.PI * 2;
      const phaseY = Math.random() * Math.PI * 2;
      const amplitudeX = 8 + Math.random() * 20;
      const amplitudeY = 6 + Math.random() * 17;
      const frequencyX = 0.00035 + Math.random() * 0.0005;
      const frequencyY = 0.0003 + Math.random() * 0.00045;
      const pointerWeight = 0.7 + Math.random() * 0.55;
      let x = 12;
      let y = 12;
      let bestClearance = Number.NEGATIVE_INFINITY;
      let bestX = x;
      let bestY = y;
      let foundClearPosition = false;

      for (let attempt = 0; attempt < 64; attempt += 1) {
        const candidateX = 12 + Math.random() * Math.max(0, maxX - 12);
        const candidateY = 12 + Math.random() * Math.max(0, maxY - 12);
        const candidateScreenX = clamp(
          candidateX + Math.sin(lastTime * frequencyX + phaseX) * amplitudeX +
            pointerSwayX * pointerWeight,
          8,
          Math.max(8, width - blockWidth - 8),
        );
        const candidateScreenY = clamp(
          candidateY + Math.cos(lastTime * frequencyY + phaseY) * amplitudeY +
            pointerSwayY * pointerWeight,
          8,
          Math.max(8, height - blockHeight - 8),
        );
        let clearance = Number.POSITIVE_INFINITY;

        fragments.forEach((other) => {
          if (other === exclude) return;
          const otherPosition = displayedPosition(other, lastTime);
          const gapX = Math.max(
            0,
            Math.abs(candidateScreenX + blockWidth / 2 - (otherPosition.x + other.blockWidth / 2)) -
              (blockWidth + other.blockWidth) / 2,
          );
          const gapY = Math.max(
            0,
            Math.abs(candidateScreenY + blockHeight / 2 - (otherPosition.y + other.blockHeight / 2)) -
              (blockHeight + other.blockHeight) / 2,
          );
          clearance = Math.min(
            clearance,
            Math.hypot(gapX, gapY),
          );
        });

        x = candidateX;
        y = candidateY;
        if (clearance > bestClearance) {
          bestClearance = clearance;
          bestX = candidateX;
          bestY = candidateY;
        }
        if (clearance >= 32) {
          foundClearPosition = true;
          break;
        }
      }
      if (!foundClearPosition) {
        x = bestX;
        y = bestY;
      }

      return {
        lines,
        snippetKey,
        characterColors: lines.map(getSyntaxColors),
        x,
        y,
        blockWidth,
        blockHeight,
        lineHeight,
        characterWidth,
        size,
        age: 0,
        decodeAge: 0,
        lifetime: 8 + Math.random() * 5,
        fadeInDuration: 0.35 + Math.random() * 0.25,
        fadeOutDuration: 0.8 + Math.random() * 0.5,
        decodeDuration: 0.9 + Math.random() * 0.8,
        seed: Math.random() * 10000,
        phaseX,
        phaseY,
        amplitudeX,
        amplitudeY,
        frequencyX,
        frequencyY,
        pointerWeight,
        hovered: false,
        alpha: 0.1 + Math.random() * 0.1,
      };
    }

    function displayedPosition(fragment, time) {
      const ambientX = Math.sin(time * fragment.frequencyX + fragment.phaseX) * fragment.amplitudeX;
      const ambientY = Math.cos(time * fragment.frequencyY + fragment.phaseY) * fragment.amplitudeY;
      return {
        x: fragment.x + ambientX + pointerSwayX * fragment.pointerWeight,
        y: fragment.y + ambientY + pointerSwayY * fragment.pointerWeight,
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
            fragment.decodeAge = fragment.decodeDuration;
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
        const targetCount = desiredFragmentCount();
        while (fragments.length > targetCount) {
          releaseSnippet(fragments.pop());
        }
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
      const rippleSpeed = 420;
      const rippleDuration = 0.45;
      ripples = ripples.filter((ripple) => {
        ripple.age += delta;
        return ripple.age <= ripple.maxDistance / rippleSpeed + rippleDuration;
      });

      if (!prefersReducedMotion) {
        pointerVelocityX += (-pointerSwayX * 12 - pointerVelocityX * 5) * delta;
        pointerVelocityY += (-pointerSwayY * 12 - pointerVelocityY * 5) * delta;
        pointerSwayX = clamp(pointerSwayX + pointerVelocityX * delta, -54, 54);
        pointerSwayY = clamp(pointerSwayY + pointerVelocityY * delta, -40, 40);
      }

      for (let fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex += 1) {
        let fragment = fragments[fragmentIndex];
        fragment.age += delta;
        fragment.decodeAge += delta;
        if (fragment.age >= fragment.lifetime) {
          fragment = createFragment(fragment);
          fragments[fragmentIndex] = fragment;
        }

        const { x, y } = displayedPosition(fragment, time);
        const isHovered =
          pointerPosition !== null &&
          pointerPosition.x >= x &&
          pointerPosition.x <= x + fragment.blockWidth &&
          pointerPosition.y >= y &&
          pointerPosition.y <= y + fragment.blockHeight;
        if (isHovered && !fragment.hovered) {
          fragments.forEach((otherFragment) => {
            otherFragment.decodeAge = otherFragment.decodeDuration;
          });
          ripples.push({
            x: pointerPosition.x,
            y: pointerPosition.y,
            age: 0,
            maxDistance: Math.hypot(width, height),
            seed: Math.random() * 10000,
          });
          if (ripples.length > 4) ripples.shift();
        }
        fragment.hovered = isHovered;
        const fadeIn = Math.min(1, fragment.age / fragment.fadeInDuration);
        const fadeOut = Math.min(
          1,
          Math.max(0, (fragment.lifetime - fragment.age) / fragment.fadeOutDuration),
        );
        const progress = Math.min(1, fragment.decodeAge / fragment.decodeDuration);
        const shimmer = 0.85 + Math.sin(time * 0.001 + fragment.phaseX) * 0.15;

        context.save();
        context.globalAlpha = fragment.alpha * fadeIn * fadeOut * shimmer;
        context.font = String(fragment.size) + 'px Consolas, "Courier New", monospace';
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
            const characterX = x + (charIndex + 0.5) * fragment.characterWidth;
            const characterY = y + (lineIndex + 0.5) * fragment.lineHeight;
            let rippleStrength = 0;
            let rippleSeed = 0;
            for (let rippleIndex = ripples.length - 1; rippleIndex >= 0; rippleIndex -= 1) {
              const ripple = ripples[rippleIndex];
              const distanceFromHit = Math.hypot(
                characterX - ripple.x,
                characterY - ripple.y,
              );
              const rippleTime = ripple.age - distanceFromHit / rippleSpeed;
              if (rippleTime >= 0 && rippleTime <= rippleDuration) {
                const strength = Math.pow(
                  Math.max(0, 1 - distanceFromHit / ripple.maxDistance),
                  3,
                );
                if (strength > rippleStrength) {
                  rippleStrength = strength;
                  rippleSeed = ripple.seed;
                }
              }
            }
            const scrambleNoise =
              Math.abs(
                Math.sin(rippleSeed + lineIndex * 91 + charIndex * 17) * 43758.5453,
              ) % 1;
            const rippleScramble = rippleStrength > scrambleNoise;

            if (/\s/.test(character) || (charIndex < resolved && !rippleScramble)) {
              displayLine += character;
            } else {
              const value = Math.sin(
                fragment.seed + rippleSeed + lineIndex * 91 + charIndex * 17 + tick * 13,
              ) * 43758.5453;
              let glyph = scrambleGlyphs[Math.abs(Math.floor(value)) % scrambleGlyphs.length];
              if (glyph === character) {
                glyph = scrambleGlyphs[(scrambleGlyphs.indexOf(glyph) + 1) % scrambleGlyphs.length];
              }
              displayLine += glyph;
            }
          }

          const characterColors = fragment.characterColors[lineIndex];
          const baseline = y + (lineIndex + 1) * fragment.lineHeight;
          let runStart = 0;

          while (runStart < displayLine.length) {
            const color = characterColors[runStart];
            let runEnd = runStart + 1;
            while (runEnd < displayLine.length && characterColors[runEnd] === color) {
              runEnd += 1;
            }
            context.fillStyle = color;
            context.shadowColor = color;
            context.fillText(
              displayLine.slice(runStart, runEnd),
              x + runStart * fragment.characterWidth,
              baseline,
            );
            runStart = runEnd;
          }
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

    function handlePointerLeave() {
      pointerPosition = null;
      fragments.forEach((fragment) => {
        fragment.hovered = false;
      });
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="ambient-background" aria-hidden="true">
      <canvas ref={canvasRef} className="ambient-code" />
      <div className="crt-overlay" />
    </div>
  );
}

