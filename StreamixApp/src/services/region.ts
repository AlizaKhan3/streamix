import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Only two physical movie shards exist in this project: US and EU.
 * Your *exact* location (e.g. Asia/Karachi) is detected from the device,
 * then *mapped* to the nearest shard for routing. There is no PK/ASIA shard.
 */
export type ClientRegion = 'US' | 'EU';

const STORAGE_KEY = 'client_region';

export type DeviceLocationInfo = {
  timezone: string;
  locale: string;
  /** Human label for where the device actually is (not limited to US/EU). */
  exactLabel: string;
  /** Which of the two shards we route to. */
  mappedShard: ClientRegion;
  mappingReason: string;
};

export function getDeviceLocationInfo(): DeviceLocationInfo {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'unknown';

  let mappedShard: ClientRegion = 'US';
  let mappingReason = 'default fallback → US shard';
  let exactLabel = timezone;

  if (
    timezone.startsWith('America/') ||
    timezone.startsWith('US/') ||
    timezone === 'Pacific/Honolulu' ||
    timezone === 'Pacific/Juneau'
  ) {
    mappedShard = 'US';
    mappingReason = 'timezone in Americas → US shard';
    exactLabel = `${timezone} (Americas)`;
  } else if (
    timezone.startsWith('Europe/') ||
    timezone.startsWith('Atlantic/Reykjavik') ||
    timezone.startsWith('Atlantic/Canary')
  ) {
    mappedShard = 'EU';
    mappingReason = 'timezone in Europe → EU shard';
    exactLabel = `${timezone} (Europe)`;
  } else if (timezone.startsWith('Asia/') || timezone.startsWith('Indian/')) {
    // Pakistan, India, Middle East, etc. — geographically closer to EU than US
    mappedShard = 'EU';
    mappingReason = 'timezone in Asia → nearest available shard is EU (no Asia shard in this cluster)';
    exactLabel = `${timezone} (Asia)`;
  } else if (timezone.startsWith('Africa/')) {
    mappedShard = 'EU';
    mappingReason = 'timezone in Africa → nearest available shard is EU';
    exactLabel = `${timezone} (Africa)`;
  } else if (timezone.startsWith('Australia/') || timezone.startsWith('Pacific/')) {
    mappedShard = 'US';
    mappingReason = 'timezone in Oceania → mapped to US shard (no APAC shard)';
    exactLabel = `${timezone} (Oceania)`;
  } else if (/[-_](US|CA|MX|PR)$/i.test(locale)) {
    mappedShard = 'US';
    mappingReason = `locale ${locale} → US shard`;
    exactLabel = `${timezone} · locale ${locale}`;
  } else if (/[-_](GB|UK|DE|FR|IT|ES|NL|PL|SE|IE|PT|AT|BE|CH|PK|IN|AE|SA)$/i.test(locale)) {
    mappedShard = 'EU';
    mappingReason = `locale ${locale} → EU shard`;
    exactLabel = `${timezone} · locale ${locale}`;
  } else {
    exactLabel = `${timezone} · locale ${locale}`;
  }

  return { timezone, locale, exactLabel, mappedShard, mappingReason };
}

/** Infer which shard to use from the device (maps exact location → US|EU). */
export function detectRegionFromDevice(): ClientRegion {
  return getDeviceLocationInfo().mappedShard;
}

export function getDeviceTimezone(): string {
  return getDeviceLocationInfo().timezone;
}

let cachedRegion: ClientRegion | null = null;

export async function getClientRegion(): Promise<ClientRegion> {
  if (cachedRegion) return cachedRegion;
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  if (saved === 'US' || saved === 'EU') {
    cachedRegion = saved;
    return saved;
  }
  cachedRegion = detectRegionFromDevice();
  return cachedRegion;
}

export async function setClientRegion(region: ClientRegion): Promise<void> {
  cachedRegion = region;
  await AsyncStorage.setItem(STORAGE_KEY, region);
}

export async function clearClientRegionOverride(): Promise<ClientRegion> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  cachedRegion = null;
  return getClientRegion();
}
