import { useColorScheme } from 'react-native';

import { getTheme, type Theme } from './tokens';

export function useTheme(): Theme {
  return getTheme(useColorScheme() === 'dark' ? 'dark' : 'light');
}
