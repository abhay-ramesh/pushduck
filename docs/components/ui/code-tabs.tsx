"use client";

import { useState } from "react";

interface CodeTabProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function CodeTab({ active, onClick, children }: CodeTabProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-1.5 text-xs font-medium font-mono transition-all
        border rounded-t-md
        ${
          active
            ? "bg-fd-muted text-foreground border-border border-b-0"
            : "bg-slate-600/10 text-muted-foreground hover:text-foreground hover:bg-muted/80 border-transparent"
        }
      `}
    >
      {children}
    </button>
  );
}

interface CodeTabsSectionProps {
  serverCodeHtml: string;
  uploadClientCodeHtml: string;
  clientCodeHtml: string;
}

export function CodeTabsSection({
  serverCodeHtml,
  uploadClientCodeHtml,
  clientCodeHtml,
}: CodeTabsSectionProps) {
  const [activeTab, setActiveTab] = useState<
    "server" | "upload-client" | "client"
  >("server");

  const currentHtml =
    activeTab === "server"
      ? serverCodeHtml
      : activeTab === "upload-client"
        ? uploadClientCodeHtml
        : clientCodeHtml;

  const currentPath =
    activeTab === "server"
      ? "app/api/upload/route.ts"
      : activeTab === "upload-client"
        ? "lib/upload-client.ts"
        : "components/uploader.tsx";

  return (
    <div className="overflow-hidden rounded-2xl border shadow-2xl bg-card">
      {/* Title Bar with Traffic Lights + Editor Tabs */}
      <div className="px-4 pt-2 bg-muted flex items-center gap-4 border-b border-border">
        {/* macOS Window Controls */}
        <div className="flex items-center space-x-2 pb-1 flex-shrink-0">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        </div>

        {/* Editor-style Tabs (like VS Code/Chrome) */}
        <div className="flex gap-1 flex-1 overflow-x-auto overflow-y-hidden">
          <CodeTab
            active={activeTab === "server"}
            onClick={() => setActiveTab("server")}
          >
            route.ts
          </CodeTab>
          <CodeTab
            active={activeTab === "upload-client"}
            onClick={() => setActiveTab("upload-client")}
          >
            upload-client.ts
          </CodeTab>
          <CodeTab
            active={activeTab === "client"}
            onClick={() => setActiveTab("client")}
          >
            uploader.tsx
          </CodeTab>
        </div>
      </div>

      <div>
        <div className="px-4 py-1 text-xs font-mono text-muted-foreground border-b border-border bg-fd-muted/50">
          {currentPath}
        </div>
        <div className="overflow-x-auto">
          <div
            className="[&_pre]:m-0 [&_pre]:border-none [&_pre]:bg-transparent text-start [&_code]:bg-transparent [&_pre]:pb-4 [&_pre]:pt-2 [&_pre]:px-0 [&_pre]:text-xs [&_code]:text-xs"
            dangerouslySetInnerHTML={{ __html: currentHtml }}
          />
        </div>
      </div>
    </div>
  );
}
