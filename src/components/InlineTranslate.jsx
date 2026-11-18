import { useState } from "react";
import TranslateButton from "./TranslateButton.jsx";

export default function InlineTranslate({ text, as: Tag = "span", className = "", style }) {
  const [translated, setTranslated] = useState(null);
  if (!text || typeof text !== "string") return null;

  return (
    <div className={className}>
      <Tag style={style}>{translated || text}</Tag>
      <TranslateButton
        text={text}
        preferredLang="fr"
        quickLangs={["bm", "wo", "fuc", "dyu", "snk"]}
        isTranslated={!!translated}
        onTranslated={(result) => setTranslated(result)}
        onClear={() => setTranslated(null)}
      />
    </div>
  );
}
