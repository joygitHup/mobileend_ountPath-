import * as Location from 'expo-location';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchApi } from '@/utils/api';

export type PositionFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  altitude: number | null;
  timestamp: string;
};

const CHECKIN_QUEUE_KEY = 'mountpath.guard.checkin.queue';
/** 位置视为「新鲜」的最大年龄 */
export const LOCATION_FRESH_MS = 120_000;

export function isFreshFixTimestamp(
  iso: string | undefined | null,
  maxAgeMs = LOCATION_FRESH_MS
): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const age = Date.now() - t;
  return age >= 0 && age <= maxAgeMs;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('location_timeout')), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

/** 高精度定位（守护 / SOS / 轨迹）；超时返回 null */
export async function getBestPosition(timeoutMs = 12000): Promise<PositionFix | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  try {
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy:
          Platform.OS === 'ios'
            ? Location.Accuracy.BestForNavigation
            : Location.Accuracy.Highest,
        mayShowUserSettingsDialog: true,
        timeInterval: 1000,
      }),
      timeoutMs
    );
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      altitude: pos.coords.altitude ?? null,
      timestamp: new Date(pos.timestamp).toISOString(),
    };
  } catch {
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (!last) return null;
      const ageMs = Date.now() - last.timestamp;
      // 超时兜底：拒绝过旧或过粗的缓存点，避免 SOS/打卡上报陈旧坐标
      if (ageMs > 120_000) return null;
      if (last.coords.accuracy != null && last.coords.accuracy > 200) return null;
      return {
        lat: last.coords.latitude,
        lng: last.coords.longitude,
        accuracy: last.coords.accuracy ?? null,
        altitude: last.coords.altitude ?? null,
        timestamp: new Date(last.timestamp).toISOString(),
      };
    } catch {
      return null;
    }
  }
}

export type CheckinPayload = {
  session_id?: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  altitude?: number | null;
  progress?: number;
  timestamp: string;
};

async function readQueue(): Promise<CheckinPayload[]> {
  try {
    const raw = await AsyncStorage.getItem(CHECKIN_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: CheckinPayload[]) {
  await AsyncStorage.setItem(CHECKIN_QUEUE_KEY, JSON.stringify(items.slice(-40)));
}

/** 上报位置；网络失败则本地排队。data.ok=false（无会话）视为失败且不排队 */
export async function postGuardCheckin(payload: CheckinPayload): Promise<boolean> {
  try {
    const res = await fetchApi<{ data?: { ok?: boolean } }>('/api/v1/guard/checkin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data?.ok !== false;
  } catch {
    const q = await readQueue();
    q.push(payload);
    await writeQueue(q);
    return false;
  }
}

export async function queuedCheckinCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function flushGuardCheckins(): Promise<number> {
  const q = await readQueue();
  if (!q.length) return 0;
  const remain: CheckinPayload[] = [];
  let flushed = 0;
  for (const item of q) {
    try {
      const res = await fetchApi<{ data?: { ok?: boolean } }>('/api/v1/guard/checkin', {
        method: 'POST',
        body: JSON.stringify(item),
      });
      if (res.data?.ok === false) {
        // 会话已结束：丢弃该项
        continue;
      }
      flushed += 1;
    } catch {
      remain.push(item);
    }
  }
  await writeQueue(remain);
  return flushed;
}
