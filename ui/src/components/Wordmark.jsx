const glyphs = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
};

export default function Wordmark() {
  return (
    <svg
      className="brand-wordmark"
      viewBox="0 0 376 56"
      role="img"
      aria-label="AidaWarp"
    >
      <g className="wordmark-dots" aria-hidden="true">
        {[..."AIDAWARP"].flatMap((letter, letterIndex) =>
          glyphs[letter].flatMap((row, y) =>
            [...row].flatMap((pixel, x) =>
              pixel === "1"
                ? [
                    <circle
                      key={`${letterIndex}-${x}-${y}`}
                      cx={4 + letterIndex * 48 + x * 8}
                      cy={4 + y * 8}
                      r="2.15"
                    />,
                  ]
                : [],
            ),
          ),
        )}
      </g>
    </svg>
  );
}
