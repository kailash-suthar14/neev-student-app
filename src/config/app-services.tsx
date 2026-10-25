import { createContext, use, type PropsWithChildren } from 'react';

import type { AppServices } from './container';

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({
  services,
  children,
}: PropsWithChildren<{ services: AppServices }>) {
  return <AppServicesContext value={services}>{children}</AppServicesContext>;
}

/** Access injected services. Screens and hooks use this instead of importing implementations. */
export function useAppServices(): AppServices {
  const services = use(AppServicesContext);
  if (!services) throw new Error('useAppServices must be used inside <AppServicesProvider>.');
  return services;
}
