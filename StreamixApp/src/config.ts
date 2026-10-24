/**
 * Backend API base URL.
 *
 * - iOS Simulator: always localhost (Mac loopback)
 * - Android phone APK: public HTTPS tunnel (Wi‑Fi client isolation blocks LAN)
 * - Android emulator / same Wi‑Fi LAN: LAN_API_URL fallback
 */
import { Platform } from 'react-native';

/** Public tunnel for physical Android phones (no trailing slash). */
export const PUBLIC_API_URL = 'https://fytmfn-ip-39-34-147-11.tunnelmole.net';

export const LAN_API_URL = 'http://192.168.0.35:4000';

const usePublic =
  typeof PUBLIC_API_URL === 'string' &&
  PUBLIC_API_URL.startsWith('http') &&
  !PUBLIC_API_URL.includes('REPLACE_WITH');

export const API_BASE_URL =
  Platform.OS === 'ios'
    ? 'http://localhost:4000'
    : usePublic
      ? PUBLIC_API_URL
      : LAN_API_URL;
