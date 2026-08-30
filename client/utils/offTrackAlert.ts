import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type OffTrackLevel = 'ok' | 'warn' | 'danger';

const WARN_M = 25;
const DANGER_M = 45;
const CORRIDOR_M = 30;

export function evaluateOffset(offsetM: number): {
  level: OffTrackLevel;
  offset_m: number;
  abs_m: number;
  corridor_m: number;
  message: string;
  voice: string;
} {
  const abs = Math.abs(offsetM);
  const side = offsetM > 0 ? '右侧' : '左侧';
  if (abs >= DANGER_M) {
    return {
      level: 'danger',
      offset_m: Math.round(offsetM),
      abs_m: Math.round(abs),
      corridor_m: CORRIDOR_M,
      message: `已严重偏离示意轨迹约 ${Math.round(abs)} 米（偏${side}），请立即返回示意走廊`,
      voice: `注意，您已偏离示意轨迹约 ${Math.round(abs)} 米，请立即返回`,
    };
  }
  if (abs >= WARN_M) {
    return {
      level: 'warn',
      offset_m: Math.round(offsetM),
      abs_m: Math.round(abs),
      corridor_m: CORRIDOR_M,
      message: `即将偏离示意轨迹（偏${side}约 ${Math.round(abs)} 米），请调整方向`,
      voice: `提醒，您正在偏离示意轨迹，请调整方向返回`,
    };
  }
  return {
    level: 'ok',
    offset_m: Math.round(offsetM),
    abs_m: Math.round(abs),
    corridor_m: CORRIDOR_M,
    message: '当前在示意轨迹走廊内',
    voice: '',
  };
}

export async function vibrateOffTrack(level: OffTrackLevel) {
  if (level === 'ok') return;
  try {
    if (level === 'danger') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  } catch {
    // web / 不支持时忽略
  }
}

function speakWeb(text: string) {
  if (typeof globalThis === 'undefined') return false;
  const g = globalThis as typeof globalThis & {
    speechSynthesis?: {
      cancel: () => void;
      speak: (u: unknown) => void;
    };
    SpeechSynthesisUtterance?: new (t: string) => {
      lang: string;
      rate: number;
    };
  };
  if (!g.speechSynthesis || !g.SpeechSynthesisUtterance) return false;
  g.speechSynthesis.cancel();
  const u = new g.SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.95;
  g.speechSynthesis.speak(u);
  return true;
}

/** 语音播报：原生优先 expo-speech，Web 用 speechSynthesis */
export async function speakOffTrack(text: string) {
  if (!text) return;

  try {
    if (Platform.OS !== 'web') {
      try {
        const Speech = await import('expo-speech');
        Speech.stop();
        Speech.speak(text, { language: 'zh-CN', rate: 0.95 });
        return;
      } catch {
        // 未安装 expo-speech 时回退
      }
    }
    speakWeb(text);
  } catch {
    // 无语音引擎时仅依赖震动与界面提示
  }
}

export async function alertOffTrack(level: OffTrackLevel, voice: string) {
  await vibrateOffTrack(level);
  if (level !== 'ok') {
    await speakOffTrack(voice);
  }
}

export { WARN_M, DANGER_M, CORRIDOR_M };
