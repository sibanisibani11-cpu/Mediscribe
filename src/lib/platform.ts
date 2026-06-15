import { Capacitor } from '@capacitor/core';

export const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
export const isMobile = typeof window !== 'undefined' && Capacitor.isNativePlatform();
export const isWeb = !isElectron && !isMobile;
