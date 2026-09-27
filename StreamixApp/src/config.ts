/**
 * Backend API base URL baked into the APK / app.
 *
 * Your Wi‑Fi blocks phone ↔ Mac (client isolation), so LAN IPs like
 * http://192.168.0.35:4000 will fail on the phone browser/APK.
 * Use the public tunnel URL below (tunnelmole must stay running).
 */
import { Platform } from 'react-native';

export const PUBLIC_API_URL = 'https://fytmfn-ip-39-34-147-11.tunnelmole.net';

export const LAN_API_URL = 'http://192.168.0.35:4000';

const usePublic =
  typeof PUBLIC_API_URL === 'string' &&
  PUBLIC_API_URL.startsWith('http') &&
  !PUBLIC_API_URL.includes('REPLACE_WITH');

export const API_BASE_URL = usePublic
  ? PUBLIC_API_URL
  : Platform.OS === 'android'
    ? LAN_API_URL
    : 'http://localhost:4000';
