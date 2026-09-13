import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import dayjs from 'dayjs';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { confirmDialog } from '@/utils/notify';

const SCHEDULE_KEY = 'mountpath.departure.remind.schedule';
const FIRED_KEY = 'mountpath.departure.remind.fired';

export type DepartureRemindSchedule = {
  tripId: string;
  routeId?: string;
  routeName: string;
  departureAt: string;
  hoursBefore: number;
  remindWeather: boolean;
  remindChecklist: boolean;
  remindRouteRisk: boolean;
};

/** 根据行程与安全中心设置同步本地提醒计划 */
export async function syncDepartureRemind(schedule: DepartureRemindSchedule | null) {
  if (!schedule) {
    await AsyncStorage.removeItem(SCHEDULE_KEY);
    return;
  }
  const anyOn =
    schedule.remindWeather || schedule.remindChecklist || schedule.remindRouteRisk;
  if (!anyOn || !schedule.departureAt) {
    await AsyncStorage.removeItem(SCHEDULE_KEY);
    return;
  }
  await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
  // 同步后立即检查一次（前台停留时不必等切后台）
  void checkDepartureReminds();
}

async function firedSet(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(FIRED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function markFired(key: string) {
  const set = await firedSet();
  set.add(key);
  const arr = [...set].slice(-40);
  await AsyncStorage.setItem(FIRED_KEY, JSON.stringify(arr));
}

function openDepartureTarget(s: DepartureRemindSchedule) {
  if (s.remindChecklist && s.routeId) {
    router.push({
      pathname: '/checklist',
      params: { routeId: s.routeId, tripId: s.tripId },
    });
    return;
  }
  router.push('/(tabs)/trip');
}

/**
 * 检查是否进入「出发前 N 小时」窗口。
 * 仅应用内 Toast（非系统推送）；杀进程/锁屏无法送达。
 * 点击 Toast 或确认框可落到清单 / 行程。
 */
export async function checkDepartureReminds(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as DepartureRemindSchedule;
    if (!s?.departureAt || !s.tripId) return false;
    const dep = dayjs(s.departureAt);
    if (!dep.isValid()) return false;
    const windowStart = dep.subtract(Math.max(1, s.hoursBefore || 12), 'hour');
    const now = dayjs();
    if (now.isBefore(windowStart) || now.isAfter(dep.add(1, 'hour'))) return false;

    const fireKey = `${s.tripId}:${dep.format('YYYY-MM-DD-HH')}:${s.hoursBefore}`;
    const fired = await firedSet();
    if (fired.has(fireKey)) return false;

    const parts: string[] = [];
    if (s.remindWeather) parts.push('查看天气是否适宜');
    if (s.remindChecklist) parts.push('核对接行前清单');
    if (s.remindRouteRisk) parts.push('留意路线风险提示');
    const tip = parts.length ? parts.join('；') : '请做好出行准备';
    const title = `出行提醒 · ${s.routeName || '行程'}`;
    const message = `预计 ${dep.format('MM/DD HH:mm')} 出发。${tip}（仅 App 打开时可见，非系统推送）`;

    Toast.show({
      type: 'info',
      text1: title,
      text2: `${message} · 点此前往`,
      visibilityTime: 5600,
      onPress: () => {
        Toast.hide();
        openDepartureTarget(s);
      },
    });

    // 再给一次明确归途（避免只看到 Toast 不知去哪）
    confirmDialog(title, `${message}\n\n是否现在去核对清单或行程？`, {
      confirmText: s.remindChecklist && s.routeId ? '去清单' : '去行程',
      cancelText: '稍后',
      onConfirm: () => openDepartureTarget(s),
    });

    await markFired(fireKey);
    return true;
  } catch {
    return false;
  }
}

let remindAppSub: { remove: () => void } | null = null;
let remindTimer: ReturnType<typeof setInterval> | null = null;

export function initDepartureRemindWatcher() {
  if (remindAppSub) return;
  remindAppSub = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      void checkDepartureReminds();
      if (!remindTimer) {
        remindTimer = setInterval(() => {
          void checkDepartureReminds();
        }, 60_000);
      }
    } else if (next === 'background' || next === 'inactive') {
      if (remindTimer) {
        clearInterval(remindTimer);
        remindTimer = null;
      }
    }
  });
  void checkDepartureReminds();
  if (AppState.currentState === 'active') {
    remindTimer = setInterval(() => {
      void checkDepartureReminds();
    }, 60_000);
  }
}
