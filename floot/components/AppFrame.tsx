import { ReactNode, useEffect, useRef } from "react";
import { Helmet } from "react-helmet";
import { ThemeMode, useThemeMode } from "../helpers/themeMode";

const KEY = "spanleaf:theme";

const stored = (): ThemeMode | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "auto" ? v : null;
  } catch {
    return null;
  }
};

/**
 * Wraps every page: brings back the light, dark or auto choice from last time, and remembers a new one.
 * With nothing saved it follows the device.
 */
export const AppFrame = ({ children }: { children: ReactNode }) => {
  const { mode, switchToLightMode, switchToDarkMode, switchToAutoMode } = useThemeMode();
  const restored = useRef(false);
  const firstSave = useRef(true);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const choice = stored() ?? "auto";
    if (choice === "dark") switchToDarkMode();
    else if (choice === "light") switchToLightMode();
    else switchToAutoMode();
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The first run is the mode before anything was restored, which must not overwrite what was saved.
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* storage blocked: the choice lasts until the page closes */
    }
  }, [mode]);

  return (
    <>
      {/* Screen readers need the page's language to read it correctly. */}
      <Helmet htmlAttributes={{ lang: "en" }} />
      {children}
    </>
  );
};
