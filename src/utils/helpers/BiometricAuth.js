import ReactNativeBiometrics from 'react-native-biometrics';
import * as Keychain from 'react-native-keychain';

const rnBiometrics = new ReactNativeBiometrics({ allowDeviceCredentials: true });
const SERVICE = 'com.yourapp.biometric_login';

export const checkBiometricSupport = async () => {
  const { available, biometryType } = await rnBiometrics.isSensorAvailable();
  return { available, biometryType }; // 'FaceID' | 'TouchID' | 'Biometrics'
};

export const saveCredentialsForBiometric = async (phone, password) => {
  try {
    await Keychain.setGenericPassword(phone, password, { service: SERVICE });
    return true;
  } catch (e) {
    console.log('Keychain save error', e);
    return false;
  }
};

export const hasSavedBiometricCredentials = async () => {
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    return !!creds;
  } catch {
    return false;
  }
};

export const getBiometricCredentials = async () => {
  try {
    const { available } = await rnBiometrics.isSensorAvailable();
    if (!available) return null;

    const { success } = await rnBiometrics.simplePrompt({
      promptMessage: 'Confirm your identity',
      cancelButtonText: 'Cancel',
    });
    if (!success) return null;

    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    if (!creds) return null;
    return { phone: creds.username, password: creds.password };
  } catch (e) {
    console.log('Biometric auth error', e);
    return null;
  }
};

export const clearBiometricCredentials = async () => {
  await Keychain.resetGenericPassword({ service: SERVICE });
};