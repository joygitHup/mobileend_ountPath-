import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Path,
  Polygon,
  Circle,
  Line,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { JoinTripModal } from '@/components/JoinTripModal';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';
import { confirmDialog, notifyError, notifyInfo } from '@/utils/notify';
import dayjs from 'dayjs';

type RiskMarkerType = 'steep' | 'cliff' | 'no_signal' | 'water';

interface RouteDetail {
  id: string;
  name: string;
  location: string;
  region: string;
  distance: number;
  elevation_gain: number;
  max_altitude: number;
  estimated_duration: string;
  difficulty: string;
  difficulty_stars: number;
  terrain_type: string;
  best_season: string[];
  image_url: string;
  real_photo_url: string;
  description: string;
  ratings: {
    climb_intensity: number;
    terrain_difficulty: number;
    altitude_risk: number;
    signal_coverage: number;
    supply_access: number;
  };
  match_score: number;
  completion_rate: number;
  turnaround_rate: number;
  tags: string[];
  checkpoints: { name: string; distance_km: number; has_water: boolean; has_signal: boolean }[];
  ai_difficulty: {
    label: string;
    stars: number;
    score: number;
    basis: string[];
  };
  overall_rating: number;
  rating_count: number;
  risk_markers: {
    id: string;
    type: RiskMarkerType;
    label: string;
    progress: number;
    note: string;
  }[];
  ai_safety_tips: {
    id: string;
    level: 'info' | 'warn' | 'danger';
    title: string;
    body: string;
  }[];
  guidebook: {
    safety_reviewed: boolean;
    reviewed_at: string;
    summary: string;
    nodes: { name: string; distance_km: number; condition: string; tip?: string }[];
    gear_suggestions: string[];
    condition_notes: string[];
  };
  elevation_profile: {
    points: {
      distance_km: number;
      altitude_m: number;
      label?: string;
      is_peak?: boolean;
      is_steep?: boolean;
    }[];
    min_m: number;
    max_m: number;
    total_ascent_m: number;
    steep_segments: { from_km: number; to_km: number; note: string }[];
    accuracy_note: string;
  };
  track_info?: {
    total: number;
    community_count?: number;
    official_id: string | null;
    recommended_id: string | null;
    filter_tags?: string[];
    tracks: {
      id: string;
      title: string;
      summary: string;
      is_official: boolean;
      recommended: boolean;
      author: string;
      author_level: number;
      distance_km: number;
      elevation_gain_m: number;
      annotation_count: number;
      use_count: number;
      complete_count: number;
      rating: number;
      rating_count: number;
      feedback: { useful: number; outdated: number; hard: number };
      tags: string[];
      created_at: string;
      updated_at: string;
    }[];
  };
  favorited?: boolean;
}

type TrackItem = NonNullable<RouteDetail['track_info']>['tracks'][number];
type TrackMetricSort = 'default' | 'useful' | 'complete' | 'use';

const TRACK_SORT_OPTIONS: { key: TrackMetricSort; label: string }[] = [
  { key: 'default', label: '综合' },
  { key: 'useful', label: '有用' },
  { key: 'complete', label: '完走' },
  { key: 'use', label: '选用' },
];

function communityTrackTags(tracks: TrackItem[]): string[] {
  const set = new Set<string>();
  for (const t of tracks) {
    if (t.is_official) continue;
    for (const tag of t.tags) {
      if (tag !== '社区') set.add(tag);
    }
  }
  return Array.from(set).sort();
}

function filterCommunityTracks(
  tracks: TrackItem[],
  selectedTags: string[],
  sort: TrackMetricSort
): TrackItem[] {
  let list = tracks.filter((t) => !t.is_official);
  if (selectedTags.length > 0) {
    list = list.filter((t) => selectedTags.every((tag) => t.tags.includes(tag)));
  }
  if (sort === 'useful') {
    return [...list].sort((a, b) => b.feedback.useful - a.feedback.useful);
  }
  if (sort === 'complete') {
    return [...list].sort((a, b) => b.complete_count - a.complete_count);
  }
  if (sort === 'use') {
    return [...list].sort((a, b) => b.use_count - a.use_count);
  }
  return [...list].sort((a, b) => {
    const scoreA = a.rating * 10 + a.use_count * 0.05 + a.feedback.useful * 0.1;
    const scoreB = b.rating * 10 + b.use_count * 0.05 + b.feedback.useful * 0.1;
    return scoreB - scoreA;
  });
}

const radarLabels = ['爬升强度', '路面难度', '海拔风险', '信号覆盖', '补给可达'];
const radarKeys: (keyof RouteDetail['ratings'])[] = [
  'climb_intensity',
  'terrain_difficulty',
  'altitude_risk',
  'signal_coverage',
  'supply_access',
];

const riskMeta: Record<
  RiskMarkerType,
  { color: string; icon: string; legend: string }
> = {
  steep: { color: '#C44536', icon: 'mountain', legend: '陡坡' },
  cliff: { color: '#C44536', icon: 'triangle-exclamation', legend: '悬崖/险段' },
  no_signal: { color: '#8B6914', icon: 'signal', legend: '无信号区' },
  water: { color: '#2D6A4F', icon: 'droplet', legend: '水源点' },
};

const tipColors = {
  info: { bg: 'rgba(45,106,79,0.08)', border: 'rgba(45,106,79,0.25)', text: '#2D6A4F' },
  warn: { bg: 'rgba(233,196,106,0.2)', border: 'rgba(184,134,11,0.35)', text: '#8B6914' },
  danger: { bg: 'rgba(196,69,54,0.1)', border: 'rgba(196,69,54,0.3)', text: '#C44536' },
};

function RadarChart({ ratings }: { ratings: RouteDetail['ratings'] }) {
  const size = 220;
  const center = size / 2;
  const maxR = 85;
  const levels = 5;
  const angleStep = (2 * Math.PI) / 5;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    const r = (value / 10) * maxR;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const r = ((level + 1) / levels) * maxR;
    const points = Array.from({ length: 5 }, (__, i) => {
      const angle = startAngle + i * angleStep;
      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    }).join(' ');
    return points;
  });

  const dataPoints = radarKeys.map((key, i) => getPoint(i, ratings[key]));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridPolygons.map((points, i) => (
        <Polygon
          key={i}
          points={points}
          fill="none"
          stroke="#E8DFD3"
          strokeWidth={i === levels - 1 ? 1.5 : 0.8}
        />
      ))}
      {Array.from({ length: 5 }, (_, i) => {
        const angle = startAngle + i * angleStep;
        return (
          <Line
            key={`line-${i}`}
            x1={center}
            y1={center}
            x2={center + maxR * Math.cos(angle)}
            y2={center + maxR * Math.sin(angle)}
            stroke="#E8DFD3"
            strokeWidth={0.8}
          />
        );
      })}
      <Polygon points={dataPolygon} fill="rgba(45,106,79,0.2)" stroke="#2D6A4F" strokeWidth={2} />
      {dataPoints.map((p, i) => (
        <Circle key={`dot-${i}`} cx={p.x} cy={p.y} r={4} fill="#2D6A4F" />
      ))}
      {radarLabels.map((label, i) => {
        const angle = startAngle + i * angleStep;
        const labelR = maxR + 22;
        const x = center + labelR * Math.cos(angle);
        const y = center + labelR * Math.sin(angle);
        return (
          <SvgText
            key={`label-${i}`}
            x={x}
            y={y}
            textAnchor="middle"
            fontSize={10}
            fill="#8B7D6B"
            fontWeight="600"
            dy={4}
          >
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

/** 路线风险示意地图：轨迹 + 安全预警标注 + 图层 */
function RiskMap({
  markers,
  distance,
  layer,
}: {
  markers: RouteDetail['risk_markers'];
  distance: number;
  layer: 'standard' | 'satellite' | 'contour';
}) {
  const W = 320;
  const H = 180;
  const pathD =
    'M 24 140 C 60 130, 80 90, 110 95 S 160 130, 190 100 S 250 40, 296 48';

  const pointAt = (t: number) => {
    const samples = [
      [24, 140],
      [70, 110],
      [110, 95],
      [150, 115],
      [190, 100],
      [240, 55],
      [296, 48],
    ];
    const idx = Math.min(samples.length - 2, Math.floor(t * (samples.length - 1)));
    const local = t * (samples.length - 1) - idx;
    const a = samples[idx];
    const b = samples[idx + 1];
    return {
      x: a[0] + (b[0] - a[0]) * local,
      y: a[1] + (b[1] - a[1]) * local,
    };
  };

  const bg =
    layer === 'satellite' ? '#3D4A3A' : layer === 'contour' ? '#EDE4D4' : '#F1EBE0';
  const trailColor = layer === 'satellite' ? '#E9C46A' : '#2D6A4F';

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <SvgGradient id="trailGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={trailColor} stopOpacity="0.35" />
            <Stop offset="1" stopColor={trailColor} stopOpacity="0.95" />
          </SvgGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} rx={16} fill={bg} />
        {layer === 'contour'
          ? [30, 55, 80, 105].map((r, i) => (
              <Circle
                key={r}
                cx={160}
                cy={100}
                r={r}
                fill="none"
                stroke="#8B6914"
                strokeWidth={1}
                opacity={0.45 - i * 0.05}
              />
            ))
          : null}
        {layer === 'satellite' ? (
          <>
            <Circle cx={90} cy={70} r={36} fill="rgba(255,255,255,0.06)" />
            <Circle cx={220} cy={50} r={42} fill="rgba(0,0,0,0.15)" />
          </>
        ) : (
          <>
            <Circle cx={90} cy={70} r={36} fill="rgba(45,106,79,0.08)" />
            <Circle cx={220} cy={50} r={42} fill="rgba(139,105,20,0.08)" />
          </>
        )}
        <Path d={pathD} stroke="url(#trailGrad)" strokeWidth={5} fill="none" strokeLinecap="round" />
        <Circle cx={24} cy={140} r={7} fill={trailColor} />
        <SvgText
          x={24}
          y={158}
          textAnchor="middle"
          fontSize={9}
          fill={layer === 'satellite' ? '#ccc' : '#8B7D6B'}
        >
          起点
        </SvgText>
        <Circle cx={296} cy={48} r={7} fill="#C44536" />
        <SvgText
          x={296}
          y={66}
          textAnchor="middle"
          fontSize={9}
          fill={layer === 'satellite' ? '#ccc' : '#8B7D6B'}
        >
          终点
        </SvgText>
        {markers.map((m) => {
          const p = pointAt(m.progress);
          const color = riskMeta[m.type].color;
          return (
            <React.Fragment key={m.id}>
              <Circle cx={p.x} cy={p.y} r={10} fill="#fff" stroke={color} strokeWidth={2.5} />
              <Circle cx={p.x} cy={p.y} r={4} fill={color} />
            </React.Fragment>
          );
        })}
        <SvgText
          x={12}
          y={18}
          fontSize={10}
          fill={layer === 'satellite' ? '#ddd' : '#8B7D6B'}
          fontWeight="600"
        >
          {layer === 'satellite' ? '卫星底图' : layer === 'contour' ? '等高线叠加' : '标准示意'} ·{' '}
          {distance}km
        </SvgText>
      </Svg>

      <View className="flex-row flex-wrap gap-2 mt-3">
        {(Object.keys(riskMeta) as RiskMarkerType[]).map((key) => (
          <View key={key} className="flex-row items-center gap-1.5 mr-1">
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: riskMeta[key].color,
              }}
            />
            <Text className="text-xs text-muted">{riskMeta[key].legend}</Text>
          </View>
        ))}
      </View>

      <View className="mt-3 gap-2">
        {markers.map((m) => (
          <View
            key={m.id}
            className="flex-row items-start p-2.5 rounded-xl"
            style={{ backgroundColor: 'rgba(61,50,41,0.04)' }}
          >
            <View
              className="w-7 h-7 rounded-full items-center justify-center mr-2.5"
              style={{ backgroundColor: `${riskMeta[m.type].color}22` }}
            >
              <FontAwesome6
                name={riskMeta[m.type].icon as 'mountain'}
                size={11}
                color={riskMeta[m.type].color}
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-foreground">
                {m.label}
                <Text className="text-muted font-normal">
                  {' '}
                  · {Math.round(m.progress * distance * 10) / 10}km 附近
                </Text>
              </Text>
              <Text className="text-xs text-muted mt-0.5" style={{ lineHeight: 17 }}>
                {m.note}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ElevationChart({ profile }: { profile: RouteDetail['elevation_profile'] }) {
  if (!profile?.points?.length) return null;
  const W = 320;
  const H = 140;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const pts = profile.points;
  const minD = pts[0].distance_km;
  const maxD = pts[pts.length - 1].distance_km || 1;
  const minA = profile.min_m;
  const maxA = profile.max_m;
  const spanA = Math.max(maxA - minA, 1);

  const xy = (p: (typeof pts)[0]) => {
    const x = padL + ((p.distance_km - minD) / (maxD - minD || 1)) * (W - padL - padR);
    const y = padT + (1 - (p.altitude_m - minA) / spanA) * (H - padT - padB);
    return { x, y };
  };

  const line = pts.map(xy);
  const area = [
    `${padL},${H - padB}`,
    ...line.map((p) => `${p.x},${p.y}`),
    `${W - padR},${H - padB}`,
  ].join(' ');

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Polygon points={area} fill="rgba(45,106,79,0.12)" />
        <Path
          d={line.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
          stroke="#2D6A4F"
          strokeWidth={2.5}
          fill="none"
        />
        {pts.map((p, i) => {
          const c = xy(p);
          return (
            <React.Fragment key={`${p.distance_km}-${i}`}>
              <Circle
                cx={c.x}
                cy={c.y}
                r={p.is_peak ? 5 : 3.5}
                fill={p.is_peak ? '#C44536' : p.is_steep ? '#D4A017' : '#2D6A4F'}
              />
            </React.Fragment>
          );
        })}
        <SvgText x={padL} y={H - 8} fontSize={9} fill="#8B7D6B">
          {minD}km
        </SvgText>
        <SvgText x={W - padR} y={H - 8} textAnchor="end" fontSize={9} fill="#8B7D6B">
          {maxD}km
        </SvgText>
        <SvgText x={4} y={padT + 4} fontSize={9} fill="#8B7D6B">
          {maxA}m
        </SvgText>
        <SvgText x={4} y={H - padB} fontSize={9} fill="#8B7D6B">
          {minA}m
        </SvgText>
      </Svg>
      <View className="flex-row flex-wrap gap-2 mt-2">
        <Text className="text-xs text-muted">最高 {profile.max_m}m</Text>
        <Text className="text-xs text-muted">最低 {profile.min_m}m</Text>
        <Text className="text-xs text-muted">累计爬升 {profile.total_ascent_m}m</Text>
      </View>
      {profile.steep_segments?.slice(0, 2).map((s) => (
        <Text key={`${s.from_km}-${s.to_km}`} className="text-xs mt-1.5" style={{ color: '#C44536' }}>
          陡坡 {s.from_km.toFixed(1)}–{s.to_km.toFixed(1)}km：{s.note}
        </Text>
      ))}
      <Text className="text-xs text-muted mt-2" style={{ lineHeight: 16 }}>
        {profile.accuracy_note}
      </Text>
    </View>
  );
}

function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <View className="flex-row items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <FontAwesome6
          key={i}
          name="star"
          size={11}
          color={i < full || (i === full && half) ? '#D4A017' : '#E8DFD3'}
          solid={i < full}
        />
      ))}
    </View>
  );
}

function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`mx-5 mt-4 bg-surface p-5 ${className}`}
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
      {children}
    </View>
  );
}

function getMatchColor(score: number): string {
  if (score >= 70) return '#2D6A4F';
  if (score >= 50) return '#E9C46A';
  return '#C44536';
}

function getMatchLabel(score: number): string {
  if (score >= 80) return '非常适合你';
  if (score >= 70) return '比较合适';
  if (score >= 50) return '有一定挑战';
  return '超出能力范围';
}

export default function RouteDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ id: string }>();
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRealPhoto, setShowRealPhoto] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineDemo, setOfflineDemo] = useState(false);
  const [mapLayer, setMapLayer] = useState<'standard' | 'satellite' | 'contour'>('standard');
  const [trackTagFilters, setTrackTagFilters] = useState<string[]>([]);
  const [trackMetricSort, setTrackMetricSort] = useState<TrackMetricSort>('default');
  const [expandedCommunityTrackId, setExpandedCommunityTrackId] = useState<string | null>(null);
  const [joinTripOpen, setJoinTripOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!params.id) return;
      (async () => {
        try {
          const res = await fetchApi<{ data: RouteDetail }>(`/api/v1/routes/${params.id}`);
          setRoute(res.data);
          setFavorited(!!res.data.favorited);
        } catch {
          setRoute(null);
        } finally {
          setLoading(false);
        }
      })();
    }, [params.id])
  );

  if (loading) {
    return (
      <Screen backgroundColor="#FDF8F0">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2D6A4F" />
        </View>
      </Screen>
    );
  }

  if (!route) {
    return (
      <Screen backgroundColor="#FDF8F0">
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">路线不存在</Text>
        </View>
      </Screen>
    );
  }

  const matchColor = getMatchColor(route.match_score);
  const ai = route.ai_difficulty;

  const joinTrip = () => {
    setJoinTripOpen(true);
  };

  const onJoinedTrip = (_trip: { id: string; route_id: string; departure_at: string }) => {
    // 成功态与跳转由 JoinTripModal 内完成，避免 Web/移动端 Alert 多按钮无响应
  };

  const toggleFavorite = async () => {
    if (!route) return;
    try {
      const res = await fetchApi<{ data: { favorited: boolean } }>(
        '/api/v1/trips/favorites/toggle',
        {
          method: 'POST',
          body: JSON.stringify({ route_id: route.id }),
        }
      );
      const next = !!res.data.favorited;
      setFavorited(next);
      Toast.show({
        type: 'success',
        text1: next ? '已收藏路线' : '已取消收藏',
        text2: next ? '可在「行程」页查看收藏' : '已从行程收藏中移除',
      });
    } catch (e) {
      notifyError('操作失败', e instanceof Error ? e.message : '请稍后重试');
    }
  };

  const sendTrackFeedback = async (
    trackId: string,
    type: 'useful' | 'outdated' | 'hard'
  ) => {
    try {
      const res = await fetchApi<{ track_info: NonNullable<RouteDetail['track_info']> }>(
        '/api/v1/track/feedback',
        {
          method: 'POST',
          body: JSON.stringify({ track_id: trackId, type }),
        }
      );
      if (res.track_info) {
        setRoute((prev) => (prev ? { ...prev, track_info: res.track_info } : prev));
      }
    } catch (e) {
      notifyError('反馈失败', e instanceof Error ? e.message : '请稍后重试');
    }
  };

  const enterTrackIfAllowed = async (trackId?: string) => {
    try {
      await fetchApi('/api/v1/trips', {
        method: 'POST',
        body: JSON.stringify({
          route_id: route.id,
          departure_at: dayjs().toISOString(),
        }),
      });
    } catch {
      // ignore — 可能已有行程
    }
    try {
      const board = await fetchApi<{
        data: {
          current: {
            id: string;
            route_id: string;
            guard_active?: boolean;
            track_access?: { allowed?: boolean; via?: string | null };
          } | null;
        };
      }>('/api/v1/trips/board');
      const current = board.data?.current;
      if (!current || current.route_id !== route.id) {
        notifyError('请先加入行程', '请在行程页确认当前计划后再进入示意跟线');
        router.push('/(tabs)/trip');
        return;
      }
      if (!current.track_access?.allowed) {
        notifyInfo('需先开启行中守护', '示意跟线不能仅靠免责签署进入，请到行程页开启守护');
        router.push('/(tabs)/trip');
        return;
      }
      router.push('/track', {
        routeId: route.id,
        tripId: current.id,
        trackId: trackId || undefined,
        withGuard: !!current.guard_active,
      });
    } catch (e) {
      notifyError('无法进入跟线', e instanceof Error ? e.message : '请稍后重试');
    }
  };

  const openTrackVariant = (trackId: string) => {
    confirmDialog(
      '进入示意跟线',
      '将使用该轨迹做示意步行（非精确导航）。须已开启行中守护。',
      {
        confirmText: '继续',
        onConfirm: () => void enterTrackIfAllowed(trackId),
      }
    );
  };

  const startNavigate = () => {
    const recommended =
      route.track_info?.recommended_id || route.track_info?.official_id || undefined;
    confirmDialog(
      '进入示意跟线',
      '示意跟线需先开启行中守护。未满足将跳转行程页。',
      {
        confirmText: '继续',
        onConfirm: () => void enterTrackIfAllowed(recommended),
      }
    );
  };

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 180 }}>
        {/* Hero */}
        <View className="relative">
          <Image
            source={{ uri: showRealPhoto ? route.real_photo_url : route.image_url }}
            style={{ width: '100%', height: 280 }}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 140 }}
          />
          <TouchableOpacity
            onPress={() => router.back()}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/30 items-center justify-center"
            style={{ marginTop: insets.top }}
          >
            <FontAwesome6 name="chevron-left" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowRealPhoto(!showRealPhoto)}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/30"
            style={{ marginTop: insets.top }}
          >
            <Text className="text-white text-xs font-medium">
              {showRealPhoto ? '宣传图' : '实拍图'}
            </Text>
          </TouchableOpacity>
          <View className="absolute bottom-4 left-4 right-4">
            <Text className="text-white text-2xl font-bold">{route.name}</Text>
            <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
              <FontAwesome6 name="location-dot" size={12} color="rgba(255,255,255,0.85)" />
              <Text className="text-white/90 text-sm">{route.region || route.location}</Text>
            </View>
            <View className="flex-row items-center gap-3 mt-2.5 flex-wrap">
              <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/35">
                <Text className="text-white text-xs font-semibold">
                  AI 难度 {ai?.label ?? route.difficulty}
                </Text>
                <Text className="text-white/80 text-xs">
                  {'★'.repeat(ai?.stars ?? route.difficulty_stars)}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/35">
                <Stars value={route.overall_rating ?? 4.5} />
                <Text className="text-white text-xs font-semibold">
                  {route.overall_rating?.toFixed(1) ?? '4.5'}
                </Text>
                <Text className="text-white/70 text-xs">({route.rating_count ?? 0})</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 核心数据 */}
        <Card>
          <Text className="text-lg font-bold text-foreground mb-1">核心数据</Text>
          <Text className="text-xs text-muted mb-4">里程 · 爬升 · 海拔 · 时长 · 路况类型</Text>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
            {[
              { icon: 'road', label: '里程', value: `${route.distance}km` },
              { icon: 'arrow-up', label: '爬升', value: `${route.elevation_gain}m` },
              { icon: 'mountain', label: '最高海拔', value: `${route.max_altitude}m` },
              { icon: 'clock', label: '预估时长', value: route.estimated_duration },
            ].map((item) => (
              <View key={item.label} className="items-center mb-3" style={{ width: '25%', paddingHorizontal: 4 }}>
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mb-1.5"
                  style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                >
                  <FontAwesome6 name={item.icon as 'road'} size={15} color="#2D6A4F" />
                </View>
                <Text className="text-xs text-muted">{item.label}</Text>
                <Text className="text-sm font-bold text-foreground mt-0.5">{item.value}</Text>
              </View>
            ))}
          </View>
          <View
            className="mt-1 px-3 py-2.5 rounded-2xl flex-row items-center gap-2"
            style={{ backgroundColor: 'rgba(45,106,79,0.06)' }}
          >
            <FontAwesome6 name="layer-group" size={13} color="#2D6A4F" />
            <Text className="text-sm font-semibold flex-1" style={{ color: '#2D6A4F' }}>
              路况类型 · {route.terrain_type || '山地步道'}
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-2 mt-3">
            <View className="px-3 py-1.5 rounded-full bg-default">
              <Text className="text-xs font-medium text-foreground">完成率 {route.completion_rate}%</Text>
            </View>
            <View className="px-3 py-1.5 rounded-full bg-default">
              <Text className="text-xs font-medium text-foreground">折返率 {route.turnaround_rate}%</Text>
            </View>
            {route.best_season && route.best_season.length > 0 ? (
               route.best_season.map((s) => (
              <View
                key={s}
                className="px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
              >
                <Text className="text-xs font-medium" style={{ color: '#2D6A4F' }}>
                  {s}
                </Text>
              </View>
            ))
          ):(
            <View className="px-3 py-1.5 rounded-full bg-default">
              <Text className="text-xs font-medium text-foreground">最佳季节 暂无数据</Text>
            </View>
              )}
          </View>
        </Card>

        {/* 轨迹信息：官方特写 + 社区收缩列表 + 标签/指标筛选 */}
        {route.track_info && route.track_info.tracks.length > 0 ? (
          <Card>
            {(() => {
              const info = route.track_info!;
              const official = info.tracks.find((t) => t.is_official);
              const tagPool = info.filter_tags?.length
                ? info.filter_tags
                : communityTrackTags(info.tracks);
              const communityList = filterCommunityTracks(
                info.tracks,
                trackTagFilters,
                trackMetricSort
              );
              const communityTotal =
                info.community_count ?? info.tracks.filter((t) => !t.is_official).length;

              const toggleTag = (tag: string) => {
                setTrackTagFilters((prev) =>
                  prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
                );
              };

              return (
                <>
                  <View className="flex-row items-center gap-2 mb-1">
                    <FontAwesome6 name="route" size={15} color="#2D6A4F" />
                    <Text className="text-lg font-bold text-foreground">轨迹信息</Text>
                  </View>
                  <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
                    官方标准路线特写推荐；社区轨迹折叠展示关键指标，可按标签与有用/完走/选用筛选。
                  </Text>

                  {official ? (
                    <View
                      className="mb-4 p-4"
                      style={{
                        backgroundColor: 'rgba(45,106,79,0.07)',
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 8,
                        borderBottomLeftRadius: 8,
                        borderBottomRightRadius: 20,
                        borderWidth: 1,
                        borderColor: 'rgba(45,106,79,0.35)',
                      }}
                    >
                      <View className="flex-row items-center gap-1.5 flex-wrap mb-2">
                        <View
                          className="px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#2D6A4F' }}
                        >
                          <Text className="text-xs font-bold text-white">官方</Text>
                        </View>
                        {official.recommended ? (
                          <View
                            className="px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: 'rgba(212,160,23,0.28)' }}
                          >
                            <Text className="text-xs font-bold" style={{ color: '#8B6914' }}>
                              推荐
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-base font-bold text-foreground mb-1">
                        {official.title}
                      </Text>
                      <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
                        {official.summary}
                      </Text>
                      <View className="flex-row flex-wrap gap-x-3 gap-y-1 mb-3">
                        <Text className="text-xs text-muted">标注 {official.annotation_count}</Text>
                        <Text className="text-xs text-muted">选用 {official.use_count}</Text>
                        <Text className="text-xs text-muted">完走 {official.complete_count}</Text>
                        <Text className="text-xs" style={{ color: '#D4A017' }}>
                          ★ {official.rating}
                          {official.rating_count > 0 ? ` (${official.rating_count})` : ''}
                        </Text>
                        <Text className="text-xs text-muted">有用 {official.feedback.useful}</Text>
                      </View>
                      <View className="flex-row flex-wrap gap-2">
                        <TouchableOpacity
                          onPress={() => openTrackVariant(official.id)}
                          className="px-3.5 py-2.5 rounded-full"
                          style={{ backgroundColor: '#2D6A4F' }}
                        >
                          <Text className="text-xs font-bold text-white">使用示意轨迹</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => sendTrackFeedback(official.id, 'useful')}
                          className="px-3 py-2.5 rounded-full"
                          style={{ backgroundColor: 'rgba(45,106,79,0.12)' }}
                        >
                          <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                            有用
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-sm font-bold text-foreground">
                      社区轨迹 · {communityList.length}
                      {communityList.length !== communityTotal ? `/${communityTotal}` : ''}
                    </Text>
                    {(trackTagFilters.length > 0 || trackMetricSort !== 'default') && (
                      <TouchableOpacity
                        onPress={() => {
                          setTrackTagFilters([]);
                          setTrackMetricSort('default');
                        }}
                      >
                        <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                          清除筛选
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View className="flex-row flex-wrap gap-2 mb-2">
                    {TRACK_SORT_OPTIONS.map((opt) => {
                      const active = trackMetricSort === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={() => setTrackMetricSort(opt.key)}
                          className="px-2.5 py-1 rounded-full"
                          style={{
                            backgroundColor: active ? '#2D6A4F' : 'rgba(61,50,41,0.06)',
                          }}
                        >
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: active ? '#fff' : '#6B5E52' }}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {tagPool.length > 0 ? (
                    <View className="flex-row flex-wrap gap-1.5 mb-3">
                      {tagPool.map((tag) => {
                        const active = trackTagFilters.includes(tag);
                        return (
                          <TouchableOpacity
                            key={tag}
                            onPress={() => toggleTag(tag)}
                            className="px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: active
                                ? 'rgba(45,106,79,0.18)'
                                : 'rgba(61,50,41,0.05)',
                              borderWidth: 1,
                              borderColor: active
                                ? 'rgba(45,106,79,0.45)'
                                : 'rgba(61,50,41,0.08)',
                            }}
                          >
                            <Text
                              className="text-xs"
                              style={{ color: active ? '#2D6A4F' : '#6B5E52' }}
                            >
                              {tag}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}

                  {communityList.length === 0 ? (
                    <Text className="text-xs text-muted mb-1">暂无符合筛选的社区轨迹</Text>
                  ) : (
                    communityList.map((t) => {
                      const expanded = expandedCommunityTrackId === t.id;
                      const displayTags = t.tags.filter((x) => x !== '社区').slice(0, 3);
                      return (
                        <View
                          key={t.id}
                          className="mb-2 px-3 py-2.5"
                          style={{
                            backgroundColor: 'rgba(61,50,41,0.035)',
                            borderTopLeftRadius: 12,
                            borderTopRightRadius: 6,
                            borderBottomLeftRadius: 6,
                            borderBottomRightRadius: 12,
                          }}
                        >
                          <View className="flex-row items-start justify-between gap-2">
                            <TouchableOpacity
                              activeOpacity={0.75}
                              className="flex-1"
                              onPress={() =>
                                setExpandedCommunityTrackId(expanded ? null : t.id)
                              }
                            >
                              <Text
                                className="text-sm font-semibold text-foreground"
                                numberOfLines={1}
                              >
                                {t.title}
                              </Text>
                              <View className="flex-row items-center flex-wrap gap-x-2.5 gap-y-0.5 mt-1">
                                <Text className="text-xs text-muted">
                                  {t.author} · 标注{t.annotation_count}
                                </Text>
                                <Text className="text-xs" style={{ color: '#2D6A4F' }}>
                                  有用 {t.feedback.useful}
                                </Text>
                                <Text className="text-xs text-muted">完走 {t.complete_count}</Text>
                                <Text className="text-xs text-muted">选用 {t.use_count}</Text>
                              </View>
                              {displayTags.length > 0 ? (
                                <View className="flex-row flex-wrap gap-1 mt-1.5">
                                  {displayTags.map((tag) => (
                                    <View
                                      key={tag}
                                      className="px-1.5 py-0.5 rounded"
                                      style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                                    >
                                      <Text className="text-xs" style={{ color: '#2D6A4F' }}>
                                        {tag}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              ) : null}
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => openTrackVariant(t.id)}
                              className="px-2.5 py-1 rounded-full mt-0.5"
                              style={{ backgroundColor: '#2D6A4F' }}
                            >
                              <Text className="text-xs font-bold text-white">使用</Text>
                            </TouchableOpacity>
                          </View>

                          {expanded ? (
                            <View className="mt-2 pt-2" style={{ borderTopWidth: 1, borderTopColor: 'rgba(61,50,41,0.08)' }}>
                              {t.summary ? (
                                <Text className="text-xs text-muted mb-2" style={{ lineHeight: 17 }}>
                                  {t.summary}
                                </Text>
                              ) : null}
                              <View className="flex-row flex-wrap gap-2">
                                <TouchableOpacity
                                  onPress={() => sendTrackFeedback(t.id, 'useful')}
                                  className="px-2.5 py-1.5 rounded-full"
                                  style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
                                >
                                  <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                                    有用
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => sendTrackFeedback(t.id, 'outdated')}
                                  className="px-2.5 py-1.5 rounded-full"
                                  style={{ backgroundColor: 'rgba(61,50,41,0.06)' }}
                                >
                                  <Text className="text-xs text-muted">过时</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => sendTrackFeedback(t.id, 'hard')}
                                  className="px-2.5 py-1.5 rounded-full"
                                  style={{ backgroundColor: 'rgba(61,50,41,0.06)' }}
                                >
                                  <Text className="text-xs text-muted">偏难</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                </>
              );
            })()}
          </Card>
        ) : null}

        {/* 海拔剖面 */}
        {route.elevation_profile ? (
          <Card>
            <View className="flex-row items-center gap-2 mb-1">
              <FontAwesome6 name="chart-area" size={15} color="#2D6A4F" />
              <Text className="text-lg font-bold text-foreground">海拔剖面图</Text>
            </View>
            <Text className="text-xs text-muted mb-3">全程海拔变化 · 标注最高点与陡坡段</Text>
            <ElevationChart profile={route.elevation_profile} />
          </Card>
        ) : null}

        {/* AI 难度说明 */}
        <Card>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground">五维难度摘要</Text>
            <View className="px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}>
              <Text className="text-xs font-bold" style={{ color: '#2D6A4F' }}>
                {ai?.label} · {ai?.score}/10
              </Text>
            </View>
          </View>
          <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
            由爬升、路面、海拔、信号、补给五维规则综合，属示意评级，非个性化 AI 结论，也不能作为出行许可。
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(ai?.basis ?? []).map((b) => (
              <View key={b} className="px-2.5 py-1 rounded-full bg-default">
                <Text className="text-xs text-muted">{b}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* 路段风险地图 */}
        <Card>
          <View className="flex-row items-center gap-2 mb-1">
            <FontAwesome6 name="map-location-dot" size={16} color="#C44536" />
            <Text className="text-lg font-bold text-foreground">路段风险地图</Text>
          </View>
          <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
            切换底图查看地形；标注陡坡、悬崖、无信号区与水源点。
          </Text>
          <View className="flex-row gap-2 mb-3">
            {(
              [
                { key: 'standard' as const, label: '标准' },
                { key: 'satellite' as const, label: '卫星' },
                { key: 'contour' as const, label: '等高线' },
              ] as const
            ).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setMapLayer(opt.key)}
                className="px-3 py-1.5 rounded-full"
                style={{
                  backgroundColor: mapLayer === opt.key ? '#2D6A4F' : 'rgba(45,106,79,0.1)',
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: mapLayer === opt.key ? '#fff' : '#2D6A4F' }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {(mapLayer === 'satellite' || mapLayer === 'contour') && !offlineReady ? (
            <Text className="text-xs mb-2" style={{ color: '#8B6914', lineHeight: 17 }}>
              演示图层。行前请点底部「离线包」下载本区{mapLayer === 'satellite' ? '卫星' : '等高线'}图。
            </Text>
          ) : null}
          <RiskMap
            markers={route.risk_markers || []}
            distance={route.distance}
            layer={mapLayer}
          />
          <View className="flex-row flex-wrap gap-2 mt-4 pt-3" style={{ borderTopWidth: 1, borderTopColor: '#F1EBE0' }}>
            {[
              { id: 'measure', icon: 'ruler', label: '测距' },
              { id: 'viewshed', icon: 'binoculars', label: '通视' },
              { id: 'camp', icon: 'campground', label: '营地' },
              { id: 'altimeter', icon: 'mountain', label: '海拔仪' },
            ].map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => router.push('/tool', { id: t.id })}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-full"
                style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
              >
                <FontAwesome6 name={t.icon as 'ruler'} size={12} color="#2D6A4F" />
                <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* AI 安全提示 */}
        <Card>
          <View className="flex-row items-center gap-2 mb-1">
            <FontAwesome6 name="shield-halved" size={16} color="#2D6A4F" />
            <Text className="text-lg font-bold text-foreground">安全提示</Text>
          </View>
          <Text className="text-xs text-muted mb-3">AI 主动预警 · 结合路况与历史风险生成</Text>
          {(route.ai_safety_tips || []).map((tip) => {
            const c = tipColors[tip.level as keyof typeof tipColors] ?? tipColors.info;
            return (
              <View
                key={tip.id}
                className="mb-2.5 p-3 rounded-2xl"
                style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}
              >
                <Text className="text-sm font-bold mb-1" style={{ color: c.text }}>
                  {tip.title}
                </Text>
                <Text className="text-xs text-foreground" style={{ lineHeight: 18 }}>
                  {tip.body}
                </Text>
              </View>
            );
          })}
        </Card>

        {/* 路书 / 攻略 */}
        <Card>
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-row items-center gap-2">
              <FontAwesome6 name="book-open" size={15} color="#2D6A4F" />
              <Text className="text-lg font-bold text-foreground">路书 / 攻略</Text>
            </View>
            {route.guidebook?.safety_reviewed ? (
              <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}>
                <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                  已安全审核
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
            {route.guidebook?.summary}
            {route.guidebook?.reviewed_at ? ` · ${route.guidebook.reviewed_at}` : ''}
          </Text>

          <Text className="text-sm font-semibold text-foreground mb-2">关键节点</Text>
          {(route.guidebook?.nodes || []).map((node, i, arr) => (
            <View key={`${node.name}-${i}`} className="flex-row items-start mb-3">
              <View className="items-center mr-3">
                <View
                  className="w-6 h-6 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: i === 0 || i === arr.length - 1 ? '#2D6A4F' : '#F1EBE0',
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: i === 0 || i === arr.length - 1 ? '#fff' : '#8B7D6B' }}
                  >
                    {i + 1}
                  </Text>
                </View>
                {i < arr.length - 1 ? <View className="w-0.5 h-8 bg-default mt-1" /> : null}
              </View>
              <View className="flex-1 pb-1">
                <Text className="text-sm font-semibold text-foreground">
                  {node.name}
                  <Text className="text-xs text-muted font-normal"> · {node.distance_km}km</Text>
                </Text>
                <Text className="text-xs text-muted mt-0.5">{node.condition}</Text>
                {node.tip ? (
                  <Text className="text-xs mt-0.5" style={{ color: '#2D6A4F' }}>
                    {node.tip}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}

          <Text className="text-sm font-semibold text-foreground mb-2 mt-1">路况说明</Text>
          {(route.guidebook?.condition_notes || []).map((note) => (
            <Text key={note} className="text-xs text-muted mb-1.5" style={{ lineHeight: 18 }}>
              · {note}
            </Text>
          ))}

          <Text className="text-sm font-semibold text-foreground mb-2 mt-3">装备建议</Text>
          <View className="flex-row flex-wrap gap-2">
            {(route.guidebook?.gear_suggestions || []).map((g) => (
              <View
                key={g}
                className="px-2.5 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
              >
                <Text className="text-xs font-medium" style={{ color: '#2D6A4F' }}>
                  {g}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* 五维评测（保留） */}
        <Card>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-foreground">五维评测</Text>
            <View className="px-4 py-2 rounded-2xl" style={{ backgroundColor: `${matchColor}15` }}>
              <Text className="text-sm font-bold" style={{ color: matchColor }}>
                契合度示意 {route.match_score}%
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: matchColor }}>
                {getMatchLabel(route.match_score)}
              </Text>
            </View>
          </View>
          <View className="items-center">
            <RadarChart ratings={route.ratings} />
          </View>
          <View className="mt-4 gap-2">
            {radarKeys.map((key, i) => (
              <View key={key} className="flex-row items-center">
                <Text className="text-xs text-muted w-16">{radarLabels[i]}</Text>
                <View className="flex-1 h-2 bg-default rounded-full mx-2 overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${(route.ratings[key] / 10) * 100}%`,
                      backgroundColor:
                        route.ratings[key] >= 7
                          ? '#C44536'
                          : route.ratings[key] >= 4
                            ? '#E9C46A'
                            : '#2D6A4F',
                    }}
                  />
                </View>
                <Text className="text-xs font-bold text-foreground w-6 text-right">
                  {route.ratings[key]}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* 简介（保留） */}
        <Card>
          <Text className="text-lg font-bold text-foreground mb-3">路线简介</Text>
          <Text className="text-sm text-muted leading-6">{route.description}</Text>
        </Card>

        {/* 补给点（保留） */}
        <Card>
          <Text className="text-lg font-bold text-foreground mb-4">补给点</Text>
          {route.checkpoints?.map((cp, i) => (
            <View key={cp.name} className="flex-row items-start mb-3">
              <View className="items-center mr-3">
                <View
                  className="w-6 h-6 rounded-full items-center justify-center"
                  style={{
                    backgroundColor:
                      i === 0 || i === route.checkpoints.length - 1 ? '#2D6A4F' : '#F1EBE0',
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{
                      color: i === 0 || i === route.checkpoints.length - 1 ? '#fff' : '#8B7D6B',
                    }}
                  >
                    {i + 1}
                  </Text>
                </View>
                {i < route.checkpoints.length - 1 && <View className="w-0.5 h-6 bg-default mt-1" />}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">{cp.name}</Text>
                <View className="flex-row items-center gap-3 mt-1">
                  <Text className="text-xs text-muted">{cp.distance_km}km</Text>
                  <View className="flex-row items-center gap-1">
                    <FontAwesome6
                      name="droplet"
                      size={9}
                      color={cp.has_water ? '#52B788' : '#C44536'}
                    />
                    <Text className="text-xs" style={{ color: cp.has_water ? '#52B788' : '#C44536' }}>
                      {cp.has_water ? '有水' : '无水'}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <FontAwesome6
                      name="signal"
                      size={9}
                      color={cp.has_signal ? '#52B788' : '#C44536'}
                    />
                    <Text
                      className="text-xs"
                      style={{ color: cp.has_signal ? '#52B788' : '#C44536' }}
                    >
                      {cp.has_signal ? '有信号' : '无信号'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))??
            <Text className="text-xs font-medium text-foreground">补给点 暂无数据</Text>
          }
        </Card>

        <TouchableOpacity onPress={joinTrip} className="mx-5 mt-4 mb-2" activeOpacity={0.85}>
          <View
            className="py-3.5 items-center"
            style={{
              backgroundColor: 'rgba(45,106,79,0.1)',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 18,
              borderWidth: 1,
              borderColor: 'rgba(45,106,79,0.25)',
            }}
          >
            <Text className="text-sm font-bold" style={{ color: '#2D6A4F' }}>
              加入行程
            </Text>
            <Text className="text-xs text-muted mt-0.5">
              设出发时间后变为唯一计划中行程（会替换已有计划）
            </Text>
          </View>
        </TouchableOpacity>

        <View className="mx-5 mb-4 flex-row gap-2">
          <TouchableOpacity
            onPress={() => router.push('/checklist', { routeId: route.id })}
            activeOpacity={0.85}
            className="flex-1"
          >
            <View
              className="py-3.5 items-center px-2"
              style={{
                backgroundColor: '#2D6A4F',
                borderTopLeftRadius: 18,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 18,
              }}
            >
              <FontAwesome6 name="list-check" size={14} color="#fff" />
              <Text className="text-sm font-bold text-white mt-1">准备清单</Text>
              <Text className="text-[10px] text-white/80 mt-0.5">行前必带与负重</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/safety-center')}
            activeOpacity={0.85}
            className="flex-1"
          >
            <View
              className="py-3.5 items-center px-2"
              style={{
                backgroundColor: 'rgba(45,106,79,0.12)',
                borderTopLeftRadius: 18,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 18,
                borderWidth: 1,
                borderColor: 'rgba(45,106,79,0.2)',
              }}
            >
              <FontAwesome6 name="user-shield" size={14} color="#2D6A4F" />
              <Text className="text-sm font-bold mt-1" style={{ color: '#2D6A4F' }}>
                安全中心
              </Text>
              <Text className="text-[10px] text-muted mt-0.5">行前联系人与 SOS</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 底部操作栏：示意跟线（非真导航） */}
      <View
        className="absolute bottom-0 left-0 right-0 px-4 pt-3 bg-background"
        style={{
          paddingBottom: Math.max(insets.bottom, 14),
          borderTopWidth: 1,
          borderTopColor: '#F1EBE0',
        }}
      >
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={toggleFavorite}
            className="items-center justify-center px-2"
            style={{ width: 56 }}
            activeOpacity={0.75}
          >
            <FontAwesome6
              name="bookmark"
              size={18}
              color={favorited ? '#2D6A4F' : '#8B7D6B'}
              solid={favorited}
            />
            <Text className="text-xs mt-1" style={{ color: favorited ? '#2D6A4F' : '#8B7D6B' }}>
              {favorited ? '取消收藏' : '收藏'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => {
              try {
                const res = await fetchApi<{
                  data: {
                    packs: {
                      title: string;
                      size_mb: number;
                      cdn_url: string;
                      note?: string;
                      downloadable?: boolean;
                    }[];
                    cdn_base: string;
                    demo?: boolean;
                    demo_note?: string;
                  };
                }>(`/api/v1/maps/offline-packs?route_id=${encodeURIComponent(params.id || '')}`);
                const packs = res.data.packs || [];
                const isDemo = !!res.data.demo || packs.every((p) => !p.downloadable);
                setOfflineReady(!isDemo);
                setOfflineDemo(isDemo);
                if (isDemo) {
                  Toast.show({
                    type: 'info',
                    text1: '离线包 · 仅演示标记',
                    text2:
                      res.data.demo_note ||
                      '未配置瓦片 CDN，当前无法真下载；路书/轨迹示意可离线查看',
                  });
                } else {
                  Toast.show({
                    type: 'success',
                    text1: '开始拉取离线包',
                    text2: packs[0]
                      ? `${packs[0].title} · ${packs[0].size_mb}MB`
                      : '已连接瓦片 CDN',
                  });
                }
              } catch {
                setOfflineReady(false);
                setOfflineDemo(false);
                Toast.show({
                  type: 'error',
                  text1: '离线包不可用',
                  text2: '请稍后重试；未配置 CDN 时仅支持演示标记',
                });
              }
            }}
            className="items-center justify-center px-2"
            style={{ width: 56 }}
            activeOpacity={0.75}
          >
            <FontAwesome6
              name="download"
              size={18}
              color={offlineReady ? '#2D6A4F' : offlineDemo ? '#B8860B' : '#8B7D6B'}
            />
            <Text
              className="text-xs mt-1"
              style={{ color: offlineReady ? '#2D6A4F' : offlineDemo ? '#B8860B' : '#8B7D6B' }}
            >
              {offlineReady ? '已下载' : offlineDemo ? '演示' : '离线包'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              router.push('/(tabs)/community', {
                routeId: route.id,
                intent: 'companion',
              });
            }}
            className="items-center justify-center px-2"
            style={{ width: 52 }}
            activeOpacity={0.75}
          >
            <FontAwesome6 name="user-group" size={17} color="#8B7D6B" />
            <Text className="text-xs mt-1 text-muted">约伴</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={startNavigate} activeOpacity={0.85} className="flex-1">
            <LinearGradient
              colors={['#2D6A4F', '#52B788']}
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
              <FontAwesome6 name="route" size={15} color="#fff" style={{ marginRight: 8 }} />
              <Text className="text-white text-base font-bold">示意跟线</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <JoinTripModal
        visible={joinTripOpen}
        routeId={route.id}
        routeName={route.name}
        onClose={() => setJoinTripOpen(false)}
        onJoined={onJoinedTrip}
      />
    </Screen>
  );
}
