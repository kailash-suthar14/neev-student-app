import { View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Logo placeholder: replace with the real brand asset (e.g. an expo-image <Image>). */
export function BrandMark({ appName, size = 72 }: { appName: string; size?: number }) {
  const { colors } = useTheme();
  const initial = appName.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${appName} logo`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText tone="onPrimary" style={{ fontSize: size / 2, lineHeight: size / 1.6, fontWeight: '800' }}>
        {initial}
      </AppText>
    </View>
  );
}
