import { type ReactNode, useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSeasonTheme } from '@/contexts/SeasonThemeContext';

/** 超过此宽度时，Web 预览收成手机竖屏画幅 */
export const PHONE_FRAME_BREAKPOINT = 520;
export const PHONE_WIDTH = 390;
/** 桌面预览台背景固定，不随四季变色 */
const DESKTOP_STAGE_BG = '#E8DFD3';

/**
 * Web 宽屏下将 App 约束为手机宽度居中，便于桌面预览移动端效果；
 * 真机 / 窄屏 Web 仍全宽铺满。
 * 四季配色只作用于手机画幅内部。
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const { palette } = useSeasonTheme();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'
    );

    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.overscrollBehavior = 'none';
    (document.body.style as CSSStyleDeclaration & { webkitTextSizeAdjust?: string }).webkitTextSizeAdjust =
      '100%';
  }, []);

  if (Platform.OS !== 'web' || width < PHONE_FRAME_BREAKPOINT) {
    return <View style={[styles.fill, { backgroundColor: palette.background }]}>{children}</View>;
  }

  const frameHeight = Math.min(Math.max(height - 40, 640), 860);

  return (
    <View style={[styles.stage, { backgroundColor: DESKTOP_STAGE_BG }]}>
      <View
        style={[
          styles.phone,
          { width: PHONE_WIDTH, height: frameHeight, backgroundColor: palette.background },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    width: '100%',
    height: '100%',
    maxHeight: '100%',
  },
  stage: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  phone: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(61,50,41,0.12)',
    ...Platform.select({
      web: {
        boxShadow: '0 24px 64px rgba(61, 50, 41, 0.18)',
      },
      default: {
        shadowColor: '#3D3229',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.18,
        shadowRadius: 32,
        elevation: 12,
      },
    }),
  },
});
