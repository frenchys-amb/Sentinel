import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

export const useOffline = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const syncRef = useRef(null);

  const syncPendingData = useCallback(async () => {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    if (queue.length === 0) return;

    const failed = [];
    for (const item of queue) {
      try {
        await api[item.method](item.url, item.data);
      } catch (err) {
        failed.push(item);
      }
    }

    localStorage.setItem('offlineQueue', JSON.stringify(failed));
    setPendingSync(failed.length);
  }, []);

  syncRef.current = syncPendingData;

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncRef.current();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    setPendingSync(queue.length);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const queueForOffline = useCallback((data) => {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    queue.push({
      ...data,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem('offlineQueue', JSON.stringify(queue));
    setPendingSync(queue.length);
  }, []);

  return { isOnline, pendingSync, syncPendingData, queueForOffline };
};
