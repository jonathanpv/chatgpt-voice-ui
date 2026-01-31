"use client";

import React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToolModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
};

export function ToolModal({
  open,
  title,
  onClose,
  children,
  className,
}: ToolModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close modal"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-xl rounded-2xl border bg-background p-6 shadow-lg",
          className
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close modal"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
