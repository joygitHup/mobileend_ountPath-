import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useSeasonTheme } from '@/contexts/SeasonThemeContext';
import { fetchApi } from '@/utils/api';
import { confirmDialog, notifyError, notifyInfo, notifySuccess } from '@/utils/notify';
import { alertOffTrack } from '@/utils/offTrackAlert';
import { getBestPosition, postGuardCheckin } from '@/utils/location';
import { buildSchematicTrail, projectOntoTrail, type LatLng } from '@/utils/trackGeo';
import { startGuardHeartbeat, stopGuardHeartbeat } from '@/utils/guardHeartbeat';

type RiskType = 'steep' | 'cliff' | 'no_signal' | 'water';
type AnnotationKind = 'note' | 'hazard' | 'water' | 'viewpoint' | 'rest' | 'photo';

interface RiskMarker {
  id: string;
  type: RiskType;
  label: string;
  progress: number;
  note: string;
  distance_km: number;
  delta_km: number;
}

interface UserAnnotation {
  id: string;
  kind: AnnotationKind;
  kind_label: string;
  title: string;
  note: string;
  progress: number;
  distance_km: number;
  altitude_m: number | null;
  delta_km: number;
  created_at: string;
  source?: 'official' | 'community' | 'draft' | 'published';
  is_official?: boolean;
  editable?: boolean;
  track_author?: string;
}

interface WalkState {
  route_id: string;
  route_name: string;
  distance_total_km: number;
  progress: number;
  distance_km: number;
  remaining_km: number;
  altitude_m: number;
  risk_markers: RiskMarker[];
  nearby_risks: RiskMarker[];
  ahead_risks: RiskMarker[];
  passed_count: number;
  next_checkpoint: {
    name: string;
    distance_km: number;
    has_water: boolean;
    has_signal: boolean;
    ahead_km: number;
  } | null;
  alerts: { level: 'info' | 'warn' | 'danger'; title: string; body: string }[];
  annotations: UserAnnotation[];
  draft_count?: number;
  official_annotation_count?: number;
  community_annotation_count?: number;
  annotation_kinds: { id: AnnotationKind; label: string }[];
  annotation_gap_m?: number;
  can_annotate?: boolean;
  annotate_block_reason?: string | null;
  offset_m: number;
  corridor_m: number;
  off_track: boolean;
  off_track_level: 'ok' | 'warn' | 'danger';
  off_track_message: string;
  off_track_voice: string;
  track?: {
    id: string;
    title: string;
    is_official: boolean;
    recommended: boolean;
    author: string;
    use_count: number;
    rating: number;
  } | null;
  walk_session_id?: string | null;
}

const riskColor: Record<RiskType, string> = {
  steep: '#C44536',
  cliff: '#C44536',
  no_signal: '#8B6914',
  water: '#2D6A4F',
};

const annColor: Record<AnnotationKind, string> = {
  note: '#3D6B4F',
  hazard: '#C44536',
  water: '#2D6A4F',
  viewpoint: '#D4A017',
  rest: '#8B6914',
  photo: '#52B788',
};

const alertStyle = {
  info: { bg: 'rgba(45,106,79,0.1)', text: '#2D6A4F' },
  warn: { bg: 'rgba(233,196,106,0.25)', text: '#8B6914' },
  danger: { bg: 'rgba(196,69,54,0.12)', text: '#C44536' },
};

const PATH =
  'M 24 150 C 60 140, 80 100, 110 105 S 160 140, 190 110 S 250 50, 296 58';

function pointAt(t: number) {
  const samples = [
    [24, 150],
    [70, 120],
    [110, 105],
    [150, 125],
    [190, 110],
    [240, 65],
    [296, 58],
  ];
  const idx = Math.min(samples.length - 2, Math.floor(t * (samples.length - 1)));
  const local = t * (samples.length - 1) - idx;
  const a = samples[idx];
  const b = samples[idx + 1];
  return {
    x: a[0] + (b[0] - a[0]) * local,
    y: a[1] + (b[1] - a[1]) * local,
  };
}

function TrackMap({
  progress,
  markers,
  annotations,
  offsetM,
}: {
  progress: number;
  markers: RiskMarker[];
  annotations: UserAnnotation[];
  offsetM: number;
}) {
  const me = pointAt(progress);
  // 横向偏移示意：每米约 0.35px，限制在可视范围
  const shiftX = Math.max(-28, Math.min(28, offsetM * 0.35));
  const off = Math.abs(offsetM) >= 25;
  return (
    <Svg width="100%" height={180} viewBox="0 0 320 180">
      <Rect x={0} y={0} width={320} height={180} rx={16} fill={off ? '#F8EDE6' : '#F1EBE0'} />
      <Circle cx={90} cy={70} r={36} fill="rgba(45,106,79,0.08)" />
      <Circle cx={220} cy={55} r={40} fill="rgba(139,105,20,0.08)" />
      {/* 示意轨迹走廊 */}
      <Path
        d={PATH}
        stroke="rgba(45,106,79,0.18)"
        strokeWidth={14}
        fill="none"
        strokeLinecap="round"
      />
      <Path d={PATH} stroke="#D4C8B8" strokeWidth={6} fill="none" strokeLinecap="round" />
      <Path d={PATH} stroke="#2D6A4F" strokeWidth={3} fill="none" strokeLinecap="round" />
      {markers.map((m) => {
        const p = pointAt(m.progress);
        const c = riskColor[m.type];
        return (
          <React.Fragment key={m.id}>
            <Circle cx={p.x} cy={p.y} r={9} fill="#fff" stroke={c} strokeWidth={2} />
            <Circle cx={p.x} cy={p.y} r={3.5} fill={c} />
          </React.Fragment>
        );
      })}
      {annotations.map((a) => {
        const p = pointAt(a.progress);
        const c = annColor[a.kind] || '#3D6B4F';
        const isOfficial = a.source === 'official' || a.is_official;
        const isDraft = a.source === 'draft';
        return (
          <React.Fragment key={a.id}>
            {isOfficial ? (
              <>
                <Circle cx={p.x} cy={p.y} r={9} fill="#fff" stroke="#2D6A4F" strokeWidth={2.5} />
                <Circle cx={p.x} cy={p.y} r={3.5} fill="#2D6A4F" />
              </>
            ) : (
              <Circle
                cx={p.x}
                cy={p.y}
                r={isDraft ? 6 : 7}
                fill={c}
                stroke={isDraft ? '#FDF8F0' : '#fff'}
                strokeWidth={2}
                opacity={isDraft ? 0.9 : 1}
              />
            )}
          </React.Fragment>
        );
      })}
      <Circle cx={24} cy={150} r={6} fill="#2D6A4F" />
      <Circle cx={296} cy={58} r={6} fill="#C44536" />
      <Circle
        cx={me.x + shiftX}
        cy={me.y}
        r={11}
        fill={off ? '#C44536' : '#52B788'}
        stroke="#fff"
        strokeWidth={3}
      />
      <SvgText x={12} y={18} fontSize={10} fill={off ? '#C44536' : '#8B6914'} fontWeight="700">
        {off ? '已偏离官方示意轨迹' : '示意折线 · 非精确导航'}
      </SvgText>
    </Svg>
  );
}

export default function TrackScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { palette } = useSeasonTheme();
  const params = useSafeSearchParams<{
    routeId: string;
    tripId?: string;
    withGuard?: boolean;
    trackId?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [walk, setWalk] = useState<WalkState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [walkSessionId, setWalkSessionId] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [walkMode, setWalkMode] = useState<'gps' | 'demo'>('gps');
  const [gpsHint, setGpsHint] = useState('等待定位…');
  const [trail, setTrail] = useState<LatLng[]>([]);
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [annOpen, setAnnOpen] = useState(false);
  const [annKind, setAnnKind] = useState<AnnotationKind>('note');
  const [annNote, setAnnNote] = useState('');
  const [annSaving, setAnnSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);
  const offsetRef = useRef(0);
  const alertedRef = useRef<Set<string>>(new Set());
  const sessionRef = useRef<string | null>(null);
  const walkSessionRef = useRef<string | null>(null);
  const trackIdRef = useRef<string | null>(null);
  const trailRef = useRef<LatLng[]>([]);
  const lastOffTrackVoiceAt = useRef(0);
  const lastOffTrackLevel = useRef<'ok' | 'warn' | 'danger'>('ok');
  const finishPromptedRef = useRef(false);

  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);

  const closeWalkSession = useCallback(async () => {
    const wid = walkSessionRef.current;
    if (!wid) return;
    walkSessionRef.current = null;
    try {
      await fetchApi('/api/v1/track/end', {
        method: 'POST',
        body: JSON.stringify({
          walk_session_id: wid,
          progress: progressRef.current,
          route_id: params.routeId,
        }),
      });
    } catch {
      // leave best-effort
    }
  }, [params.routeId]);

  const syncProgress = useCallback(async (progress: number, offsetM?: number) => {
    if (!params.routeId) return;
    progressRef.current = progress;
    if (typeof offsetM === 'number') offsetRef.current = offsetM;
    try {
      const res = await fetchApi<{ data: WalkState }>('/api/v1/track/progress', {
        method: 'POST',
        body: JSON.stringify({
          route_id: params.routeId,
          progress,
          offset_m: offsetRef.current,
          session_id: sessionRef.current,
          track_id: trackIdRef.current,
          walk_session_id: walkSessionRef.current,
        }),
      });
      setWalk(res.data);

      // 偏航：震动 + 语音（有冷却，避免刷屏）
      const level = res.data.off_track_level || 'ok';
      if (level !== 'ok') {
        const now = Date.now();
        const levelChanged = lastOffTrackLevel.current !== level;
        const cooldown = level === 'danger' ? 8000 : 12000;
        if (levelChanged || now - lastOffTrackVoiceAt.current > cooldown) {
          lastOffTrackVoiceAt.current = now;
          lastOffTrackLevel.current = level;
          void alertOffTrack(level, res.data.off_track_voice || res.data.off_track_message);
        }
      } else if (lastOffTrackLevel.current !== 'ok') {
        lastOffTrackLevel.current = 'ok';
      }

      for (const m of res.data.nearby_risks) {
        if (
          (m.type === 'cliff' || m.type === 'no_signal' || m.type === 'steep') &&
          !alertedRef.current.has(m.id)
        ) {
          alertedRef.current.add(m.id);
          notifyInfo(m.label, m.note);
          break;
        }
      }

      if (progress >= 0.995 && !finishPromptedRef.current) {
        finishPromptedRef.current = true;
        setWalking(false);
        const endedWalkId = walkSessionRef.current;
        confirmDialog(
          '示意跟线已完成',
          '本段示意步行已到终点。「仅结束跟线」不会关闭行中守护与行程；守护仍会继续前台上报，请记得回守护页或行程页收口。',
          {
            confirmText: '完结行程并结束守护',
            cancelText: '仅结束跟线',
            onConfirm: () => {
              void (async () => {
                try {
                  await closeWalkSession();
                  if (params.tripId) {
                    await fetchApi(`/api/v1/trips/${params.tripId}/complete`, {
                      method: 'POST',
                      body: JSON.stringify({
                        abandoned: false,
                        walk_session_id: endedWalkId,
                      }),
                    });
                  }
                  stopGuardHeartbeat();
                  notifySuccess('行程已完结', '守护已结束，里程已按本次跟线进度计入统计');
                  router.replace('/(tabs)/trip');
                } catch (e) {
                  finishPromptedRef.current = false;
                  notifyError(
                    '完结失败',
                    e instanceof Error ? e.message : '可到行程页手动结束'
                  );
                }
              })();
            },
            onCancel: () => {
              void (async () => {
                await closeWalkSession();
                confirmDialog(
                  '跟线已结束，守护仍可能开启',
                  '示意跟线草稿已收口。若行中守护仍在上报，请前往守护页结束，或到行程中心完结行程。',
                  {
                    confirmText: '去守护页',
                    cancelText: '知道了',
                    onConfirm: () =>
                      router.push('/guard', {
                        routeId: params.routeId || '',
                        tripId: params.tripId,
                      }),
                  }
                );
              })();
            },
          }
        );
      }
    } catch {
      // keep last state
    }
  }, [params.routeId, params.tripId, router, closeWalkSession]);

  const bootstrap = useCallback(async () => {
    if (!params.routeId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const rawGuard = params.withGuard as boolean | string | undefined;
      const wantGuard =
        rawGuard === true || rawGuard === 'true' || String(rawGuard) === '1';
      const res = await fetchApi<{
        data: {
          walk: WalkState;
          guard_session: { id: string } | null;
          walk_session_id: string;
          track_id: string;
          trail?: {
            start_lat: number;
            start_lng: number;
            distance_km: number;
            route_id: string;
          };
        };
      }>('/api/v1/track/start', {
        method: 'POST',
        body: JSON.stringify({
          route_id: params.routeId,
          trip_id: params.tripId,
          with_guard: wantGuard,
          track_id: params.trackId,
        }),
      });
      setWalk(res.data.walk);
      progressRef.current = res.data.walk.progress;
      offsetRef.current = 0;
      sessionRef.current = res.data.guard_session?.id ?? null;
      setSessionId(res.data.guard_session?.id ?? null);
      if (res.data.guard_session?.id) {
        startGuardHeartbeat({
          id: res.data.guard_session.id,
          started_at: new Date().toISOString(),
          planned_duration_hours: 8,
        });
      }
      walkSessionRef.current = res.data.walk_session_id;
      setWalkSessionId(res.data.walk_session_id);
      trackIdRef.current = res.data.track_id;
      setTrackId(res.data.track_id);
      finishPromptedRef.current = (res.data.walk.progress || 0) >= 0.995;
      const t = res.data.trail;
      if (t) {
        const points = buildSchematicTrail(
          { lat: t.start_lat, lng: t.start_lng },
          t.distance_km || res.data.walk.distance_km || 10,
          t.route_id || params.routeId
        );
        setTrail(points);
        trailRef.current = points;
      }
      alertedRef.current = new Set();
      lastOffTrackLevel.current = 'ok';
      lastOffTrackVoiceAt.current = 0;
    } catch (e) {
      setWalk(null);
      notifyError(
        '无法进入示意跟线',
        e instanceof Error ? e.message : '请先完成行程安全闸门或检查网络'
      );
    } finally {
      setLoading(false);
    }
  }, [params.routeId, params.tripId, params.withGuard, params.trackId]);

  useFocusEffect(
    useCallback(() => {
      bootstrap();
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setWalking(false);
        void closeWalkSession();
      };
    }, [bootstrap, closeWalkSession])
  );

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!walking) return;

    if (walkMode === 'demo') {
      const step = speed === 'fast' ? 0.012 : speed === 'slow' ? 0.003 : 0.006;
      timerRef.current = setInterval(() => {
        const next = Math.min(1, progressRef.current + step);
        syncProgress(next);
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }

    // GPS 模式：投影到示意折线 → 进度 + 偏航，并联动守护打卡
    const tickGps = async () => {
      const pos = await getBestPosition();
      if (!pos) {
        setGpsHint('定位失败，请检查权限或切演示模式');
        return;
      }
      const line = trailRef.current;
      if (line.length < 2) {
        setGpsHint('轨迹几何未就绪');
        return;
      }
      const { progress, offsetM } = projectOntoTrail(
        { lat: pos.lat, lng: pos.lng },
        line
      );
      // 进度只前进不后退（防定位抖动）
      const next = Math.max(progressRef.current, progress);
      setGpsHint(
        `GPS ${(pos.accuracy ?? 0).toFixed(0)}m · 进度 ${(next * 100).toFixed(0)}% · 偏航 ${Math.round(offsetM)}m`
      );
      await syncProgress(next, offsetM);
      if (sessionRef.current) {
        void postGuardCheckin({
          session_id: sessionRef.current,
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
          altitude: pos.altitude,
          progress: next,
          timestamp: pos.timestamp,
        });
      }
    };
    void tickGps();
    timerRef.current = setInterval(() => {
      void tickGps();
    }, 4000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [walking, speed, walkMode, syncProgress]);

  const stepManual = (delta: number) => {
    const next = Math.min(1, Math.max(0, progressRef.current + delta));
    syncProgress(next);
  };

  const nudgeOffset = (delta: number) => {
    const next = Math.max(-120, Math.min(120, offsetRef.current + delta));
    syncProgress(progressRef.current, next);
  };

  const recenterPath = () => {
    syncProgress(progressRef.current, 0);
  };

  const openAnnotate = () => {
    if (walk && walk.can_annotate === false) {
      notifyInfo(
        '此处不可标注',
        walk.annotate_block_reason ||
          `与已有标注点须相距至少 ${walk.annotation_gap_m || 5} 米。官方标注始终保留显示。`
      );
      return;
    }
    setWalking(false);
    setAnnKind('note');
    setAnnNote('');
    setAnnOpen(true);
  };

  const saveAnnotation = async () => {
    if (!params.routeId || !annNote.trim() || annSaving) return;
    setAnnSaving(true);
    try {
      const res = await fetchApi<{ walk: WalkState }>('/api/v1/track/annotations', {
        method: 'POST',
        body: JSON.stringify({
          route_id: params.routeId,
          trip_id: params.tripId,
          kind: annKind,
          note: annNote.trim(),
          progress: progressRef.current,
          walk_session_id: walkSessionRef.current,
          track_id: trackIdRef.current,
          offset_m: offsetRef.current,
        }),
      });
      if (res.walk) setWalk(res.walk);
      setAnnOpen(false);
      setAnnNote('');
      notifySuccess('已标注', '标注已记入本次步行草稿，可发布为社区轨迹。');
    } catch (e) {
      notifyError('标注失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setAnnSaving(false);
    }
  };

  const publishMyTrack = () => {
    if (!params.routeId || publishing) return;
    const draftCount = walk?.draft_count || 0;
    confirmDialog(
      '发布轨迹',
      draftCount > 0
        ? `将把本次 ${draftCount} 个标注发布到「${walk?.route_name}」的轨迹信息，供其他用户参考选用。`
        : '本次暂无新标注，仍可发布为社区完走轨迹。',
      {
        confirmText: '确认发布',
        onConfirm: async () => {
          setPublishing(true);
          try {
            await fetchApi('/api/v1/track/publish', {
              method: 'POST',
              body: JSON.stringify({
                route_id: params.routeId,
                walk_session_id: walkSessionRef.current,
                title: `${walk?.route_name || '路线'} · 我的现场轨迹`,
                summary:
                  draftCount > 0
                    ? `含 ${draftCount} 个现场标注，基于实际步行反馈。`
                    : '基于示意轨迹完走发布。',
              }),
            });
            notifySuccess('发布成功', '已挂到该路线的轨迹信息，官方标准路线仍置顶推荐。');
            await syncProgress(progressRef.current);
          } catch (e) {
            notifyError('发布失败', e instanceof Error ? e.message : '请稍后重试');
          } finally {
            setPublishing(false);
          }
        },
      }
    );
  };

  const deleteAnnotation = (id: string, editable?: boolean) => {
    if (!params.routeId) return;
    if (editable === false) {
      notifyError('不可删除', '该标注来自已发布轨迹，仅可删除本次新增草稿。');
      return;
    }
    confirmDialog('删除标注', '确认删除这条草稿标注？', {
      confirmText: '删除',
      destructive: true,
      onConfirm: async () => {
        try {
          const q = new URLSearchParams({
            route_id: params.routeId!,
            progress: String(progressRef.current),
            offset_m: String(offsetRef.current),
          });
          if (trackIdRef.current) q.set('track_id', trackIdRef.current);
          if (walkSessionRef.current) q.set('walk_session_id', walkSessionRef.current);
          const res = await fetchApi<{ walk: WalkState }>(
            `/api/v1/track/annotations/${id}?${q.toString()}`,
            { method: 'DELETE' }
          );
          if (res.walk) setWalk(res.walk);
        } catch (e) {
          notifyError('删除失败', e instanceof Error ? e.message : '请稍后重试');
        }
      },
    });
  };

  if (loading) {
    return (
      <Screen backgroundColor="#FDF8F0">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2D6A4F" />
          <Text className="text-muted text-sm mt-3">加载路段风险…</Text>
        </View>
      </Screen>
    );
  }

  if (!walk) {
    return (
      <Screen backgroundColor="#FDF8F0">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-muted mb-1 text-center">无法进入示意跟线</Text>
          <Text className="text-xs text-muted mb-3 text-center" style={{ lineHeight: 17 }}>
            需先加入行程并完成守护/免责闸门。缺联系人时无法静默开守护。
          </Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/trip')} className="mb-2">
            <Text style={{ color: '#2D6A4F', fontWeight: '600' }}>去行程页</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: '#8B7D6B', fontWeight: '500' }}>返回</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <View
        className="flex-row items-center px-4 pb-3"
        style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: '#F1EBE0' }}
      >
        <TouchableOpacity
          onPress={() => {
            setWalking(false);
            void (async () => {
              const hadGuard = !!sessionRef.current;
              await closeWalkSession();
              if (hadGuard) {
                confirmDialog(
                  '跟线已退出',
                  '示意跟线已收口，但行中守护与行程可能仍在进行。是否前往守护页收口？',
                  {
                    confirmText: '去守护页',
                    cancelText: '先返回',
                    onConfirm: () =>
                      router.push('/guard', {
                        routeId: params.routeId || '',
                        tripId: params.tripId,
                      }),
                    onCancel: () => router.back(),
                  }
                );
              } else {
                router.back();
              }
            })();
          }}
          className="w-10 h-10 items-center justify-center"
        >
          <FontAwesome6 name="chevron-left" size={18} color="#3D3229" />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="text-base font-bold text-foreground">{walk.route_name}</Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {walk.track
              ? `${walk.track.is_official ? '官方' : '社区'} · ${walk.track.title}`
              : '动态轨迹步行'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={publishMyTrack}
          disabled={publishing}
          className="px-2 py-1"
          hitSlop={6}
        >
          <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
            {publishing ? '…' : '发布'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="mb-3 px-3 py-2.5 rounded-2xl"
          style={{ backgroundColor: 'rgba(184,134,11,0.16)' }}
        >
          <Text className="text-xs font-bold" style={{ color: '#8B6914' }}>
            示意跟线 · 非官方精确导航
          </Text>
          <Text className="text-[11px] text-muted mt-1" style={{ lineHeight: 16 }}>
            无真 GPX 时为示意折线；请结合纸质地图/专业 App，并优先开启行中守护。
          </Text>
        </View>

        <TrackMap
          progress={walk.progress}
          markers={walk.risk_markers}
          annotations={walk.annotations || []}
          offsetM={walk.offset_m || 0}
        />

        {/* 偏航状态条 */}
        <View
          className="mt-3 mb-2 px-3 py-2.5 rounded-2xl"
          style={{
            backgroundColor:
              walk.off_track_level === 'danger'
                ? 'rgba(196,69,54,0.14)'
                : walk.off_track_level === 'warn'
                  ? 'rgba(233,196,106,0.28)'
                  : 'rgba(45,106,79,0.08)',
          }}
        >
          <View className="flex-row items-center gap-2 mb-1">
            <FontAwesome6
              name={walk.off_track ? 'bell' : 'route'}
              size={13}
              color={
                walk.off_track_level === 'danger'
                  ? '#C44536'
                  : walk.off_track_level === 'warn'
                    ? '#8B6914'
                    : '#2D6A4F'
              }
            />
            <Text
              className="text-xs font-bold flex-1"
              style={{
                color:
                  walk.off_track_level === 'danger'
                    ? '#C44536'
                    : walk.off_track_level === 'warn'
                      ? '#8B6914'
                      : '#2D6A4F',
              }}
            >
              {walk.off_track_message || '当前在示意轨迹走廊内'}
            </Text>
          </View>
          <Text className="text-xs text-muted">
            侧向偏移 {walk.offset_m || 0}m · 走廊 ±{walk.corridor_m || 30}m · 偏航将震动并语音提醒
          </Text>
        </View>

        <View className="flex-row gap-2 mb-3">
          <TouchableOpacity
            onPress={() => nudgeOffset(-15)}
            className="flex-1 py-2 rounded-xl items-center"
            style={{ backgroundColor: 'rgba(196,69,54,0.1)' }}
          >
            <Text className="text-xs font-semibold" style={{ color: '#C44536' }}>
              偏左 15m
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={recenterPath}
            className="flex-1 py-2 rounded-xl items-center"
            style={{ backgroundColor: 'rgba(45,106,79,0.12)' }}
          >
            <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
              回到轨迹
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => nudgeOffset(15)}
            className="flex-1 py-2 rounded-xl items-center"
            style={{ backgroundColor: 'rgba(196,69,54,0.1)' }}
          >
            <Text className="text-xs font-semibold" style={{ color: '#C44536' }}>
              偏右 15m
            </Text>
          </TouchableOpacity>
        </View>

        {/* 进度条 */}
        <View className="mt-1 mb-2">
          <View className="flex-row justify-between mb-1.5">
            <Text className="text-xs text-muted">已行 {walk.distance_km} km</Text>
            <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
              {Math.round(walk.progress * 100)}%
            </Text>
            <Text className="text-xs text-muted">剩余 {walk.remaining_km} km</Text>
          </View>
          <View className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: '#F1EBE0' }}>
            <View
              className="h-full rounded-full"
              style={{ width: `${walk.progress * 100}%`, backgroundColor: '#2D6A4F' }}
            />
          </View>
        </View>

        {/* 核心状态 */}
        <View className="flex-row gap-2 mb-4">
          {[
            { label: '海拔', value: `${walk.altitude_m}m`, icon: 'mountain' },
            {
              label: '下一补给',
              value: walk.next_checkpoint
                ? `${walk.next_checkpoint.ahead_km}km`
                : '—',
              icon: 'flag',
            },
            {
              label: '风险点',
              value: `${walk.passed_count}/${walk.risk_markers.length}`,
              icon: 'triangle-exclamation',
            },
          ].map((s) => (
            <View
              key={s.label}
              className="flex-1 bg-surface p-3"
              style={{
                borderTopLeftRadius: 16,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 16,
              }}
            >
              <FontAwesome6 name={s.icon as 'mountain'} size={12} color="#2D6A4F" />
              <Text className="text-base font-bold text-foreground mt-1.5">{s.value}</Text>
              <Text className="text-xs text-muted">{s.label}</Text>
            </View>
          ))}
        </View>

        {walk.next_checkpoint ? (
          <View
            className="mb-4 px-3 py-2.5 rounded-2xl flex-row items-center gap-2"
            style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
          >
            <FontAwesome6 name="location-dot" size={13} color="#2D6A4F" />
            <Text className="text-xs flex-1" style={{ color: '#2D6A4F', lineHeight: 18 }}>
              下一节点 {walk.next_checkpoint.name}
              {walk.next_checkpoint.has_water ? ' · 有水' : ' · 无水'}
              {walk.next_checkpoint.has_signal ? ' · 有信号' : ' · 无信号'}
            </Text>
          </View>
        ) : null}

        {/* 动态预警 */}
        <Text className="text-sm font-bold text-foreground mb-2">路段风险预警</Text>
        {walk.alerts.length === 0 ? (
          <Text className="text-xs text-muted mb-4">附近暂无特殊风险，请保持当前配速</Text>
        ) : (
          walk.alerts.map((a, i) => {
            const s = alertStyle[a.level as keyof typeof alertStyle] ?? alertStyle.info;
            return (
              <View
                key={`${a.title}-${i}`}
                className="mb-2 p-3 rounded-2xl"
                style={{ backgroundColor: s.bg }}
              >
                <Text className="text-sm font-bold mb-0.5" style={{ color: s.text }}>
                  {a.title}
                </Text>
                <Text className="text-xs text-foreground" style={{ lineHeight: 17 }}>
                  {a.body}
                </Text>
              </View>
            );
          })
        )}

        {/* 全部风险点列表 */}
        <Text className="text-sm font-bold text-foreground mb-2 mt-2">全程风险点</Text>
        {walk.risk_markers.map((m) => {
          const passed = m.delta_km < -0.05;
          const near = Math.abs(m.delta_km) <= 0.35;
          return (
            <View
              key={m.id}
              className="flex-row items-center py-2.5"
              style={{ borderBottomWidth: 1, borderBottomColor: '#F1EBE0', opacity: passed ? 0.45 : 1 }}
            >
              <View
                className="w-2.5 h-2.5 rounded-full mr-2.5"
                style={{ backgroundColor: riskColor[m.type] }}
              />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">
                  {m.label}
                  {near ? ' · 附近' : passed ? ' · 已过' : ''}
                </Text>
                <Text className="text-xs text-muted">{m.distance_km}km · {m.note}</Text>
              </View>
            </View>
          );
        })}

        {/* 用户标注 */}
        <View className="flex-row items-center justify-between mt-5 mb-2">
          <Text className="text-sm font-bold text-foreground">
            轨迹标注 ({walk.annotations?.length || 0})
          </Text>
          <TouchableOpacity onPress={openAnnotate} activeOpacity={0.8}>
            <Text
              className="text-xs font-semibold"
              style={{ color: walk.can_annotate === false ? '#A89888' : '#2D6A4F' }}
            >
              {walk.can_annotate === false ? '当前位置过近' : '+ 在当前位置标注'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text className="text-xs text-muted mb-2" style={{ lineHeight: 17 }}>
          始终显示官方标注
          {walk.official_annotation_count != null
            ? `（${walk.official_annotation_count}）`
            : ''}
          ；选用社区轨迹时叠加其用户标注
          {walk.community_annotation_count
            ? `（${walk.community_annotation_count}）`
            : ''}
          。用户标注间距须 ≥{walk.annotation_gap_m || 5}m，官方点不受影响。
          {walk.draft_count ? ` 草稿 ${walk.draft_count} 条。` : ''}
        </Text>
        {walk.can_annotate === false && walk.annotate_block_reason ? (
          <Text className="text-xs mb-2" style={{ color: '#8B6914', lineHeight: 17 }}>
            {walk.annotate_block_reason}
          </Text>
        ) : null}
        {(walk.annotations || []).length === 0 ? (
          <Text className="text-xs text-muted mb-2">暂无标注，步行中可随时补充</Text>
        ) : (
          (walk.annotations || []).map((a) => {
            const sourceLabel =
              a.source === 'official' || a.is_official
                ? '官方'
                : a.source === 'community' || a.source === 'published'
                  ? '社区'
                  : a.source === 'draft'
                    ? '草稿'
                    : '';
            return (
              <View
                key={a.id}
                className="flex-row items-start py-2.5"
                style={{ borderBottomWidth: 1, borderBottomColor: '#F1EBE0' }}
              >
                <View
                  className="w-2.5 h-2.5 rounded-full mr-2.5 mt-1.5"
                  style={{
                    backgroundColor:
                      a.source === 'official' || a.is_official
                        ? '#2D6A4F'
                        : annColor[a.kind] || '#3D6B4F',
                  }}
                />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">
                    {a.kind_label} · {a.distance_km}km
                    {sourceLabel ? ` · ${sourceLabel}` : ''}
                    {a.track_author && a.source === 'community' ? ` · ${a.track_author}` : ''}
                    {a.altitude_m != null ? ` · ${a.altitude_m}m` : ''}
                  </Text>
                  <Text className="text-xs text-muted mt-0.5" style={{ lineHeight: 17 }}>
                    {a.note}
                  </Text>
                </View>
                {a.editable !== false && a.source === 'draft' ? (
                  <TouchableOpacity
                    onPress={() => deleteAnnotation(a.id, true)}
                    hitSlop={8}
                    className="ml-2 p-1"
                  >
                    <FontAwesome6 name="trash" size={12} color="#C4B8A8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}

        <TouchableOpacity
          onPress={publishMyTrack}
          disabled={publishing}
          activeOpacity={0.85}
          className="mt-4 mb-2 py-3.5 rounded-2xl items-center"
          style={{ backgroundColor: publishing ? 'rgba(45,106,79,0.35)' : '#2D6A4F' }}
        >
          {publishing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-sm">
              发布轨迹到本路线
              {walk.draft_count ? `（含 ${walk.draft_count} 标注）` : ''}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* 底部步行控制 */}
      <View
        className="px-4 pt-3"
        style={{
          paddingBottom: Math.max(insets.bottom, 14),
          borderTopWidth: 1,
          borderTopColor: '#F1EBE0',
          backgroundColor: palette.background,
        }}
      >
        <View className="flex-row gap-2 mb-2">
          {(
            [
              { key: 'gps' as const, label: 'GPS 示意' },
              { key: 'demo' as const, label: '演示推进' },
            ] as const
          ).map((m) => (
            <TouchableOpacity
              key={m.key}
              onPress={() => {
                setWalkMode(m.key);
                if (m.key === 'gps') setWalking(false);
              }}
              className="flex-1 py-2 rounded-full items-center"
              style={{
                backgroundColor: walkMode === m.key ? '#2D6A4F' : 'rgba(45,106,79,0.1)',
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: walkMode === m.key ? '#fff' : '#2D6A4F' }}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {walkMode === 'gps' ? (
          <View
            className="mb-3 px-3 py-2 rounded-2xl"
            style={{ backgroundColor: 'rgba(184,134,11,0.12)' }}
          >
            <Text className="text-[11px] font-semibold" style={{ color: '#8B6914', lineHeight: 16 }}>
              示意跟线 · 非官方导航
            </Text>
            <Text className="text-[11px] text-muted mt-0.5" style={{ lineHeight: 16 }}>
              {gpsHint}；无真 GPX 时投影到示意折线，勿当作精确导航。室内可切「演示」。
            </Text>
          </View>
        ) : (
          <View className="flex-row gap-2 mb-3">
            {(
              [
                { key: 'slow' as const, label: '慢走' },
                { key: 'normal' as const, label: '常速' },
                { key: 'fast' as const, label: '疾行' },
              ] as const
            ).map((s) => (
              <TouchableOpacity
                key={s.key}
                onPress={() => setSpeed(s.key)}
                className="flex-1 py-2 rounded-full items-center"
                style={{
                  backgroundColor: speed === s.key ? '#2D6A4F' : 'rgba(45,106,79,0.1)',
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: speed === s.key ? '#fff' : '#2D6A4F' }}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={openAnnotate}
            className="w-12 h-12 rounded-2xl items-center justify-center"
            style={{ backgroundColor: 'rgba(45,106,79,0.12)' }}
          >
            <FontAwesome6 name="location-pin" size={16} color="#2D6A4F" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => stepManual(-0.05)}
            className="w-11 h-12 rounded-2xl items-center justify-center"
            style={{
              backgroundColor: 'rgba(61,50,41,0.08)',
              opacity: walkMode === 'demo' ? 1 : 0.35,
            }}
            disabled={walkMode !== 'demo'}
          >
            <FontAwesome6 name="backward" size={13} color="#3D3229" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setWalking((v) => !v)}
            activeOpacity={0.85}
            className="flex-1"
          >
            <LinearGradient
              colors={walking ? ['#8B6914', '#C44536'] : ['#2D6A4F', '#52B788']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                borderRadius: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FontAwesome6
                name={walking ? 'pause' : 'person-walking'}
                size={16}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text className="text-white text-base font-bold">
                {walking
                  ? walkMode === 'gps'
                    ? '暂停定位'
                    : '暂停步行'
                  : walk.progress > 0
                    ? walkMode === 'gps'
                      ? '继续跟线'
                      : '继续步行'
                    : walkMode === 'gps'
                      ? '开始跟线'
                      : '开始步行'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => stepManual(0.05)}
            className="w-11 h-12 rounded-2xl items-center justify-center"
            style={{
              backgroundColor: 'rgba(61,50,41,0.08)',
              opacity: walkMode === 'demo' ? 1 : 0.35,
            }}
            disabled={walkMode !== 'demo'}
          >
            <FontAwesome6 name="forward" size={13} color="#3D3229" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 标注弹层 */}
      <Modal visible={annOpen} transparent animationType="slide" onRequestClose={() => setAnnOpen(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View
            className="bg-background px-5 pt-4"
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-lg font-bold text-foreground">添加标注点</Text>
              <TouchableOpacity onPress={() => setAnnOpen(false)} hitSlop={8}>
                <FontAwesome6 name="xmark" size={18} color="#8B7D6B" />
              </TouchableOpacity>
            </View>
            <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
              将标注在当前位置：约 {walk.distance_km}km
              {walk.altitude_m != null ? ` · 海拔 ${walk.altitude_m}m` : ''}
              。须与已有标注（含官方与社区）相距 ≥{walk.annotation_gap_m || 5}m；官方标注始终显示且不受影响。
            </Text>

            <Text className="text-xs font-semibold text-foreground mb-2">类型</Text>
            <View className="flex-row flex-wrap gap-2 mb-3">
              {(
                walk.annotation_kinds || [
                  { id: 'note' as const, label: '路况备注' },
                  { id: 'hazard' as const, label: '危险提示' },
                  { id: 'water' as const, label: '水源' },
                  { id: 'viewpoint' as const, label: '观景点' },
                  { id: 'rest' as const, label: '休息点' },
                  { id: 'photo' as const, label: '打卡点' },
                ]
              ).map((k) => (
                <TouchableOpacity
                  key={k.id}
                  onPress={() => setAnnKind(k.id)}
                  className="px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: annKind === k.id ? '#2D6A4F' : 'rgba(45,106,79,0.1)',
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: annKind === k.id ? '#fff' : '#2D6A4F' }}
                  >
                    {k.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              value={annNote}
              onChangeText={setAnnNote}
              placeholder="描述这里的路况、风险或补给情况…"
              placeholderTextColor="#A89888"
              multiline
              maxLength={300}
              style={{
                minHeight: 88,
                maxHeight: 140,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#E8DFD0',
                backgroundColor: '#fff',
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 14,
                color: '#3D3229',
                lineHeight: 20,
                textAlignVertical: 'top',
              }}
            />

            <TouchableOpacity
              onPress={saveAnnotation}
              disabled={!annNote.trim() || annSaving}
              activeOpacity={0.85}
              className="mt-4 py-3.5 rounded-2xl items-center"
              style={{
                backgroundColor: annNote.trim() && !annSaving ? '#2D6A4F' : 'rgba(45,106,79,0.35)',
              }}
            >
              {annSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold">保存到轨迹</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
