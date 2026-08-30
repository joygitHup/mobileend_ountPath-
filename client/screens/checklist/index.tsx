import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';

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
}

const categoryConfig = {
  essential: { label: '强制必带', color: '#C44536', bg: 'rgba(196,69,54,0.08)', icon: 'triangle-exclamation' as const },
  recommended: { label: '强烈建议', color: '#E9C46A', bg: 'rgba(233,196,106,0.12)', icon: 'circle-check' as const },
  optional: { label: '可选提升', color: '#2D6A4F', bg: 'rgba(45,106,79,0.08)', icon: 'circle-plus' as const },
};

function ItemCard({
  item,
  onToggle,
}: {
  item: ChecklistItem;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = categoryConfig[item.category] ?? categoryConfig.recommended;

  return (
    <View
      className="bg-surface rounded-2xl mb-3 overflow-hidden"
      style={{
        shadowColor: '#3D3229',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
        opacity: item.checked ? 0.6 : 1,
      }}
    >
      <TouchableOpacity
        onPress={() => onToggle(item.id)}
        className="flex-row items-center p-4"
        activeOpacity={0.7}
      >
        <View
          className="w-6 h-6 rounded-lg items-center justify-center mr-3"
          style={{
            backgroundColor: item.checked ? '#2D6A4F' : 'transparent',
            borderWidth: 2,
            borderColor: item.checked ? '#2D6A4F' : '#E8DFD3',
          }}
        >
          {item.checked && <FontAwesome6 name="check" size={12} color="#fff" />}
        </View>
        <View className="flex-1">
          <Text
            className="text-base font-semibold text-foreground"
            style={{ textDecorationLine: item.checked ? 'line-through' : 'none' }}
          >
            {item.name}
          </Text>
          <View className="flex-row items-center gap-2 mt-1">
            <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: config.bg }}>
              <Text className="text-xs font-medium" style={{ color: config.color }}>
                {config.label}
              </Text>
            </View>
            <Text className="text-xs text-muted">{item.weight_grams}g</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setExpanded(!expanded)} className="pl-2">
          <FontAwesome6
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#8B7D6B"
          />
        </TouchableOpacity>
      </TouchableOpacity>
      {expanded && (
        <View className="px-4 pb-3 pt-0 ml-9">
          <View
            className="p-3 rounded-xl"
            style={{ backgroundColor: '#F1EBE0' }}
          >
            <View className="flex-row items-start gap-2">
              <FontAwesome6 name="lightbulb" size={12} color="#D4A276" style={{ marginTop: 2 }} />
              <Text className="text-xs text-muted flex-1 leading-5">{item.description}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export default function ChecklistScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ routeId: string; tripId?: string }>();
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!params.routeId) return;
      (async () => {
        try {
          const res = await fetchApi<{ data: ChecklistData }>(
            `/api/v1/checklist/${params.routeId}`
          );
          setData(res.data);
        } catch {
          setData(null);
        } finally {
          setLoading(false);
        }
      })();
    }, [params.routeId])
  );

  const toggleItem = async (id: string) => {
    if (!data) return;
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
      // 回滚
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
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">加载失败</Text>
        </View>
      </Screen>
    );
  }

  const categories = ['essential', 'recommended', 'optional'] as const;
  const checkedCount = data.items.filter((i) => i.checked).length;
  const totalCount = data.items.length;
  const totalWeight = data.items
    .filter((i) => i.checked)
    .reduce((sum, i) => sum + i.weight_grams, 0);
  const progress = totalCount > 0 ? checkedCount / totalCount : 0;
  const isOverweight = totalWeight > data.total_weight_suggestion_grams;

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8 }} className="px-5 pb-4">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
            <FontAwesome6 name="chevron-left" size={18} color="#3D3229" />
            <Text className="text-base font-semibold text-foreground ml-2">准备清单</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/safety-center')}
            className="px-4 py-2 rounded-full"
            style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
          >
            <Text className="text-sm font-semibold" style={{ color: '#2D6A4F' }}>
              安全中心
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Route Info */}
        <View
          className="mx-5 bg-surface rounded-3xl p-5 mb-4"
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
          <Text className="text-lg font-bold text-foreground">{data.route_name}</Text>
          <View className="flex-row items-center gap-4 mt-2">
            <View className="flex-row items-center gap-1.5">
              <FontAwesome6 name="cloud-sun" size={13} color="#8B7D6B" />
              <Text className="text-xs text-muted">{data.weather_summary}</Text>
            </View>
          </View>
          {/* Progress */}
          <View className="mt-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-foreground">
                打包进度 {checkedCount}/{totalCount}
              </Text>
              <Text className="text-sm font-bold" style={{ color: progress === 1 ? '#2D6A4F' : '#3D3229' }}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
            <View className="h-3 bg-default rounded-full overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${progress * 100}%`,
                  backgroundColor: progress === 1 ? '#2D6A4F' : '#52B788',
                }}
              />
            </View>
          </View>
          {/* Weight */}
          <View className="flex-row items-center justify-between mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: '#F1EBE0' }}>
            <View className="flex-row items-center gap-2">
              <FontAwesome6 name="weight-hanging" size={14} color={isOverweight ? '#C44536' : '#8B7D6B'} />
              <Text className="text-sm" style={{ color: isOverweight ? '#C44536' : '#3D3229' }}>
                {(totalWeight / 1000).toFixed(1)}kg
              </Text>
              <Text className="text-xs text-muted">
                / 建议 {(data.total_weight_suggestion_grams / 1000).toFixed(1)}kg
              </Text>
            </View>
            {isOverweight && (
              <Text className="text-xs font-medium" style={{ color: '#C44536' }}>
                建议精简
              </Text>
            )}
          </View>
        </View>

        {/* Items by Category */}
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
                <Text className="text-xs text-muted">({items.filter(i => i.checked).length}/{items.length})</Text>
              </View>
              {items.map((item) => (
                <ItemCard key={item.id} item={item} onToggle={toggleItem} />
              ))}
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom */}
      {progress === 1 && (
        <View
          className="absolute bottom-0 left-0 right-0 px-5 pb-5 pt-3 bg-background/90"
          style={{ paddingBottom: Math.max(insets.bottom, 20) }}
        >
          <LinearGradient
            colors={['#2D6A4F', '#52B788']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="rounded-2xl py-4 items-center"
          >
            <FontAwesome6 name="circle-check" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text className="text-white text-base font-bold">打包完成，准备出发！</Text>
          </LinearGradient>
        </View>
      )}
    </Screen>
  );
}
