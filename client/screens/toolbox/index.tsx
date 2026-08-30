import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';

interface ToolItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  offline: boolean;
  offline_note: string;
  category: 'field' | 'map' | 'analysis';
}

const categoryLabel = {
  field: '行中工具',
  map: '地图图层',
  analysis: '分析工具',
};

export default function ToolboxScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [intro, setIntro] = useState('');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          setLoading(true);
          const res = await fetchApi<{
            data: { intro?: string; tools?: ToolItem[] } | ToolItem[];
          }>('/api/v1/tools');
          const payload = res.data;
          if (Array.isArray(payload)) {
            setTools(payload);
            setIntro('户外刚需工具集中入口');
          } else {
            setTools(payload?.tools ?? []);
            setIntro(payload?.intro || '');
          }
        } catch {
          setTools([]);
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  const groups = (['field', 'map', 'analysis'] as const).map((cat) => ({
    cat,
    items: (tools || []).filter((t) => t.category === cat),
  }));

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
        <Text className="flex-1 text-center text-base font-bold text-foreground">工具箱</Text>
        <View className="w-10" />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2D6A4F" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text className="text-sm text-muted mb-4" style={{ lineHeight: 20 }}>
            {intro || '户外刚需工具，优先保证离线可用。'}
          </Text>

          {groups.map(({ cat, items }) =>
            items.length === 0 ? null : (
              <View key={cat} className="mb-5">
                <Text className="text-sm font-bold text-foreground mb-3">
                  {categoryLabel[cat]}
                </Text>
                <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
                  {items.map((tool) => (
                    <TouchableOpacity
                      key={tool.id}
                      onPress={() => router.push('/tool', { id: tool.id })}
                      activeOpacity={0.8}
                      className="bg-surface p-3.5 mb-3"
                      style={{
                        width: '47%',
                        marginHorizontal: '1.5%',
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 8,
                        borderBottomLeftRadius: 8,
                        borderBottomRightRadius: 20,
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mb-2.5"
                        style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
                      >
                        <FontAwesome6 name={tool.icon as 'compass'} size={16} color="#2D6A4F" />
                      </View>
                      <Text className="text-sm font-bold text-foreground">{tool.name}</Text>
                      <Text className="text-xs text-muted mt-1" numberOfLines={2} style={{ lineHeight: 16 }}>
                        {tool.description}
                      </Text>
                      <Text
                        className="text-xs mt-2 font-medium"
                        style={{ color: tool.offline ? '#2D6A4F' : '#8B6914' }}
                      >
                        {tool.offline_note}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
