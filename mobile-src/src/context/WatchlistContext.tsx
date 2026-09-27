import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { addToWatchlist, fetchWatchlist, removeFromWatchlist } from '../services/api';
import { useAuth } from './AuthContext';

type WatchlistContextType = {
  ids: Set<string>;
  loading: boolean;
  has: (contentId: number | string) => boolean;
  refresh: () => Promise<void>;
  add: (contentId: number | string) => Promise<void>;
  remove: (contentId: number | string) => Promise<void>;
  toggle: (contentId: number | string) => Promise<boolean>;
};

const WatchlistContext = createContext<WatchlistContextType>({} as WatchlistContextType);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchWatchlist();
      const next = new Set(
        (rows || []).map((r: any) => String(r.content_id))
      );
      setIds(next);
    } catch {
      setIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const has = useCallback(
    (contentId: number | string) => ids.has(String(contentId)),
    [ids]
  );

  const add = useCallback(async (contentId: number | string) => {
    await addToWatchlist(Number(contentId));
    setIds((prev) => new Set(prev).add(String(contentId)));
  }, []);

  const remove = useCallback(async (contentId: number | string) => {
    await removeFromWatchlist(contentId);
    setIds((prev) => {
      const next = new Set(prev);
      next.delete(String(contentId));
      return next;
    });
  }, []);

  const toggle = useCallback(
    async (contentId: number | string) => {
      if (has(contentId)) {
        await remove(contentId);
        return false;
      }
      await add(contentId);
      return true;
    },
    [has, add, remove]
  );

  const value = useMemo(
    () => ({ ids, loading, has, refresh, add, remove, toggle }),
    [ids, loading, has, refresh, add, remove, toggle]
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export const useWatchlist = () => useContext(WatchlistContext);
