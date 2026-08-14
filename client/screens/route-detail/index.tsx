import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';

interface RouteDetail {
  id: string;
  name: string;
  location: string;
  distance: number;
  elevation_gain: number;
  max_altitude: number;
  estimated_duration: string;
  difficulty: string;
  difficulty_stars: number;
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
}

const radarLabels = ['爬升强度', '路面难度', '海拔风险', '信号覆盖', '补给可达'];
const radarKeys: (keyof RouteDetail['ratings'])[] = [
  'climb_intensity',
  'terrain_difficulty',
  'altitude_risk',
  'signal_coverage',
  'supply_access',
];

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

  useFocusEffect(
    useCallback(() => {
      if (!params.id) return;
      (async () => {
        try {
          const res = await fetchApi<{ data: RouteDetail }>(`/api/v1/routes/${params.id}`);
          setRoute(res.data);
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

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Hero Image */}
        <View className="relative">
          <Image
            source={{ uri: showRealPhoto ? route.real_photo_url : route.image_url }}
            style={{ width: '100%', height: 280 }}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 }}
          />
          {/* Back button */}
          <TouchableOpacity
            onPress={() => router.back()}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/30 items-center justify-center"
            style={{ marginTop: insets.top }}
          >
            <FontAwesome6 name="chevron-left" size={18} color="#fff" />
          </TouchableOpacity>
          {/* Photo toggle */}
          <TouchableOpacity
            onPress={() => setShowRealPhoto(!showRealPhoto)}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/30"
            style={{ marginTop: insets.top }}
          >
            <Text className="text-white text-xs font-medium">
              {showRealPhoto ? '宣传图' : '实拍图'}
            </Text>
          </TouchableOpacity>
          {/* Title overlay */}
          <View className="absolute bottom-4 left-4 right-4">
            <Text className="text-white text-2xl font-bold">{route.name}</Text>
            <View className="flex-row items-center gap-2 mt-1">
              <FontAwesome6 name="location-dot" size={12} color="rgba(255,255,255,0.8)" />
              <Text className="text-white/90 text-sm">{route.location}</Text>
            </View>
          </View>
        </View>

        {/* Match Score + Radar */}
        <View
          className="mx-5 mt-5 bg-surface rounded-3xl p-5"
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
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-foreground">五维评测</Text>
            <View
              className="px-4 py-2 rounded-2xl"
              style={{ backgroundColor: `${matchColor}15` }}
            >
              <Text className="text-sm font-bold" style={{ color: matchColor }}>
                匹配度 {route.match_score}%
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: matchColor }}>
                {getMatchLabel(route.match_score)}
              </Text>
            </View>
          </View>
          <View className="items-center">
            <RadarChart ratings={route.ratings} />
          </View>
          {/* Rating bars */}
          <View className="mt-4 gap-2">
            {radarKeys.map((key, i) => (
              <View key={key} className="flex-row items-center">
                <Text className="text-xs text-muted w-16">{radarLabels[i]}</Text>
                <View className="flex-1 h-2 bg-default rounded-full mx-2 overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${(route.ratings[key] / 10) * 100}%`,
                      backgroundColor: route.ratings[key] >= 7 ? '#C44536' : route.ratings[key] >= 4 ? '#E9C46A' : '#2D6A4F',
                    }}
                  />
                </View>
                <Text className="text-xs font-bold text-foreground w-6 text-right">
                  {route.ratings[key]}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Basic Info */}
        <View
          className="mx-5 mt-4 bg-surface rounded-3xl p-5"
          style={{
            shadowColor: '#3D3229',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <Text className="text-lg font-bold text-foreground mb-4">路线信息</Text>
          <View className="flex-row flex-wrap gap-4">
            {[
              { icon: 'road', label: '总距离', value: `${route.distance}km` },
              { icon: 'arrow-up', label: '累计爬升', value: `${route.elevation_gain}m` },
              { icon: 'mountain', label: '最高海拔', value: `${route.max_altitude}m` },
              { icon: 'clock', label: '预计时长', value: route.estimated_duration },
            ].map((item) => (
              <View key={item.label} className="items-center" style={{ width: '22%' }}>
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mb-1.5"
                  style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                >
                  <FontAwesome6 name={item.icon as any} size={16} color="#2D6A4F" />
                </View>
                <Text className="text-xs text-muted">{item.label}</Text>
                <Text className="text-sm font-bold text-foreground mt-0.5">{item.value}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap gap-2 mt-4">
            <View className="px-3 py-1.5 rounded-full bg-default">
              <Text className="text-xs font-medium text-foreground">
                完成率 {route.completion_rate}%
              </Text>
            </View>
            <View className="px-3 py-1.5 rounded-full bg-default">
              <Text className="text-xs font-medium text-foreground">
                折返率 {route.turnaround_rate}%
              </Text>
            </View>
            {route.best_season.map((s) => (
              <View key={s} className="px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}>
                <Text className="text-xs font-medium" style={{ color: '#2D6A4F' }}>{s}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Description */}
        <View
          className="mx-5 mt-4 bg-surface rounded-3xl p-5"
          style={{
            shadowColor: '#3D3229',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <Text className="text-lg font-bold text-foreground mb-3">路线简介</Text>
          <Text className="text-sm text-muted leading-6">{route.description}</Text>
        </View>

        {/* Checkpoints */}
        <View
          className="mx-5 mt-4 bg-surface rounded-3xl p-5"
          style={{
            shadowColor: '#3D3229',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <Text className="text-lg font-bold text-foreground mb-4">补给点</Text>
          {route.checkpoints.map((cp, i) => (
            <View key={cp.name} className="flex-row items-start mb-3">
              <View className="items-center mr-3">
                <View
                  className="w-6 h-6 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: i === 0 || i === route.checkpoints.length - 1 ? '#2D6A4F' : '#F1EBE0',
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: i === 0 || i === route.checkpoints.length - 1 ? '#fff' : '#8B7D6B' }}
                  >
                    {i + 1}
                  </Text>
                </View>
                {i < route.checkpoints.length - 1 && (
                  <View className="w-0.5 h-6 bg-default mt-1" />
                )}
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
                    <Text className="text-xs" style={{ color: cp.has_signal ? '#52B788' : '#C44536' }}>
                      {cp.has_signal ? '有信号' : '无信号'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View
        className="absolute bottom-0 left-0 right-0 px-5 pb-5 pt-3 bg-background/90"
        style={{ paddingBottom: Math.max(insets.bottom, 20) }}
      >
        <TouchableOpacity
          onPress={() => router.push('/checklist', { routeId: route.id })}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#2D6A4F', '#52B788']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="rounded-2xl py-4 items-center"
          >
            <FontAwesome6 name="list-check" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text className="text-white text-base font-bold">开始准备行程</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}
