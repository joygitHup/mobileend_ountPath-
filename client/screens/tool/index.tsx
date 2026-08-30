import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';

const titles: Record<string, string> = {
  altimeter: '海拔仪',
  compass: '指南针',
  measure: '测距工具',
  contour: '等高线图',
  satellite: '卫星地图',
  signal: '信号检测',
  camp: '营地标记',
  viewshed: '通视分析',
  profile: '海拔剖面',
  coords: '坐标转换',
};

function AltimeterPanel() {
  const [alt, setAlt] = useState<number | null>(null);
  const [source, setSource] = useState<'baro' | 'gps'>('baro');
  const [mode, setMode] = useState<'live' | 'demo'>('demo');

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { Barometer } = await import('expo-sensors');
        const available = await Barometer.isAvailableAsync();
        if (!available || cancelled) {
          setMode('demo');
          return;
        }
        setMode('live');
        Barometer.setUpdateInterval(1000);
        sub = Barometer.addListener((data) => {
          // 标准大气压近似：海拔(m) ≈ 44330 * (1 - (P/1013.25)^0.1903)
          const p = data.pressure;
          const approx = 44330 * (1 - Math.pow(p / 1013.25, 0.1903));
          setAlt(approx);
        });
      } catch {
        setMode('demo');
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'demo') return;
    setAlt(428);
    const t = setInterval(() => {
      setAlt((a) => (a ?? 428) + (Math.random() - 0.48) * 2.2);
    }, 1200);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    if (source !== 'gps' || mode === 'demo') return;
    let cancelled = false;
    (async () => {
      const { getBestPosition } = await import('@/utils/location');
      const pos = await getBestPosition();
      if (!cancelled && pos?.altitude != null) setAlt(pos.altitude);
    })();
    return () => {
      cancelled = true;
    };
  }, [source, mode]);

  return (
    <View className="items-center py-6">
      <Text className="text-xs text-muted mb-2">
        {mode === 'live' ? '气压计实读 · 可切 GPS 海拔' : '演示数据 · 不可用于野外决策'}
      </Text>
      <Text className="text-5xl font-bold text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
        {(alt ?? 0).toFixed(0)}
        <Text className="text-lg text-muted"> m</Text>
      </Text>
      <Text className="text-xs mt-2" style={{ color: '#2D6A4F' }}>
        精度说明：气压计估算约 ±5–15m，需本地校准
      </Text>
      <View className="flex-row gap-2 mt-5">
        {(['baro', 'gps'] as const).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setSource(s)}
            className="px-4 py-2 rounded-full"
            style={{
              backgroundColor: source === s ? '#2D6A4F' : 'rgba(45,106,79,0.1)',
            }}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: source === s ? '#fff' : '#2D6A4F' }}
            >
              {s === 'baro' ? '气压计校准' : 'GPS 海拔'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text className="text-xs text-muted mt-4 px-4 text-center" style={{ lineHeight: 18 }}>
        当前海拔为{source === 'baro' ? '气压计估算值' : 'GPS 海拔'}，可与当地气象站气压对比校准。
      </Text>
    </View>
  );
}

function CompassPanel() {
  const [heading, setHeading] = useState(42);
  const [warn, setWarn] = useState(false);
  const [mode, setMode] = useState<'live' | 'demo'>('demo');

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { Magnetometer } = await import('expo-sensors');
        const available = await Magnetometer.isAvailableAsync();
        if (!available || cancelled) {
          setMode('demo');
          return;
        }
        setMode('live');
        Magnetometer.setUpdateInterval(200);
        sub = Magnetometer.addListener((data) => {
          const angle = (Math.atan2(data.y, data.x) * 180) / Math.PI;
          const h = (angle + 360) % 360;
          setHeading(h);
        });
      } catch {
        setMode('demo');
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'demo') return;
    const t = setInterval(() => {
      setHeading((h) => (h + (Math.random() - 0.45) * 8 + 360) % 360);
    }, 800);
    return () => clearInterval(t);
  }, [mode]);

  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const dir = dirs[Math.round(heading / 45) % 8];

  return (
    <View className="items-center py-4">
      <Svg width={220} height={220} viewBox="0 0 220 220">
        <Circle cx={110} cy={110} r={100} fill="#F1EBE0" stroke="#2D6A4F" strokeWidth={3} />
        <Circle cx={110} cy={110} r={78} fill="#FDF8F0" stroke="#E8DFD3" strokeWidth={1} />
        <Polygon
          points="110,28 118,110 102,110"
          fill="#C44536"
          origin="110, 110"
          transform={`rotate(${heading}, 110, 110)`}
        />
        <Polygon
          points="110,192 118,110 102,110"
          fill="#3D3229"
          transform={`rotate(${heading}, 110, 110)`}
        />
        <SvgText x={110} y={24} textAnchor="middle" fontSize={14} fontWeight="700" fill="#2D6A4F">
          N
        </SvgText>
        <Circle cx={110} cy={110} r={6} fill="#2D6A4F" />
      </Svg>
      <Text className="text-3xl font-bold text-foreground mt-3">
        {heading.toFixed(0)}° · {dir}
      </Text>
      <Text className="text-xs text-muted mt-1">
        {mode === 'live' ? '磁力计实读 · 请远离金属干扰' : '磁偏角校正演示 · 离线可用'}
      </Text>
      <TouchableOpacity
        onPress={() => setWarn(true)}
        className="mt-4 px-4 py-2.5 rounded-full"
        style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
      >
        <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
          重新校准
        </Text>
      </TouchableOpacity>
      {warn ? (
        <Text className="text-xs mt-3 px-6 text-center" style={{ color: '#C44536', lineHeight: 18 }}>
          请远离金属或电子设备后重新校准；若持续抖动，可能存在磁性干扰。
        </Text>
      ) : null}
    </View>
  );
}

function MeasurePanel() {
  const [p1, setP1] = useState({ x: 40, y: 120 });
  const [p2, setP2] = useState({ x: 260, y: 60 });
  const [active, setActive] = useState<'p1' | 'p2'>('p2');

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  // 示意图：1px ≈ 8m
  const meters = Math.round(Math.sqrt(dx * dx + dy * dy) * 8);

  return (
    <View>
      <Text className="text-xs text-muted mb-2" style={{ lineHeight: 18 }}>
        点击地图区域放置测距点（示意）。直线距离仅供参考，非路径距离。
      </Text>
      <TouchableOpacity
        activeOpacity={1}
        onPress={(e) => {
          const { locationX, locationY } = e.nativeEvent;
          const pt = { x: locationX, y: locationY };
          if (active === 'p1') setP1(pt);
          else setP2(pt);
        }}
        className="rounded-2xl overflow-hidden"
        style={{ height: 200, backgroundColor: '#E8DFD3' }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 320 200">
          <Circle cx={80} cy={70} r={40} fill="rgba(45,106,79,0.12)" />
          <Circle cx={220} cy={110} r={50} fill="rgba(139,105,20,0.1)" />
          <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#2D6A4F" strokeWidth={2} strokeDasharray="6 4" />
          <Circle cx={p1.x} cy={p1.y} r={8} fill="#2D6A4F" />
          <Circle cx={p2.x} cy={p2.y} r={8} fill="#C44536" />
          <SvgText x={p1.x} y={p1.y - 12} textAnchor="middle" fontSize={10} fill="#2D6A4F">
            A
          </SvgText>
          <SvgText x={p2.x} y={p2.y - 12} textAnchor="middle" fontSize={10} fill="#C44536">
            B
          </SvgText>
        </Svg>
      </TouchableOpacity>
      <View className="flex-row gap-2 mt-3">
        {(['p1', 'p2'] as const).map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => setActive(k)}
            className="flex-1 py-2.5 rounded-xl items-center"
            style={{ backgroundColor: active === k ? '#2D6A4F' : 'rgba(45,106,79,0.1)' }}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: active === k ? '#fff' : '#2D6A4F' }}
            >
              放置点 {k === 'p1' ? 'A' : 'B'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text className="text-center text-xl font-bold text-foreground mt-4">
        {meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters} m`}
      </Text>
    </View>
  );
}

function MapLayerPanel({ mode }: { mode: 'contour' | 'satellite' }) {
  return (
    <View>
      <View
        className="rounded-2xl overflow-hidden items-center justify-center"
        style={{
          height: 220,
          backgroundColor: mode === 'satellite' ? '#3D4A3A' : '#EDE4D4',
        }}
      >
        {mode === 'contour' ? (
          <Svg width="100%" height="100%" viewBox="0 0 320 220">
            {[40, 70, 100, 130, 160].map((y, i) => (
              <Circle
                key={y}
                cx={160}
                cy={120}
                r={30 + i * 28}
                fill="none"
                stroke="#8B6914"
                strokeWidth={1.2}
                opacity={0.55}
              />
            ))}
            <SvgText x={160} y={30} textAnchor="middle" fontSize={12} fill="#8B6914" fontWeight="600">
              等高线示意图层
            </SvgText>
          </Svg>
        ) : (
          <View className="items-center px-6">
            <FontAwesome6 name="globe" size={40} color="rgba(255,255,255,0.7)" />
            <Text className="text-white/80 text-sm mt-3 text-center">卫星影像底图（演示）</Text>
          </View>
        )}
      </View>
      <Text className="text-xs text-muted mt-3" style={{ lineHeight: 18 }}>
        {mode === 'contour'
          ? '当前为示意图层。未配置 MAP_TILE_CDN 时无法真下载等高线包；野外请自备离线地图 App。'
          : '当前为演示卫星底图。未配置瓦片 CDN 时无法真下载图幅；勿当作可靠导航底图。'}
      </Text>
    </View>
  );
}

function SignalPanel() {
  const [data, setData] = useState<{
    bars: number;
    dbm: number;
    technology: string;
    tip: string;
    accuracy_note: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const sample = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ data: typeof data }>(`/api/v1/tools/signal`);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      sample();
    }, [])
  );

  return (
    <View>
      <View className="items-center py-4">
        <View className="flex-row items-end gap-1.5 h-12 mb-3">
          {[1, 2, 3, 4].map((b) => (
            <View
              key={b}
              style={{
                width: 14,
                height: 12 + b * 8,
                borderRadius: 3,
                backgroundColor:
                  data && data.bars >= b ? '#2D6A4F' : 'rgba(61,50,41,0.12)',
              }}
            />
          ))}
        </View>
        {loading ? (
          <ActivityIndicator color="#2D6A4F" />
        ) : data ? (
          <>
            <Text className="text-2xl font-bold text-foreground">{data.technology}</Text>
            <Text className="text-sm text-muted mt-1">{data.dbm} dBm · {data.bars}/4 格</Text>
            <Text className="text-xs mt-3 px-2 text-center" style={{ color: '#2D6A4F', lineHeight: 18 }}>
              {data.tip}
            </Text>
            <Text className="text-xs text-muted mt-2">{data.accuracy_note}</Text>
          </>
        ) : (
          <Text className="text-muted text-sm">无法检测</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={sample}
        className="py-3 rounded-2xl items-center"
        style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
      >
        <Text className="text-sm font-semibold" style={{ color: '#2D6A4F' }}>
          重新采样
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function CampPanel() {
  const [camps, setCamps] = useState<
    { id: string; name: string; distance_km: number; rating: number; note: string }[]
  >([]);

  useFocusEffect(
    useCallback(() => {
      fetchApi<{ data: typeof camps }>('/api/v1/tools/camps')
        .then((r) => setCamps(Array.isArray(r.data) ? r.data : []))
        .catch(() => setCamps([]));
    }, [])
  );

  return (
    <View className="gap-3">
      {camps.map((c) => (
        <View
          key={c.id}
          className="p-3.5 rounded-2xl"
          style={{ backgroundColor: 'rgba(45,106,79,0.06)' }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-foreground">{c.name}</Text>
            <Text className="text-xs font-semibold" style={{ color: '#D4A017' }}>
              ★ {c.rating}
            </Text>
          </View>
          <Text className="text-xs text-muted mt-1">约 {c.distance_km} km · {c.note}</Text>
        </View>
      ))}
    </View>
  );
}

function ViewshedPanel() {
  return (
    <View>
      <View
        className="rounded-2xl p-4 mb-3"
        style={{ backgroundColor: 'rgba(196,69,54,0.08)', borderWidth: 1, borderColor: 'rgba(196,69,54,0.2)' }}
      >
        <Text className="text-xs font-semibold mb-1" style={{ color: '#C44536' }}>
          仅供参考
        </Text>
        <Text className="text-xs text-muted" style={{ lineHeight: 18 }}>
          通视结果可能因树木、天气、建筑物变化，野外请以实际观察为准。
        </Text>
      </View>
      <Svg width="100%" height={180} viewBox="0 0 320 180">
        <Polygon points="0,180 40,100 90,130 140,60 200,90 260,40 320,70 320,180" fill="#E8DFD3" />
        <Line x1={50} y1={110} x2={250} y2={55} stroke="#2D6A4F" strokeWidth={2} strokeDasharray="5 4" />
        <Circle cx={50} cy={110} r={6} fill="#2D6A4F" />
        <Circle cx={250} cy={55} r={6} fill="#C44536" />
        <SvgText x={50} y={130} textAnchor="middle" fontSize={10} fill="#8B7D6B">
          观察点
        </SvgText>
        <SvgText x={250} y={42} textAnchor="middle" fontSize={10} fill="#8B7D6B">
          目标点
        </SvgText>
      </Svg>
      <Text className="text-sm font-semibold text-foreground mt-2">结果：部分遮挡</Text>
      <Text className="text-xs text-muted mt-1" style={{ lineHeight: 18 }}>
        中段山脊可能阻挡视线，不适合作为稳定瞭望/信号中继点。建议改选更高开阔点。
      </Text>
    </View>
  );
}

function ProfileHint() {
  const router = useSafeRouter();
  return (
    <View className="items-center py-6">
      <FontAwesome6 name="chart-area" size={36} color="#2D6A4F" />
      <Text className="text-sm text-muted mt-3 text-center px-4" style={{ lineHeight: 20 }}>
        完整海拔剖面已内嵌在路线详情「核心数据」下方。可从发现或行程进入任意路线查看。
      </Text>
      <TouchableOpacity
        onPress={() => router.push('/(tabs)/')}
        className="mt-4 px-5 py-2.5 rounded-full"
        style={{ backgroundColor: '#2D6A4F' }}
      >
        <Text className="text-white text-sm font-semibold">去发现路线</Text>
      </TouchableOpacity>
    </View>
  );
}

function CoordsPanel() {
  const [lat, setLat] = useState('32.0617');
  const [lng, setLng] = useState('118.7778');
  // 粗略演示偏移
  const gcjLat = (parseFloat(lat) + 0.0021).toFixed(6);
  const gcjLng = (parseFloat(lng) + 0.0034).toFixed(6);
  const bdLat = (parseFloat(gcjLat) + 0.006).toFixed(6);
  const bdLng = (parseFloat(gcjLng) + 0.0065).toFixed(6);

  return (
    <View>
      <Text className="text-xs text-muted mb-3">输入 WGS84 坐标（演示偏移，非正式算法）</Text>
      <View className="flex-row gap-2 mb-3">
        <TextInput
          value={lat}
          onChangeText={setLat}
          keyboardType="decimal-pad"
          className="flex-1 bg-surface px-3 py-2.5 rounded-xl text-sm"
          style={{ borderWidth: 1, borderColor: '#E8DFD0', color: '#3D3229' }}
          placeholder="纬度"
        />
        <TextInput
          value={lng}
          onChangeText={setLng}
          keyboardType="decimal-pad"
          className="flex-1 bg-surface px-3 py-2.5 rounded-xl text-sm"
          style={{ borderWidth: 1, borderColor: '#E8DFD0', color: '#3D3229' }}
          placeholder="经度"
        />
      </View>
      {[
        { name: 'WGS84', v: `${lat}, ${lng}` },
        { name: 'GCJ02', v: `${gcjLat}, ${gcjLng}` },
        { name: 'BD09', v: `${bdLat}, ${bdLng}` },
      ].map((row) => (
        <View
          key={row.name}
          className="flex-row items-center py-2.5"
          style={{ borderBottomWidth: 1, borderBottomColor: '#F1EBE0' }}
        >
          <Text className="text-xs font-bold w-16" style={{ color: '#2D6A4F' }}>
            {row.name}
          </Text>
          <Text className="text-xs text-foreground flex-1">{row.v}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ToolScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { id } = useSafeSearchParams<{ id: string }>();
  const title = titles[id] || '工具';

  const body = (() => {
    switch (id) {
      case 'altimeter':
        return <AltimeterPanel />;
      case 'compass':
        return <CompassPanel />;
      case 'measure':
        return <MeasurePanel />;
      case 'contour':
        return <MapLayerPanel mode="contour" />;
      case 'satellite':
        return <MapLayerPanel mode="satellite" />;
      case 'signal':
        return <SignalPanel />;
      case 'camp':
        return <CampPanel />;
      case 'viewshed':
        return <ViewshedPanel />;
      case 'profile':
        return <ProfileHint />;
      case 'coords':
        return <CoordsPanel />;
      default:
        return <Text className="text-muted text-center py-10">未知工具</Text>;
    }
  })();

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <View
        className="flex-row items-center px-4 pb-3"
        style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: '#F1EBE0' }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center"
        >
          <FontAwesome6 name="chevron-left" size={18} color="#3D3229" />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-base font-bold text-foreground">{title}</Text>
        <View className="w-10" />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>{body}</ScrollView>
    </Screen>
  );
}
