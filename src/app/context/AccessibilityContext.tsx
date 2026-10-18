import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

export const TEXT_SIZE_OPTIONS = [
  { value: "standard", label: "Standard", description: "Default text size", scale: 1 },
  { value: "comfortable", label: "Medium", description: "A little larger and easier to read", scale: 1.125 },
  { value: "large", label: "Large print", description: "Largest text for easier reading", scale: 1.25 },
] as const;

export type TextSize = typeof TEXT_SIZE_OPTIONS[number]["value"];

interface AccessibilityContextValue {
  textSize: TextSize;
  setTextSize: Dispatch<SetStateAction<TextSize>>;
}

const STORAGE_KEY = "parish-connect-text-size";
const FONT_SIZE_TOKENS: Record<string, string> = {
  "--text-xs": "0.75rem",
  "--text-sm": "0.875rem",
  "--text-base": "1rem",
  "--text-lg": "1.125rem",
  "--text-xl": "1.25rem",
  "--text-2xl": "1.5rem",
  "--text-3xl": "1.875rem",
  "--text-4xl": "2.25rem",
  "--text-5xl": "3rem",
  "--text-6xl": "3.75rem",
  "--text-7xl": "4.5rem",
  "--text-8xl": "6rem",
  "--text-9xl": "8rem",
};

function getInitialTextSize(): TextSize {
  try {
    const savedSize = window.localStorage.getItem(STORAGE_KEY);
    if (TEXT_SIZE_OPTIONS.some((option) => option.value === savedSize)) {
      return savedSize as TextSize;
    }
  } catch {
    // Use the default when browser storage is unavailable.
  }
  return "standard";
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [textSize, setTextSize] = useState<TextSize>(getInitialTextSize);
  const value = useMemo(() => ({ textSize, setTextSize }), [textSize]);

  useEffect(() => {
    const scale = TEXT_SIZE_OPTIONS.find((option) => option.value === textSize)?.scale ?? 1;
    const root = document.documentElement;
    Object.entries(FONT_SIZE_TOKENS).forEach(([property, value]) => {
      root.style.setProperty(property, `calc(${value} * ${scale})`);
    });
    document.body.style.fontSize = `calc(1rem * ${scale})`;
    root.dataset.textSize = textSize;
    try {
      window.localStorage.setItem(STORAGE_KEY, textSize);
    } catch {
      // Keep the preference for the current session if storage is unavailable.
    }
  }, [textSize]);

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) throw new Error("useAccessibility must be used within an AccessibilityProvider");
  return context;
}