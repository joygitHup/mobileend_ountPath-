import SplashScreenView from '@/screens/splash';
import { useSafeRouter } from '@/hooks/useSafeRouter';

/** 独立预览：结束后回到登录闸门由根布局接管；此处仅作设计预览 */
export default function SplashRoute() {
  const router = useSafeRouter();
  return (
    <SplashScreenView
      onFinish={() => {
        router.replace('/login');
      }}
    />
  );
}
