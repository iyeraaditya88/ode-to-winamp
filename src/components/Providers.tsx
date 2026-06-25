'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
      <PlayerProvider>{children}</PlayerProvider>
    </QueryClientProvider>
  );
}
