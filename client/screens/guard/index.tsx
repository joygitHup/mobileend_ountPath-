import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';

type GuardStatus = 'idle' | 'active' | 'sos';

interface GuardSession {
  id: string;
  status: string;
  started_at: string;
  planned_duration_hours: number;
  guardians: string[];
  last_location: { lat: number; lng: number; timestamp: string } | null;
}

export default function GuardScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ routeId: string }>();
  const [status, setStatus] = useState<GuardStatus>('idle');
  const [session, setSession] = useState<GuardSession | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const pulseAnim = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
    opacity: 0.3 + 0.7 * (2 - pulseAnim.value),
  }));

  useEffect(() => {
    if (status === 'active') {
      // eslint-disable-next-line react-hooks/immutability
      pulseAnim.value = withRepeat(
        withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [status]);

  const startGuard = async () => {
    try {
      const res = await fetchApi<{ data: GuardSession }>('/api/v1/guard/start', {
        method: 'POST',
        body: JSON.stringify({
          route_id: params.routeId || 'unknown',
          planned_duration_hours: 8,
          guardians: ['家人'],
        }),
      });
      setSession(res.data);
      setStatus('active');
      const startTime = Date.now();
      const timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    } catch {
      Alert.alert('错误', '启动守护失败');
    }
  };

  const triggerSOS = () => {
    Alert.alert(
      'SOS 紧急求救',
      '确认触发SOS？系统将立即向你的守护人发送最后位置和轨迹信息。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认求救',
          style: 'destructive',
          onPress: async () => {
            if (!session) return;
            try {
              await fetchApi('/api/v1/guard/sos', {
                method: 'POST',
                body: JSON.stringify({
                  session_id: session.id,
                  message: '紧急求救，请速来救援',
                }),
              });
              setStatus('sos');
            } catch {
              Alert.alert('错误', 'SOS发送失败，请尝试拨打110');
            }
          },
        },
      ]
    );
  };

  const stopGuard = async () => {
    if (!session) return;
    Alert.alert('结束守护', '确认结束本次守护？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认结束',
        onPress: async () => {
          try {
            await fetchApi('/api/v1/guard/stop', {
              method: 'POST',
              body: JSON.stringify({ session_id: session.id }),
            });
            setStatus('idle');
            setSession(null);
            setElapsed(0);
          } catch {
            Alert.alert('错误', '结束守护失败');
          }
        },
      },
    ]);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8 }} className="px-5 pb-4">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
            <FontAwesome6 name="chevron-left" size={18} color="#3D3229" />
            <Text className="text-base font-semibold text-foreground ml-2">实时守护</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1 items-center justify-center px-5">
        {status === 'idle' && (
          <View className="items-center">
            <View
              className="w-32 h-32 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
            >
              <FontAwesome6 name="shield-halved" size={48} color="#2D6A4F" />
            </View>
            <Text className="text-xl font-bold text-foreground mb-2">开启实时守护</Text>
            <Text className="text-sm text-muted text-center mb-8 leading-6">
              开启后，你的守护人将实时看到你的位置和轨迹。{'\n'}无信号时本地记录，恢复信号后自动上传。
            </Text>
            <TouchableOpacity onPress={startGuard} activeOpacity={0.85}>
              <LinearGradient
                colors={['#2D6A4F', '#52B788']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="rounded-2xl py-4 px-10 items-center"
              >
                <Text className="text-white text-lg font-bold">开始守护</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {status === 'active' && (
          <View className="items-center w-full">
            {/* Breathing indicator */}
            <View className="relative mb-8">
              <Animated.View
                className="absolute w-40 h-40 rounded-full"
                style={[
                  pulseStyle,
                  { backgroundColor: 'rgba(82,183,136,0.2)', top: -20, left: -20 },
                ]}
              />
              <View
                className="w-24 h-24 rounded-full items-center justify-center"
                style={{ backgroundColor: '#52B788' }}
              >
                <FontAwesome6 name="shield-halved" size={36} color="#fff" />
              </View>
            </View>

            <Text className="text-lg font-bold mb-1" style={{ color: '#2D6A4F' }}>
              守护中
            </Text>
            <Text className="text-3xl font-bold text-foreground mb-6" style={{ fontVariant: ['tabular-nums'] }}>
              {formatTime(elapsed)}
            </Text>

            {/* Info cards */}
            <View className="w-full bg-surface rounded-3xl p-5 mb-4" style={{
              borderTopLeftRadius: 32, borderTopRightRadius: 8,
              borderBottomLeftRadius: 8, borderBottomRightRadius: 32,
              shadowColor: '#3D3229', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
            }}>
              <View className="flex-row items-center gap-3 mb-4">
                <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}>
                  <FontAwesome6 name="location-dot" size={16} color="#2D6A4F" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">最后位置</Text>
                  <Text className="text-xs text-muted mt-0.5">
                    {session?.last_location
                      ? `${session.last_location.lat.toFixed(4)}, ${session.last_location.lng.toFixed(4)}`
                      : '定位中...'}
                  </Text>
                </View>
                <View className="w-3 h-3 rounded-full bg-success" />
              </View>
              <View className="flex-row items-center gap-3 mb-4">
                <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}>
                  <FontAwesome6 name="users" size={16} color="#2D6A4F" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">守护人</Text>
                  <Text className="text-xs text-muted mt-0.5">
                    {session?.guardians.join(', ') || '家人'}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}>
                  <FontAwesome6 name="clock" size={16} color="#2D6A4F" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">计划时长</Text>
                  <Text className="text-xs text-muted mt-0.5">
                    {session?.planned_duration_hours || 8} 小时
                  </Text>
                </View>
              </View>
            </View>

            {/* SOS Button */}
            <TouchableOpacity
              onPress={triggerSOS}
              className="w-full mb-3"
              activeOpacity={0.85}
            >
              <View
                className="rounded-2xl py-4 items-center"
                style={{
                  backgroundColor: '#C44536',
                  shadowColor: '#C44536',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  elevation: 6,
                }}
              >
                <View className="flex-row items-center">
                  <FontAwesome6 name="triangle-exclamation" size={18} color="#fff" />
                  <Text className="text-white text-lg font-bold ml-2">SOS 紧急求救</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={stopGuard} className="w-full">
              <View
                className="rounded-2xl py-3 items-center"
                style={{ backgroundColor: 'rgba(61,50,41,0.08)' }}
              >
                <Text className="text-muted text-sm font-medium">结束守护</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {status === 'sos' && (
          <View className="items-center">
            <View
              className="w-32 h-32 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: 'rgba(196,69,54,0.1)' }}
            >
              <FontAwesome6 name="triangle-exclamation" size={48} color="#C44536" />
            </View>
            <Text className="text-xl font-bold mb-2" style={{ color: '#C44536' }}>
              SOS 已发送
            </Text>
            <Text className="text-sm text-muted text-center mb-8 leading-6">
              已向你的守护人发送最后位置和轨迹信息。{'\n'}请保持冷静，等待救援。
            </Text>
            <TouchableOpacity
              onPress={() => {
                setStatus('idle');
                setSession(null);
                setElapsed(0);
              }}
              activeOpacity={0.85}
            >
              <View
                className="rounded-2xl py-4 px-10 items-center"
                style={{ backgroundColor: '#3D3229' }}
              >
                <Text className="text-white text-base font-bold">返回</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Screen>
  );
}
