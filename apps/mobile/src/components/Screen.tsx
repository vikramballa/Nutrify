import { ReactNode, useContext } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeaderShownContext } from '@react-navigation/elements';
import { colors } from '../theme/colors';

export function Screen({ children }: { children: ReactNode }) {
  // A navigation header already clears the status bar; adding the top inset
  // again left a blank band under the header on every pushed screen.
  const headerShown = useContext(HeaderShownContext);
  return (
    <SafeAreaView
      edges={headerShown ? [] : ['top']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}
