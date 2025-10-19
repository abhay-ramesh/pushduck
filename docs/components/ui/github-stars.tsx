"use client";

import { Github, Star } from "lucide-react";
import { useEffect, useState } from "react";

export function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    async function fetchStars() {
      try {
        const response = await fetch(
          "https://api.github.com/repos/abhay-ramesh/pushduck"
        );
        const data = await response.json();
        setStars(data.stargazers_count);
      } catch (error) {
        console.error("Failed to fetch GitHub stars:", error);
      }
    }

    fetchStars();
  }, []);

  return (
    <a
      href="https://github.com/abhay-ramesh/pushduck"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md overflow-hidden border border-border hover:border-primary/50 transition-colors group"
      title="Star Pushduck on GitHub"
    >
      {/* Star Button */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted transition-colors">
        {/* <Star className="w-4 h-4 text-muted-foreground group-hover:text-yellow-500 group-hover:fill-yellow-500 transition-all" /> */}
        <Github className="w-4 h-4 text-muted-foreground transition-all" />
        <span className="text-sm font-medium">GitHub</span>
      </div>

      {/* Star Count */}
      <div className="px-3 flex items-center gap-1 py-2 bg-muted text-sm font-medium tabular-nums border-l">
        <Star className="group-hover:w-4 -ml-1 group-hover:ml-0 w-0 opacity-0 group-hover:opacity-100 h-4 text-muted-foreground group-hover:text-yellow-500 group-hover:fill-yellow-500 transition-all" />
        {stars !== null ? stars.toLocaleString() : "..."}
      </div>
    </a>
  );
}
