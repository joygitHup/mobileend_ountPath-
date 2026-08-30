import { AppState, type AppStateStatus } from 'react-native';
import {
  flushGuardCheckins,
  getBestPosition,
  postGuardCheckin,
  queuedCheckinCount,
} from '@/utils/location';
import { fetchApi } from '@/utils/api';
import { notifyError, notifyInfo } from '@/utils/notify';

export type GuardHeartbeatSession = {
  id: string;
  started_at: string;
  planned_duration_hours: number;
};

export type GuardHeartbeatState = {
  session: GuardHeartbeatSession | null;
  /** 计时与打卡是否在跑（仅前台） */
  running: boolean;
  /** App 进后台后暂停打卡 */
  pausedByBackground: boolean;
  elapsedSec: number;
  checkinOk: boolean;
  queued: number;
  overtime: boolean;
  overtimeNotified: boolean;
  lastLocation: {
    lat: number;
    lng: number;
    timestamp: string;
    accuracy?: number;
  } | null;
};

type Listener = (s: GuardHeartbeatState) => void;

const listeners = new Set<Listener>();

let state: GuardHeartbeatState = {
  session: null,
  running: false,
  pausedByBackground: false,
  elapsedSec: 0,
  checkinOk: true,
  queued: 0,
  overtime: false,
  overtimeNotified: false,
  lastLocation: null,
};

let tickTimer: ReturnType<typeof setInterval> | null = null;
let checkinTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let bgHintShown = false;
let overtimeInFlight = false;

function emit() {
  const snap = { ...state };
  listeners.forEach((fn) => {
    try {
      fn(snap);
    } catch {
      // ignore listener errors
    }
  });
}

function setState(patch: Partial<GuardHeartbeatState>) {
  state = { ...state, ...patch };
  emit();
}

function clearTimers() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (checkinTimer) {
    clearInterval(checkinTimer);
    checkinTimer = null;
  }
}

async function runCheckin() {
  const s = state.session;
  if (!s || state.pausedByBackground) return;
  const pos = await getBestPosition();
  if (!pos) {
    setState({ checkinOk: false });
    return;
  }
  const ok = await postGuardCheckin({
    session_id: s.id,
    lat: pos.lat,
    lng: pos.lng,
    accuracy: pos.accuracy,
    altitude: pos.altitude,
    timestamp: pos.timestamp,
  });
  const queued = await queuedCheckinCount();
  setState({
    checkinOk: ok,
    queued,
    lastLocation: ok
      ? {
          lat: pos.lat,
          lng: pos.lng,
          timestamp: pos.timestamp,
          accuracy: pos.accuracy ?? undefined,
        }
      : state.lastLocation,
  });
  if (ok) {
    const flushed = await flushGuardCheckins();
    if (flushed > 0) setState({ queued: await queuedCheckinCount() });
  }
  await maybeNotifyOvertime();
}

async function maybeNotifyOvertime() {
  const s = state.session;
  if (!s || state.overtimeNotified || overtimeInFlight) return;
  const plannedSec = Math.max(1, s.planned_duration_hours) * 3600;
  if (state.elapsedSec < plannedSec) {
    if (state.overtime) setState({ overtime: false });
    return;
  }
  setState({ overtime: true });
  overtimeInFlight = true;
  try {
    const res = await fetchApi<{
      data: { notified?: boolean; already?: boolean; message?: string };
    }>('/api/v1/guard/overtime', {
      method: 'POST',
      body: JSON.stringify({ session_id: s.id }),
    });
    setState({ overtimeNotified: true });
    if (!res.data?.already) {
      notifyError(
        '守护已超时',
        res.data?.message ||
          '已超过计划时长，已向紧急联系人模拟超时提醒（演示通知，非真短信）'
      );
    }
  } catch {
    // 下次打卡再试
  } finally {
    overtimeInFlight = false;
  }
}

function startTimers() {
  clearTimers();
  const s = state.session;
  if (!s) return;
  const startMs = new Date(s.started_at).getTime() || Date.now();
  const tick = () => {
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    setState({ elapsedSec });
    void maybeNotifyOvertime();
  };
  tick();
  tickTimer = setInterval(tick, 1000);
  void runCheckin();
  checkinTimer = setInterval(() => {
    void runCheckin();
  }, 20000);
  setState({ running: true, pausedByBackground: false });
}

function pauseTimers(reason: 'background') {
  clearTimers();
  setState({ running: false, pausedByBackground: reason === 'background' });
  if (reason === 'background' && state.session && !bgHintShown) {
    bgHintShown = true;
    notifyInfo(
      '守护打卡已暂停',
      '切后台/锁屏后无法持续定位（仅前台权限）。会话仍保留，回到 App 会自动恢复上报。'
    );
  }
}

function onAppState(next: AppStateStatus) {
  if (!state.session) return;
  if (next === 'active') {
    bgHintShown = false;
    void flushGuardCheckins().then(async () => {
      setState({ queued: await queuedCheckinCount() });
    });
    if (!state.running) startTimers();
  } else if (next === 'background' || next === 'inactive') {
    if (state.running) pauseTimers('background');
  }
}

/** 在根 Provider 调用一次 */
export function initGuardHeartbeat() {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener('change', onAppState);
}

export function subscribeGuardHeartbeat(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
}

export function getGuardHeartbeatState(): GuardHeartbeatState {
  return { ...state };
}

export function startGuardHeartbeat(session: GuardHeartbeatSession) {
  state = {
    ...state,
    session: {
      id: session.id,
      started_at: session.started_at,
      planned_duration_hours: session.planned_duration_hours || 8,
    },
    overtime: false,
    overtimeNotified: false,
    pausedByBackground: false,
  };
  bgHintShown = false;
  if (AppState.currentState === 'active') {
    startTimers();
  } else {
    pauseTimers('background');
  }
  emit();
}

export function stopGuardHeartbeat() {
  clearTimers();
  state = {
    session: null,
    running: false,
    pausedByBackground: false,
    elapsedSec: 0,
    checkinOk: true,
    queued: 0,
    overtime: false,
    overtimeNotified: false,
    lastLocation: null,
  };
  bgHintShown = false;
  emit();
}

/** 冷启动 / 登录后：若服务端仍有 active|sos 会话则恢复前台打卡 */
export async function resumeGuardHeartbeatIfNeeded(): Promise<boolean> {
  if (state.session) {
    if (AppState.currentState === 'active' && !state.running) {
      startTimers();
    }
    return true;
  }
  try {
    const res = await fetchApi<{
      data: {
        id: string;
        status: string;
        started_at: string;
        planned_duration_hours?: number;
        overtime_notified?: boolean;
        last_location?: GuardHeartbeatState['lastLocation'];
      } | null;
    }>('/api/v1/guard/status');
    const s = res.data;
    if (!s?.id || (s.status !== 'active' && s.status !== 'sos')) {
      return false;
    }
    if (s.last_location) {
      state = { ...state, lastLocation: s.last_location };
    }
    if (s.overtime_notified) {
      state = { ...state, overtimeNotified: true, overtime: true };
    }
    startGuardHeartbeat({
      id: s.id,
      started_at: s.started_at,
      planned_duration_hours: s.planned_duration_hours || 8,
    });
    return true;
  } catch {
    return false;
  }
}

export async function forceGuardCheckin() {
  await runCheckin();
}
