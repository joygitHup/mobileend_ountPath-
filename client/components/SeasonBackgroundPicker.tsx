import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import {
  SEASON_ORDER,
  SEASON_PALETTES,
  type SeasonId,
  useSeasonTheme,
} from '@/contexts/SeasonThemeContext';

/** 春夏秋冬背景色选择器（收纳在折叠区内使用） */
export function SeasonBackgroundPicker() {
  const { season, setSeason } = useSeasonTheme();

  return (
    <View className="flex-row gap-2">
      {SEASON_ORDER.map((id) => {
        const p = SEASON_PALETTES[id];
        const selected = season === id;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => setSeason(id)}
            activeOpacity={0.85}
            className="flex-1 items-center py-2"
            style={{
              backgroundColor: p.background,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? '#2D6A4F' : p.swatch,
              borderRadius: 12,
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${p.label}·${p.subtitle}`}
          >
            <View
              className="w-5 h-5 rounded-full mb-1"
              style={{ backgroundColor: p.swatch }}
            />
            <Text
              className="text-xs font-bold"
              style={{ color: selected ? '#2D6A4F' : '#3D3229' }}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function seasonLabel(id: SeasonId) {
  return `${SEASON_PALETTES[id].label}·${SEASON_PALETTES[id].subtitle}`;
}
