import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

/**
 * Shared layout configurations - Professional and mature design
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  githubUrl: "https://github.com/abhay-ramesh/pushduck",
  nav: {
    title: (
      <>
        <div className="flex gap-3 items-center">
          <div className="relative">
            <Image
              src="/pushduck-mascot.png"
              alt="Pushduck"
              width={32}
              height={32}
              className="rounded-md"
            />
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full opacity-60 animate-pulse bg-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight">Pushduck</span>
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              File uploads made simple
            </span>
          </div>
        </div>
      </>
    ),
  },
  links: [
    {
      text: "Documentation",
      url: "/docs",
      active: "nested-url",
    },
    {
      text: "Examples",
      url: "/docs/examples",
    },
    {
      text: "Changelog",
      url: "/docs/roadmap",
    },
    {
      text: "AI/LLM TXT",
      url: "/llms.txt",
      external: true,
    },
  ],
};
