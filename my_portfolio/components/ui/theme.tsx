"use client";
import { ThemeProvider, useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
export function Theme({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
export function ThemeSwitch() {
  const { setTheme } = useTheme();
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="icon-button" aria-label="테마 선택">
        <Sun size={18} className="sun-icon" />
        <Moon size={18} className="moon-icon" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="popover" sideOffset={10} align="end">
          {[
            { key: "light", label: "라이트", Icon: Sun },
            { key: "dark", label: "다크", Icon: Moon },
            { key: "system", label: "시스템", Icon: Monitor },
          ].map(({ key, label, Icon }) => (
            <Dropdown.Item key={key} onSelect={() => setTheme(key)}>
              <Icon size={16} />
              {label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
