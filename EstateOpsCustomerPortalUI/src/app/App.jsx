import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import AppProviders from './providers/AppProviders.jsx';
import { createAppRouter } from './router/index.jsx';

export default function App() {
  const [router] = useState(createAppRouter);
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
