import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
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
  estimated_duration: string;
  difficulty_stars: number;
  image_url: string;
  match_score: number;
}

export default function TripScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [guardActive, setGuardActive] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchApi<{ data: RouteItem[] }>('/api/v1/routes?sort=match')
        .then((res) => setRoutes(res.data.slice(0, 3)))
        .catch(() => setRoutes([]));
      fetchApi<{ data: any }>('/api/v1/guard/status')
        .then((res) => setGuardActive(res.data !== null))
        .catch(() => setGuardActive(false));
    }, [])
  );

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 16 }} className="px-5 pb-4">
          <Text className="text-2xl font-bold text-foreground">行程中心</Text>
          <Text className="text-sm text-muted mt-1">管理你的行前准备和行程安全</Text>
        </View>

        {/* Guard Status */}
        <View className="px-5 mb-5">
          <TouchableOpacity
            onPress={() => router.push('/guard', { routeId: routes[0]?.id || '' })}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={guardActive ? ['#52B788', '#2D6A4F'] : ['#2D6A4F', '#52B788']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="rounded-3xl p-5"
              style={{
                borderTopLeftRadius: 32,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 32,
              }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                  >
                    <FontAwesome6
                      name="shield-halved"
                      size={22}
                      color="#fff"
                    />
                  </View>
                  <View>
                    <Text className="text-white text-lg font-bold">
                      {guardActive ? '守护进行中' : '实时守护'}
                    </Text>
                    <Text className="text-white/80 text-xs mt-0.5">
                      {guardActive ? '你的位置正在共享给守护人' : '开启后守护人可实时查看你的位置'}
                    </Text>
                  </View>
                </View>
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                >
                  {guardActive ? (
                    <View className="w-3 h-3 rounded-full bg-white" />
                  ) : (
                    <FontAwesome6 name="chevron-right" size={14} color="#fff" />
                  )}
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View className="px-5 mb-5">
          <View className="flex-row gap-3">
            {[
              { icon: 'list-check', label: '准备清单', desc: '智能生成', color: '#2D6A4F' },
              { icon: 'map-location-dot', label: '选择路线', desc: '开始规划', color: '#D4A276' },
              { icon: 'users', label: '找搭子', desc: '同行伙伴', color: '#E9C46A' },
            ].map((action) => (
              <TouchableOpacity
                key={action.label}
                className="flex-1 bg-surface rounded-2xl p-4 items-center"
                style={{
                  shadowColor: '#3D3229',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 6,
                  elevation: 2,
                }}
                onPress={() => {
                  if (action.label === '选择路线' && routes.length > 0) {
                    router.push('/route-detail', { id: routes[0].id });
                  }
                }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: `${action.color}15` }}
                >
                  <FontAwesome6 name={action.icon as any} size={18} color={action.color} />
                </View>
                <Text className="text-sm font-semibold text-foreground">{action.label}</Text>
                <Text className="text-xs text-muted mt-0.5">{action.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Upcoming Routes */}
        <View className="px-5">
          <Text className="text-lg font-bold text-foreground mb-3">推荐路线</Text>
          {routes.map((route) => (
            <TouchableOpacity
              key={route.id}
              onPress={() => router.push('/route-detail', { id: route.id })}
              className="flex-row bg-surface rounded-2xl mb-3 overflow-hidden"
              style={{
                shadowColor: '#3D3229',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 6,
                elevation: 2,
              }}
              activeOpacity={0.85}
            >
              <View
                className="w-24 h-24"
                style={{ backgroundColor: '#F1EBE0' }}
              >
                <View className="w-24 h-24 items-center justify-center" style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}>
                  <FontAwesome6 name="mountain" size={28} color="#2D6A4F" />
                </View>
              </View>
              <View className="flex-1 p-3 justify-center">
                <Text className="text-base font-bold text-foreground">{route.name}</Text>
                <Text className="text-xs text-muted mt-1">{route.location}</Text>
                <View className="flex-row items-center gap-3 mt-2">
                  <Text className="text-xs text-muted">{route.distance}km</Text>
                  <Text className="text-xs text-muted">{route.estimated_duration}</Text>
                  <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}>
                    <Text className="text-xs font-medium" style={{ color: '#2D6A4F' }}>
                      匹配 {route.match_score}%
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
