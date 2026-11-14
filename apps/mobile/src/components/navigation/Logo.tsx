import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, font } from '@/theme';

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="acmeLogo" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6366F1" />
          <Stop offset="1" stopColor="#4338CA" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="64" height="64" rx="16" fill="url(#acmeLogo)" />
      <Path d="M18 44 L32 18 L46 44" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M24 36 H40" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <Circle cx="32" cy="18" r="4.5" fill="#A5B4FC" />
      <Circle cx="18" cy="44" r="3.5" fill="#C7D2FE" />
      <Circle cx="46" cy="44" r="3.5" fill="#C7D2FE" />
    </Svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLabel="ACME IoT">
      <LogoMark size={compact ? 30 : 34} />
      {!compact ? (
        <View>
          <Text style={{ fontFamily: font.bold, fontSize: 17, color: colors.text, letterSpacing: -0.3 }}>ACME IoT</Text>
          <Text style={{ fontFamily: font.medium, fontSize: 11, color: colors.textSubtle }}>Building Intelligence</Text>
        </View>
      ) : null}
    </View>
  );
}
