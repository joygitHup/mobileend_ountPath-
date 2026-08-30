import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { getLegalDoc, type LegalDocKey } from '@/utils/legalDocs';

export function LegalDocModal({
  visible,
  docKey,
  onClose,
}: {
  visible: boolean;
  docKey: LegalDocKey | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const doc = docKey ? getLegalDoc(docKey) : null;

  return (
    <Modal visible={visible && !!doc} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 8 }}>
        <View className="px-4 pb-2 flex-row items-center">
          <TouchableOpacity
            onPress={onClose}
            className="w-10 h-10 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
            hitSlop={8}
          >
            <FontAwesome6 name="xmark" size={16} color="#2D6A4F" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground">{doc?.title}</Text>
            <Text className="text-xs text-muted mt-0.5">更新日期 {doc?.updatedAt}</Text>
          </View>
        </View>
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 24 }}
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
            {doc?.sections.map((sec) => (
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
      </View>
    </Modal>
  );
}
