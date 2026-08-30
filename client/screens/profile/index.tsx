import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { SeasonBackgroundPicker, seasonLabel } from '@/components/SeasonBackgroundPicker';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '@/contexts/AuthContext';
import { useSeasonTheme } from '@/contexts/SeasonThemeContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAppPermissions } from '@/hooks/useAppPermissions';
import { fetchApi } from '@/utils/api';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
}

interface MeProfile {
  id: string;
  name: string;
  avatar_url: string;
  bio: string;
  verified: boolean;
  verified_label: string;
  level: number;
  total_distance_km: number;
  total_trips: number;
  total_elevation_gain: number;
  safety_score: number;
  badges: Badge[];
  completed_routes: {
    route_id: string;
    route_name?: string;
    completed_at: string;
    duration_hours: number;
  }[];
}

function Accordion({
  title,
  right,
  children,
  defaultOpen = false,
}: {
  title: string;
  right?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View
      className="mx-5 mt-4 bg-surface overflow-hidden"
      style={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 24,
        shadowColor: '#3D3229',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center px-4 py-4"
        activeOpacity={0.75}
      >
        <Text className="text-base font-bold text-foreground flex-1">{title}</Text>
        {right ? <Text className="text-xs text-muted mr-2">{right}</Text> : null}
        <FontAwesome6
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#8B7D6B"
        />
      </TouchableOpacity>
      {open ? <View className="px-4 pb-4">{children}</View> : null}
    </View>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  danger,
  badge,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  badge?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center py-3.5"
      activeOpacity={0.75}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: danger ? 'rgba(196,69,54,0.1)' : 'rgba(45,106,79,0.1)' }}
      >
        <FontAwesome6
          name={icon as 'shield-halved'}
          size={16}
          color={danger ? '#C44536' : '#2D6A4F'}
        />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            className="text-sm font-semibold"
            style={{ color: danger ? '#C44536' : '#3D3229' }}
          >
            {title}
          </Text>
          {badge && badge > 0 ? (
            <View
              className="px-1.5 min-w-[18px] h-[18px] rounded-full items-center justify-center"
              style={{ backgroundColor: '#C44536' }}
            >
              <Text className="text-white text-[10px] font-bold">
                {badge > 99 ? '99+' : badge}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text className="text-xs text-muted mt-0.5">{subtitle}</Text>
        ) : null}
      </View>
      <FontAwesome6 name="chevron-right" size={12} color="#8B7D6B" />
    </TouchableOpacity>
  );
}

function MenuCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="mx-5 mt-4 bg-surface px-4"
      style={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 24,
      }}
    >
      {children}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mx-5 mt-5 mb-1 text-xs font-semibold text-muted tracking-wide">
      {children}
    </Text>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { isAuthenticated, user, logout, updateUser } = useAuth();
  const { palette } = useSeasonTheme();
  const { unreadCount, refreshUnread } = useNotifications();
  const { grantedCount, items } = useAppPermissions();
  const [profile, setProfile] = useState<MeProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        setProfile(null);
        return;
      }
      fetchApi<{ data: MeProfile }>('/api/v1/me/profile')
        .then((res) => {
          setProfile(res.data);
          updateUser({ name: res.data.name, avatar_url: res.data.avatar_url });
        })
        .catch(() => setProfile(null));
      void refreshUnread();
    }, [isAuthenticated, updateUser, refreshUnread])
  );

  const permHint =
    items.length > 0
      ? `已授权 ${grantedCount}/${items.length}`
      : '定位 · 相册 · 相机';

  if (!isAuthenticated) {
    return (
      <Screen safeAreaEdges={['left', 'right']} backgroundColor={palette.background}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          style={{ paddingTop: insets.top }}
        >
          <LinearGradient
            colors={['#2D6A4F', '#52B788']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingTop: 40, paddingBottom: 48 }}
            className="px-6 items-center"
          >
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <FontAwesome6 name="mountain-sun" size={32} color="#fff" />
            </View>
            <Text className="text-white text-2xl font-bold tracking-widest">山途</Text>
            <Text className="text-white/80 text-sm mt-2 text-center">
              登录后同步行程、勋章与安全守护
            </Text>
          </LinearGradient>
          <View
            className="mx-5 bg-surface p-6 -mt-6"
            style={{
              borderTopLeftRadius: 32,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 32,
            }}
          >
            <TouchableOpacity
              onPress={() => router.push('/login')}
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 24,
                overflow: 'hidden',
              }}
            >
              <LinearGradient
                colors={['#2D6A4F', '#52B788']}
                style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-white font-bold">去登录</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <SectionLabel>设置与合规</SectionLabel>
          <MenuCard>
            <MenuRow
              icon="user-shield"
              title="隐私与权限"
              subtitle={permHint}
              onPress={() => router.push('/privacy')}
            />
          </MenuCard>

          <Accordion title="界面背景" right={seasonLabel(palette.id)}>
            <SeasonBackgroundPicker />
          </Accordion>
        </ScrollView>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen safeAreaEdges={['left', 'right']} backgroundColor={palette.background}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">加载中…</Text>
        </View>
      </Screen>
    );
  }

  const displayName = user?.name || profile.name;
  const earnedBadges = profile.badges.filter((b) => b.earned).length;

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor={palette.background}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        <LinearGradient
          colors={['#2D6A4F', '#52B788']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + 20, paddingBottom: 28 }}
          className="px-5 items-center"
        >
          <TouchableOpacity onPress={() => router.push('/edit-profile')} activeOpacity={0.85}>
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: 80, height: 80, borderRadius: 40 }}
              contentFit="cover"
            />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold mt-3">{displayName}</Text>
          <Text className="text-white/80 text-xs mt-1.5 text-center px-6" numberOfLines={2}>
            {profile.bio}
          </Text>
          <View className="flex-row items-center gap-2 mt-2.5">
            <View className="px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Text className="text-white text-xs font-medium">Lv.{profile.level}</Text>
            </View>
            <View className="px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Text className="text-white text-xs font-medium">安全分 {profile.safety_score}</Text>
            </View>
            <View
              className="px-3 py-1 rounded-full"
              style={{
                backgroundColor: profile.verified
                  ? 'rgba(233,196,106,0.35)'
                  : 'rgba(255,255,255,0.15)',
              }}
            >
              <Text className="text-white text-xs font-medium">{profile.verified_label}</Text>
            </View>
          </View>
        </LinearGradient>

        <View
          className="mx-5 bg-surface p-5 -mt-5"
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
              {
                value:
                  profile.total_distance_km % 1 === 0
                    ? `${profile.total_distance_km}`
                    : profile.total_distance_km.toFixed(1),
                unit: 'km',
                label: '总里程',
              },
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

        <SectionLabel>出行与安全</SectionLabel>
        <MenuCard>
          <MenuRow
            icon="toolbox"
            title="工具箱"
            subtitle="海拔 · 指南针 · 测距 · 图层"
            onPress={() => router.push('/toolbox')}
          />
          <View style={{ height: 1, backgroundColor: '#F1EBE0' }} />
          <MenuRow
            icon="shield-halved"
            title="安全中心"
            subtitle="紧急联系人 · SOS · 卫星设备"
            onPress={() => router.push('/safety-center')}
          />
        </MenuCard>

        <SectionLabel>账号</SectionLabel>
        <MenuCard>
          <MenuRow
            icon="bell"
            title="消息"
            subtitle={
              unreadCount > 0
                ? `${unreadCount} 条未读（评论 · 点赞）`
                : '评论回复与点赞通知'
            }
            badge={unreadCount}
            onPress={() => router.push('/messages')}
          />
          <View style={{ height: 1, backgroundColor: '#F1EBE0' }} />
          <MenuRow
            icon="user-pen"
            title="编辑资料"
            subtitle="头像 / 昵称 / 简介 / 实名认证"
            onPress={() => router.push('/edit-profile')}
          />
        </MenuCard>

        <SectionLabel>设置与合规</SectionLabel>
        <MenuCard>
          <MenuRow
            icon="user-shield"
            title="隐私与权限"
            subtitle={`${permHint} · 协议政策`}
            onPress={() => router.push('/privacy')}
          />
          <View style={{ height: 1, backgroundColor: '#F1EBE0' }} />
          <MenuRow
            icon="file-shield"
            title="隐私政策"
            onPress={() => router.push('/legal-doc', { type: 'privacy' })}
          />
          <View style={{ height: 1, backgroundColor: '#F1EBE0' }} />
          <MenuRow
            icon="file-contract"
            title="用户协议"
            onPress={() => router.push('/legal-doc', { type: 'terms' })}
          />
        </MenuCard>

        <Accordion title="界面背景" right={seasonLabel(palette.id)}>
          <Text className="text-xs text-muted mb-3" style={{ lineHeight: 17 }}>
            仅改变手机端整体页面背景
          </Text>
          <SeasonBackgroundPicker />
        </Accordion>

        <Accordion
          title="成就与记录"
          right={`${earnedBadges} 勋章 · ${profile.completed_routes.length} 路线`}
        >
          <Text className="text-xs font-semibold text-foreground mb-2">
            勋章墙 · {earnedBadges}/{profile.badges.length}
          </Text>
          <View className="flex-row flex-wrap gap-3 mb-4">
            {profile.badges.map((badge) => (
              <View key={badge.id} className="items-center" style={{ width: '22%' }}>
                <View
                  className="w-14 h-14 rounded-full items-center justify-center mb-1.5"
                  style={{
                    backgroundColor: badge.earned
                      ? 'rgba(45,106,79,0.1)'
                      : 'rgba(61,50,41,0.05)',
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

          <Text className="text-xs font-semibold text-foreground mb-2">
            安全学分 · {profile.safety_score}/100
          </Text>
          <View className="flex-row items-center gap-4 mb-4">
            <View
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
            >
              <Text className="text-xl font-bold" style={{ color: '#2D6A4F' }}>
                {profile.safety_score}
              </Text>
            </View>
            <View className="flex-1">
              <View className="h-3 bg-default rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${profile.safety_score}%`, backgroundColor: '#2D6A4F' }}
                />
              </View>
              <Text className="text-xs text-muted mt-2">完成安全培训与风险测试可提升学分</Text>
            </View>
          </View>

          <Text className="text-xs font-semibold text-foreground mb-2">
            已完成路线 · {profile.completed_routes.length}
          </Text>
          {profile.completed_routes.length === 0 ? (
            <Text className="text-sm text-muted text-center py-2">暂无完成记录</Text>
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
                  <Text className="text-sm font-semibold text-foreground">
                    {cr.route_name || `路线 ${cr.route_id}`}
                  </Text>
                  <Text className="text-xs text-muted mt-0.5">
                    {cr.completed_at} · {cr.duration_hours}小时
                  </Text>
                </View>
              </View>
            ))
          )}
        </Accordion>

        <TouchableOpacity
          onPress={() => logout()}
          activeOpacity={0.7}
          className="mx-5 mt-5 mb-2 py-4 items-center"
          style={{
            backgroundColor: 'rgba(196,69,54,0.08)',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 20,
          }}
        >
          <Text className="font-semibold" style={{ color: '#C44536' }}>
            退出登录
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}
