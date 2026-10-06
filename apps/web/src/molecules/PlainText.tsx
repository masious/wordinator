// Renders authored plain text, linking only safe http/https URLs. Line breaks are preserved by the container's CSS.
export function PlainText({ children }: { children: string }) {
  return <>{children.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a> : part)}</>;
}
