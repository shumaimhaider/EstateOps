import { useState } from 'react';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import '@/shared/i18n/index.js';
import { shouldRetry } from '@/shared/lib/errors.js';
import { reportError } from '@/shared/lib/errorReporter.js';
import ToastProvider from '@/shared/ui/toast/ToastProvider.jsx';
import RootFallback from '../errors/RootFallback.jsx';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry, refetchOnWindowFocus: false } },
  });
}

export default function AppProviders({ children }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ErrorBoundary FallbackComponent={RootFallback} onError={(error) => reportError(error)}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

AppProviders.propTypes = { children: PropTypes.node };
