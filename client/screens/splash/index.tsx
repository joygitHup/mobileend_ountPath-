import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { Screen } from '@/components/Screen';

ExpoSplashScreen.preventAutoHideAsync().catch(() => {
  /* already prevented or unsupported on web */
});

function MountainLayer({
  width,
  height,
  d,
  gradId,
  colors,
  opacity = 1,
}: {
  width: number;
  height: number;
  d: string;
  gradId: string;
  colors: [string, string];
  opacity?: number;
}) {
  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', bottom: 0, left: 0 }}
    >
      <Defs>
        <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors[0]} stopOpacity={opacity} />
          <Stop offset="1" stopColor={colors[1]} stopOpacity={opacity} />
        </SvgGradient>
      </Defs>
      <Path d={d} fill={`url(#${gradId})`} />
    </Svg>
  );
}

type SplashProps = {
  /** 动画结束或用户跳过时回调；作为独立路由时可不传 */
  onFinish?: () => void;
};

export default function SplashScreenView({ onFinish }: SplashProps) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: winW, height: winH });
  const width = viewport.width;
  const height = viewport.height;
  const leaving = useRef(false);

  const mist = useSharedValue(0.35);
  const sun = useSharedValue(0.4);
  const screenOpacity = useSharedValue(1);

  const mistStyle = useAnimatedStyle(() => ({ opacity: mist.value }));
  const sunStyle = useAnimatedStyle(() => ({
    opacity: sun.value,
    transform: [{ scale: 0.92 + sun.value * 0.12 }],
  }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));

  const complete = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    onFinish?.();
  }, [onFinish]);

  const finish = useCallback(() => {
    if (leaving.current) return;
    // Reanimated SharedValue 通过 .value 赋值是官方 API
    // eslint-disable-next-line react-hooks/immutability -- SharedValue mutation
    screenOpacity.value = withTiming(
      0,
      { duration: 520, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(complete)();
      }
    );
  }, [complete, screenOpacity]);

  useEffect(() => {
    ExpoSplashScreen.hideAsync().catch(() => undefined);

    // eslint-disable-next-line react-hooks/immutability -- SharedValue mutation
    mist.value = withTiming(0.7, {
      duration: 2200,
      easing: Easing.inOut(Easing.ease),
    });
    // eslint-disable-next-line react-hooks/immutability -- SharedValue mutation
    sun.value = withTiming(1, {
      duration: 1800,
      easing: Easing.out(Easing.cubic),
    });

    const timer = setTimeout(finish, 2400);
    return () => clearTimeout(timer);
  }, [finish, mist, sun]);

  const mountainH = Math.min(height * 0.42, 340);
  const farPath = `M0 ${mountainH * 0.55} L${width * 0.18} ${mountainH * 0.32} L${width * 0.34} ${mountainH * 0.48} L${width * 0.52} ${mountainH * 0.18} L${width * 0.72} ${mountainH * 0.42} L${width * 0.88} ${mountainH * 0.28} L${width} ${mountainH * 0.4} L${width} ${mountainH} L0 ${mountainH} Z`;
  const nearPath = `M0 ${mountainH * 0.62} L${width * 0.22} ${mountainH * 0.38} L${width * 0.4} ${mountainH * 0.55} L${width * 0.58} ${mountainH * 0.3} L${width * 0.78} ${mountainH * 0.52} L${width} ${mountainH * 0.36} L${width} ${mountainH} L0 ${mountainH} Z`;

  return (
    <Screen
      safeAreaEdges={['left', 'right']}
      backgroundColor="#FDF8F0"
      statusBarStyle="dark"
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={finish}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (w > 0 && h > 0) {
            setViewport((prev) =>
              prev.width === w && prev.height === h ? prev : { width: w, height: h }
            );
          }
        }}
      >
        <Animated.View style={[{ flex: 1 }, fadeStyle]}>
          <LinearGradient
            colors={['#FDF8F0', '#F3E9D8', '#D4E5D0', '#A8C5B0']}
            locations={[0, 0.35, 0.7, 1]}
            style={{ flex: 1 }}
          >
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  alignSelf: 'center',
                  top: height * 0.18,
                  width: width * 0.55,
                  height: width * 0.55,
                  borderRadius: width * 0.3,
                  backgroundColor: '#E9C46A',
                },
                sunStyle,
              ]}
            />
            <View
              style={{
                position: 'absolute',
                alignSelf: 'center',
                top: height * 0.22,
                width: width * 0.28,
                height: width * 0.28,
                borderRadius: width * 0.14,
                backgroundColor: 'rgba(253,248,240,0.55)',
              }}
            />

            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: mountainH * 0.35,
                  height: mountainH * 0.8,
                },
                mistStyle,
              ]}
            >
              <LinearGradient
                colors={[
                  'transparent',
                  'rgba(253,248,240,0.35)',
                  'rgba(253,248,240,0.75)',
                ]}
                style={{ flex: 1 }}
              />
            </Animated.View>

            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: mountainH,
              }}
            >
              <MountainLayer
                width={width}
                height={mountainH}
                d={farPath}
                gradId="mtFar"
                colors={['#7FA88A', '#4A7C5F']}
                opacity={0.75}
              />
              <MountainLayer
                width={width}
                height={mountainH}
                d={nearPath}
                gradId="mtNear"
                colors={['#3D6B4F', '#2D6A4F']}
              />
              <LinearGradient
                colors={['transparent', 'rgba(253,248,240,0.25)', '#FDF8F0']}
                locations={[0, 0.55, 1]}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: mountainH * 0.45,
                }}
              />
            </View>

            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: insets.top,
                paddingBottom: mountainH * 0.35,
                paddingHorizontal: 32,
              }}
            >
              <Animated.View
                entering={FadeIn.duration(800)}
                style={{
                  width: 72,
                  height: 72,
                  borderTopLeftRadius: 32,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 32,
                  backgroundColor: 'rgba(45,106,79,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 28,
                  borderWidth: 1,
                  borderColor: 'rgba(45,106,79,0.18)',
                }}
              >
                <Svg width={36} height={36} viewBox="0 0 36 36">
                  <Path d="M4 28 L14 12 L20 20 L26 10 L32 28 Z" fill="#2D6A4F" />
                  <Path d="M18 28 L22 20 L26 28 Z" fill="#E9C46A" opacity={0.9} />
                </Svg>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(180).duration(900)}>
                <Text
                  style={{
                    fontSize: 48,
                    fontWeight: '700',
                    color: '#3D3229',
                    letterSpacing: 10,
                    textAlign: 'center',
                  }}
                >
                  山途
                </Text>
                <Text
                  style={{
                    marginTop: 14,
                    fontSize: 16,
                    fontWeight: '600',
                    color: '#2D6A4F',
                    letterSpacing: 2,
                    textAlign: 'center',
                  }}
                >
                  出发前，先问山途
                </Text>
                <Text
                  style={{
                    marginTop: 10,
                    fontSize: 13,
                    color: '#8B7D6B',
                    textAlign: 'center',
                    lineHeight: 20,
                  }}
                >
                  智能决策 · 安全保障
                </Text>
              </Animated.View>
            </View>

            <Animated.View
              entering={FadeIn.delay(900).duration(600)}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: Math.max(insets.bottom, 16) + 12,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: 'rgba(45,106,79,0.25)',
                }}
              />
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  color: '#A89888',
                  letterSpacing: 1,
                }}
              >
                轻触跳过
              </Text>
            </Animated.View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </Screen>
  );
}
