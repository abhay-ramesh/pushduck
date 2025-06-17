import { baseOptions } from "@/app/layout.config";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions}
      tree={source.pageTree}
      sidebar={{
        defaultOpenLevel: 0,
        collapsible: false,
        footer: null,
      }}
      nav={{ ...baseOptions.nav, mode: "top" }}
    >
      {children}
    </DocsLayout>
  );
}
