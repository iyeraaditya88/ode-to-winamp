'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, domMax } from 'framer-motion';
import { useState } from 'react';
import { PlayerProvider } from '@/contexts/PlayerContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 60_000 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* domMax = all motion features (drag/pan/layout), loaded lazily so the
          initial bundle stays light. `strict` forces `m.*` (catches stray motion.*). */}
      <LazyMotion features={domMax} strict>
        <PlayerProvider>{children}</PlayerProvider>
      </LazyMotion>
    </QueryClientProvider>
  );
}
