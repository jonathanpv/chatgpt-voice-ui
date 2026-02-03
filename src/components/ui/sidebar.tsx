"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = "18rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3.25rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("Sidebar components must be used within SidebarProvider");
  }
  return context;
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);

    const handleChange = () => setIsMobile(mediaQuery.matches);
    handleChange();

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [breakpoint]);

  return isMobile;
}

type SidebarProviderProps = React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const [openState, setOpenState] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);
  const isMobile = useIsMobile();

  const open = openProp ?? openState;

  const setOpen = React.useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (value) => {
      const nextOpen = typeof value === "function" ? value(open) : value;
      if (openProp === undefined) {
        setOpenState(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [open, openProp, onOpenChange]
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((prev) => !prev);
      return;
    }
    setOpen((prev) => !prev);
  }, [isMobile, setOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        (event.metaKey || event.ctrlKey) &&
        key === SIDEBAR_KEYBOARD_SHORTCUT
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <SidebarContext.Provider
      value={{
        state: open ? "expanded" : "collapsed",
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }}
    >
      <div
        className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
        style={{
          "--sidebar-width": SIDEBAR_WIDTH,
          "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
          "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
          ...style,
        } as any}
        data-state={open ? "expanded" : "collapsed"}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

type SidebarProps = React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
};

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: SidebarProps) {
  const { open, openMobile, setOpenMobile } = useSidebar();

  const isOpen = collapsible === "none" ? true : open;

  const desktopCollapsedClass = !isOpen
    ? collapsible === "offcanvas"
      ? side === "left"
        ? "md:-left-[calc(var(--sidebar-width))]"
        : "md:-right-[calc(var(--sidebar-width))]"
      : collapsible === "icon"
        ? "md:w-(--sidebar-width-icon)"
        : "md:hidden"
    : "";

  const desktopContainerClass = cn(
    "fixed inset-y-0 z-30 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
    side === "left" ? "left-0" : "right-0",
    variant === "floating" && "p-2",
    variant === "inset" && "p-2",
    desktopCollapsedClass
  );

  const sidebarClass = cn(
    "flex h-full w-full flex-col bg-sidebar text-sidebar-foreground",
    side === "left" ? "border-r" : "border-l",
    variant !== "sidebar" && "rounded-lg border border-sidebar-border shadow-sm",
    className
  );

  return (
    <>
      <div
        data-slot="sidebar-container"
        data-side={side}
        data-variant={variant}
        data-collapsible={collapsible}
        className={desktopContainerClass}
      >
        <div data-sidebar="sidebar" data-slot="sidebar" className={sidebarClass} {...props}>
          {children}
        </div>
      </div>

      <div className="md:hidden" dir={dir}>
        {openMobile && (
          <div className="fixed inset-0 z-40">
            <button
              type="button"
              aria-label="Close sidebar"
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpenMobile(false)}
            />
            <div
              className={cn(
                "absolute inset-y-0 w-(--sidebar-width-mobile)",
                side === "left" ? "left-0" : "right-0"
              )}
            >
              <div
                data-sidebar="sidebar"
                data-slot="sidebar"
                className={sidebarClass}
                {...props}
              >
                {children}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type SidebarInsetProps = React.ComponentProps<"div">;

function SidebarInset({ className, ...props }: SidebarInsetProps) {
  const { open } = useSidebar();

  return (
    <div
      className={cn(
        "flex min-h-svh min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-linear",
        open ? "md:pl-(--sidebar-width)" : "md:pl-0",
        className
      )}
      {...props}
    />
  );
}

type SidebarHeaderProps = React.ComponentProps<"div">;

function SidebarHeader({ className, ...props }: SidebarHeaderProps) {
  return (
    <div
      className={cn("sticky top-0 z-10 flex items-center bg-sidebar", className)}
      {...props}
    />
  );
}

type SidebarFooterProps = React.ComponentProps<"div">;

function SidebarFooter({ className, ...props }: SidebarFooterProps) {
  return (
    <div
      className={cn("sticky bottom-0 z-10 flex items-center bg-sidebar", className)}
      {...props}
    />
  );
}

type SidebarContentProps = React.ComponentProps<"div">;

function SidebarContent({ className, ...props }: SidebarContentProps) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-auto", className)}
      {...props}
    />
  );
}

type SidebarGroupProps = React.ComponentProps<"div">;

function SidebarGroup({ className, ...props }: SidebarGroupProps) {
  return <div className={cn("px-2 pb-2", className)} {...props} />;
}

type SidebarGroupLabelProps = React.ComponentProps<"div">;

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

type SidebarGroupActionProps = React.ComponentProps<"button">;

function SidebarGroupAction({ className, ...props }: SidebarGroupActionProps) {
  return (
    <button
      type="button"
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md",
        className
      )}
      {...props}
    />
  );
}

type SidebarGroupContentProps = React.ComponentProps<"div">;

function SidebarGroupContent({ className, ...props }: SidebarGroupContentProps) {
  return <div className={cn("px-0", className)} {...props} />;
}

type SidebarMenuProps = React.ComponentProps<"ul">;

function SidebarMenu({ className, ...props }: SidebarMenuProps) {
  return <ul className={cn("flex flex-col gap-1", className)} {...props} />;
}

type SidebarMenuItemProps = React.ComponentProps<"li">;

function SidebarMenuItem({ className, ...props }: SidebarMenuItemProps) {
  return <li className={cn("relative", className)} {...props} />;
}

const sidebarMenuButtonVariants = cva(
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2",
  {
    variants: {
      size: {
        default: "h-8",
        lg: "h-10 px-3 text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

type SidebarMenuButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
  };

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  SidebarMenuButtonProps
>(({ className, asChild, isActive, size, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      data-active={isActive ? "true" : undefined}
      className={cn(
        sidebarMenuButtonVariants({ size }),
        isActive &&
          "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
        className
      )}
      {...(!asChild ? { type: "button" } : null)}
      {...props}
    />
  );
});
SidebarMenuButton.displayName = "SidebarMenuButton";

type SidebarMenuActionProps = React.ComponentProps<"button">;

function SidebarMenuAction({ className, ...props }: SidebarMenuActionProps) {
  return (
    <button
      type="button"
      className={cn(
        "text-muted-foreground hover:text-foreground absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1",
        className
      )}
      {...props}
    />
  );
}

type SidebarMenuBadgeProps = React.ComponentProps<"span">;

function SidebarMenuBadge({ className, ...props }: SidebarMenuBadgeProps) {
  return (
    <span
      className={cn(
        "text-muted-foreground ml-auto rounded-full px-1.5 text-xs",
        className
      )}
      {...props}
    />
  );
}

type SidebarMenuSubProps = React.ComponentProps<"ul">;

function SidebarMenuSub({ className, ...props }: SidebarMenuSubProps) {
  return (
    <ul
      className={cn(
        "border-muted ml-3 flex flex-col gap-1 border-l pl-3",
        className
      )}
      {...props}
    />
  );
}

type SidebarMenuSubItemProps = React.ComponentProps<"li">;

function SidebarMenuSubItem({ className, ...props }: SidebarMenuSubItemProps) {
  return <li className={cn("relative", className)} {...props} />;
}

type SidebarMenuSubButtonProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
};

const SidebarMenuSubButton = React.forwardRef<
  HTMLButtonElement,
  SidebarMenuSubButtonProps
>(({ className, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      className={cn(
        "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent inline-flex w-full items-center rounded-md px-2 py-1 text-sm",
        className
      )}
      {...(!asChild ? { type: "button" } : null)}
      {...props}
    />
  );
});
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

type SidebarMenuSkeletonProps = React.ComponentProps<"div">;

function SidebarMenuSkeleton({ className, ...props }: SidebarMenuSkeletonProps) {
  return (
    <div
      className={cn(
        "bg-muted h-8 w-full animate-pulse rounded-md",
        className
      )}
      {...props}
    />
  );
}

type SidebarInputProps = React.ComponentProps<"input">;

function SidebarInput({ className, ...props }: SidebarInputProps) {
  return (
    <input
      className={cn(
        "border-sidebar-border bg-sidebar-accent text-sidebar-foreground placeholder:text-muted-foreground h-9 w-full rounded-md border px-3 text-sm outline-none",
        className
      )}
      {...props}
    />
  );
}

type SidebarRailProps = React.ComponentProps<"button">;

function SidebarRail({ className, ...props }: SidebarRailProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      aria-label="Toggle sidebar"
      onClick={toggleSidebar}
      className={cn(
        "hover:bg-sidebar-border absolute inset-y-0 right-0 hidden w-3 translate-x-1/2 rounded-full sm:flex",
        className
      )}
      {...props}
    />
  );
}

type SidebarTriggerProps = React.ComponentProps<typeof Button> & {
  srLabel?: string;
};

function SidebarTrigger({
  className,
  srLabel = "Toggle sidebar",
  onClick,
  ...props
}: SidebarTriggerProps) {
  const { toggleSidebar } = useSidebar();

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    onClick?.(event);
    toggleSidebar();
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
      <PanelLeft className="size-4 rtl:rotate-180" />
    </Button>
  );
}

export {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarHeader,
  SidebarFooter,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuSkeleton,
  SidebarInput,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
};
