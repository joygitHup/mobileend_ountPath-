import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  answerConfirm,
  getActiveConfirm,
  subscribeConfirmQueue,
  type ConfirmRequest,
} from '@/utils/confirmQueue';

/** 挂在根 Provider：Web 上渲染带真实按钮文案的确认框 */
export function ConfirmModalHost() {
  const [active, setActive] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const sync = () => setActive(getActiveConfirm());
    sync();
    return subscribeConfirmQueue(sync);
  }, []);

  if (Platform.OS !== 'web' || !active) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => answerConfirm(false)}>
      <Pressable
        onPress={() => answerConfirm(false)}
        style={{
          flex: 1,
          backgroundColor: 'rgba(61,50,41,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: '#FDF8F0',
            borderRadius: 20,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 16,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#3D3229' }}>{active.title}</Text>
          <Text style={{ fontSize: 14, color: '#6B5E52', marginTop: 10, lineHeight: 21 }}>
            {active.message}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <TouchableOpacity
              onPress={() => answerConfirm(false)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: 'rgba(61,50,41,0.06)',
              }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#6B5E52' }}>
                {active.cancelText}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => answerConfirm(true)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: active.destructive ? '#C44536' : '#2D6A4F',
              }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                {active.confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
