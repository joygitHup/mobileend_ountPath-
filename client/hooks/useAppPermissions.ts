import { useCallback, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';

export type PermissionKind = 'location' | 'photos' | 'camera';

export type PermissionStatusLabel = 'granted' | 'denied' | 'undetermined' | 'restricted' | 'unavailable';

export type PermissionItem = {
  kind: PermissionKind;
  title: string;
  purpose: string;
  status: PermissionStatusLabel;
  statusText: string;
  canAskAgain: boolean;
};

function mapStatus(
  status: string | undefined,
  canAskAgain = true
): { status: PermissionStatusLabel; statusText: string; canAskAgain: boolean } {
  if (Platform.OS === 'web') {
    return { status: 'unavailable', statusText: '请在系统浏览器设置中管理', canAskAgain: false };
  }
  switch (status) {
    case 'granted':
    case 'limited':
      return { status: 'granted', statusText: '已允许', canAskAgain: true };
    case 'denied':
      return {
        status: 'denied',
        statusText: canAskAgain ? '已拒绝' : '已拒绝 · 需去系统设置开启',
        canAskAgain,
      };
    case 'restricted':
      return { status: 'restricted', statusText: '受系统限制', canAskAgain: false };
    default:
      return { status: 'undetermined', statusText: '未请求', canAskAgain: true };
  }
}

const META: Record<
  PermissionKind,
  { title: string; purpose: string; icon: string }
> = {
  location: {
    title: '定位',
    purpose: '用于轨迹导航、实时守护打卡、偏航提醒与 SOS 定位。关闭后守护与导航能力将受限。',
    icon: 'location-dot',
  },
  photos: {
    title: '相册',
    purpose: '仅在您主动选择图片时访问，用于社区发帖、约伴配图等。不会后台扫描相册。',
    icon: 'images',
  },
  camera: {
    title: '相机',
    purpose: '仅在您主动拍照时使用，用于上传路况、发帖配图。不会在未使用相关功能时开启。',
    icon: 'camera',
  },
};

async function readAll(): Promise<PermissionItem[]> {
  if (Platform.OS === 'web') {
    return (Object.keys(META) as PermissionKind[]).map((kind) => ({
      kind,
      title: META[kind].title,
      purpose: META[kind].purpose,
      ...mapStatus(undefined),
    }));
  }

  const [loc, photos, camera] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    ImagePicker.getMediaLibraryPermissionsAsync(),
    Camera.getCameraPermissionsAsync(),
  ]);

  return [
    {
      kind: 'location',
      title: META.location.title,
      purpose: META.location.purpose,
      ...mapStatus(loc.status, loc.canAskAgain),
    },
    {
      kind: 'photos',
      title: META.photos.title,
      purpose: META.photos.purpose,
      ...mapStatus(photos.status, photos.canAskAgain),
    },
    {
      kind: 'camera',
      title: META.camera.title,
      purpose: META.camera.purpose,
      ...mapStatus(camera.status, camera.canAskAgain),
    },
  ];
}

export function useAppPermissions() {
  const [items, setItems] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await readAll());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const openSystemSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert('无法打开设置', '请手动前往系统设置 → 山途 → 权限');
    }
  }, []);

  const request = useCallback(
    async (kind: PermissionKind) => {
      if (Platform.OS === 'web') {
        Alert.alert('Web 预览', '权限需在真机 App 中管理');
        return;
      }

      const current = items.find((i) => i.kind === kind);
      if (current?.status === 'denied' && !current.canAskAgain) {
        Alert.alert('需要开启权限', `请在系统设置中允许「${META[kind].title}」`, [
          { text: '取消', style: 'cancel' },
          { text: '去设置', onPress: () => void openSystemSettings() },
        ]);
        return;
      }

      if (kind === 'location') {
        await Location.requestForegroundPermissionsAsync();
      } else if (kind === 'photos') {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      } else {
        await Camera.requestCameraPermissionsAsync();
      }
      await refresh();
    },
    [items, openSystemSettings, refresh]
  );

  const grantedCount = items.filter((i) => i.status === 'granted').length;

  return {
    items,
    loading,
    refresh,
    request,
    openSystemSettings,
    grantedCount,
    meta: META,
  };
}
