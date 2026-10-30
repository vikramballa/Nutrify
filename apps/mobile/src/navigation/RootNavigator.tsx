import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { fonts, radii } from '../theme/typography';
import { spring } from '../theme/motion';
import { HomeScreen } from '../screens/HomeScreen';
import { RecipesScreen } from '../screens/RecipesScreen';
import { GroceryScreen } from '../screens/GroceryScreen';
import { AskScreen } from '../screens/AskScreen';
import { SnapMealScreen } from '../screens/SnapMealScreen';
import { PantryScreen } from '../screens/PantryScreen';
import { RecipeDetailScreen } from '../screens/RecipeDetailScreen';
import { MealPlanScreen } from '../screens/MealPlanScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { LogMealScreen } from '../screens/LogMealScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { SavedScreen } from '../screens/SavedScreen';
import { BarcodeScreen } from '../screens/BarcodeScreen';
import type { RootStackParamList, TabParamList } from './types';

const OnboardingScreen = () => <ProfileSetupScreen mode="onboarding" />;
const SettingsScreen = () => <ProfileSetupScreen mode="settings" />;

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Recipes: 'restaurant',
  Scan: 'scan',
  Grocery: 'cart',
  Ask: 'chatbubble-ellipses',
};

/**
 * Tab glyph that lifts and scales when its tab becomes active. The filled/
 * outline swap carries the state on its own; the motion just makes the
 * handoff between two tabs legible.
 */
function TabIcon({
  route,
  color,
  size,
  focused,
}: {
  route: keyof TabParamList;
  color: string;
  size: number;
  focused: boolean;
}) {
  const t = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(t, { toValue: focused ? 1 : 0, ...spring }).start();
  }, [focused, t]);

  return (
    <Animated.View
      style={{
        transform: [
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
        ],
      }}
    >
      <Ionicons
        name={
          focused
            ? TAB_ICONS[route]
            : (`${TAB_ICONS[route]}-outline` as keyof typeof Ionicons.glyphMap)
        }
        size={size}
        color={color}
      />
    </Animated.View>
  );
}

/**
 * The centre tab reads as an action, not a destination: a raised coral disc
 * that breaks the tab bar's line. It is still a real tab, so the navigator
 * keeps handling focus and back behaviour.
 */
function ScanTabButton({ focused }: { focused: boolean }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(t, { toValue: focused ? 1 : 0, ...spring }).start();
  }, [focused, t]);

  return (
    <Animated.View
      style={[
        styles.scanButton,
        { transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] },
      ]}
    >
      <Ionicons name="camera" size={26} color="#fff" />
    </Animated.View>
  );
}

const scanTabOptions: BottomTabNavigationOptions = {
  title: '',
  tabBarIcon: ({ focused }) => <ScanTabButton focused={focused} />,
  tabBarItemStyle: { height: 66 },
  tabBarAccessibilityLabel: 'Scan a meal',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.surface,
          height: 66,
          borderTopColor: colors.border,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.1 },
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon route={route.name} color={color} size={size} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Recipes" component={RecipesScreen} />
      <Tab.Screen name="Scan" component={SnapMealScreen} options={scanTabOptions} />
      <Tab.Screen name="Grocery" component={GroceryScreen} />
      <Tab.Screen name="Ask" component={AskScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { user, ready } = useAuth();

  // Wait until any stored session is restored before deciding what to show.
  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
      </Stack.Navigator>
    );
  }

  // Signed up but hasn't answered the questionnaire yet — force it once.
  if (!user.onboarded) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Pushed screens slide in from the right on both platforms, so the
        // hierarchy reads the same everywhere.
        animation: 'slide_from_right',
        headerTitleStyle: { fontFamily: fonts.semibold },
        headerTintColor: colors.textPrimary,
        headerStyle: { backgroundColor: colors.background },
      }}
    >
      {/* The title is only ever seen as the back label on pushed screens. */}
      <Stack.Screen name="Tabs" component={Tabs} options={{ title: 'Home' }} />
      <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <Stack.Screen
        name="MealPlan"
        component={MealPlanScreen}
        // The screen draws its own large "Meal Plan" title beside its actions.
        options={{ headerShown: true, title: '' }}
      />
      <Stack.Screen
        name="Progress"
        component={ProgressScreen}
        options={{ headerShown: true, title: 'Progress' }}
      />
      <Stack.Screen
        name="LogMeal"
        component={LogMealScreen}
        options={{ headerShown: true, title: 'Log a Meal' }}
      />
      <Stack.Screen
        name="Pantry"
        component={PantryScreen}
        options={{ headerShown: true, title: 'Cook From Pantry' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: true, title: 'Settings' }}
      />
      <Stack.Screen
        name="Saved"
        component={SavedScreen}
        options={{ headerShown: true, title: 'Saved Recipes' }}
      />
      <Stack.Screen
        name="Barcode"
        component={BarcodeScreen}
        options={{ headerShown: true, title: 'Scan a Barcode' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scanButton: {
    width: 54,
    height: 54,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Lifted clear of the bar so it reads as a button sitting on top of it.
    marginTop: -22,
    borderWidth: 4,
    borderColor: colors.surface,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
