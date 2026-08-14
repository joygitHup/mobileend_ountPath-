import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';

interface RouteItem {
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
  tags: string[];
  ratings: {
    climb_intensity: number;
    terrain_difficulty: number;
    altitude_risk: number;
    signal_coverage: number;
    supply_access: number;
  };
}

const difficultyFilters = [
  { label: '全部', value: 'all' },
  { label: '入门', value: 'easy' },
  { label: '进阶', value: 'moderate' },
  { label: '挑战', value: 'hard' },
  { label: '专家', value: 'expert' },
];

function getMatchColor(score: number): string {
  if (score >= 70) return '#2D6A4F';
  if (score >= 50) return '#E9C46A';
  return '#C44536';
}

function getMatchBg(score: number): string {
  if (score >= 70) return 'rgba(45,106,79,0.1)';
  if (score >= 50) return 'rgba(233,196,106,0.15)';
  return 'rgba(196,69,54,0.1)';
}

function RouteCard({ route, onPress }: { route: RouteItem; onPress: () => void }) {
  const matchColor = getMatchColor(route.match_score);
  const matchBg = getMatchBg(route.match_score);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="bg-surface rounded-3xl mb-5 overflow-hidden"
      style={{
        shadowColor: '#3D3229',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <View className="relative">
        <Image
          source={{ uri: route.image_url }}
          style={{ width: '100%', height: 180 }}
          contentFit="cover"
        />
        <View
          className="absolute top-3 left-3 px-3 py-1 rounded-full"
          style={{ backgroundColor: matchBg }}
        >
          <Text className="text-xs font-bold" style={{ color: matchColor }}>
            匹配度 {route.match_score}%
          </Text>
        </View>
        <View className="absolute bottom-3 right-3 bg-black/40 px-2 py-1 rounded-lg">
          <Text className="text-white text-xs font-medium">
            {route.distance}km · {route.elevation_gain}m↑
          </Text>
        </View>
      </View>
      <View className="p-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-lg font-bold text-foreground flex-1">{route.name}</Text>
          <View className="flex-row items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <FontAwesome6
                key={i}
                name="star"
                size={10}
                color={i < route.difficulty_stars ? '#E9C46A' : '#E8DFD3'}
              />
            ))}
          </View>
        </View>
        <View className="flex-row items-center gap-1 mb-3">
          <FontAwesome6 name="location-dot" size={11} color="#8B7D6B" />
          <Text className="text-xs text-muted">{route.location}</Text>
          <Text className="text-xs text-muted mx-1">·</Text>
          <FontAwesome6 name="clock" size={11} color="#8B7D6B" />
          <Text className="text-xs text-muted">{route.estimated_duration}</Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {route.tags.slice(0, 3).map((tag) => (
            <View
              key={tag}
              className="px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
            >
              <Text className="text-xs font-medium" style={{ color: '#2D6A4F' }}>
                {tag}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadRoutes = useCallback(async (filter?: string, query?: string) => {
    try {
      setLoading(true);
      let path = '/api/v1/routes?sort=match';
      if (filter && filter !== 'all') path += `&difficulty=${filter}`;
      if (query) {
        path = `/api/v1/routes/search?q=${encodeURIComponent(query)}`;
      }
      const res = await fetchApi<{ data: RouteItem[] }>(path);
      setRoutes(res.data);
    } catch {
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRoutes(activeFilter, searchQuery);
    }, [activeFilter, searchQuery, loadRoutes])
  );

  const handleFilterChange = (value: string) => {
    setActiveFilter(value);
    setSearchQuery('');
  };

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          className="px-5 pt-3 pb-4"
          style={{ paddingTop: insets.top + 12 }}
        >
          <LinearGradient
            colors={['#2D6A4F', '#52B788']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-3xl p-5 mb-4"
            style={{
              borderTopLeftRadius: 32,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 32,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-white/80 text-sm font-medium">出发前，先问山途</Text>
                <Text className="text-white text-2xl font-bold mt-1">发现你的下一条路线</Text>
              </View>
              <View
                className="w-12 h-12 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
              >
                <FontAwesome6 name="mountain-sun" size={22} color="#fff" />
              </View>
            </View>
            <View className="flex-row items-center gap-4 mt-2">
              <View className="flex-row items-center gap-1.5">
                <FontAwesome6 name="temperature-half" size={13} color="rgba(255,255,255,0.8)" />
                <Text className="text-white/90 text-xs">晴 18°C</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <FontAwesome6 name="wind" size={13} color="rgba(255,255,255,0.8)" />
                <Text className="text-white/90 text-xs">微风</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <FontAwesome6 name="shield-halved" size={13} color="rgba(255,255,255,0.8)" />
                <Text className="text-white/90 text-xs">适宜出行</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Search */}
          <View
            className="flex-row items-center bg-surface rounded-2xl px-4 py-3"
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
              placeholder="搜索路线、地点..."
              placeholderTextColor="#8B7D6B"
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (text.length > 0) setActiveFilter('all');
              }}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <FontAwesome6 name="xmark" size={16} color="#8B7D6B" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filters */}
        <View className="px-5 mb-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
            {difficultyFilters.map((f) => (
              <TouchableOpacity
                key={f.value}
                onPress={() => handleFilterChange(f.value)}
                className="px-4 py-2 rounded-full mr-2"
                style={{
                  backgroundColor: activeFilter === f.value ? '#2D6A4F' : 'rgba(45,106,79,0.08)',
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: activeFilter === f.value ? '#fff' : '#2D6A4F' }}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Route List */}
        <View className="px-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground">
              {searchQuery ? '搜索结果' : '为你推荐'}
            </Text>
            <Text className="text-sm text-muted">{routes.length} 条路线</Text>
          </View>

          {loading ? (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#2D6A4F" />
              <Text className="text-muted text-sm mt-3">正在为你寻找最佳路线...</Text>
            </View>
          ) : routes.length === 0 ? (
            <View className="py-20 items-center">
              <FontAwesome6 name="map-location-dot" size={40} color="#D4C9BB" />
              <Text className="text-muted text-sm mt-3">暂无匹配的路线</Text>
            </View>
          ) : (
            routes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                onPress={() => router.push('/route-detail', { id: route.id })}
              />
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
