"use client";

import { cn } from "@/lib/utils";
import * as React from "react";

export interface ProgressBarProps {
  /** Progress value (0-100) */
  value: number;
  /** Maximum value (default: 100) */
  max?: number;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Status color variant */
  variant?: "default" | "success" | "error" | "warning";
  /** Show percentage text */
  showValue?: boolean;
  /** Custom className */
  className?: string;
  /** Animated progress */
  animated?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  variant = "default",
  showValue = false,
  className,
  animated = true,
  ...props
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const sizeClasses = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  const variantClasses = {
    default: "bg-primary",
    success: "bg-green-500",
    error: "bg-destructive",
    warning: "bg-yellow-500",
  };

  return (
    <div className={cn("space-y-1", className)} {...props}>
      {showValue && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}

      <div
        className={cn(
          "w-full bg-muted rounded-full overflow-hidden",
          sizeClasses[size]
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            animated && "transition-all",
            variantClasses[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
