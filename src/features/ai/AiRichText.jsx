function renderInline(line, prefix) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.length > 4 && part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${prefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

export function RichText({ text }) {
  const lines = String(text || "").split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;

        const heading = line.match(/^#{1,3}\s+(.*)/);
        if (heading) {
          return (
            <p key={i} className="font-bold">
              {renderInline(heading[1], i)}
            </p>
          );
        }

        const bullet = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
        if (bullet) {
          return (
            <p key={i} className="pl-3 relative">
              <span className="absolute left-0">•</span>
              {renderInline(bullet[1], i)}
            </p>
          );
        }

        return <p key={i}>{renderInline(line, i)}</p>;
      })}
    </div>
  );
}

export default RichText;
