import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from '@/shared/config/config.js';
import App from '@/app/App.jsx';
import './index.css';

/**
 * Bootstrap. In mock mode the MSW worker starts BEFORE the first render and serves both REST
 * and GraphQL. In real mode the worker is never loaded; nothing else changes.
 */
async function bootstrap() {
  if (config.isMock) {
    const { startMockServer } = await import('./mocks/browser.js');
    await startMockServer();
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
