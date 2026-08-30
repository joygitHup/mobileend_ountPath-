import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { Screen } from '@/components/Screen';
import { LegalDocModal } from '@/components/LegalDocModal';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '@/contexts/AuthContext';
import type { LegalDocKey } from '@/utils/legalDocs';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1400&q=80';

type LoginScreenProps = {
  /** 启动闸门模式：必须登录，无关闭/游客入口；成功后由根布局切入主页 */
  gate?: boolean;
};

export default function LoginScreen({ gate = false }: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const router = useSafeRouter();
  const { login } = useAuth();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [legalKey, setLegalKey] = useState<LegalDocKey | null>(null);
  /** 实际可视高度（Web 手机框内不等于 windowHeight） */
  const [viewport, setViewport] = useState({ width: windowWidth, height: windowHeight });

  const width = viewport.width;
  const height = viewport.height;

  const layout = useMemo(() => {
    const compact = height < 720;
    const tiny = height < 640;
    const narrow = width < 360;
    return {
      compact,
      tiny,
      padX: narrow ? 16 : 24,
      brandSize: tiny ? 36 : compact ? 42 : 48,
      brandTracking: tiny ? 4 : compact ? 6 : 8,
      headlineSize: tiny ? 16 : 20,
      closeMb: tiny ? 12 : compact ? 20 : 32,
      brandMb: tiny ? 12 : 0,
      formPadX: narrow ? 16 : 20,
      formPadY: tiny ? 16 : 24,
      fieldH: tiny ? 48 : 52,
      showHint: !tiny,
    };
  }, [width, height]);

  const mist = useSharedValue(0.55);
  const mistStyle = useAnimatedStyle(() => ({
    opacity: mist.value,
  }));

  useEffect(() => {
    mist.value = withRepeat(
      withTiming(0.75, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [mist]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const sendCode = () => {
    const trimmed = phone.trim();
    if (!/^1\d{10}$/.test(trimmed)) {
      setError('请输入正确的手机号');
      return;
    }
    setError('');
    setCountdown(60);
  };

  const handleLogin = async () => {
    const trimmed = phone.trim();
    if (!/^1\d{10}$/.test(trimmed)) {
      setError('请输入正确的手机号');
      return;
    }
    if (code.trim().length < 4) {
      setError('请输入验证码');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const base = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '';
      const res = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmed, code: code.trim() }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { token: string; user: { id: string; name: string; phone?: string; avatar_url?: string } };
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error || `登录失败 (${res.status})`);
      }
      if (!json?.data?.token) {
        throw new Error('登录响应无效');
      }
      await login(json.data.token, json.data.user);
      // gate 模式：根布局感知 isAuthenticated 后自动进入主页
      if (!gate) {
        router.replace('/(tabs)');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const bottomPad = Math.max(insets.bottom, 12) + 8;
  const topPad = insets.top + (layout.compact ? 8 : 16);

  return (
    <Screen
      safeAreaEdges={['left', 'right']}
      backgroundColor="#FDF8F0"
      statusBarStyle="light"
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View
          style={{ flex: 1 }}
          onLayout={(e) => {
            const { width: w, height: h } = e.nativeEvent.layout;
            if (w > 0 && h > 0) {
              setViewport((prev) =>
                prev.width === w && prev.height === h ? prev : { width: w, height: h }
              );
            }
          }}
        >
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
            <Image
              source={{ uri: HERO_IMAGE }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              contentPosition="center"
            />
            <LinearGradient
              colors={[
                'rgba(45,106,79,0.35)',
                'rgba(61,50,41,0.15)',
                'transparent',
              ]}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: layout.compact ? '36%' : '42%',
              }}
            />
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: layout.compact ? '64%' : '58%',
                },
                mistStyle,
              ]}
            >
              <LinearGradient
                colors={[
                  'transparent',
                  'rgba(253,248,240,0.55)',
                  '#FDF8F0',
                  '#FDF8F0',
                ]}
                locations={[0, 0.35, 0.65, 1]}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'space-between',
              paddingTop: topPad,
              paddingBottom: bottomPad,
              paddingHorizontal: layout.padX,
              minHeight: height,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={{ marginBottom: layout.brandMb }}>
              {!gate && (
                <Animated.View entering={FadeIn.duration(700)}>
                  <Pressable
                    onPress={() => {
                      if (router.canGoBack()) router.back();
                    }}
                    hitSlop={16}
                    style={{
                      alignSelf: 'flex-start',
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: layout.closeMb,
                      backgroundColor: 'rgba(253,248,240,0.22)',
                    }}
                  >
                    <FontAwesome6 name="xmark" size={16} color="#FDF8F0" />
                  </Pressable>
                </Animated.View>
              )}

              <Animated.View
                entering={FadeInDown.delay(100).duration(700)}
                style={gate ? { marginTop: layout.closeMb } : undefined}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontWeight: '700',
                    fontSize: layout.brandSize,
                    letterSpacing: layout.brandTracking,
                    textShadowColor: 'rgba(61,50,41,0.35)',
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 8,
                  }}
                >
                  山途
                </Text>
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontWeight: '600',
                    marginTop: layout.tiny ? 8 : 12,
                    fontSize: layout.headlineSize,
                    letterSpacing: 1.2,
                  }}
                >
                  出发前，先问山途
                </Text>
                {!layout.tiny && (
                  <Text
                    style={{
                      marginTop: 8,
                      color: 'rgba(253,248,240,0.85)',
                      fontSize: 14,
                      lineHeight: 22,
                      maxWidth: 280,
                    }}
                  >
                    为徒步者准备的智能决策与安全保障
                  </Text>
                )}
              </Animated.View>
            </View>

            <Animated.View
              entering={FadeInUp.delay(200).duration(650)}
              style={{
                backgroundColor: '#FFFFFF',
                paddingHorizontal: layout.formPadX,
                paddingTop: layout.formPadY,
                paddingBottom: layout.formPadY - 4,
                borderTopLeftRadius: 36,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 36,
                shadowColor: '#3D3229',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.08,
                shadowRadius: 20,
                elevation: 6,
                width: '100%',
                maxWidth: 420,
                alignSelf: 'center',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: layout.compact ? 14 : 20,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: '#2D6A4F',
                  }}
                />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#3D3229' }}>
                  手机号登录
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  marginBottom: 12,
                  backgroundColor: '#F1EBE0',
                  borderRadius: 18,
                  height: layout.fieldH,
                }}
              >
                <FontAwesome6 name="mobile-screen" size={16} color="#8B7D6B" />
                <Text style={{ color: '#3D3229', fontWeight: '500', marginLeft: 12, marginRight: 8 }}>
                  +86
                </Text>
                <TextInput
                  style={{
                    flex: 1,
                    color: '#3D3229',
                    fontSize: 16,
                    paddingVertical: 0,
                    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
                  }}
                  placeholder="请输入手机号"
                  placeholderTextColor="#A89888"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  maxLength={11}
                  value={phone}
                  onChangeText={(t) => {
                    setPhone(t.replace(/\D/g, ''));
                    setError('');
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  marginBottom: 8,
                  backgroundColor: '#F1EBE0',
                  borderRadius: 18,
                  height: layout.fieldH,
                  minWidth: 0,
                }}
              >
                <FontAwesome6 name="shield-halved" size={15} color="#8B7D6B" />
                <TextInput
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: '#3D3229',
                    fontSize: 16,
                    marginLeft: 12,
                    paddingVertical: 0,
                    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
                  }}
                  placeholder="验证码"
                  placeholderTextColor="#A89888"
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={6}
                  value={code}
                  onChangeText={(t) => {
                    setCode(t.replace(/\D/g, ''));
                    setError('');
                  }}
                />
                <TouchableOpacity
                  onPress={sendCode}
                  disabled={countdown > 0}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 12,
                    flexShrink: 0,
                    backgroundColor:
                      countdown > 0 ? 'rgba(45,106,79,0.08)' : 'rgba(45,106,79,0.12)',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: countdown > 0 ? '#8B7D6B' : '#2D6A4F',
                    }}
                  >
                    {countdown > 0 ? `${countdown}s` : '获取验证码'}
                  </Text>
                </TouchableOpacity>
              </View>

              {error ? (
                <Text style={{ fontSize: 12, marginTop: 4, marginBottom: 4, color: '#C44536' }}>
                  {error}
                </Text>
              ) : layout.showHint ? (
                <Text style={{ fontSize: 12, marginTop: 4, marginBottom: 4, color: '#8B7D6B' }}>
                  演示环境验证码请使用 1234
                </Text>
              ) : (
                <View style={{ height: 4 }} />
              )}

              <TouchableOpacity
                onPress={handleLogin}
                disabled={submitting}
                activeOpacity={0.85}
                style={{
                  marginTop: 12,
                  overflow: 'hidden',
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 24,
                }}
              >
                <LinearGradient
                  colors={['#2D6A4F', '#52B788']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    height: layout.fieldH,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text
                        style={{
                          color: '#FFFFFF',
                          fontSize: 16,
                          fontWeight: '700',
                          letterSpacing: 2,
                        }}
                      >
                        进入山途
                      </Text>
                      <FontAwesome6 name="arrow-right" size={14} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {!gate && (
                <TouchableOpacity
                  onPress={() => router.back()}
                  activeOpacity={0.7}
                  hitSlop={8}
                  style={{ alignItems: 'center', marginTop: 12, paddingVertical: 10 }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#8B7D6B' }}>
                    返回
                  </Text>
                </TouchableOpacity>
              )}

              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 11,
                  marginTop: gate ? 16 : 4,
                  color: '#C4B8A8',
                  lineHeight: 16,
                }}
              >
                登录即表示同意
                <Text
                  style={{ color: '#2D6A4F', fontWeight: '600' }}
                  onPress={() => setLegalKey('terms')}
                >
                  《用户协议》
                </Text>
                与
                <Text
                  style={{ color: '#2D6A4F', fontWeight: '600' }}
                  onPress={() => setLegalKey('privacy')}
                >
                  《隐私政策》
                </Text>
              </Text>
            </Animated.View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <LegalDocModal
        visible={!!legalKey}
        docKey={legalKey}
        onClose={() => setLegalKey(null)}
      />
    </Screen>
  );
}
