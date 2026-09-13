import { useState } from 'react';
import { View, StyleSheet, LogBox, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';
import { useAuth } from '@/contexts/AuthContext';
import SplashScreenView from '@/screens/splash';
import LoginScreen from '@/screens/login';

import '../global.css';

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

/**
 * 启动流程：启动页结束后再等鉴权恢复，再分流登录 / 主应用。
 * 注意：Splash 结束时会淡出到 opacity:0，不可在 isLoading 阶段继续挂载已淡出的 Splash，否则会整页空白。
 */
function AppEntry() {
  const { isAuthenticated, isLoading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  if (!splashDone) {
    return (
      <View style={styles.fill}>
        <SplashScreenView onFinish={() => setSplashDone(true)} />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.bootLoading}>
        <ActivityIndicator size="large" color="#2D6A4F" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.fill}>
        <LoginScreen gate />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="splash" options={{ animation: 'fade' }} />
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen name="route-detail" />
      <Stack.Screen name="checklist" />
      <Stack.Screen name="guard" />
      <Stack.Screen name="safety-center" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="legal-doc" />
      <Stack.Screen name="post-detail" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="toolbox" />
      <Stack.Screen name="tool" />
      <Stack.Screen name="track" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <Provider>
      <View style={styles.root}>
        <AppEntry />
      </View>
      <Toast />
    </Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  bootLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDF8F0',
  },
});
