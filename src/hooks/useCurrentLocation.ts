import { useCallback, useEffect, useRef, useState } from 'react';
import { ASTANA_CENTER } from '../data/astanaData';
import type { CurrentGeoState } from '../types/qala';
import { API_BASE } from '../apiBase';

const MANUAL_GEO_KEY = 'qala_manual_geo_v1';

export function useCurrentLocation() {
  const [location, setLocation] = useState<CurrentGeoState>(() => {
    try {
      const saved = window.localStorage.getItem(MANUAL_GEO_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<CurrentGeoState>;
        if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          return {
            lat: parsed.lat,
            lng: parsed.lng,
            source: 'manual',
            address: parsed.address || 'Указано на карте Астаны',
            district: parsed.district || 'Астана',
            nearestLandmark: parsed.nearestLandmark || '',
            updatedAt: parsed.updatedAt || new Date().toISOString(),
            tracking: false,
            error: null,
          };
        }
      }
    } catch {
      // ignore
    }
    return {
      lat: ASTANA_CENTER[0],
      lng: ASTANA_CENTER[1],
      source: 'default',
      address: 'Нұржол желек жолы · Байтерек',
      district: 'Есиль',
      nearestLandmark: 'Байтерек',
      updatedAt: new Date().toISOString(),
      tracking: false,
      error: null,
    };
  });

  const [isDetecting, setIsDetecting] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number): Promise<{ address: string; district: string; nearestLandmark: string }> => {
      try {
        const res = await fetch(`${API_BASE}/api/geo/reverse?lat=${lat}&lng=${lng}`);
        if (res.ok) {
          const data = (await res.json()) as {
            address?: string;
            district?: string;
            nearestLandmark?: string;
          };
          return {
            address: data.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            district: data.district || 'Астана',
            nearestLandmark: data.nearestLandmark || '',
          };
        }
      } catch {
        // ignore network error
      }
      return {
        address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        district: 'Астана',
        nearestLandmark: '',
      };
    },
    []
  );

  const applyCoordinates = useCallback(
    async (
      lat: number,
      lng: number,
      source: CurrentGeoState['source'],
      options?: { accuracyM?: number; label?: string; tracking?: boolean; error?: string | null }
    ) => {
      const geo = await reverseGeocode(lat, lng);
      const next: CurrentGeoState = {
        lat,
        lng,
        accuracyM: options?.accuracyM,
        source,
        address: options?.label || geo.address,
        district: geo.district,
        nearestLandmark: geo.nearestLandmark,
        updatedAt: new Date().toISOString(),
        tracking: Boolean(options?.tracking),
        error: options?.error ?? null,
      };
      setLocation(next);
      return next;
    },
    [reverseGeocode]
  );

  const fallbackToServerIp = useCallback(
    async (errorReason?: string): Promise<CurrentGeoState> => {
      try {
        const res = await fetch(`${API_BASE}/api/geo/current`);
        if (res.ok) {
          const d = (await res.json()) as {
            lat?: number;
            lng?: number;
            city?: string;
            source?: 'ip' | 'default';
          };
          if (typeof d.lat === 'number' && typeof d.lng === 'number') {
            return await applyCoordinates(d.lat, d.lng, d.source || 'ip', {
              error: errorReason || null,
            });
          }
        }
      } catch {
        // ignore
      }
      return await applyCoordinates(ASTANA_CENTER[0], ASTANA_CENTER[1], 'default', {
        label: 'Нұржол желек жолы · Байтерек',
        error: errorReason || null,
      });
    },
    [applyCoordinates]
  );

  const refreshLocation = useCallback(
    async (opts?: { forceGps?: boolean }): Promise<CurrentGeoState> => {
      setIsDetecting(true);
      if (opts?.forceGps) {
        try {
          window.localStorage.removeItem(MANUAL_GEO_KEY);
        } catch {
          // ignore
        }
      }

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        const res = await fallbackToServerIp('Геолокация браузера недоступна — использован IP/Астана');
        setIsDetecting(false);
        return res;
      }

      return new Promise<CurrentGeoState>((resolve) => {
        let settled = false;
        const safetyTimer = window.setTimeout(async () => {
          if (settled) return;
          settled = true;
          const fb = await fallbackToServerIp('Таймаут GPS — определено по сети');
          setIsDetecting(false);
          resolve(fb);
        }, 6800);

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(safetyTimer);
            const updated = await applyCoordinates(
              pos.coords.latitude,
              pos.coords.longitude,
              'gps',
              {
                accuracyM: Math.round(pos.coords.accuracy),
                tracking: watchIdRef.current !== null,
              }
            );
            setIsDetecting(false);
            resolve(updated);
          },
          async (err) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(safetyTimer);
            const reason =
              err.code === 1
                ? 'Доступ к GPS запрещён — использована сетевая локация'
                : 'GPS-сигнал недоступен — определено по сети';
            const fb = await fallbackToServerIp(reason);
            setIsDetecting(false);
            resolve(fb);
          },
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000 }
        );
      });
    },
    [applyCoordinates, fallbackToServerIp]
  );

  const setManualLocation = useCallback(
    async (lat: number, lng: number, label?: string) => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      const next = await applyCoordinates(lat, lng, 'manual', { label, tracking: false });
      try {
        window.localStorage.setItem(MANUAL_GEO_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    },
    [applyCoordinates]
  );

  const toggleLiveTracking = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return false;
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setLocation((prev) => ({ ...prev, tracking: false }));
      return false;
    }

    try {
      window.localStorage.removeItem(MANUAL_GEO_KEY);
    } catch {
      // ignore
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        void applyCoordinates(pos.coords.latitude, pos.coords.longitude, 'gps', {
          accuracyM: Math.round(pos.coords.accuracy),
          tracking: true,
        });
      },
      () => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        setLocation((prev) => ({
          ...prev,
          tracking: false,
          error: 'Живое отслеживание GPS прервано',
        }));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );
    watchIdRef.current = id;
    setLocation((prev) => ({ ...prev, tracking: true, error: null }));
    return true;
  }, [applyCoordinates]);

  // Initial automatic location detection if no manual pin was locked
  useEffect(() => {
    let hasManual = false;
    try {
      hasManual = Boolean(window.localStorage.getItem(MANUAL_GEO_KEY));
    } catch {
      hasManual = false;
    }
    if (!hasManual) {
      void refreshLocation();
    }
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [refreshLocation]);

  return {
    location,
    isDetecting,
    refreshLocation,
    setManualLocation,
    toggleLiveTracking,
    reverseGeocode,
  };
}
