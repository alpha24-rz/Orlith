'use client'

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes"
import { installBackendFetchOverride } from "@/lib/backend-url"

// Route browser `/api/*` calls to a runtime backend URL (e.g. a Colab tunnel)
// when one is configured. No-op on the server and when no override is set.
installBackendFetchOverride()

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
