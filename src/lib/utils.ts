import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function openExternalUrl(url: string) {
  if (typeof window === "undefined") {
    return
  }

  const electron = (window as any).electron
  if (electron?.openExternal) {
    electron.openExternal(url)
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}
