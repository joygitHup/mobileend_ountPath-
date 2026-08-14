import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
}

interface UserProfile {
  id: string;
  name: string;
  avatar_url: string;
  level: number;
  total_distance_km: number;
  total_trips: number;
  total_elevation_gain: number;
  safety_score: number;
  badges: Badge[];
  completed_routes: { route_id: string; completed_at: string; duration_hours: number }[];
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
      fetch(`${BASE_URL}/api/v1/community/user/profile`)
        .then((res) => res.json())
        .then((res: { data: UserProfile }) => setProfile(res.data))
        .catch(() => setProfile(null));
    }, [])
  );

  if (!profile) return null;

  const earnedBadges = profile.badges.filter((b) => b.earned);
  const lockedBadges = profile.badges.filter((b) => !b.earned);

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Profile Header */}
        <LinearGradient
          colors={['#2D6A4F', '#52B788']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + 20, paddingBottom: 30 }}
          className="px-5 items-center"
        >
          <Image
            source={{ uri: profile.avatar_url }}
            style={{ width: 80, height: 80, borderRadius: 40 }}
            contentFit="cover"
          />
          <Text className="text-white text-xl font-bold mt-3">{profile.name}</Text>
          <View className="flex-row items-center gap-2 mt-1">
            <View className="px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Text className="text-white text-xs font-medium">Lv.{profile.level}</Text>
            </View>
            <View className="px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Text className="text-white text-xs font-medium">安全分 {profile.safety_score}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View
          className="mx-5 bg-surface rounded-3xl p-5 -mt-5"
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
          <View className="flex-row justify-around">
            {[
              { value: `${profile.total_distance_km}`, unit: 'km', label: '总里程' },
              { value: `${profile.total_trips}`, unit: '次', label: '总次数' },
              { value: `${profile.total_elevation_gain}`, unit: 'm', label: '总爬升' },
            ].map((stat) => (
              <View key={stat.label} className="items-center">
                <View className="flex-row items-end">
                  <Text className="text-2xl font-bold text-foreground">{stat.value}</Text>
                  <Text className="text-xs text-muted ml-0.5 mb-1">{stat.unit}</Text>
                </View>
                <Text className="text-xs text-muted mt-1">{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Badges */}
        <View
          className="mx-5 mt-5 bg-surface rounded-3xl p-5"
          style={{
            shadowColor: '#3D3229',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-foreground">勋章墙</Text>
            <Text className="text-sm text-muted">{earnedBadges.length}/{profile.badges.length}</Text>
          </View>
          <View className="flex-row flex-wrap gap-3">
            {profile.badges.map((badge) => (
              <View
                key={badge.id}
                className="items-center"
                style={{ width: '22%' }}
              >
                <View
                  className="w-14 h-14 rounded-full items-center justify-center mb-1.5"
                  style={{
                    backgroundColor: badge.earned ? 'rgba(45,106,79,0.1)' : 'rgba(61,50,41,0.05)',
                    opacity: badge.earned ? 1 : 0.4,
                  }}
                >
                  <Text className="text-2xl">{badge.icon}</Text>
                </View>
                <Text
                  className="text-xs text-center font-medium"
                  style={{ color: badge.earned ? '#3D3229' : '#C4B8A8' }}
                  numberOfLines={1}
                >
                  {badge.name}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Safety Score */}
        <View
          className="mx-5 mt-5 bg-surface rounded-3xl p-5"
          style={{
            shadowColor: '#3D3229',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <Text className="text-lg font-bold text-foreground mb-4">安全学分</Text>
          <View className="flex-row items-center gap-4">
            <View
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
            >
              <Text className="text-2xl font-bold" style={{ color: '#2D6A4F' }}>
                {profile.safety_score}
              </Text>
            </View>
            <View className="flex-1">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm text-muted">学分进度</Text>
                <Text className="text-sm font-medium text-foreground">{profile.safety_score}/100</Text>
              </View>
              <View className="h-3 bg-default rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${profile.safety_score}%`, backgroundColor: '#2D6A4F' }}
                />
              </View>
              <Text className="text-xs text-muted mt-2">完成安全培训视频和风险测试可提升学分</Text>
            </View>
          </View>
        </View>

        {/* Completed Routes */}
        <View
          className="mx-5 mt-5 bg-surface rounded-3xl p-5"
          style={{
            shadowColor: '#3D3229',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <Text className="text-lg font-bold text-foreground mb-4">已完成路线</Text>
          {profile.completed_routes.length === 0 ? (
            <Text className="text-sm text-muted text-center py-4">暂无完成记录</Text>
          ) : (
            profile.completed_routes.map((cr) => (
              <View
                key={cr.route_id}
                className="flex-row items-center py-3"
                style={{ borderBottomWidth: 1, borderBottomColor: '#F1EBE0' }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                >
                  <FontAwesome6 name="circle-check" size={18} color="#2D6A4F" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">路线 {cr.route_id}</Text>
                  <Text className="text-xs text-muted mt-0.5">{cr.completed_at} · {cr.duration_hours}小时</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
