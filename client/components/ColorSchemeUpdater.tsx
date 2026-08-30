import { Fragment, useEffect, type ReactNode } from 'react';
import { ColorSchemeName, Platform } from 'react-native';
import { Uniwind } from 'uniwind'

// system: 跟随系统变化
// light: 固定为 light 主题
// dark: 固定为 dark 主题
// 山途以亮色为主（DESIGN.md）；固定 light 避免系统暗色下主题变量不一致导致白屏
const DEFAULT_THEME: 'system' | 'light' | 'dark' = 'light'

const WebOnlyColorSchemeUpdater = function ({ children }: { children?: ReactNode }) {
  useEffect(() => {
    Uniwind.setTheme(DEFAULT_THEME);
  }, []);

  useEffect(() => {
    function handleMessage(e: MessageEvent<{ event: string; colorScheme: ColorSchemeName; } | undefined>) {
      if (e.data?.event === 'coze.workbench.colorScheme') {
        // 山途固定亮色四季背景，忽略工作台暗色切换以免冲掉季节变量
        if (typeof e.data.colorScheme === 'string' && e.data.colorScheme === 'light') {
          Uniwind.setTheme('light');
        }
      }
    }

    if (Platform.OS === 'web') {
      window.addEventListener('message', handleMessage, false);
    }

    return () => {
      if (Platform.OS === 'web') {
        window.removeEventListener('message', handleMessage, false);
      }
    }
  }, []);

  return <Fragment>
    {children}
  </Fragment>
};

export {
  WebOnlyColorSchemeUpdater,
}
