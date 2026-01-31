"use client";

import React, { createContext, useContext, useState } from "react";
import { PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

function useSidebarContext() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("Sidebar components must be used within SidebarProvider");
  }
  return context;
}

type SidebarProviderProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

function SidebarProvider({
  children,
  defaultOpen = true,
  className,
  ...props
}: SidebarProviderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen }}>
      <div className={cn("flex min-h-screen w-full", className)} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

type SidebarProps = React.HTMLAttributes<HTMLElement>;

function Sidebar({ className, ...props }: SidebarProps) {
  const { isOpen } = useSidebarContext();

  return (
    <aside
      className={cn(
        "bg-background text-foreground w-72 flex-col border-r",
        isOpen ? "fixed inset-y-0 left-0 z-40 flex" : "hidden",
        "md:static md:z-auto md:flex",
        className
      )}
      {...props}
    />
  );
}

type SidebarInsetProps = React.HTMLAttributes<HTMLDivElement>;

function SidebarInset({ className, ...props }: SidebarInsetProps) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", className)} {...props} />
  );
}

type SidebarHeaderProps = React.HTMLAttributes<HTMLDivElement>;

function SidebarHeader({ className, ...props }: SidebarHeaderProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    />
  );
}

type SidebarContentProps = React.HTMLAttributes<HTMLDivElement>;

function SidebarContent({ className, ...props }: SidebarContentProps) {
  return (
    <div
      className={cn("flex-1 overflow-y-auto", className)}
      {...props}
    />
  );
}

type SidebarGroupProps = React.HTMLAttributes<HTMLDivElement>;

function SidebarGroup({ className, ...props }: SidebarGroupProps) {
  return <div className={cn("px-2 pb-2", className)} {...props} />;
}

type SidebarGroupLabelProps = React.HTMLAttributes<HTMLDivElement>;

function SidebarGroupLabel({ className, ...props }: SidebarGroupLabelProps) {
  return (
    <div
      className={cn(
        "px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

type SidebarMenuProps = React.HTMLAttributes<HTMLDivElement>;

function SidebarMenu({ className, ...props }: SidebarMenuProps) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

type SidebarMenuButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

function SidebarMenuButton({ className, ...props }: SidebarMenuButtonProps) {
  return (
    <button
      className={cn(
        "text-foreground hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        className
      )}
      {...props}
    />
  );
}

type SidebarTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  srLabel?: string;
};

function SidebarTrigger({
  className,
  srLabel = "Toggle sidebar",
  onClick,
  ...props
}: SidebarTriggerProps) {
  const { setIsOpen } = useSidebarContext();

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    onClick?.(event);
    setIsOpen((prev) => !prev);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={handleClick}
      aria-label={srLabel}
      {...props}
    >
      <PanelLeft className="size-4" />
    </Button>
  );
}

export {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarTrigger,
};
