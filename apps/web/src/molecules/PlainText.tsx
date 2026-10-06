// Renders authored plain text, linking only safe http/https URLs. Line breaks are preserved by the container's CSS.
// Pass `linkify={false}` when the text sits inside another link, such as a feed card, where nested anchors are invalid.
export function PlainText({ children, linkify = true }: { children: string; linkify?: boolean }) {
  if (!linkify) return <>{children}</>;
  return <>{children.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a> : part)}</>;
}
