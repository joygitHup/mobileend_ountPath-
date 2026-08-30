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
  try {
    // 1. 请求权限
    const { status } = await Location.requestForegroundPermissionsAsync();
    console.log('📍 位置权限状态:', status);

    if (status !== 'granted') {
      console.warn('📍 位置权限被拒绝，尝试使用缓存位置');
      // 尝试用缓存位置
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const ageMs = Date.now() - last.timestamp;
          if (ageMs <= LOCATION_FRESH_MS) {
            console.log('📍 使用缓存位置 (age:', ageMs, 'ms)');
            return {
              lat: last.coords.latitude,
              lng: last.coords.longitude,
              accuracy: last.coords.accuracy ?? null,
              altitude: last.coords.altitude ?? null,
              timestamp: new Date(last.timestamp).toISOString(),
            };
          }
        }
      } catch (cacheError) {
        console.warn('📍 获取缓存位置失败:', cacheError);
      }
      return null;
    }

    console.log('📍 权限已授予，正在获取精确位置...');

    // 2. 获取精确位置
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

    console.log('📍 位置获取成功:', pos.coords.latitude, pos.coords.longitude);

    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      altitude: pos.coords.altitude ?? null,
      timestamp: new Date(pos.timestamp).toISOString(),
    };
  } catch (error) {
    console.error('📍 获取位置失败:', error);

    // 3. 降级：尝试用缓存位置
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        const ageMs = Date.now() - last.timestamp;
        if (ageMs <= LOCATION_FRESH_MS) {
          console.log('📍 降级使用缓存位置 (age:', ageMs, 'ms)');
          return {
            lat: last.coords.latitude,
            lng: last.coords.longitude,
            accuracy: last.coords.accuracy ?? null,
            altitude: last.coords.altitude ?? null,
            timestamp: new Date(last.timestamp).toISOString(),
          };
        }
      }
    } catch (cacheError) {
      console.warn('📍 获取缓存位置失败:', cacheError);
    }

    return null;
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