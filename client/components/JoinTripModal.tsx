import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs, { type Dayjs } from 'dayjs';
import Toast from 'react-native-toast-message';
import { fetchApi } from '@/utils/api';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { stopGuardHeartbeat } from '@/utils/guardHeartbeat';
import {
  PHONE_FRAME_BREAKPOINT,
  PHONE_WIDTH,
} from '@/components/MobileShell';

function defaultDeparture(): Dayjs {
  return dayjs().add(1, 'day').hour(7).minute(0).second(0).millisecond(0);
}

type CurrentTripBrief = {
  id: string;
  route_id: string;
  route_name?: string;
  status: string;
};

type Step = 'pick' | 'replace' | 'done';

const TIME_PRESETS = [
  '05:30',
  '06:00',
  '06:30',
  '07:00',
  '07:30',
  '08:00',
  '08:30',
  '09:00',
  '10:00',
  '14:00',
  '16:00',
];

function buildDayOptions(count = 14) {
  const start = dayjs().startOf('day');
  return Array.from({ length: count }, (_, i) => {
    const d = start.add(i, 'day');
    let label = d.format('M/D');
    if (i === 0) label = '今天';
    else if (i === 1) label = '明天';
    else if (i === 2) label = '后天';
    return {
      key: d.format('YYYY-MM-DD'),
      day: d,
      label,
      week: '日一二三四五六'[d.day()],
    };
  });
}

export function JoinTripModal({
  visible,
  routeId,
  routeName,
  onClose,
  onJoined,
}: {
  visible: boolean;
  routeId: string | null;
  routeName?: string | null;
  onClose: () => void;
  onJoined?: (trip: { id: string; route_id: string; departure_at: string }) => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { width: winW } = useWindowDimensions();
  const phoneFramed = Platform.OS === 'web' && winW >= PHONE_FRAME_BREAKPOINT;

  const [departure, setDeparture] = useState<Dayjs>(defaultDeparture);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<CurrentTripBrief | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [step, setStep] = useState<Step>('pick');
  const [joined, setJoined] = useState<{
    id: string;
    route_id: string;
    departure_at: string;
  } | null>(null);
  const [showNativePicker, setShowNativePicker] = useState(false);
  const [nativeMode, setNativeMode] = useState<'date' | 'time'>('date');

  const dayOptions = useMemo(() => buildDayOptions(14), [visible]);
  const selectedDayKey = departure.format('YYYY-MM-DD');
  const selectedTime = departure.format('HH:mm');

  const willReplace = !!existing && !!routeId && existing.route_id !== routeId;

  useEffect(() => {
    if (!visible) return;
    setDeparture(defaultDeparture());
    setSubmitting(false);
    setExisting(null);
    setStep('pick');
    setJoined(null);
    setShowNativePicker(false);

    let cancelled = false;
    (async () => {
      setLoadingCurrent(true);
      try {
        const res = await fetchApi<{ data: CurrentTripBrief | null }>('/api/v1/trips/current');
        if (!cancelled) setExisting(res.data ?? null);
      } catch {
        if (!cancelled) setExisting(null);
      } finally {
        if (!cancelled) setLoadingCurrent(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, routeId]);

  const setDay = (d: Dayjs) => {
    setDeparture((prev) =>
      d.hour(prev.hour()).minute(prev.minute()).second(0).millisecond(0)
    );
  };

  const setTime = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map((n) => Number(n));
    setDeparture((prev) => prev.hour(h).minute(m).second(0).millisecond(0));
  };

  const createTrip = async () => {
    if (!routeId) return;
    const iso = departure.toISOString();
    if (departure.isBefore(dayjs().subtract(1, 'minute'))) {
      Toast.show({
        type: 'error',
        text1: '出发时间无效',
        text2: '预计出发时间不能早于现在',
      });
      setStep('pick');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchApi<{
        data: { id: string; route_id: string; departure_at: string };
      }>('/api/v1/trips', {
        method: 'POST',
        body: JSON.stringify({
          route_id: routeId,
          departure_at: iso,
        }),
      });
      setJoined(res.data);
      setStep('done');
      // 换行程后端会结束旧 active/sos；客户端心跳也要停，避免旧会话悬空上报
      stopGuardHeartbeat();
      onJoined?.(res.data);
      Toast.show({
        type: 'success',
        text1: '已加入行程',
        text2: `${routeName || '路线'} · ${departure.format('M月D日 HH:mm')}`,
      });
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: '加入失败',
        text2: e instanceof Error ? e.message : '请稍后重试',
      });
      setStep('pick');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (!routeId || submitting) return;

    let current = existing;
    try {
      const res = await fetchApi<{ data: CurrentTripBrief | null }>('/api/v1/trips/current');
      current = res.data ?? null;
      setExisting(current);
    } catch {
      // keep cached
    }

    if (current && current.route_id !== routeId) {
      setStep('replace');
      return;
    }
    await createTrip();
  };

  const onNativeChange = (_: unknown, date?: Date) => {
    if (Platform.OS === 'android') setShowNativePicker(false);
    if (!date) return;
    const next = dayjs(date);
    if (nativeMode === 'date') {
      setDeparture((prev) =>
        next.hour(prev.hour()).minute(prev.minute()).second(0).millisecond(0)
      );
    } else {
      setDeparture((prev) =>
        prev.hour(next.hour()).minute(next.minute()).second(0).millisecond(0)
      );
    }
  };

  const sheetMaxH = phoneFramed ? 520 : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        className="flex-1 justify-end"
        style={{
          backgroundColor: 'rgba(0,0,0,0.45)',
          ...(phoneFramed
            ? {
                // Web 手机框内居中叠层，避免弹层铺满桌面
                alignItems: 'center' as const,
              }
            : null),
        }}
      >
        <TouchableOpacity
          style={{ flex: 1, alignSelf: 'stretch' }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          className="bg-background pt-3"
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: Math.max(insets.bottom, 16),
            width: phoneFramed ? PHONE_WIDTH : '100%',
            maxHeight: sheetMaxH,
            maxWidth: phoneFramed ? PHONE_WIDTH : undefined,
          }}
        >
          <View className="items-center mb-2">
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(61,50,41,0.15)',
              }}
            />
          </View>

          <View className="flex-row items-center justify-between px-5 mb-2">
            <Text className="text-lg font-bold text-foreground">
              {step === 'replace' ? '替换行程？' : step === 'done' ? '已加入' : '加入行程'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} className="w-9 h-9 items-center justify-center">
              <FontAwesome6 name="xmark" size={18} color="#8B7D6B" />
            </TouchableOpacity>
          </View>

          {step === 'pick' ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
            >
              {willReplace ? (
                <View
                  className="mb-3 px-3 py-2.5 rounded-2xl"
                  style={{ backgroundColor: 'rgba(196,69,54,0.1)' }}
                >
                  <Text className="text-xs font-semibold" style={{ color: '#C44536', lineHeight: 18 }}>
                    已有计划「{existing?.route_name || '当前路线'}」。确认后将替换该计划。
                  </Text>
                </View>
              ) : null}

              <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
                {routeName
                  ? existing && existing.route_id === routeId
                    ? `「${routeName}」已在计划中，可更新预计出发时间。`
                    : `将「${routeName}」设为当前唯一计划，请选择出发日期与时间。`
                  : '请选择预计出发日期与时间。'}
              </Text>

              <Text className="text-sm font-bold text-foreground mb-2">出发日期</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              >
                {dayOptions.map((d) => {
                  const active = d.key === selectedDayKey;
                  return (
                    <TouchableOpacity
                      key={d.key}
                      onPress={() => setDay(d.day)}
                      className="items-center justify-center"
                      style={{
                        width: 56,
                        paddingVertical: 10,
                        borderRadius: 14,
                        backgroundColor: active ? '#2D6A4F' : 'rgba(61,50,41,0.06)',
                      }}
                      activeOpacity={0.85}
                    >
                      <Text
                        className="text-[10px] mb-0.5"
                        style={{ color: active ? 'rgba(255,255,255,0.75)' : '#8B7D6B' }}
                      >
                        周{d.week}
                      </Text>
                      <Text
                        className="text-sm font-bold"
                        style={{ color: active ? '#fff' : '#3D3229' }}
                      >
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View className="flex-row items-center justify-between mt-4 mb-2">
                <Text className="text-sm font-bold text-foreground">出发时间</Text>
                {Platform.OS !== 'web' ? (
                  <TouchableOpacity
                    onPress={() => {
                      setNativeMode('time');
                      setShowNativePicker(true);
                    }}
                    hitSlop={8}
                  >
                    <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                      精确选择
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {TIME_PRESETS.map((t) => {
                  const active = selectedTime === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setTime(t)}
                      className="px-3 py-2 rounded-full"
                      style={{
                        backgroundColor: active ? '#2D6A4F' : 'rgba(45,106,79,0.1)',
                        minWidth: 64,
                        alignItems: 'center',
                      }}
                      activeOpacity={0.85}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: active ? '#fff' : '#2D6A4F' }}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View
                className="flex-row items-center px-3 py-3 rounded-2xl mb-4"
                style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
              >
                <FontAwesome6 name="clock" size={14} color="#2D6A4F" />
                <Text className="text-sm font-bold ml-2" style={{ color: '#2D6A4F' }}>
                  {departure.format('M月D日')} 周{'日一二三四五六'[departure.day()]}{' '}
                  {departure.format('HH:mm')}
                </Text>
              </View>

              {Platform.OS !== 'web' && showNativePicker ? (
                <View className="mb-3 rounded-2xl overflow-hidden bg-surface">
                  <DateTimePicker
                    value={departure.toDate()}
                    mode={nativeMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    locale="zh-CN"
                    onChange={onNativeChange}
                    minimumDate={new Date()}
                  />
                  {Platform.OS === 'ios' ? (
                    <TouchableOpacity
                      onPress={() => setShowNativePicker(false)}
                      className="py-2.5 items-center"
                      style={{ borderTopWidth: 1, borderTopColor: '#F1EBE0' }}
                    >
                      <Text className="text-sm font-semibold" style={{ color: '#2D6A4F' }}>
                        完成
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              <TouchableOpacity
                onPress={submit}
                disabled={submitting || !routeId || loadingCurrent}
                className="py-3.5 rounded-2xl items-center"
                style={{
                  backgroundColor:
                    submitting || !routeId || loadingCurrent
                      ? 'rgba(45,106,79,0.35)'
                      : willReplace
                        ? '#C44536'
                        : '#2D6A4F',
                }}
                activeOpacity={0.85}
              >
                {submitting || loadingCurrent ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-sm">
                    {willReplace
                      ? '继续 · 将替换现有计划'
                      : existing && existing.route_id === routeId
                        ? '更新出发时间'
                        : '确认加入行程'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : null}

          {step === 'replace' ? (
            <View className="px-5 pb-1">
              <Text className="text-sm text-muted mb-4" style={{ lineHeight: 20 }}>
                行程中已有「{existing?.route_name || '当前计划'}」。确认后将关闭该计划并替换为「
                {routeName || '新路线'}」，原准备清单与进度会消失。
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setStep('pick')}
                  className="flex-1 py-3.5 rounded-2xl items-center"
                  style={{ backgroundColor: 'rgba(61,50,41,0.08)' }}
                >
                  <Text className="text-sm font-semibold text-foreground">返回修改</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void createTrip()}
                  disabled={submitting}
                  className="flex-1 py-3.5 rounded-2xl items-center"
                  style={{ backgroundColor: '#C44536' }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white text-sm font-bold">确认替换</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {step === 'done' && joined ? (
            <View className="px-5 pb-1">
              <View
                className="items-center py-4 mb-3 rounded-2xl"
                style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
              >
                <View
                  className="w-12 h-12 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(45,106,79,0.15)' }}
                >
                  <FontAwesome6 name="circle-check" size={22} color="#2D6A4F" />
                </View>
                <Text className="text-base font-bold text-foreground">
                  {routeName || '路线'} 已加入
                </Text>
                <Text className="text-xs text-muted mt-1">
                  预计出发 {dayjs(joined.departure_at).format('M月D日 HH:mm')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/checklist', {
                    routeId: joined.route_id,
                    tripId: joined.id,
                  });
                }}
                className="py-3.5 rounded-2xl items-center mb-2"
                style={{ backgroundColor: '#2D6A4F' }}
                activeOpacity={0.85}
              >
                <Text className="text-white font-bold text-sm">去准备清单</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/(tabs)/trip');
                }}
                className="py-3 rounded-2xl items-center mb-1"
                style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
                activeOpacity={0.85}
              >
                <Text className="text-sm font-semibold" style={{ color: '#2D6A4F' }}>
                  去行程中心
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} className="py-2.5 items-center" hitSlop={6}>
                <Text className="text-xs text-muted">稍后</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
