import { useState, useCallback } from 'react';

interface ToastOptions {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export const useToast = () => {
  const [toast, setToast] = useState<ToastOptions & { visible: boolean }>({
    message: '',
    type: 'info',
    duration: 3000,
    visible: false,
  });

  const showToast = useCallback((options: ToastOptions) => {
    setToast({
      ...options,
      type: options.type || 'info',
      duration: options.duration || 3000,
      visible: true,
    });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  return { toast, showToast, hideToast };
};
