import { useColorScheme as useRNColorScheme } from 'react-native';
import { Colors } from '@/constants/Colors';

export function useThemeColors() {
  const scheme = useRNColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  return { isDark, colors, scheme };
}
