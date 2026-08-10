import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Button from '../../components/Button';
import normalize from '../../utils/helpers/normalize';
import { Colors, Fonts } from '../../themes/ThemePath';
import {
  checkBiometricSupport,
  getBiometricCredentials,
  saveCredentialsForBiometric,
  hasSavedBiometricCredentials,
  clearBiometricCredentials,
} from '../../utils/helpers/BiometricAuth';

const BiometricCheckScreen = () => {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [biometryType, setBiometryType] = useState(null);
  const [hasSavedCreds, setHasSavedCreds] = useState(false);
  const [lastResult, setLastResult] = useState('');

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const { available: isAvailable, biometryType: type } =
        await checkBiometricSupport();
      setAvailable(isAvailable);
      setBiometryType(type);

      const saved = await hasSavedBiometricCredentials();
      setHasSavedCreds(saved);

      setLastResult(
        isAvailable
          ? `Sensor available: ${type || 'Unknown type'}`
          : 'No biometric sensor available on this device/build.',
      );
    } catch (e) {
      setLastResult(`Error checking biometrics: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const handleTriggerPrompt = async () => {
    setLastResult('Waiting for biometric prompt...');
    // If nothing is saved yet, save dummy test credentials first so
    // getBiometricCredentials() has something to unlock.
    if (!hasSavedCreds) {
      const saved = await saveCredentialsForBiometric('test_user', 'test_pass');
      if (!saved) {
        setLastResult('Failed to save test credentials to Keychain.');
        return;
      }
      setHasSavedCreds(true);
    }

    const creds = await getBiometricCredentials();
    if (creds) {
      setLastResult(`Success — unlocked credentials for "${creds.phone}"`);
    } else {
      setLastResult('Prompt failed, was cancelled, or no credentials found.');
    }
  };

  const handleClear = async () => {
    Alert.alert(
      'Clear saved credentials?',
      'This removes the test credentials from the Keychain/Keystore.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearBiometricCredentials();
            setHasSavedCreds(false);
            setLastResult('Cleared saved credentials.');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Biometric Diagnostics</Text>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.skyblue} style={{ marginVertical: normalize(24) }} />
        ) : (
          <>
            <Row label="Sensor available" value={available ? 'Yes' : 'No'} />
            <Row label="Biometry type" value={biometryType || 'N/A'} />
            <Row label="Credentials saved" value={hasSavedCreds ? 'Yes' : 'No'} />

            <View style={styles.resultBox}>
              <Text style={styles.resultText}>{lastResult}</Text>
            </View>

            <Button
              height={normalize(45)}
              marginTop={normalize(20)}
              width={'100%'}
              backgroundColor={Colors.skyblue}
              title={'Re-check sensor'}
              fontSize={normalize(14)}
              fontFamily={Fonts.MulishSemiBold}
              textColor={'white'}
              onPress={runCheck}
            />

            <Button
              height={normalize(45)}
              marginTop={normalize(14)}
              width={'100%'}
              backgroundColor={Colors.skyblue}
              title={'Trigger biometric popup'}
              fontSize={normalize(14)}
              fontFamily={Fonts.MulishSemiBold}
              textColor={'white'}
              onPress={handleTriggerPrompt}
              disabled={!available}
            />

            {hasSavedCreds && (
              <Button
                height={normalize(45)}
                marginTop={normalize(14)}
                width={'100%'}
                backgroundColor={'transparent'}
                title={'Clear saved test credentials'}
                fontSize={normalize(13)}
                fontFamily={Fonts.MulishSemiBold}
                textColor={'#D14343'}
                onPress={handleClear}
              />
            )}

            {!available && (
              <Text style={styles.hint}>
                If this says "No" but your device has Face ID/fingerprint set
                up, it's almost always a native linking issue — do a clean
                rebuild (not a JS reload) after installing
                react-native-biometrics.
              </Text>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

export default BiometricCheckScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F7FB',
    padding: normalize(20),
  },
  card: {
    backgroundColor: 'white',
    borderRadius: normalize(20),
    padding: normalize(20),
    marginTop: normalize(20),
    shadowColor: '#102030',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  title: {
    fontSize: normalize(20),
    fontWeight: '800',
    color: Colors.darkblue,
    marginBottom: normalize(12),
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: normalize(8),
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  rowLabel: {
    fontSize: normalize(14),
    color: '#5E6A7D',
    fontFamily: Fonts.MulishRegular,
  },
  rowValue: {
    fontSize: normalize(14),
    fontWeight: '700',
    color: Colors.darkblue,
  },
  resultBox: {
    marginTop: normalize(16),
    padding: normalize(12),
    borderRadius: normalize(10),
    backgroundColor: '#F4F7FB',
  },
  resultText: {
    fontSize: normalize(13),
    color: '#334155',
    textAlign: 'center',
  },
  hint: {
    marginTop: normalize(16),
    fontSize: normalize(12),
    color: '#D14343',
    textAlign: 'center',
    lineHeight: normalize(18),
  },
});