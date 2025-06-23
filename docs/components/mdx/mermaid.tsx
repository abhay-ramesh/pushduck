"use client";

import { useTheme } from "next-themes";
import { useEffect, useId, useRef, useState } from "react";

export function Mermaid({ diagram }: { diagram: string }) {
  const id = useId();
  const [svg, setSvg] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const currentDiagramRef = useRef<string>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (currentDiagramRef.current === diagram || !containerRef.current) return;
    const container = containerRef.current;
    currentDiagramRef.current = diagram;

    async function renderDiagram() {
      const { default: mermaid } = await import("mermaid");

      try {
        // configure mermaid
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          fontFamily: "inherit",
          themeCSS: "margin: 1.5rem auto 0;",
          theme: resolvedTheme === "dark" ? "dark" : "default",
        });

        const { svg, bindFunctions } = await mermaid.render(
          id,
          diagram.replaceAll("\\n", "\n")
        );

        bindFunctions?.(container);
        setSvg(svg);
      } catch (error) {
        console.error("Error while rendering mermaid", error);
      }
    }

    void renderDiagram();
  }, [diagram, id, resolvedTheme]);

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />;
}
