import { createContext, useContext } from 'react';

export const ToastContext = createContext({ show: () => {} });

/** show({ message, tone: 'success' | 'danger' | 'info' }) */
export function useToast() {
  return useContext(ToastContext);
}
