import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';

type RiskLevel = 'low' | 'medium' | 'high';

interface DiscoverRoute {
  id: string;
  name: string;
  location: string;
  distance: number;
  elevation_gain: number;
  estimated_duration: string;
  difficulty_stars: number;
  difficulty: string;
  image_url: string;
  match_score: number;
  completion_rate: number;
  turnaround_rate: number;
  tags: string[];
  decision_summary: string;
  match_reasons: string[];
  risk_level: RiskLevel;
  caution_reason: string | null;
  key_checkpoint: string | null;
  season_fit: boolean;
  province?: string;
  match_personalized?: boolean;
}

interface WeatherBrief {
  condition: string;
  temp_c: number;
  wind: string;
  advice: string;
  suitable_label: string;
  is_fallback?: boolean;
  source?: string;
}

interface DiscoverFeed {
  weather: WeatherBrief;
  current_season: string;
  today: DiscoverRoute[];
  matched: DiscoverRoute[];
  caution: DiscoverRoute[];
  seasonal: DiscoverRoute[];
  filter_provinces?: string[];
  match_personalized?: boolean;
}

const DIFF_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部难度' },
  { key: 'easy', label: '轻松' },
  { key: 'moderate', label: '中等' },
  { key: 'hard', label: '困难' },
  { key: 'expert', label: '专家' },
];

function matchTone(score: number) {
  if (score >= 70) return { color: '#2D6A4F', bg: 'rgba(45,106,79,0.12)' };
  if (score >= 50) return { color: '#B8860B', bg: 'rgba(233,196,106,0.22)' };
  return { color: '#C44536', bg: 'rgba(196,69,54,0.12)' };
}

function riskTone(level: RiskLevel) {
  if (level === 'high') return { label: '高风险', color: '#C44536', bg: 'rgba(196,69,54,0.12)' };
  if (level === 'medium') return { label: '需谨慎', color: '#B8860B', bg: 'rgba(233,196,106,0.22)' };
  return { label: '风险低', color: '#2D6A4F', bg: 'rgba(45,106,79,0.1)' };
}

function suitableTone(label?: string) {
  if (label === '适宜出行') return '#52B788';
  if (label === '不建议出行') return '#C44536';
  return '#E9C46A';
}

function RouteCard({
  route,
  onPress,
  variant = 'default',
}: {
  route: DiscoverRoute;
  onPress: () => void;
  variant?: 'default' | 'caution';
}) {
  const match = matchTone(route.match_score);
  const risk = riskTone(route.risk_level);
  const isCaution = variant === 'caution';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="bg-surface mb-4 overflow-hidden"
      style={{
        borderTopLeftRadius: 28,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 28,
        borderWidth: isCaution ? 1 : 0,
        borderColor: isCaution ? 'rgba(196,69,54,0.2)' : 'transparent',
        shadowColor: '#3D3229',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <View className="relative">
        <Image
          source={{ uri: route.image_url }}
          style={{ width: '100%', height: 156 }}
          contentFit="cover"
        />
        <View
          className="absolute top-3 left-3 px-2.5 py-1 rounded-full"
          style={{ backgroundColor: match.bg }}
        >
          <Text className="text-xs font-bold" style={{ color: match.color }}>
            匹配示意 {route.match_score}%
          </Text>
        </View>
        <View
          className="absolute top-3 right-3 px-2.5 py-1 rounded-full"
          style={{ backgroundColor: risk.bg }}
        >
          <Text className="text-xs font-bold" style={{ color: risk.color }}>
            {risk.label}
          </Text>
        </View>
      </View>
      <View className="p-4">
        <Text className="text-lg font-bold text-foreground mb-1">{route.name}</Text>
        <Text className="text-xs text-muted mb-2">{route.location}</Text>
        {!!route.decision_summary && (
          <Text className="text-sm mb-2" style={{ color: '#2D6A4F', lineHeight: 20 }}>
            {route.decision_summary}
          </Text>
        )}
        <View className="flex-row flex-wrap gap-3 mb-2">
          <Text className="text-xs text-muted">{route.distance}km</Text>
          <Text className="text-xs text-muted">{route.elevation_gain}m↑</Text>
          <Text className="text-xs text-muted">{route.estimated_duration}</Text>
        </View>
        {route.match_reasons?.length ? (
          <Text className="text-xs text-muted" numberOfLines={2} style={{ lineHeight: 17 }}>
            {route.match_reasons.join(' · ')}
          </Text>
        ) : null}
        {isCaution && route.caution_reason ? (
          <Text className="text-xs mt-2" style={{ color: '#C44536' }}>
            {route.caution_reason}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function SectionHeader({
  title,
  subtitle,
  count,
  accent = '#2D6A4F',
}: {
  title: string;
  subtitle?: string;
  count?: number;
  accent?: string;
}) {
  return (
    <View className="mb-3">
      <View className="flex-row items-center gap-2 mb-1">
        <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: accent }} />
        <Text className="text-lg font-bold text-foreground flex-1">{title}</Text>
        {typeof count === 'number' && (
          <Text className="text-sm text-muted">{count} 条</Text>
        )}
      </View>
      {subtitle ? (
        <Text className="text-xs text-muted ml-3" style={{ lineHeight: 18 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function SectionEmpty({ tip }: { tip: string }) {
  return (
    <View
      className="mb-4 px-4 py-5 items-center"
      style={{
        backgroundColor: 'rgba(61,50,41,0.04)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 16,
      }}
    >
      <Text className="text-xs text-muted text-center" style={{ lineHeight: 18 }}>
        {tip}
      </Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="px-3 py-1.5 rounded-full mr-2"
      style={{ backgroundColor: active ? '#2D6A4F' : 'rgba(61,50,41,0.06)' }}
      activeOpacity={0.85}
    >
      <Text
        className="text-xs font-semibold"
        style={{ color: active ? '#fff' : '#6B5E52' }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const [feed, setFeed] = useState<DiscoverFeed | null>(null);
  const [searchResults, setSearchResults] = useState<DiscoverRoute[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [difficulty, setDifficulty] = useState('all');
  const [province, setProvince] = useState('all');

  const loadFeed = useCallback(
    async (soft?: boolean) => {
      try {
        if (!soft) setLoading(true);
        const qs = new URLSearchParams();
        if (difficulty !== 'all') qs.set('difficulty', difficulty);
        if (province !== 'all') qs.set('province', province);
        const q = qs.toString();
        const res = await fetchApi<{ data: DiscoverFeed }>(
          `/api/v1/routes/discover${q ? `?${q}` : ''}`
        );
        setFeed(res.data);
        setSearchResults(null);
      } catch {
        setFeed(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [difficulty, province]
  );

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      setLoading(true);
      const res = await fetchApi<{ data: DiscoverRoute[] }>(
        `/api/v1/routes/search?q=${encodeURIComponent(q.trim())}`
      );
      setSearchResults(res.data);
    } catch {
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (searchQuery.trim()) {
        runSearch(searchQuery);
      } else {
        loadFeed();
      }
    }, [loadFeed, runSearch, searchQuery])
  );

  const openDetail = (id: string) => router.push('/route-detail', { id });

  const weather = feed?.weather;
  const suitableColor = suitableTone(weather?.suitable_label);

  const provinces = useMemo(() => {
    const list = feed?.filter_provinces?.length
      ? feed.filter_provinces
      : ['安徽', '浙江', '江西', '云南', '江苏', '广东'];
    return [{ key: 'all', label: '全部地区' }, ...list.map((p) => ({ key: p, label: p }))];
  }, [feed?.filter_provinces]);

  const filterActive = difficulty !== 'all' || province !== 'all';

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              if (searchQuery.trim()) runSearch(searchQuery);
              else loadFeed(true);
            }}
            tintColor="#2D6A4F"
          />
        }
      >
        <View className="px-5 pt-3 pb-3" style={{ paddingTop: insets.top + 12 }}>
          <LinearGradient
            colors={['#2D6A4F', '#52B788']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="p-5 mb-4"
            style={{
              borderTopLeftRadius: 32,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 32,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 pr-3">
                <Text className="text-white/80 text-sm font-medium">出发前，先问山途</Text>
                <Text className="text-white text-2xl font-bold mt-1">发现可出发的路线</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/toolbox')}
                className="w-12 h-12 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                activeOpacity={0.8}
              >
                <FontAwesome6 name="toolbox" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {weather ? (
              <>
                <View className="flex-row items-center gap-3 mb-2 flex-wrap">
                  <View className="flex-row items-center gap-1.5">
                    <FontAwesome6 name="cloud-sun" size={13} color="rgba(255,255,255,0.85)" />
                    <Text className="text-white/90 text-xs">
                      {weather.condition} {weather.temp_c}°C
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <FontAwesome6 name="wind" size={13} color="rgba(255,255,255,0.85)" />
                    <Text className="text-white/90 text-xs">{weather.wind}</Text>
                  </View>
                  <View
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                  >
                    <Text className="text-xs font-semibold" style={{ color: suitableColor }}>
                      {weather.suitable_label}
                    </Text>
                  </View>
                  {weather.is_fallback ? (
                    <View
                      className="px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(184,134,11,0.45)' }}
                    >
                      <Text className="text-xs font-semibold text-white">示意天气</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-white/75 text-xs" style={{ lineHeight: 18 }}>
                  {weather.advice}
                  {weather.is_fallback ? ' · 非实况，仅供离线示意' : ''}
                  {feed?.current_season ? ` · 当前${feed.current_season}季` : ''}
                  {province !== 'all' ? ` · ${province}局地` : ''}
                </Text>
              </>
            ) : (
              <Text className="text-white/80 text-xs">正在同步出行建议…</Text>
            )}
          </LinearGradient>

          <View
            className="flex-row items-center bg-surface rounded-2xl px-4 py-3 mb-3"
            style={{
              shadowColor: '#3D3229',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <FontAwesome6 name="magnifying-glass" size={16} color="#8B7D6B" />
            <TextInput
              className="flex-1 ml-3 text-base text-foreground"
              style={{ fontSize: 16, paddingVertical: 0 }}
              placeholder="搜索路线、地点、标签…"
              placeholderTextColor="#8B7D6B"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              onSubmitEditing={() => runSearch(searchQuery)}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setSearchResults(null);
                  loadFeed();
                }}
                hitSlop={8}
              >
                <FontAwesome6 name="xmark" size={16} color="#8B7D6B" />
              </TouchableOpacity>
            )}
          </View>

          {!searchResults ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {DIFF_FILTERS.map((f) => (
                  <FilterChip
                    key={f.key}
                    label={f.label}
                    active={difficulty === f.key}
                    onPress={() => setDifficulty(f.key)}
                  />
                ))}
              </ScrollView>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                {provinces.map((f) => (
                  <FilterChip
                    key={f.key}
                    label={f.label}
                    active={province === f.key}
                    onPress={() => setProvince(f.key)}
                  />
                ))}
              </ScrollView>
              {filterActive ? (
                <TouchableOpacity
                  onPress={() => {
                    setDifficulty('all');
                    setProvince('all');
                  }}
                  className="mt-2 mb-1"
                >
                  <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                    清除筛选
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </View>

        <View className="px-5">
          {loading && !refreshing ? (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#2D6A4F" />
              <Text className="text-muted text-sm mt-3">正在为你整理出行建议…</Text>
            </View>
          ) : searchResults ? (
            <>
              <SectionHeader
                title="搜索结果"
                subtitle={searchQuery ? `关键词「${searchQuery}」` : undefined}
                count={searchResults.length}
              />
              {searchResults.length === 0 ? (
                <SectionEmpty tip="没有找到相关路线，试试别的关键词或清除搜索" />
              ) : (
                searchResults.map((route) => (
                  <RouteCard key={route.id} route={route} onPress={() => openDetail(route.id)} />
                ))
              )}
            </>
          ) : !feed ? (
            <View className="py-16 items-center">
              <Text className="text-muted text-sm">暂时无法加载发现内容</Text>
              <TouchableOpacity
                onPress={() => loadFeed()}
                className="mt-3 px-4 py-2 rounded-full"
                style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
              >
                <Text style={{ color: '#2D6A4F', fontWeight: '600' }}>重试</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {feed.match_personalized ? (
                <Text className="text-[11px] text-muted mb-3">
                  契合度由等级、里程、收藏与完赛履历的规则估算，仅供参考，非出行许可
                </Text>
              ) : (
                <Text className="text-[11px] text-muted mb-3">
                  完善体能等级与收藏后，规则契合度会更贴近你；仍非权威决策
                </Text>
              )}

              <SectionHeader
                title="今日适宜"
                subtitle="天气与季节规则下的示意推荐，优先短途、低风险；非出行许可"
                count={feed.today.length}
              />
              {feed.today.length === 0 ? (
                <SectionEmpty tip="当前筛选下暂无今日适宜路线，可放宽难度或换地区" />
              ) : (
                feed.today.map((route) => (
                  <RouteCard
                    key={`today-${route.id}`}
                    route={route}
                    onPress={() => openDetail(route.id)}
                  />
                ))
              )}

              <View className="mt-2" />
              <SectionHeader
                title="为你匹配"
                subtitle="按规则契合度排序并说明原因；仅供参考，请结合自身判断"
                count={feed.matched.length}
              />
              {feed.matched.length === 0 ? (
                <SectionEmpty tip="暂无匹配结果，试试清除筛选" />
              ) : (
                feed.matched.map((route) => (
                  <RouteCard
                    key={`match-${route.id}`}
                    route={route}
                    onPress={() => openDetail(route.id)}
                  />
                ))
              )}

              <View className="mt-2" />
              <SectionHeader
                title="本周慎行"
                subtitle="折返率偏高、信号弱或体能门槛高——出发前务必看清风险"
                count={feed.caution.length}
                accent="#C44536"
              />
              {feed.caution.length === 0 ? (
                <SectionEmpty tip="当前没有特别需要警惕的线路" />
              ) : (
                feed.caution.map((route) => (
                  <RouteCard
                    key={`caution-${route.id}`}
                    route={route}
                    variant="caution"
                    onPress={() => openDetail(route.id)}
                  />
                ))
              )}

              <View className="mt-2" />
              <SectionHeader
                title={`${feed.current_season}季精选`}
                subtitle="当前季节更友好的线路，仍请结合自身体能选择"
                count={feed.seasonal.length}
                accent="#8B6914"
              />
              {feed.seasonal.length === 0 ? (
                <SectionEmpty tip={`暂无明确标注适宜${feed.current_season}季的线路`} />
              ) : (
                feed.seasonal.slice(0, 4).map((route) => (
                  <RouteCard
                    key={`season-${route.id}`}
                    route={route}
                    onPress={() => openDetail(route.id)}
                  />
                ))
              )}

              <View
                className="mt-2 mb-4 p-4"
                style={{
                  backgroundColor: 'rgba(45,106,79,0.06)',
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 20,
                }}
              >
                <Text className="text-sm font-semibold text-foreground mb-1">选好路线之后</Text>
                <Text className="text-xs text-muted" style={{ lineHeight: 18 }}>
                  主路径：安全中心（行前联系人）→ 准备清单 → 行程开启守护 → 示意跟线。
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
