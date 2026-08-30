import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useSeasonTheme } from '@/contexts/SeasonThemeContext';
import {
  useAppPermissions,
  type PermissionItem,
  type PermissionStatusLabel,
} from '@/hooks/useAppPermissions';

function statusColor(status: PermissionStatusLabel) {
  if (status === 'granted') return '#2D6A4F';
  if (status === 'denied' || status === 'restricted') return '#C44536';
  if (status === 'unavailable') return '#8B7D6B';
  return '#D4A017';
}

function PermissionCard({
  item,
  icon,
  onPress,
}: {
  item: PermissionItem;
  icon: string;
  onPress: () => void;
}) {
  const color = statusColor(item.status);
  const actionLabel =
    item.status === 'granted'
      ? '已开启'
      : item.status === 'denied' && !item.canAskAgain
        ? '去系统设置'
        : item.status === 'unavailable'
          ? '不可用'
          : '去授权';

  return (
    <View
      className="bg-surface px-4 py-3.5 mb-2"
      style={{
        borderTopLeftRadius: 18,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 18,
      }}
    >
      <View className="flex-row items-start">
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
        >
          <FontAwesome6 name={icon as 'location-dot'} size={16} color="#2D6A4F" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-foreground">{item.title}</Text>
            <Text className="text-xs font-semibold" style={{ color }}>
              {item.statusText}
            </Text>
          </View>
          <Text className="text-xs text-muted mt-1.5" style={{ lineHeight: 17 }}>
            {item.purpose}
          </Text>
          {item.status !== 'granted' && item.status !== 'unavailable' ? (
            <TouchableOpacity
              onPress={onPress}
              activeOpacity={0.85}
              className="mt-3 self-start px-3 py-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(45,106,79,0.12)' }}
            >
              <Text className="text-xs font-bold" style={{ color: '#2D6A4F' }}>
                {actionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { palette } = useSeasonTheme();
  const { items, loading, request, openSystemSettings, grantedCount, meta } =
    useAppPermissions();

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor={palette.background}>
      <View style={{ paddingTop: insets.top + 8 }} className="px-4 pb-2 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
          hitSlop={8}
        >
          <FontAwesome6 name="chevron-left" size={16} color="#2D6A4F" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-foreground">隐私与权限</Text>
          <Text className="text-xs text-muted mt-0.5">
            定位 · 相册 · 相机 · 协议说明
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="px-4 py-3 mb-3"
          style={{
            backgroundColor: 'rgba(45,106,79,0.08)',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 16,
          }}
        >
          <Text className="text-xs text-foreground" style={{ lineHeight: 18 }}>
            权限按需申请：仅在使用相关功能时请求。您可随时在本页或系统设置中管理授权。
          </Text>
        </View>

        <Text className="text-sm font-bold text-foreground mb-2">系统权限</Text>
        {loading && items.length === 0 ? (
          <View className="py-8 items-center">
            <ActivityIndicator color="#2D6A4F" />
          </View>
        ) : (
          items.map((item) => (
            <PermissionCard
              key={item.kind}
              item={item}
              icon={meta[item.kind].icon}
              onPress={() => {
                if (item.status === 'denied' && !item.canAskAgain) {
                  void openSystemSettings();
                } else {
                  void request(item.kind);
                }
              }}
            />
          ))
        )}
        <Text className="text-xs text-muted mb-4 mt-1">
          已授权 {grantedCount}/{items.length || 3}
        </Text>

        <TouchableOpacity
          onPress={() => void openSystemSettings()}
          activeOpacity={0.85}
          className="flex-row items-center bg-surface px-4 py-3.5 mb-4"
          style={{
            borderTopLeftRadius: 18,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 18,
          }}
        >
          <View
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: 'rgba(61,50,41,0.06)' }}
          >
            <FontAwesome6 name="gear" size={16} color="#8B7D6B" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">系统设置</Text>
            <Text className="text-xs text-muted mt-0.5">跳转系统页精细管理权限</Text>
          </View>
          <FontAwesome6 name="chevron-right" size={12} color="#8B7D6B" />
        </TouchableOpacity>

        <Text className="text-sm font-bold text-foreground mb-2">协议与政策</Text>
        <View
          className="bg-surface px-4 mb-2"
          style={{
            borderTopLeftRadius: 18,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 18,
          }}
        >
          <TouchableOpacity
            onPress={() => router.push('/legal-doc', { type: 'privacy' })}
            className="flex-row items-center py-3.5"
            activeOpacity={0.75}
          >
            <FontAwesome6 name="file-shield" size={15} color="#2D6A4F" />
            <Text className="text-sm font-semibold text-foreground ml-3 flex-1">隐私政策</Text>
            <FontAwesome6 name="chevron-right" size={12} color="#8B7D6B" />
          </TouchableOpacity>
          <View style={{ height: 1, backgroundColor: '#F1EBE0' }} />
          <TouchableOpacity
            onPress={() => router.push('/legal-doc', { type: 'terms' })}
            className="flex-row items-center py-3.5"
            activeOpacity={0.75}
          >
            <FontAwesome6 name="file-contract" size={15} color="#2D6A4F" />
            <Text className="text-sm font-semibold text-foreground ml-3 flex-1">用户协议</Text>
            <FontAwesome6 name="chevron-right" size={12} color="#8B7D6B" />
          </TouchableOpacity>
        </View>

        <Text className="text-xs text-muted mt-2 px-1" style={{ lineHeight: 17 }}>
          正式上架前请由法务审定协议文本，并替换应用内占位联系方式。
        </Text>
      </ScrollView>
    </Screen>
  );
}
