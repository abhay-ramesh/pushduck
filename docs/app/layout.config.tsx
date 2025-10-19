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
          <Image
            src="/pushduck-mascot.png"
            alt="Pushduck"
            width={28}
            height={28}
            className="rounded-md"
          />
          <div className="flex flex-col">
            <span className="brand-title text-base font-bold tracking-tight">
              Pushduck
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              // S3 uploads for any framework
            </span>
          </div>
        </div>
      </>
    ),
  },
  links: [],
};
