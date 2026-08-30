import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export type SeasonPalette = {
  id: SeasonId;
  label: string;
  subtitle: string;
  /** 移动端整页背景 */
  background: string;
  /** 选择器色块预览用 */
  swatch: string;
};

/** 春夏秋冬：仅改变移动端整体界面背景色 */
export const SEASON_PALETTES: Record<SeasonId, SeasonPalette> = {
  spring: {
    id: 'spring',
    label: '春',
    subtitle: '嫩绿',
    background: '#F2F7EC',
    swatch: '#D4E2C4',
  },
  summer: {
    id: 'summer',
    label: '夏',
    subtitle: '薄荷',
    background: '#EEF7F4',
    swatch: '#C5E0D6',
  },
  autumn: {
    id: 'autumn',
    label: '秋',
    subtitle: '暖阳',
    background: '#FDF8F0',
    swatch: '#E8DFD3',
  },
  winter: {
    id: 'winter',
    label: '冬',
    subtitle: '霜雪',
    background: '#F2F5F8',
    swatch: '#D4DAE3',
  },
};

export const SEASON_ORDER: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

export const DEFAULT_SEASON: SeasonId = 'autumn';

const STORAGE_KEY = 'mountpath.season';

/** 旧版写死的秋日背景，Screen 中会映射为当前季节色 */
export const LEGACY_APP_BACKGROUND = '#FDF8F0';

type SeasonThemeContextValue = {
  season: SeasonId;
  palette: SeasonPalette;
  setSeason: (id: SeasonId) => void;
  ready: boolean;
};

const SeasonThemeContext = createContext<SeasonThemeContextValue | null>(null);

export function SeasonThemeProvider({ children }: { children: ReactNode }) {
  const [season, setSeasonState] = useState<SeasonId>(DEFAULT_SEASON);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && saved && (SEASON_ORDER as string[]).includes(saved)) {
          setSeasonState(saved as SeasonId);
        }
      } catch {
        // keep default
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSeason = useCallback((id: SeasonId) => {
    setSeasonState(id);
    void AsyncStorage.setItem(STORAGE_KEY, id).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({
      season,
      palette: SEASON_PALETTES[season],
      setSeason,
      ready,
    }),
    [season, setSeason, ready]
  );

  return (
    <SeasonThemeContext.Provider value={value}>{children}</SeasonThemeContext.Provider>
  );
}

export function useSeasonTheme() {
  const ctx = useContext(SeasonThemeContext);
  if (!ctx) {
    return {
      season: DEFAULT_SEASON,
      palette: SEASON_PALETTES[DEFAULT_SEASON],
      setSeason: (_id: SeasonId) => undefined,
      ready: true,
    } satisfies SeasonThemeContextValue;
  }
  return ctx;
}

/** 解析页面背景：未传 / 旧秋日色 / CSS 变量 → 当前季节背景 */
export function resolveSeasonBackground(
  backgroundColor: string | undefined,
  seasonBackground: string
): string {
  if (
    !backgroundColor ||
    backgroundColor === LEGACY_APP_BACKGROUND ||
    backgroundColor === 'var(--background)' ||
    backgroundColor === 'var(--color-background)'
  ) {
    return seasonBackground;
  }
  return backgroundColor;
}
