import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';
import { confirmDialog, notifyError, notifySuccess } from '@/utils/notify';
import { flushGuardCheckins, getBestPosition, isFreshFixTimestamp, queuedCheckinCount } from '@/utils/location';
import {
  forceGuardCheckin,
  startGuardHeartbeat,
  stopGuardHeartbeat,
  subscribeGuardHeartbeat,
} from '@/utils/guardHeartbeat';

type GuardStatus = 'idle' | 'active' | 'sos';

interface GuardSession {
  id: string;
  status: string;
  route_id?: string;
  trip_id?: string;
  started_at: string;
  planned_duration_hours: number;
  guardians: string[];
  contacts_ready?: boolean;
  overtime?: boolean;
  overtime_notified?: boolean;
  last_location: {
    lat: number;
    lng: number;
    timestamp: string;
    accuracy?: number;
  } | null;
}

interface ContactBrief {
  id: string;
  name: string;
  phone: string;
  is_primary: boolean;
}

export default function GuardScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ routeId: string; tripId?: string }>();
  const [status, setStatus] = useState<GuardStatus>('idle');
  const [session, setSession] = useState<GuardSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [contacts, setContacts] = useState<ContactBrief[]>([]);
  const [checkinOk, setCheckinOk] = useState(true);
  const [queued, setQueued] = useState(0);
  const [pausedByBackground, setPausedByBackground] = useState(false);
  const [overtime, setOvertime] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [signal, setSignal] = useState<{
    bars: number;
    dbm: number;
    technology: string;
    tip: string;
    accuracy_note?: string;
  } | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);

  const pulseAnim = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
    opacity: 0.3 + 0.7 * (2 - pulseAnim.value),
  }));

  useEffect(() => {
    return subscribeGuardHeartbeat((hb) => {
      setElapsed(hb.elapsedSec);
      setCheckinOk(hb.checkinOk);
      setQueued(hb.queued);
      setPausedByBackground(hb.pausedByBackground);
      setOvertime(hb.overtime);
      if (hb.lastLocation) {
        setSession((prev) =>
          prev ? { ...prev, last_location: hb.lastLocation } : prev
        );
      }
    });
  }, []);

  const refreshSignal = async () => {
    setSignalLoading(true);
    try {
      const res = await fetchApi<{
        data: {
          bars: number;
          dbm: number;
          technology: string;
          tip: string;
          accuracy_note?: string;
        };
      }>('/api/v1/tools/signal');
      setSignal(res.data);
    } catch {
      setSignal(null);
    } finally {
      setSignalLoading(false);
    }
  };

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetchApi<{ data: ContactBrief[] }>('/api/v1/me/contacts');
      setContacts(Array.isArray(res.data) ? res.data : []);
    } catch {
      setContacts([]);
    }
  }, []);

  const applySession = useCallback((s: GuardSession) => {
    setSession(s);
    setStatus(s.status === 'sos' ? 'sos' : 'active');
    setOvertime(!!s.overtime || !!s.overtime_notified);
    // SOS 态仍持续打卡，便于救援侧拿到最新位置
    startGuardHeartbeat({
      id: s.id,
      started_at: s.started_at,
      planned_duration_hours: s.planned_duration_hours || 8,
    });
  }, []);

  const restore = useCallback(async () => {
    setBootstrapping(true);
    try {
      await loadContacts();
      setQueued(await queuedCheckinCount());
      await flushGuardCheckins();
      const res = await fetchApi<{ data: GuardSession | null }>('/api/v1/guard/status');
      if (res.data?.id) {
        applySession({
          ...res.data,
          guardians: res.data.guardians || [],
          planned_duration_hours: res.data.planned_duration_hours || 8,
        });
      }
    } catch {
      // ignore
    } finally {
      setBootstrapping(false);
    }
  }, [applySession, loadContacts]);

  useFocusEffect(
    useCallback(() => {
      void restore();
      // 离屏不停止心跳：切跟线/其它页时继续前台打卡
      return undefined;
    }, [restore])
  );

  useEffect(() => {
    if (status === 'active') {
      pulseAnim.value = withRepeat(
        withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      refreshSignal();
      const sigTimer = setInterval(refreshSignal, 15000);
      return () => clearInterval(sigTimer);
    }
  }, [status]);

  const guardianLabel =
    (session?.guardians?.length ? session.guardians : contacts.map((c) => c.name)).join('、') ||
    '未设置联系人';

  const plannedHours = session?.planned_duration_hours || 8;

  const startGuard = async () => {
    if (contacts.length === 0) {
      confirmDialog('需要紧急联系人', '开启守护前请先在安全中心添加至少一位紧急联系人。', {
        confirmText: '去添加',
        onConfirm: () => router.push('/safety-center'),
      });
      return;
    }
    try {
      const pos = await getBestPosition();
      let planned = 8;
      try {
        const board = await fetchApi<{
          data: { current?: { planned_duration_hours?: number; route_id?: string } | null };
        }>('/api/v1/trips/board');
        const cur = board.data?.current;
        if (cur?.planned_duration_hours && cur.planned_duration_hours > 0) {
          planned = cur.planned_duration_hours;
        }
      } catch {
        // keep 8
      }
      const res = await fetchApi<{ data: GuardSession }>('/api/v1/guard/start', {
        method: 'POST',
        body: JSON.stringify({
          route_id: params.routeId || 'unknown',
          trip_id: params.tripId,
          planned_duration_hours: planned,
          guardians: contacts.map((c) => c.name),
          lat: pos?.lat,
          lng: pos?.lng,
          accuracy: pos?.accuracy,
        }),
      });
      applySession({
        ...res.data,
        guardians: res.data.guardians?.length ? res.data.guardians : contacts.map((c) => c.name),
      });
    } catch (e) {
      notifyError('启动失败', e instanceof Error ? e.message : '启动守护失败');
    }
  };

  const triggerSOS = () => {
    if (contacts.length === 0 && !(session?.guardians?.length)) {
      confirmDialog('无法求救', '请先添加紧急联系人', {
        confirmText: '去添加',
        onConfirm: () => router.push('/safety-center'),
      });
      return;
    }
    confirmDialog(
      'SOS 紧急求救',
      `确认记录求救？将向 ${guardianLabel} 发起通知流程（当前为演示：仅写日志，不真发短信/推送）。危急请拨打 110。`,
      {
        confirmText: '确认求救',
        destructive: true,
        onConfirm: async () => {
          if (!session) return;
          try {
            const pos = await getBestPosition();
            const cached =
              session.last_location &&
              isFreshFixTimestamp(session.last_location.timestamp)
                ? session.last_location
                : null;
            const lat = pos?.lat ?? cached?.lat;
            const lng = pos?.lng ?? cached?.lng;
            const locationAt = pos?.timestamp ?? cached?.timestamp;
            if (lat == null || lng == null || (lat === 0 && lng === 0)) {
              notifyError(
                '无法获取定位',
                '请开启定位后重试；危急请直接拨打 110'
              );
              return;
            }
            const res = await fetchApi<{
              data: { notify?: { message?: string }; contacts_notified?: { name: string }[] };
            }>('/api/v1/guard/sos', {
              method: 'POST',
              body: JSON.stringify({
                session_id: session.id,
                lat,
                lng,
                timestamp: locationAt,
                message: '紧急求救，请速来救援',
                channel: 'all',
              }),
            });
            setStatus('sos');
            const names = res.data?.contacts_notified?.map((c) => c.name).join('、');
            if (names) {
              notifySuccess(
                '已记录求救',
                `已向 ${names} 模拟通知（演示模式，非真短信/推送）；危急请拨打 110。前台将继续上报位置。`
              );
            }
          } catch (e) {
            notifyError(
              'SOS 发送失败',
              e instanceof Error ? e.message : '请尝试拨打 110，并检查紧急联系人'
            );
          }
        },
      }
    );
  };

  const stopGuard = async () => {
    if (!session) return;
    confirmDialog('结束守护', '确认结束本次守护？结束不会自动关闭行程。', {
      confirmText: '确认结束',
      onConfirm: async () => {
        try {
          await fetchApi('/api/v1/guard/stop', {
            method: 'POST',
            body: JSON.stringify({
              session_id: session.id,
              complete_trip: false,
            }),
          });
          stopGuardHeartbeat();
          setStatus('idle');
          setSession(null);
          setElapsed(0);
          setOvertime(false);
        } catch {
          notifyError('错误', '结束守护失败');
        }
      },
    });
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (bootstrapping) {
    return (
      <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2D6A4F" />
          <Text className="text-sm text-muted mt-3">同步守护状态…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <View style={{ paddingTop: insets.top + 8 }} className="px-5 pb-4">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
            <FontAwesome6 name="chevron-left" size={18} color="#3D3229" />
            <Text className="text-base font-semibold text-foreground ml-2">实时守护</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/safety-center')} hitSlop={8}>
            <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
              紧急联系人
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1 items-center justify-center px-5">
        {status === 'idle' && (
          <View className="items-center">
            <View
              className="w-32 h-32 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
            >
              <FontAwesome6 name="shield-halved" size={48} color="#2D6A4F" />
            </View>
            <Text className="text-xl font-bold text-foreground mb-2">开启实时守护</Text>
            <Text className="text-sm text-muted text-center mb-4 leading-6">
              开启后 App 在前台时约每 20 秒上报 GPS（切跟线页也会继续）。{'\n'}
              切后台/锁屏会暂停打卡但会话保留；回前台自动恢复。无网写入本地队列。
            </Text>
            <View
              className="w-full mb-6 px-4 py-3 rounded-2xl"
              style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
            >
              <Text className="text-xs font-semibold text-foreground mb-1">守护人</Text>
              <Text className="text-sm" style={{ color: contacts.length ? '#2D6A4F' : '#C44536' }}>
                {contacts.length
                  ? contacts.map((c) => `${c.name}${c.is_primary ? '（主）' : ''}`).join('、')
                  : '尚未添加 · 请先去安全中心设置'}
              </Text>
            </View>
            <TouchableOpacity onPress={startGuard} activeOpacity={0.85}>
              <LinearGradient
                colors={['#2D6A4F', '#52B788']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="rounded-2xl py-4 px-10 items-center"
              >
                <Text className="text-white text-lg font-bold">开始守护</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/tool', { id: 'signal' })}
              className="mt-4"
            >
              <Text className="text-sm font-semibold" style={{ color: '#2D6A4F' }}>
                先检测当前信号 →
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'active' && (
          <View className="items-center w-full">
            <View className="relative mb-8">
              <Animated.View
                className="absolute w-40 h-40 rounded-full"
                style={[
                  pulseStyle,
                  { backgroundColor: 'rgba(82,183,136,0.2)', top: -20, left: -20 },
                ]}
              />
              <View
                className="w-24 h-24 rounded-full items-center justify-center"
                style={{ backgroundColor: '#52B788' }}
              >
                <FontAwesome6 name="shield-halved" size={36} color="#fff" />
              </View>
            </View>

            <Text className="text-lg font-bold mb-1" style={{ color: overtime ? '#C44536' : '#2D6A4F' }}>
              {overtime ? '已超时 · 仍在守护' : pausedByBackground ? '守护暂停（后台）' : '守护中'}
            </Text>
            <Text
              className="text-3xl font-bold text-foreground mb-2"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatTime(elapsed)}
            </Text>
            <Text className="text-xs mb-3" style={{ color: checkinOk ? '#52B788' : '#C44536' }}>
              {pausedByBackground
                ? '已切后台，定位上报暂停 · 回 App 后继续'
                : checkinOk
                  ? queued > 0
                    ? `定位正常 · 本地待传 ${queued} 条（回网后重试）`
                    : 'GPS 上报正常（前台）'
                  : queued > 0
                    ? `离线本地排队 ${queued} 条 · 回网后手动点「立即上报」或自动重试`
                    : '定位失败，将重试'}
            </Text>
            {overtime ? (
              <Text className="text-xs mb-4 text-center px-2" style={{ color: '#C44536', lineHeight: 17 }}>
                已超过计划 {plannedHours} 小时，已向紧急联系人模拟超时提醒（演示通知）。
              </Text>
            ) : null}

            <View
              className="w-full bg-surface rounded-3xl p-5 mb-4"
              style={{
                borderTopLeftRadius: 32,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 32,
                shadowColor: '#3D3229',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.08,
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <View className="flex-row items-center gap-3 mb-4">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                >
                  <FontAwesome6 name="location-dot" size={16} color="#2D6A4F" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">最后位置</Text>
                  <Text className="text-xs text-muted mt-0.5">
                    {session?.last_location &&
                    typeof session.last_location.lat === 'number' &&
                    typeof session.last_location.lng === 'number'
                      ? `${session.last_location.lat.toFixed(5)}, ${session.last_location.lng.toFixed(5)}`
                      : '等待首次 GPS 上报…'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => void forceGuardCheckin()} hitSlop={8}>
                  <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                    立即上报
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row items-center gap-3 mb-4">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                >
                  <FontAwesome6 name="users" size={16} color="#2D6A4F" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">守护人</Text>
                  <Text className="text-xs text-muted mt-0.5">{guardianLabel}</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-3 mb-4">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                >
                  <FontAwesome6 name="clock" size={16} color="#2D6A4F" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">计划时长</Text>
                  <Text className="text-xs text-muted mt-0.5">
                    {plannedHours} 小时
                    {overtime ? ' · 已超时并已提醒联系人' : ` · 超时将模拟通知 ${guardianLabel}`}
                  </Text>
                </View>
              </View>

              <View className="pt-3" style={{ borderTopWidth: 1, borderTopColor: '#F1EBE0' }}>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-semibold text-foreground">信号检测</Text>
                  <TouchableOpacity onPress={refreshSignal} disabled={signalLoading}>
                    <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                      {signalLoading ? '检测中…' : '刷新'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text className="text-[11px] mb-1.5" style={{ color: '#8B6914' }}>
                  演示数据 · 非真实基站测量
                </Text>
                {signal ? (
                  <>
                    <View className="flex-row items-end gap-1 mb-1.5">
                      {[1, 2, 3, 4].map((b) => (
                        <View
                          key={b}
                          style={{
                            width: 10,
                            height: 8 + b * 5,
                            borderRadius: 2,
                            backgroundColor:
                              signal.bars >= b ? '#2D6A4F' : 'rgba(61,50,41,0.12)',
                          }}
                        />
                      ))}
                      <Text className="text-xs text-muted ml-2">
                        {signal.technology} · {signal.dbm} dBm
                      </Text>
                    </View>
                    <Text className="text-xs text-muted" style={{ lineHeight: 17 }}>
                      {signal.tip}
                      {signal.accuracy_note ? ` · ${signal.accuracy_note}` : ''}
                    </Text>
                  </>
                ) : (
                  <Text className="text-xs text-muted">暂无信号采样</Text>
                )}
              </View>
            </View>

            <TouchableOpacity onPress={triggerSOS} className="w-full mb-3" activeOpacity={0.85}>
              <View
                className="rounded-2xl py-4 items-center"
                style={{
                  backgroundColor: '#C44536',
                  shadowColor: '#C44536',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  elevation: 6,
                }}
              >
                <View className="flex-row items-center">
                  <FontAwesome6 name="triangle-exclamation" size={18} color="#fff" />
                  <Text className="text-white text-lg font-bold ml-2">SOS 紧急求救</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={stopGuard} className="w-full">
              <View
                className="rounded-2xl py-3 items-center"
                style={{ backgroundColor: 'rgba(61,50,41,0.08)' }}
              >
                <Text className="text-muted text-sm font-medium">结束守护</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {status === 'sos' && (
          <View className="items-center">
            <View
              className="w-32 h-32 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: 'rgba(196,69,54,0.1)' }}
            >
              <FontAwesome6 name="triangle-exclamation" size={48} color="#C44536" />
            </View>
            <Text className="text-xl font-bold mb-2" style={{ color: '#C44536' }}>
              SOS 已发送
            </Text>
            <Text className="text-sm text-muted text-center mb-8 leading-6">
              已向 {guardianLabel} 模拟发送位置（演示通知）。{'\n'}
              前台将继续定位打卡以便更新位置；危急请拨打 110。
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <View
                className="rounded-2xl py-4 px-10 items-center"
                style={{ backgroundColor: '#3D3229' }}
              >
                <Text className="text-white text-base font-bold">返回</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Screen>
  );
}
