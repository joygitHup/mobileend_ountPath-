import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useSeasonTheme } from '@/contexts/SeasonThemeContext';
import { useNotifications } from '@/contexts/NotificationContext';

function TabDotIcon({
  name,
  color,
  showDot,
}: {
  name: 'user' | 'users';
  color: string;
  showDot: boolean;
}) {
  return (
    <View>
      <FontAwesome6 name={name} size={20} color={color} />
      {showDot ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -6,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#C44536',
            borderWidth: 1.5,
            borderColor: '#FDF8F0',
          }}
        />
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { palette } = useSeasonTheme();
  const { unreadCount, communityNewCount, refreshAll } = useNotifications();
  const [muted, accent, border] = useCSSVariable([
    '--color-muted',
    '--color-accent',
    '--color-border',
  ]) as string[];

  useFocusEffect(
    useCallback(() => {
      void refreshAll();
    }, [refreshAll])
  );

  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 0);
  const tabPadBottom = bottomInset > 8 ? bottomInset - 4 : 8;

  let tabBarStyle: Record<string, any> = {
    backgroundColor: palette.background,
    borderTopWidth: 1,
    borderTopColor: border,
    paddingBottom: tabPadBottom,
    paddingTop: 8,
    height: 56 + tabPadBottom,
  };

  if (Platform.OS === 'web') {
    tabBarStyle = {
      ...tabBarStyle,
      height: 'auto' as unknown as number,
      minHeight: 56 + tabPadBottom,
    };
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '发现',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="mountain" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trip"
        options={{
          title: '行程',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="route" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: '社区',
          tabBarIcon: ({ color }) => (
            <TabDotIcon name="users" color={color} showDot={communityNewCount > 0} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color }) => (
            <TabDotIcon name="user" color={color} showDot={unreadCount > 0} />
          ),
        }}
      />
    </Tabs>
  );
}
