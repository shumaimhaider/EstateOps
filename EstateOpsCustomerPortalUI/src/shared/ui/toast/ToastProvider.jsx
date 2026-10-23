import { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ToastContext } from './toastContext.js';

const TONE = {
  success: 'bg-tone-success-bg text-tone-success-fg',
  danger: 'bg-tone-danger-bg text-tone-danger-fg',
  info: 'bg-tone-info-bg text-tone-info-fg',
};

export default function ToastProvider({ children, durationMs = 5000 }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback(
    ({ message, tone = 'info' }) => {
      const id = globalThis.crypto.randomUUID();
      setToasts((list) => [...list, { id, message, tone }]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), durationMs);
    },
    [durationMs],
  );
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 end-4 z-toast flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((x) => (
          <div
            key={x.id}
            className={`rounded-xl px-4 py-3 text-sm font-medium shadow-token ${TONE[x.tone]}`}
          >
            {x.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

ToastProvider.propTypes = { children: PropTypes.node, durationMs: PropTypes.number };
