import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ClientRegion,
  clearClientRegionOverride,
  detectRegionFromDevice,
  getClientRegion,
  getDeviceLocationInfo,
  setClientRegion as persistRegion,
} from '../services/region';

type RegionContextType = {
  region: ClientRegion;
  detectedRegion: ClientRegion;
  timezone: string;
  exactLabel: string;
  mappingReason: string;
  loading: boolean;
  setRegion: (region: ClientRegion) => Promise<void>;
  useDetected: () => Promise<void>;
};

const RegionContext = createContext<RegionContextType>({} as RegionContextType);

export function RegionProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegionState] = useState<ClientRegion>('US');
  const [loading, setLoading] = useState(true);
  const location = useMemo(() => getDeviceLocationInfo(), []);
  const detectedRegion = detectRegionFromDevice();

  useEffect(() => {
    getClientRegion().then((r) => {
      setRegionState(r);
      setLoading(false);
    });
  }, []);

  const setRegion = useCallback(async (r: ClientRegion) => {
    await persistRegion(r);
    setRegionState(r);
  }, []);

  const useDetected = useCallback(async () => {
    const r = await clearClientRegionOverride();
    setRegionState(r);
  }, []);

  return (
    <RegionContext.Provider
      value={{
        region,
        detectedRegion,
        timezone: location.timezone,
        exactLabel: location.exactLabel,
        mappingReason: location.mappingReason,
        loading,
        setRegion,
        useDetected,
      }}
    >
      {children}
    </RegionContext.Provider>
  );
}

export const useRegion = () => useContext(RegionContext);
