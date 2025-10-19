"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const packageManagers = [
  { name: "npm", command: "npx @pushduck/cli init" },
  { name: "pnpm", command: "pnpm dlx @pushduck/cli init" },
  { name: "yarn", command: "yarn dlx @pushduck/cli init" },
  { name: "bun", command: "bunx @pushduck/cli init" },
];

export function InstallCommand() {
  const [activeManager, setActiveManager] = useState("npm");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const command = packageManagers.find(
      (pm) => pm.name === activeManager
    )?.command;
    if (command) {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="inline-flex overflow-hidden rounded-lg border shadow-md bg-card">
      {/* Package Manager Tabs */}
      <div className="flex border-r bg-muted">
        {packageManagers.map((pm) => (
          <button
            key={pm.name}
            onClick={() => setActiveManager(pm.name)}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              activeManager === pm.name
                ? "text-primary bg-card"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {pm.name}
          </button>
        ))}
      </div>

      {/* Command Display */}
      <div className="flex items-center gap-2 px-4 py-2">
        <code className="text-sm font-mono">
          {packageManagers.find((pm) => pm.name === activeManager)?.command}
        </code>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded hover:bg-muted transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}
