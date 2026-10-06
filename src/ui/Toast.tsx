"use client";
import * as RToast from "@radix-ui/react-toast";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "./cn";

type ToastTone = "success" | "error";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

/** Presentational card, reused by the design page. */
function ToastCard({ tone, message }: { tone: ToastTone; message: string }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-page px-4 py-3 text-sm text-ink shadow-pop">
      <Icon aria-hidden className={cn("size-5 shrink-0", tone === "success" ? "text-success" : "text-danger")} />
      <span>{message}</span>
    </div>
  );
}

const Ctx = createContext<(tone: ToastTone, message: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastTone, message: string) => {
    setItems((xs) => [...xs, { id: Date.now() + Math.random(), tone, message }]);
  }, []);
  return (
    <Ctx.Provider value={push}>
      <RToast.Provider duration={5000} swipeDirection="down">
        {children}
        {items.map((t) => (
          <RToast.Root
            key={t.id}
            // Errors interrupt (role=alert). Success waits its turn (role=status).
            type={t.tone === "error" ? "foreground" : "background"}
            onOpenChange={(open) => !open && setItems((xs) => xs.filter((x) => x.id !== t.id))}
          >
            <RToast.Description>
              <ToastCard tone={t.tone} message={t.message} />
            </RToast.Description>
          </RToast.Root>
        ))}
        <RToast.Viewport
          style={{ zIndex: "var(--z-toast)" }}
          className="fixed right-4 bottom-4 left-4 flex flex-col items-center gap-2 outline-none sm:left-auto sm:items-end"
        />
      </RToast.Provider>
    </Ctx.Provider>
  );
}
