import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useSeasonTheme } from '@/contexts/SeasonThemeContext';
import { getLegalDoc, type LegalDocKey } from '@/utils/legalDocs';

export default function LegalDocScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { palette } = useSeasonTheme();
  const params = useLocalSearchParams<{ type?: string }>();
  const key: LegalDocKey = params.type === 'terms' ? 'terms' : 'privacy';
  const doc = getLegalDoc(key);

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
          <Text className="text-lg font-bold text-foreground">{doc.title}</Text>
          <Text className="text-xs text-muted mt-0.5">更新日期 {doc.updatedAt}</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="bg-surface px-4 py-4 mt-2"
          style={{
            borderTopLeftRadius: 20,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 20,
          }}
        >
          <Text className="text-xs text-muted mb-4" style={{ lineHeight: 18 }}>
            以下内容供产品演示与合规说明使用，正式上架前请以法务审定版本为准。
          </Text>
          {doc.sections.map((sec) => (
            <View key={sec.heading} className="mb-4">
              <Text className="text-sm font-bold text-foreground mb-2">{sec.heading}</Text>
              {sec.body.map((line) => (
                <Text
                  key={line}
                  className="text-xs text-muted mb-1.5"
                  style={{ lineHeight: 20 }}
                >
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
