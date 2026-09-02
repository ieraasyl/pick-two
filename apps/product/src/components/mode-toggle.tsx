import { DesktopIcon } from "@phosphor-icons/react/dist/csr/Desktop";
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
import { useState } from "react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

const themeOptions = {
  system: { icon: DesktopIcon, next: "light" },
  light: { icon: SunIcon, next: "dark" },
  dark: { icon: MoonIcon, next: "system" },
} as const;

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const { icon: Icon, next } = themeOptions[theme];
  const [hasInteracted, setHasInteracted] = useState(false);

  const changeTheme = () => {
    setHasInteracted(true);
    setTheme(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme}`}
      onClick={changeTheme}
    >
      <Icon
        className={
          hasInteracted
            ? "animate-in duration-200 zoom-in-75 spin-in-90 motion-reduce:animate-none"
            : undefined
        }
        aria-hidden="true"
      />
    </Button>
  );
}
