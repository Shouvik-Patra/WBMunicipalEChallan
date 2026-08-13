import React, { useEffect, useRef } from 'react';
import {
  SafeAreaView,
  Dimensions,
  View,
  Text,
  Animated,
  Easing,
} from 'react-native';
import PropTypes from 'prop-types';
import LottieView from 'lottie-react-native';
import { Colors } from '../../themes/ThemePath';
import { useAppTheme } from '../../themes/ThemeContext';

export default function Loader({ visible, text }) {
  const { colors } = useAppTheme();
  const rippleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lottieRef = useRef(null);

  useEffect(() => {
    let rippleAnimation;

    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      rippleAnim.setValue(0);
      rippleAnimation = Animated.loop(
        Animated.timing(rippleAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      );
      rippleAnimation.start();

      lottieRef.current?.play();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      rippleAnim.stopAnimation();
      lottieRef.current?.pause();
    }

    return () => {
      if (rippleAnimation) rippleAnimation.stop();
    };
  }, [visible]);

  const screenHeight = Dimensions.get('window').height;

  const rippleScale = rippleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 2.5],
  });

  const rippleOpacity = rippleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0],
  });

  return visible ? (
    <Animated.View
      style={{
        flex: 1,
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.7)',
        zIndex: 99,
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        height: screenHeight,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeAnim,
      }}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: colors.skyblue,
            opacity: rippleOpacity,
            transform: [{ scale: rippleScale }],
          }}
        />
        <LottieView
          ref={lottieRef}
          source={require('../../assets/loading.json')}
          autoPlay
          loop
          style={{
            width: 200,
            height: 200,
          }}
        />
      </View>

      <Text
        style={{
          alignSelf: 'center',
          marginTop: 24,
          fontSize: 18,
          color: colors.white,
          fontWeight: '600',
          textAlign: 'center',
          letterSpacing: 0.5,
        }}
      >
        {text}
      </Text>
    </Animated.View>
  ) : null;
}

Loader.propTypes = {
  visible: PropTypes.bool,
  text: PropTypes.string,
};

Loader.defaultProps = {
  visible: false,
  text: 'Finding your location...',
};