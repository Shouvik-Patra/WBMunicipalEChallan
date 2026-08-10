import React from 'react';
import {
  View,
  Text,
  Animated,
  Dimensions,
} from 'react-native';
import PropTypes from 'prop-types';
import LottieView from 'lottie-react-native';
import { useAppTheme } from '../../themes/ThemeContext';

export default function Face_Recognizer_Loader({ visible, text }) {
  const { colors } = useAppTheme();

  const screenHeight = Dimensions.get('window').height;

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={{
        flex: 1,
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: screenHeight,
        backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: 999,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LottieView
          source={require('../../assets/face_scan_loader.json')}
          autoPlay
          loop
          style={{
            width: 260,
            height: 260,
          }}
        />
      </View>

      <Text
        style={{
          marginTop: 10,
          color: colors.white,
          fontSize: 18,
          fontWeight: '600',
          textAlign: 'center',
          letterSpacing: 0.5,
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

Face_Recognizer_Loader.propTypes = {
  visible: PropTypes.bool,
  text: PropTypes.string,
};

Face_Recognizer_Loader.defaultProps = {
  visible: false,
  text: 'Scanning face...',
};