"use client";
import * as RDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  dismissible = true,
  restoreFocusTo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  actions: ReactNode;
  /** False hides the close button and ignores Escape and outside clicks. For states the user must resolve. */
  dismissible?: boolean;
  /** Where focus goes when the dialog closes. Needed when the dialog is opened by state rather than by a trigger. */
  restoreFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 bg-overlay" style={{ zIndex: "var(--z-modal)" }} />
        <RDialog.Content
          style={{ zIndex: "var(--z-modal)" }}
          onCloseAutoFocus={
            restoreFocusTo
              ? (e) => {
                  e.preventDefault();
                  restoreFocusTo.current?.focus();
                }
              : undefined
          }
          onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
          onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
          onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
          className="fixed top-1/2 left-1/2 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-page p-6 shadow-pop"
        >
          <div className="flex items-start justify-between gap-4">
            <RDialog.Title className="text-lg font-semibold text-ink">{title}</RDialog.Title>
            {dismissible ? (
              <RDialog.Close asChild>
                <IconButton label="Close" className="-mt-1 -mr-2">
                  <X aria-hidden className="size-5" />
                </IconButton>
              </RDialog.Close>
            ) : null}
          </div>
          {description ? (
            <RDialog.Description className="mt-2 text-sm text-muted">{description}</RDialog.Description>
          ) : (
            <RDialog.Description className="sr-only">{title}</RDialog.Description>
          )}
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
