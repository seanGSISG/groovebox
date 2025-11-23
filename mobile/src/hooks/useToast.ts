import { useState, useCallback, useRef, useEffect } from 'react';

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

  const queueRef = useRef<ToastOptions[]>([]);
  const isShowingRef = useRef(false);

  const showNextToast = useCallback(() => {
    if (queueRef.current.length === 0) {
      isShowingRef.current = false;
      return;
    }

    const nextToast = queueRef.current.shift();
    if (nextToast) {
      isShowingRef.current = true;
      setToast({
        ...nextToast,
        type: nextToast.type || 'info',
        duration: nextToast.duration || 3000,
        visible: true,
      });
    }
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    queueRef.current.push(options);

    // If no toast is currently showing, show the next one
    if (!isShowingRef.current) {
      showNextToast();
    }
  }, [showNextToast]);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));

    // Wait a bit before showing the next toast to allow animation to complete
    setTimeout(() => {
      showNextToast();
    }, 100);
  }, [showNextToast]);

  return { toast, showToast, hideToast };
};
