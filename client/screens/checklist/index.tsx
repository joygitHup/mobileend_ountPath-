import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { JoinTripModal } from '@/components/JoinTripModal';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';
import { notifyInfo } from '@/utils/notify';

interface ChecklistItem {
  id: string;
  name: string;
  description: string;
  category: 'essential' | 'recommended' | 'optional';
  weight_grams: number;
  checked: boolean;
}

interface ChecklistData {
  trip_id?: string;
  route_id: string;
  route_name: string;
  departure_time: string;
  weather_summary: string;
  items: ChecklistItem[];
  total_weight_suggestion_grams: number;
  read_only?: boolean;
  need_trip?: boolean;
}

const categoryConfig = {
  essential: { label: '建议必带', color: '#C44536', bg: 'rgba(196,69,54,0.08)', icon: 'triangle-exclamation' as const },
  recommended: { label: '强烈建议', color: '#E9C46A', bg: 'rgba(233,196,106,0.12)', icon: 'circle-check' as const },
  optional: { label: '可选提升', color: '#2D6A4F', bg: 'rgba(45,106,79,0.08)', icon: 'circle-plus' as const },
};

function ItemCard({
  item,
  onToggle,
  disabled,
}: {
  item: ChecklistItem;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={() => !disabled && onToggle(item.id)}
      activeOpacity={disabled ? 1 : 0.75}
      className="mb-2 px-3 py-3 flex-row items-start gap-3 bg-surface"
      style={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 16,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <View
        className="w-6 h-6 rounded-md items-center justify-center mt-0.5"
        style={{
          borderWidth: 1.5,
          borderColor: item.checked ? '#2D6A4F' : '#C4B8A8',
          backgroundColor: item.checked ? '#2D6A4F' : 'transparent',
        }}
      >
        {item.checked ? <FontAwesome6 name="check" size={11} color="#fff" /> : null}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-foreground">{item.name}</Text>
        {!!item.description && (
          <View className="mt-2 p-3 rounded-xl" style={{ backgroundColor: '#F1EBE0' }}>
            <View className="flex-row items-start gap-2">
              <FontAwesome6 name="lightbulb" size={12} color="#D4A276" style={{ marginTop: 2 }} />
              <Text className="text-xs text-muted flex-1 leading-5">{item.description}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function ChecklistScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ routeId: string; tripId?: string }>();
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinOpen, setJoinOpen] = useState(false);

  const load = useCallback(async () => {
    if (!params.routeId) return;
    try {
      setLoading(true);
      const res = await fetchApi<{ data: ChecklistData }>(
        `/api/v1/checklist/${params.routeId}`
      );
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [params.routeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toggleItem = async (id: string) => {
    if (!data) return;
    if (data.read_only || data.need_trip || !data.trip_id) {
      notifyInfo('请先加入行程', '清单勾选会写入当前行程，加入后即可勾选');
      setJoinOpen(true);
      return;
    }
    const target = data.items.find((i) => i.id === id);
    if (!target) return;
    const nextChecked = !target.checked;
    setData({
      ...data,
      items: data.items.map((item) =>
        item.id === id ? { ...item, checked: nextChecked } : item
      ),
    });
    try {
      await fetchApi(`/api/v1/checklist/${params.routeId}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ item_id: id, checked: nextChecked }),
      });
    } catch {
      setData({
        ...data,
        items: data.items.map((item) =>
          item.id === id ? { ...item, checked: target.checked } : item
        ),
      });
    }
  };

  if (loading) {
    return (
      <Screen backgroundColor="#FDF8F0">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2D6A4F" />
        </View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen backgroundColor="#FDF8F0">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-muted mb-3">加载失败</Text>
          <TouchableOpacity onPress={() => void load()} className="px-4 py-2 rounded-xl" style={{ backgroundColor: '#2D6A4F' }}>
            <Text className="text-white font-semibold">重试</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  const categories = ['essential', 'recommended', 'optional'] as const;
  const checkedCount = data.items.filter((i) => i.checked).length;
  const totalCount = data.items.length;
  const essential = data.items.filter((i) => i.category === 'essential');
  const essentialDone = essential.filter((i) => i.checked).length;
  const essentialReady = essential.length > 0 && essentialDone >= essential.length;
  const totalWeight = data.items
    .filter((i) => i.checked)
    .reduce((sum, i) => sum + i.weight_grams, 0);
  const progress = totalCount > 0 ? checkedCount / totalCount : 0;
  const readOnly = !!(data.read_only || data.need_trip || !data.trip_id);

  const goNext = () => {
    if (readOnly) {
      setJoinOpen(true);
      return;
    }
    router.push('/(tabs)/trip');
  };

  const goGuard = () => {
    if (readOnly || !data.trip_id) {
      setJoinOpen(true);
      return;
    }
    router.push('/guard', { routeId: data.route_id, tripId: data.trip_id });
  };

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <View style={{ paddingTop: insets.top + 8 }} className="px-5 pb-4">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} className="w-9 h-9 items-center justify-center">
            <FontAwesome6 name="chevron-left" size={16} color="#2D6A4F" />
          </TouchableOpacity>
          <View className="flex-1 px-2">
            <Text className="text-lg font-bold text-foreground text-center">{data.route_name}</Text>
            <Text className="text-xs text-muted text-center mt-0.5">行前准备清单</Text>
          </View>
          <View className="w-9" />
        </View>
        {readOnly ? (
          <TouchableOpacity
            onPress={() => setJoinOpen(true)}
            className="mt-3 px-3 py-2.5 rounded-2xl"
            style={{ backgroundColor: 'rgba(196,69,54,0.1)' }}
          >
            <Text className="text-xs font-semibold" style={{ color: '#C44536', lineHeight: 18 }}>
              尚未加入行程 · 当前为只读预览。点此加入后即可勾选并写入行程。
            </Text>
          </TouchableOpacity>
        ) : null}
        <Text className="text-xs text-muted mt-2">
          已勾 {checkedCount}/{totalCount}
          {essential.length > 0 ? ` · 建议必带 ${essentialDone}/${essential.length}` : ''}
          {totalWeight > 0 ? ` · 约 ${Math.round(totalWeight / 1000)}kg` : ''}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: progress === 1 || essentialReady || readOnly ? 120 : 40 }}
        showsVerticalScrollIndicator={false}
      >
        {categories.map((cat) => {
          const items = data.items.filter((i) => i.category === cat);
          if (items.length === 0) return null;
          const config = categoryConfig[cat];
          return (
            <View key={cat} className="mx-5 mb-4">
              <View className="flex-row items-center gap-2 mb-3">
                <View className="w-7 h-7 rounded-full items-center justify-center" style={{ backgroundColor: config.bg }}>
                  <FontAwesome6 name={config.icon} size={12} color={config.color} />
                </View>
                <Text className="text-base font-bold text-foreground">{config.label}</Text>
                <Text className="text-xs text-muted">({items.filter((i) => i.checked).length}/{items.length})</Text>
              </View>
              {items.map((item) => (
                <ItemCard key={item.id} item={item} onToggle={toggleItem} disabled={readOnly} />
              ))}
            </View>
          );
        })}
      </ScrollView>

      {(progress === 1 || essentialReady || readOnly) && (
        <View
          className="absolute bottom-0 left-0 right-0 px-5 pt-3 bg-background/95"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {readOnly ? (
            <TouchableOpacity onPress={() => setJoinOpen(true)} activeOpacity={0.85}>
              <LinearGradient
                colors={['#2D6A4F', '#52B788']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text className="text-white text-base font-bold">加入行程后勾选清单</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View className="gap-2">
              <TouchableOpacity
                onPress={essentialReady ? goGuard : goNext}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#2D6A4F', '#52B788']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text className="text-white text-base font-bold">
                    {essentialReady ? '去开启行中守护' : '回行程中心'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              {essentialReady ? (
                <TouchableOpacity onPress={goNext} className="py-2 items-center">
                  <Text className="text-sm font-semibold" style={{ color: '#2D6A4F' }}>
                    先回行程中心
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>
      )}

      <JoinTripModal
        visible={joinOpen}
        routeId={params.routeId}
        routeName={data.route_name}
        onClose={() => setJoinOpen(false)}
        onJoined={async () => {
          setJoinOpen(false);
          await load();
        }}
      />
    </Screen>
  );
}
