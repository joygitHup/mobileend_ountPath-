import { ExpoConfig, ConfigContext } from 'expo/config';

const appName = process.env.COZE_PROJECT_NAME || process.env.EXPO_PUBLIC_COZE_PROJECT_NAME || '山途';
const projectId = process.env.COZE_PROJECT_ID || process.env.EXPO_PUBLIC_COZE_PROJECT_ID;
const slugAppName = projectId ? `app${projectId}` : 'mountpath';
const androidPackage = projectId ? `com.anonymous.x${projectId}` : 'com.mountpath.app';
const iosBundleId = projectId ? `com.anonymous.x${projectId}` : 'com.mountpath.app';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: appName,
    slug: slugAppName,
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "mountpath",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: iosBundleId,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "此应用需要获取您的位置以提供实时守护功能。",
        NSLocationAlwaysAndWhenInUseUsageDescription: "此应用需要获取您的位置以提供实时守护功能。"
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#FDF8F0"
      },
      package: androidPackage,
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION"
      ]
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#FDF8F0"
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "山途需要访问相册，仅在您选择图片上传社区帖子或约伴配图时使用。",
          cameraPermission: "山途需要使用相机，仅在您主动拍摄路况或发帖配图时使用。",
          microphonePermission: "山途需要访问麦克风，仅在您拍摄带声音的视频时使用。"
        }
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "山途需要访问位置，用于轨迹导航、实时守护打卡、偏航提醒与 SOS 定位。",
          locationAlwaysAndWhenInUsePermission: "山途需要访问位置，用于轨迹导航、实时守护打卡、偏航提醒与 SOS 定位。",
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true
        }
      ],
      [
        "expo-camera",
        {
          cameraPermission: "山途需要访问相机，仅在您主动拍照上传时使用。",
          microphonePermission: "山途需要访问麦克风，仅在您录制视频声音时使用。",
          recordAudioAndroid: true
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    }
  };
};