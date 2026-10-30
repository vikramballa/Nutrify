import { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';
import { cardStyle } from '../theme/typography';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[cardStyle, style]}>{children}</View>;
}
