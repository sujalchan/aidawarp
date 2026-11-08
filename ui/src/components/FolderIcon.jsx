export default function FolderIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 9.5A4.5 4.5 0 0 1 8.5 5H19l5 5h15.5A4.5 4.5 0 0 1 44 14.5v17a4.5 4.5 0 0 1-4.5 4.5h-31A4.5 4.5 0 0 1 4 31.5v-22Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M5 15h38"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
