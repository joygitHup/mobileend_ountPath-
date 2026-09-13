import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { JoinTripModal } from '@/components/JoinTripModal';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';
import { confirmDialog, notifyError, notifyInfo, notifySuccess } from '@/utils/notify';
import {
  checkDepartureReminds,
  syncDepartureRemind,
} from '@/utils/departureRemind';
import { stopGuardHeartbeat } from '@/utils/guardHeartbeat';
import dayjs from 'dayjs';

interface GapItem {
  id: string;
  name: string;
  description: string;
}

interface TrackAccess {
  allowed: boolean;
  via: 'guard' | 'disclaimer' | null;
  message: string;
}

interface CurrentTrip {
  id: string;
  status: 'planned' | 'active' | 'completed';
  route_id: string;
  route_name: string;
  location: string;
  image_url?: string;
  distance: number;
  elevation_gain: number;
  estimated_duration: string;
  departure_at: string;
  departure_label: string;
  planned_duration_hours: number;
  guardians: string[];
  decision_summary: string;
  risk_level: string;
  key_checkpoint: string | null;
  progress: {
    essential_total: number;
    essential_done: number;
    total: number;
    done: number;
    essential_ready: boolean;
    gaps: GapItem[];
  };
  guard_active: boolean;
  disclaimer_accepted: boolean;
  disclaimer_accepted_at: string | null;
  track_access: TrackAccess;
  next_action: { key: string; label: string; hint: string };
  weather_summary: string;
}

interface FavoriteItem {
  id: string;
  name: string;
  location: string;
  distance: number;
  elevation_gain: number;
  estimated_duration: string;
  difficulty: string;
  image_url: string;
  match_score: number;
  decision_summary: string;
  favorited: boolean;
}

interface TripBoard {
  safety_tip: string;
  weather: {
    condition: string;
    temp_c: number;
    wind?: string;
    suitable_label: string;
    advice: string;
    is_fallback?: boolean;
    source?: string;
  };
  disclaimer_text?: string;
  current: CurrentTrip | null;
  favorites?: FavoriteItem[];
  history?: {
    id: string;
    route_id: string;
    route_name: string;
    distance_km: number;
    elevation_gain_m: number;
    duration_hours: number;
    completed_at: string;
    completed_label: string;
  }[];
  guardians?: string[];
  contacts_ready?: boolean;
}

export default function TripScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const [board, setBoard] = useState<TripBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gateVisible, setGateVisible] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [joinRoute, setJoinRoute] = useState<{ id: string; name: string } | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetchApi<{ data: TripBoard }>('/api/v1/trips/board');
      setBoard(res.data);
      const cur = res.data?.current;
      if (cur?.departure_at) {
        // 拉取安全设置以同步本地提醒；失败则用默认窗口
        let hours = 12;
        let rw = true;
        let rc = true;
        let rr = true;
        try {
          const safety = await fetchApi<{
            data: {
              settings?: {
                departure_remind_hours?: number;
                remind_weather?: boolean;
                remind_checklist?: boolean;
                remind_route_risk?: boolean;
              };
            };
          }>('/api/v1/me/safety');
          hours = safety.data?.settings?.departure_remind_hours ?? 12;
          rw = safety.data?.settings?.remind_weather ?? true;
          rc = safety.data?.settings?.remind_checklist ?? true;
          rr = safety.data?.settings?.remind_route_risk ?? true;
        } catch {
          // keep defaults
        }
        await syncDepartureRemind({
          tripId: cur.id,
          routeId: cur.route_id,
          routeName: cur.route_name || '',
          departureAt: cur.departure_at,
          hoursBefore: hours,
          remindWeather: rw,
          remindChecklist: rc,
          remindRouteRisk: rr,
        });
        await checkDepartureReminds();
      } else {
        await syncDepartureRemind(null);
      }
    } catch (e) {
      setBoard(null);
      setLoadError(e instanceof Error ? e.message : '加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBoard();
      setGateVisible(false);
      setAgreed(false);
    }, [loadBoard])
  );

  const current = board?.current;

  const enterTrack = () => {
    if (!current) return;
    router.push('/track', {
      routeId: current.route_id,
      tripId: current.id,
      // 仅已有守护时附带 session；跟线本身要求已开守护
      withGuard: !!current.guard_active,
    });
  };

  /** 示意跟线：仅已开守护可进；否则弹出闸门引导开守护 */
  const requestUseTrack = () => {
    if (!current) return;
    if (current.guard_active && current.track_access?.allowed) {
      enterTrack();
      return;
    }
    setAgreed(false);
    setGateVisible(true);
  };

  const openGuard = () => {
    if (!current) return;
    setGateVisible(false);
    router.push('/guard', {
      routeId: current.route_id,
      tripId: current.id,
    });
  };

  const ackAndOpenGuard = async () => {
    if (!current || !agreed || signing) return;
    setSigning(true);
    try {
      // 免责仅作确认记录，不授予无守护跟线权
      await fetchApi(`/api/v1/trips/${current.id}/disclaimer`, { method: 'POST' });
      setGateVisible(false);
      router.push('/guard', {
        routeId: current.route_id,
        tripId: current.id,
      });
    } catch (e) {
      notifyError('确认失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSigning(false);
    }
  };

  const runNextAction = () => {
    if (!current) return;
    if (current.next_action.key === 'checklist') {
      router.push('/checklist', { routeId: current.route_id, tripId: current.id });
      return;
    }
    if (
      current.next_action.key === 'track' ||
      current.next_action.key === 'track_gate'
    ) {
      requestUseTrack();
      return;
    }
    openGuard();
  };

  const endTrip = () => {
    if (!current) return;
    const finish = async (abandoned: boolean) => {
      try {
        const res = await fetchApi<{
          data: {
            stats?: {
              added_distance_km?: number;
              added_elevation_m?: number;
              total_distance_km?: number;
              total_trips?: number;
              total_elevation_gain?: number;
            };
          };
        }>(`/api/v1/trips/${current.id}/complete`, {
          method: 'POST',
          body: JSON.stringify({ abandoned }),
        });
        stopGuardHeartbeat();
        await loadBoard();
        if (abandoned) {
          notifyInfo('已取消', '未计入个人里程');
          return;
        }
        const s = res.data?.stats;
        const tip = s
          ? `+${s.added_distance_km ?? 0}km / +${s.added_elevation_m ?? 0}m · 累计 ${s.total_distance_km ?? 0}km`
          : '行程相关数据已清除';
        notifySuccess('已计入个人统计', tip);
      } catch (e) {
        notifyError(abandoned ? '操作失败' : '结束失败', e instanceof Error ? e.message : '请稍后重试');
      }
    };

    confirmDialog(
      '结束行程',
      '结束后将清除当前行程进度。是否继续？',
      {
        confirmText: '继续',
        onConfirm: () => {
          confirmDialog(
            '计入个人统计？',
            '计入将把路线里程/爬升写入「我的」；选不计入则仅放弃行程。',
            {
              confirmText: '结束并计入',
              cancelText: '仅放弃（不计入）',
              onConfirm: () => void finish(false),
              onCancel: () => void finish(true),
            }
          );
        },
      }
    );
  };

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: insets.top + 16 }} className="px-5 pb-3">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-2xl font-bold text-foreground">行程中心</Text>
              <Text className="text-sm text-muted mt-1">同时仅一条计划中行程</Text>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => router.push('/tool', { id: 'altimeter' })}
                className="items-center justify-center"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: 'rgba(45,106,79,0.1)',
                }}
                activeOpacity={0.8}
              >
                <FontAwesome6 name="mountain" size={16} color="#2D6A4F" />
                <Text className="text-xs mt-0.5" style={{ color: '#2D6A4F', fontSize: 10 }}>
                  海拔
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/tool', { id: 'compass' })}
                className="items-center justify-center"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: 'rgba(45,106,79,0.1)',
                }}
                activeOpacity={0.8}
              >
                <FontAwesome6 name="compass" size={16} color="#2D6A4F" />
                <Text className="text-xs mt-0.5" style={{ color: '#2D6A4F', fontSize: 10 }}>
                  指南针
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {loading ? (
          <View className="py-24 items-center">
            <ActivityIndicator size="large" color="#2D6A4F" />
            <Text className="text-muted text-sm mt-3">加载行程作战板…</Text>
          </View>
        ) : loadError ? (
          <View className="py-20 items-center px-6">
            <FontAwesome6 name="cloud-bolt" size={28} color="#8B7D6B" />
            <Text className="text-foreground font-semibold mt-3">行程加载失败</Text>
            <Text className="text-muted text-sm text-center mt-2" style={{ lineHeight: 20 }}>
              {loadError}
            </Text>
            <TouchableOpacity
              onPress={() => void loadBoard()}
              className="mt-5 px-5 py-3 rounded-2xl"
              style={{ backgroundColor: '#2D6A4F' }}
              activeOpacity={0.85}
            >
              <Text className="text-white font-semibold">重试</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="px-5">
            {/* Safety tip */}
            <View
              className="mb-3 px-4 py-3 flex-row items-start gap-2"
              style={{
                backgroundColor: 'rgba(45,106,79,0.08)',
                borderTopLeftRadius: 18,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 18,
              }}
            >
              <FontAwesome6 name="circle-info" size={14} color="#2D6A4F" style={{ marginTop: 2 }} />
              <Text className="text-xs flex-1" style={{ color: '#3D6B4F', lineHeight: 18 }}>
                {board?.safety_tip || '出发前确认天气与必带装备'}
              </Text>
            </View>

            {/* Weather card */}
            {board?.weather ? (
              <View
                className="mb-4 px-4 py-3.5 bg-surface"
                style={{
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 20,
                  borderWidth: 1,
                  borderColor: '#F1EBE0',
                }}
              >
                <View className="flex-row items-center justify-between mb-1.5">
                  <View className="flex-row items-center gap-2">
                    <FontAwesome6 name="cloud-sun" size={16} color="#2D6A4F" />
                    <Text className="text-sm font-bold text-foreground">出行天气</Text>
                  </View>
                  <View
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
                  >
                    <Text className="text-[11px] font-semibold" style={{ color: '#2D6A4F' }}>
                      {board.weather.suitable_label}
                      {board.weather.is_fallback ? ' · 示意' : ''}
                    </Text>
                  </View>
                </View>
                <Text className="text-base font-bold text-foreground">
                  {board.weather.condition} · {board.weather.temp_c}°C
                  {board.weather.wind ? ` · ${board.weather.wind}` : ''}
                </Text>
                <Text className="text-xs text-muted mt-1.5" style={{ lineHeight: 17 }}>
                  {board.weather.advice}
                  {board.weather.is_fallback ? '（离线示意天气，非实况）' : ''}
                </Text>
                {!board.contacts_ready ? (
                  <TouchableOpacity
                    onPress={() => router.push('/safety-center')}
                    className="mt-2.5 flex-row items-center"
                  >
                    <FontAwesome6 name="user-plus" size={11} color="#C44536" />
                    <Text className="text-xs ml-1.5 font-semibold" style={{ color: '#C44536' }}>
                      行前设置：去安全中心添加紧急联系人
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {!current ? (
              <EmptyTrip
                onDiscover={() => router.push('/(tabs)/')}
              />
            ) : (
              <>
                {/* Current trip card */}
                <View
                  className="bg-surface mb-4 overflow-hidden"
                  style={{
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 10,
                    borderBottomLeftRadius: 10,
                    borderBottomRightRadius: 28,
                    shadowColor: '#3D3229',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                    elevation: 3,
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => router.push('/route-detail', { id: current.route_id })}
                  >
                    {current.image_url ? (
                      <Image
                        source={{ uri: current.image_url }}
                        style={{ width: '100%', height: 140 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View className="h-28 items-center justify-center" style={{ backgroundColor: '#F1EBE0' }}>
                        <FontAwesome6 name="mountain" size={32} color="#2D6A4F" />
                      </View>
                    )}
                  </TouchableOpacity>

                  <View className="p-4">
                    <View className="flex-row items-center gap-2 mb-2">
                      <View
                        className="px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: current.guard_active
                            ? 'rgba(82,183,136,0.18)'
                            : 'rgba(45,106,79,0.1)',
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{
                            color: current.guard_active ? '#2D6A4F' : '#8B7D6B',
                          }}
                        >
                          {current.guard_active ? '守护中' : '计划中'}
                        </Text>
                      </View>
                      <Text className="text-xs text-muted">{current.departure_label}</Text>
                    </View>

                    <Text className="text-xl font-bold text-foreground mb-1">
                      {current.route_name}
                    </Text>
                    <Text className="text-xs text-muted mb-2">{current.location}</Text>
                    {!!current.decision_summary && (
                      <Text className="text-sm mb-3" style={{ color: '#2D6A4F', lineHeight: 20 }}>
                        {current.decision_summary}
                      </Text>
                    )}

                    <View className="flex-row flex-wrap gap-3 mb-3">
                      <Meta icon="route" text={`${current.distance}km`} />
                      <Meta icon="mountain" text={`${current.elevation_gain}m↑`} />
                      <Meta icon="clock" text={current.estimated_duration} />
                    </View>

                    <Text className="text-xs text-muted mb-1">{current.weather_summary}</Text>
                    {current.key_checkpoint ? (
                      <View className="flex-row items-center gap-1.5 mb-3">
                        <FontAwesome6 name="flag" size={11} color="#8B7D6B" />
                        <Text className="text-xs text-muted">关注 · {current.key_checkpoint}</Text>
                      </View>
                    ) : (
                      <View className="mb-2" />
                    )}

                    {/* Progress */}
                    <View className="mb-1 flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-foreground">准备进度</Text>
                      <Text className="text-sm font-bold" style={{ color: '#2D6A4F' }}>
                        必带 {current.progress.essential_done}/{current.progress.essential_total}
                      </Text>
                    </View>
                    <View className="h-2.5 rounded-full overflow-hidden mb-3" style={{ backgroundColor: '#F1EBE0' }}>
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${
                            current.progress.essential_total
                              ? (current.progress.essential_done / current.progress.essential_total) * 100
                              : 0
                          }%`,
                          backgroundColor: current.progress.essential_ready ? '#52B788' : '#2D6A4F',
                        }}
                      />
                    </View>

                    <TouchableOpacity onPress={runNextAction} activeOpacity={0.85}>
                      <LinearGradient
                        colors={
                          current.track_access?.allowed
                            ? ['#52B788', '#2D6A4F']
                            : ['#2D6A4F', '#52B788']
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          borderTopLeftRadius: 20,
                          borderTopRightRadius: 8,
                          borderBottomLeftRadius: 8,
                          borderBottomRightRadius: 20,
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                        }}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 pr-3">
                            <Text className="text-white text-base font-bold">
                              {current.next_action.label}
                            </Text>
                            <Text className="text-white/80 text-xs mt-0.5">
                              {current.next_action.hint}
                            </Text>
                          </View>
                          <FontAwesome6 name="arrow-right" size={16} color="#fff" />
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* 轨迹准入状态 */}
                    <View
                      className="mt-3 px-3 py-2.5 rounded-2xl flex-row items-start gap-2"
                      style={{
                        backgroundColor: current.track_access?.allowed
                          ? 'rgba(45,106,79,0.08)'
                          : 'rgba(196,69,54,0.1)',
                      }}
                    >
                      <FontAwesome6
                        name={current.track_access?.allowed ? 'circle-check' : 'lock'}
                        size={13}
                        color={current.track_access?.allowed ? '#2D6A4F' : '#C44536'}
                        style={{ marginTop: 2 }}
                      />
                      <Text
                        className="text-xs flex-1"
                        style={{
                          color: current.track_access?.allowed ? '#2D6A4F' : '#C44536',
                          lineHeight: 18,
                        }}
                      >
                        {current.track_access?.message ||
                          '示意跟线需先开启行中守护'}
                        {current.disclaimer_accepted && !current.guard_active
                          ? '（已确认风险说明，仍需开守护）'
                          : ''}
                      </Text>
                    </View>

                    {/* 约伴：绑定路线+行程，发布到社区 */}
                    <TouchableOpacity
                      onPress={() =>
                        router.push('/(tabs)/community', {
                          routeId: current.route_id,
                          tripId: current.id,
                          intent: 'companion',
                        })
                      }
                      activeOpacity={0.85}
                      className="mt-3 px-3 py-3 rounded-2xl flex-row items-center"
                      style={{ backgroundColor: 'rgba(82,183,136,0.12)' }}
                    >
                      <View
                        className="w-9 h-9 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: 'rgba(45,106,79,0.12)' }}
                      >
                        <FontAwesome6 name="user-group" size={14} color="#2D6A4F" />
                      </View>
                      <View className="flex-1 pr-2">
                        <Text className="text-sm font-bold text-foreground">约伴同行</Text>
                        <Text className="text-xs text-muted mt-0.5" style={{ lineHeight: 17 }}>
                          发布到社区「约伴」区，绑定本线路与行程，他人评论接洽
                        </Text>
                      </View>
                      <FontAwesome6 name="chevron-right" size={12} color="#8B7D6B" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={endTrip}
                      activeOpacity={0.85}
                      className="mt-3 px-3 py-3 rounded-2xl flex-row items-center"
                      style={{ backgroundColor: 'rgba(61,50,41,0.05)' }}
                    >
                      <View
                        className="w-9 h-9 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: 'rgba(196,69,54,0.1)' }}
                      >
                        <FontAwesome6 name="flag-checkered" size={14} color="#C44536" />
                      </View>
                      <View className="flex-1 pr-2">
                        <Text className="text-sm font-bold text-foreground">关闭行程</Text>
                        <Text className="text-xs text-muted mt-0.5" style={{ lineHeight: 17 }}>
                          关闭后路线与相关数据从行程中消失
                        </Text>
                      </View>
                      <FontAwesome6 name="chevron-right" size={12} color="#8B7D6B" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Essential gaps */}
                {!current.progress.essential_ready && current.progress.gaps.length > 0 && (
                  <View className="mb-4">
                    <Text className="text-lg font-bold text-foreground mb-2">必带缺口</Text>
                    <Text className="text-xs text-muted mb-3">
                      未齐建议必带前，不建议开启长途守护出行（当前不强制拦截）
                    </Text>
                    {current.progress.gaps.map((gap) => (
                      <TouchableOpacity
                        key={gap.id}
                        onPress={() =>
                          router.push('/checklist', {
                            routeId: current.route_id,
                            tripId: current.id,
                          })
                        }
                        className="flex-row items-center bg-surface mb-2 px-3 py-3"
                        style={{
                          borderTopLeftRadius: 16,
                          borderTopRightRadius: 8,
                          borderBottomLeftRadius: 8,
                          borderBottomRightRadius: 16,
                          borderWidth: 1,
                          borderColor: 'rgba(196,69,54,0.15)',
                        }}
                        activeOpacity={0.8}
                      >
                        <View
                          className="w-9 h-9 rounded-full items-center justify-center mr-3"
                          style={{ backgroundColor: 'rgba(196,69,54,0.1)' }}
                        >
                          <FontAwesome6 name="box" size={14} color="#C44536" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-foreground">{gap.name}</Text>
                          <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>
                            {gap.description}
                          </Text>
                        </View>
                        <FontAwesome6 name="chevron-right" size={12} color="#8B7D6B" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Guard panel */}
                <TouchableOpacity
                  onPress={openGuard}
                  activeOpacity={0.85}
                  className="mb-4"
                >
                  <LinearGradient
                    colors={
                      current.guard_active ? ['#52B788', '#2D6A4F'] : ['#3D6B4F', '#2D6A4F']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      borderTopLeftRadius: 28,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 28,
                      padding: 18,
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3 flex-1">
                        <View
                          className="w-11 h-11 rounded-full items-center justify-center"
                          style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                        >
                          <FontAwesome6 name="shield-halved" size={20} color="#fff" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-white text-base font-bold">
                            {current.guard_active ? '行中守护进行中' : '开启行中守护'}
                          </Text>
                          <Text className="text-white/80 text-xs mt-0.5">
                            {current.guard_active
                              ? `守护人：${(current.guardians?.length ? current.guardians : board?.guardians || []).join('、') || '已开启'} · 计划 ${current.planned_duration_hours}h`
                              : board?.contacts_ready
                                ? `将通知：${(board.guardians || []).join('、')} · 紧急联系人可在安全中心维护`
                                : '行前请先在安全中心添加紧急联系人'}
                          </Text>
                        </View>
                      </View>
                      <FontAwesome6 name="chevron-right" size={14} color="#fff" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* 历史行程 */}
            {board && (board.history?.length || 0) > 0 && (
              <View className="mb-4">
                <Text className="text-lg font-bold text-foreground mb-1">历史行程</Text>
                <Text className="text-xs text-muted mb-3" style={{ lineHeight: 17 }}>
                  结束并计入后出现在此；里程已累加到「我的」
                </Text>
                {board.history!.map((h) => (
                  <TouchableOpacity
                    key={h.id}
                    onPress={() => router.push('/route-detail', { id: h.route_id })}
                    activeOpacity={0.85}
                    className="flex-row items-center bg-surface mb-2 px-3 py-3"
                    style={{
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 8,
                      borderBottomLeftRadius: 8,
                      borderBottomRightRadius: 16,
                    }}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
                    >
                      <FontAwesome6 name="flag-checkered" size={14} color="#2D6A4F" />
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
                        {h.route_name}
                      </Text>
                      <Text className="text-xs text-muted mt-0.5">
                        {h.completed_label} · {h.distance_km}km
                        {h.elevation_gain_m ? ` · ${h.elevation_gain_m}m↑` : ''}
                        {h.duration_hours ? ` · ${h.duration_hours}h` : ''}
                      </Text>
                    </View>
                    <FontAwesome6 name="chevron-right" size={12} color="#8B7D6B" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* 收藏路线：发现页收藏后在此展示；可设出发时间加入行程 */}
            {board && (board.favorites?.length || 0) > 0 && (
              <View className="mb-4">
                <Text className="text-lg font-bold text-foreground mb-1">收藏路线</Text>
                <Text className="text-xs text-muted mb-3" style={{ lineHeight: 17 }}>
                  来自发现页的收藏；加入行程需设置预计出发时间，取消收藏后从此处消失
                </Text>
                {board.favorites!.map((f) => (
                  <View
                    key={f.id}
                    className="bg-surface mb-2 overflow-hidden"
                    style={{
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 8,
                      borderBottomLeftRadius: 8,
                      borderBottomRightRadius: 16,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => router.push('/route-detail', { id: f.id })}
                      activeOpacity={0.88}
                      className="flex-row"
                    >
                      {f.image_url ? (
                        <Image
                          source={{ uri: f.image_url }}
                          style={{ width: 88, height: 88 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          className="items-center justify-center"
                          style={{ width: 88, height: 88, backgroundColor: '#F1EBE0' }}
                        >
                          <FontAwesome6 name="bookmark" size={20} color="#2D6A4F" solid />
                        </View>
                      )}
                      <View className="flex-1 p-3 justify-center">
                        <View className="flex-row items-center gap-1.5 mb-0.5">
                          <FontAwesome6 name="bookmark" size={11} color="#2D6A4F" solid />
                          <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                            已收藏
                          </Text>
                        </View>
                        <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>
                          {f.location} · {f.distance}km
                        </Text>
                        {f.decision_summary ? (
                          <Text
                            className="text-xs mt-1"
                            style={{ color: '#2D6A4F' }}
                            numberOfLines={1}
                          >
                            {f.decision_summary}
                          </Text>
                        ) : null}
                      </View>
                      <View className="justify-center pr-3">
                        <FontAwesome6 name="chevron-right" size={12} color="#8B7D6B" />
                      </View>
                    </TouchableOpacity>
                    <View
                      className="px-3 pb-3 pt-1 flex-row"
                      style={{ borderTopWidth: 1, borderTopColor: '#F1EBE0' }}
                    >
                      <TouchableOpacity
                        onPress={() => setJoinRoute({ id: f.id, name: f.name })}
                        className="flex-1 py-2.5 rounded-xl items-center"
                        style={{ backgroundColor: '#2D6A4F' }}
                        activeOpacity={0.85}
                      >
                        <Text className="text-xs font-bold text-white">加入行程 · 设出发时间</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Discover entry — not a route list */}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/')}
              activeOpacity={0.8}
              className="mb-2 px-4 py-4 flex-row items-center justify-between"
              style={{
                backgroundColor: 'rgba(45,106,79,0.06)',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 20,
              }}
            >
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-foreground">去发现选路</Text>
                <Text className="text-xs text-muted mt-0.5">
                  同一时间仅一条计划中行程；选路请到发现
                </Text>
              </View>
              <FontAwesome6 name="compass" size={18} color="#2D6A4F" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* 示意跟线闸门：确认风险后开启守护（免责不能绕过守护） */}
      <Modal
        visible={gateVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setGateVisible(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View
            className="bg-background px-5 pt-4"
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: Math.max(insets.bottom, 16),
              maxHeight: '88%',
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-foreground">示意跟线前确认</Text>
              <TouchableOpacity onPress={() => setGateVisible(false)} hitSlop={8}>
                <FontAwesome6 name="xmark" size={18} color="#8B7D6B" />
              </TouchableOpacity>
            </View>
            <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
              示意跟线需先开启行中守护。免责说明仅作风险确认，不能替代守护与定位上报。
            </Text>

            <ScrollView style={{ maxHeight: 200 }} className="mb-3">
              <View
                className="rounded-2xl px-3 py-3"
                style={{ backgroundColor: 'rgba(61,50,41,0.05)' }}
              >
                <Text className="text-xs text-muted" style={{ lineHeight: 20 }}>
                  {board?.disclaimer_text ||
                    '示意跟线非精确导航；后台将暂停上报，危急请拨打 110。'}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={() => setAgreed((v) => !v)}
              className="flex-row items-start gap-2.5 mb-4"
              activeOpacity={0.8}
            >
              <View
                className="w-5 h-5 rounded items-center justify-center mt-0.5"
                style={{
                  borderWidth: 1.5,
                  borderColor: agreed ? '#2D6A4F' : '#C4B8A8',
                  backgroundColor: agreed ? '#2D6A4F' : 'transparent',
                }}
              >
                {agreed ? <FontAwesome6 name="check" size={10} color="#fff" /> : null}
              </View>
              <Text className="text-xs text-foreground flex-1" style={{ lineHeight: 18 }}>
                我已阅读上述说明，知悉示意跟线非导航，且需在开守护后使用。
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void ackAndOpenGuard()}
              disabled={!agreed || signing}
              activeOpacity={0.85}
              className="mb-1"
            >
              <LinearGradient
                colors={
                  agreed && !signing ? ['#2D6A4F', '#52B788'] : ['#A8B5A8', '#A8B5A8']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  borderRadius: 16,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {signing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome6 name="shield-halved" size={16} color="#fff" />
                    <Text className="text-white font-bold ml-2">确认并开启守护</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <JoinTripModal
        visible={!!joinRoute}
        routeId={joinRoute?.id ?? null}
        routeName={joinRoute?.name}
        onClose={() => setJoinRoute(null)}
        onJoined={async () => {
          await loadBoard();
        }}
      />
    </Screen>
  );
}

function Meta({ icon, text }: { icon: string; text: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <FontAwesome6 name={icon as 'route'} size={11} color="#8B7D6B" />
      <Text className="text-xs text-muted">{text}</Text>
    </View>
  );
}

function EmptyTrip({ onDiscover }: { onDiscover: () => void }) {
  return (
    <View
      className="bg-surface p-6 mb-4 items-center"
      style={{
        borderTopLeftRadius: 28,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 28,
      }}
    >
      <View
        className="w-16 h-16 rounded-full items-center justify-center mb-4"
        style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
      >
        <FontAwesome6 name="map" size={26} color="#2D6A4F" />
      </View>
      <Text className="text-lg font-bold text-foreground mb-2">还没有当前行程</Text>
      <Text className="text-sm text-muted text-center mb-5" style={{ lineHeight: 22 }}>
        发现页加入路线并设置出发时间后，会成为唯一的「计划中」行程；关闭后相关数据即消失。
      </Text>
      <TouchableOpacity onPress={onDiscover} activeOpacity={0.85} className="w-full overflow-hidden"
        style={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 20,
        }}
      >
        <LinearGradient
          colors={['#2D6A4F', '#52B788']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingVertical: 14, alignItems: 'center' }}
        >
          <Text className="text-white font-bold">去发现选路</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}
