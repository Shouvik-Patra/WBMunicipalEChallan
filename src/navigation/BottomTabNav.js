import React from 'react';
import {
  Image,
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Home from '../screens/tabScreens/Home';
import MyProfile from '../screens/tabScreens/MyProfile';
import { Colors, Images } from '../themes/ThemePath';
import normalize from '../utils/helpers/normalize';
import { useAppTheme } from '../themes/ThemeContext';
import ChallanList from '../screens/tabScreens/ChallanList';

const Tab = createBottomTabNavigator();

const TabButton = ({ children, onPress, onLongPress, accessibilityState, routeName }) => {
  const focused = accessibilityState?.selected;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.tabButtonWrap,
        focused && styles.tabButtonFocused,
        pressed && styles.tabButtonPressed,
        routeName === 'Home' && styles.centerButtonLift,
        routeName === 'Home' && styles.centerButton,
        routeName === 'Home' && focused && styles.centerButtonFocused,
        routeName === 'Home' && pressed && styles.centerButtonPressed,
      ]}
    >
      {children}
    </Pressable>
  );
};

const TabIcon = ({ focused, source, isCenterTab }) => (
  <View
    style={[
      styles.iconShell,
      isCenterTab && styles.centerIconShell,
      focused && !isCenterTab && styles.iconShellFocused,
    ]}
  >
    <Image
      style={[
        styles.tabIcon,
        isCenterTab && styles.centerIcon,
        !isCenterTab && {
          tintColor: focused ? Colors.white : '#808080',
        },
      ]}
      source={source}
      resizeMode="contain"
    />
  </View>
);

const BottomTabNav = () => {
  const { colors } = useAppTheme();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        unmountOnBlur: true,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
        headerShown: false,
        tabBarStyle: [
          styles.tabBarStyle,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ],
      }}
    >
      <Tab.Screen
        name="ChallanList"
        component={ChallanList}
        options={{
          unmountOnBlur: true,
          tabBarButton: props => <TabButton {...props} routeName="ChallanList" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={Images.tab6} />
          ),
        }}
      />


      <Tab.Screen
        name="Home"
        component={Home}
        options={{
          unmountOnBlur: true,
          tabBarButton: props => <TabButton {...props} routeName="Home" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={Images.tab1} isCenterTab />
          ),
        }}
      />

     

      <Tab.Screen
        name="MyProfile"
        component={MyProfile}
        options={{
          unmountOnBlur: true,
          tabBarButton: props => <TabButton {...props} routeName="MyProfile" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={Images.tab4} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export default BottomTabNav;

const styles = StyleSheet.create({
  tabBarStyle: {
    position: 'absolute',

    left: normalize(12),
    right: normalize(12),
    bottom: normalize(10),

    height: normalize(72),

    borderRadius: normalize(28),
    borderWidth: 1,

    paddingHorizontal: normalize(8),
    paddingVertical: normalize(8),

    shadowColor: '#0F1B2D',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.12,
    shadowRadius: 18,

    elevation: 12,
  },

  tabButtonWrap: {
    flex: 1,
    height: '100%',

    alignItems: 'center',
    justifyContent: 'center',
  },

  tabButtonPressed: {
    transform: [{ scale: 0.94 }],
  },

  // LEFT + RIGHT TAB ICON
  iconShell: {
    top:8,
    width: normalize(42),
    height: normalize(42),

    borderRadius: normalize(14),

    backgroundColor: 'rgba(6,72,91,0.06)',

    alignItems: 'center',
    justifyContent: 'center',

    borderWidth: 1,
    borderColor: 'rgba(6,72,91,0.04)',
  },

  // Selected LEFT + RIGHT tab
  iconShellFocused: {
    backgroundColor: Colors.skyblue,
    borderColor: Colors.skyblue,

    shadowColor: Colors.skyblue,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,

    elevation: 6,
  },

  tabIcon: {
    width: normalize(20),
    height: normalize(20),
  },

  /*
   * HOME / CENTER TAB
   * No background
   * No border
   * No shadow
   */
  centerIconShell: {
    width: normalize(50),
    height: normalize(50),

    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,

    alignItems: 'center',
    justifyContent: 'center',

    shadowOpacity: 0,
    elevation: 0,
  },

  centerIcon: {
    width: normalize(80),
    height: normalize(80),
    bottom:10,
    
  },
});
