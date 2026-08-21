import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import ViewShot from 'react-native-view-shot';
import ImageCompressor from 'react-native-compressor';
import Geolocation from '@react-native-community/geolocation';
import { Colors, Fonts, Images } from '../../themes/ThemePath';
import normalize from '../../utils/helpers/normalize';
import showErrorAlert from '../../utils/helpers/Toast';
import Loader from '../../utils/helpers/Loader';
import constants from '../../utils/helpers/constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// TODO: move to constants.js / .env — bundled keys are visible in the app package,
// so restrict this key to the Geocoding API + your app's SHA-1/package name in
// Google Cloud Console rather than relying on keeping it secret.


// ── Reverse geocode lat/long -> human-readable address ──
const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${constants.GOOGLE_KEY}`,
    );
    const data = await res.json();

    if (data.status === 'OK' && data.results?.length) {
      return data.results[0].formatted_address;
    }
    return null;
  } catch (e) {
    console.error('Reverse geocode error:', e);
    return null;
  }
};

// ── Location helpers (moved here from Home so they no longer block navigation
//    into the camera screen — they now run in the background while the
//    camera is warming up / the user is framing their shot) ──
const requestLocationPermission = async () => {
  if (Platform.OS === 'ios') return true;
  const already = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  if (already) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location Permission Required',
      message: 'This app needs location access to geo-tag evidence photos.',
      buttonNeutral: 'Ask Me Later',
      buttonNegative: 'Cancel',
      buttonPositive: 'OK',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
};

const getLocation = () =>
  new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => {
        const msgs = { 1: 'Permission denied.', 2: 'Unavailable.', 3: 'Timed out.' };
        reject(new Error('Unable to fetch location. ' + (msgs[err.code] || 'Try again.')));
      },
      // maximumAge bumped up so a recently-cached fix (if the OS has one) can
      // be reused instantly instead of always forcing a fresh GPS lock.
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 },
    );
  });

const CaptureEvidence = props => {
  // Camera state
  const [cameraPosition, setCameraPosition] = useState('back'); // evidence = back camera by default
  const device = useCameraDevice(cameraPosition);
  const [flash, setFlash] = useState('off');
  const cameraRef = useRef(null);
  const viewShotRef = useRef(null);

  // Params passed from Home
  const pickedImageUri = props?.route?.params?.pickedImageUri; // set when coming from gallery

  // ── Location is now fetched here (on mount) instead of being passed in as
  //     a route param computed by Home before navigation. This means the
  //     camera screen mounts — and the live camera preview starts — instantly,
  //     while the GPS fix resolves in the background in parallel. ──
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(pickedImageUri || '');
  const [showFullScreenPreview, setShowFullScreenPreview] = useState(!!pickedImageUri);
  const [showOverlay, setShowOverlay] = useState(!!pickedImageUri);
  const [currentDateTime, setCurrentDateTime] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Address state (resolved via Google Geocoding API) ──
  const [address, setAddress] = useState('');
  const [addressLoading, setAddressLoading] = useState(false);

  useEffect(() => {
    if (!pickedImageUri) checkPermission();
    fetchLocation();
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Resolve address as soon as we have coordinates ──
  useEffect(() => {
    if (latitude == null || longitude == null) return;
    let cancelled = false;
    setAddressLoading(true);
    reverseGeocode(latitude, longitude).then(result => {
      if (cancelled) return;
      setAddress(result || '');
      setAddressLoading(false);
    });
    return () => { cancelled = true; };
  }, [latitude, longitude]);

  const fetchLocation = async () => {
    try {
      const granted = await requestLocationPermission();
      if (!granted) {
        setLocationError('Location permission denied.');
        return;
      }
      const coords = await getLocation();
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
    } catch (e) {
      console.error('Location fetch error:', e);
      setLocationError(e.message || 'Unable to fetch location.');
    }
  };

  const updateDateTime = () => {
    const now = new Date();
    setCurrentDateTime(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
  };

  const checkPermission = async () => {
    await Camera.requestCameraPermission();
  };

  const toggleCameraPosition = () => {
    setCameraPosition(cameraPosition === 'front' ? 'back' : 'front');
  };

  const takePicture = async () => {
    if (cameraRef.current !== null && !isProcessing) {
      setIsProcessing(true);
      try {
        const photo = await cameraRef.current.takePhoto({
          qualityPrioritization: 'quality',
          quality: 0.9,
          flash,
        });
        const uri = `file://${photo.path}`;
        setPreviewImage(uri);
        setShowFullScreenPreview(true);

        // brief delay so the raw photo is visible before the geo-tag stamp fades in
        setTimeout(() => {
          setShowOverlay(true);
          setIsProcessing(false);
        }, 800);
      } catch (error) {
        console.error('Error during image capture:', error);
        setIsProcessing(false);
        showErrorAlert('Failed to capture photo. Please try again.');
      }
    }
  };

  const cancelCapture = () => props?.navigation.goBack();

  const retakePhoto = () => {
    if (pickedImageUri) {
      // can't "retake" a gallery pick — just go back and let them pick again
      props?.navigation.goBack();
      return;
    }
    setShowFullScreenPreview(false);
    setPreviewImage('');
    setShowOverlay(false);
    setIsProcessing(false);
  };

  // ── Submit: bake the geo-tag caption into the image via ViewShot, then compress ──
  const handleSubmit = async () => {
    if (!viewShotRef.current || isSubmitting) return;
    setLoading(true);
    setIsSubmitting(true);
    try {
      const capturedUri = await viewShotRef.current.capture();
      const compressedUri = await ImageCompressor.Image.compress(capturedUri, {
        compressionMethod: 'auto',
        quality: 0.85,
        input: 'uri',
        output: 'jpg',
      });

      setLoading(false);
      setIsSubmitting(false);

      props?.navigation.navigate('BottomTabNav', {
        screen: 'Home',
        params: {
          evidenceUri: compressedUri,
          latitude,
          longitude,
          address,
          capturedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error processing evidence image:', error);
      setLoading(false);
      setIsSubmitting(false);
      showErrorAlert('Failed to process photo. Please try again.');
    }
  };

  if (!pickedImageUri && !device) {
    return (
      <View style={styles.container}>
        <Text style={{ color: Colors.text }}>Loading camera...</Text>
      </View>
    );
  }

  return (
    <View style={styles.fullScreenContainer}>
      <Loader visible={loading} />

      {/* ── Live Camera ── */}
      {!showFullScreenPreview && (
        <>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            photo={true}
            orientation="portrait"
            flash={flash}
            enableZoomGesture
          />

          <View style={styles.frameHint}>
            <Text style={styles.frameHintText}>Frame the offence clearly in view</Text>
          </View>

          <View style={styles.liveInfoBar}>
            <Text style={styles.liveInfoDot}>●</Text>
            <Text style={styles.liveInfoText} numberOfLines={2}>
              {latitude == null
                ? (locationError || 'Locating...')
                : addressLoading
                ? 'Resolving address...'
                : address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
            </Text>
          </View>
        </>
      )}

      {/* ── Preview with baked-in geo-tag stamp ── */}
      {showFullScreenPreview && (
        <View style={styles.previewContainer}>
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'jpg', quality: 0.95 }}
            style={styles.fullPreview}
          >
            <Image source={{ uri: previewImage }} style={styles.fullPreviewImage} resizeMode="cover" />

            {showOverlay && (
              <View style={styles.stampBar}>
                <View style={styles.stampRow}>
                  <View style={styles.stampBadge}>
                    <Text style={styles.stampBadgeText}>EVIDENCE</Text>
                  </View>
                  <Text style={styles.stampDateTime}>{currentDateTime}</Text>
                </View>
                <Text style={styles.stampAddress} numberOfLines={2}>
                  {latitude == null
                    ? (locationError || 'Locating...')
                    : addressLoading
                    ? 'Resolving address...'
                    : (address || 'Address unavailable')}
                </Text>
                <Text style={styles.stampCoords}>
                  {latitude == null
                    ? ' '
                    : `Lat: ${latitude.toFixed(6)}   Long: ${longitude.toFixed(6)}`}
                </Text>
              </View>
            )}
          </ViewShot>
        </View>
      )}

      {/* ── Header ── */}
      <View style={styles.cameraHeader}>
        <TouchableOpacity style={styles.closeButton} onPress={cancelCapture}>
          <Image resizeMode="contain" style={styles.iconImage1} source={Images.close} />
        </TouchableOpacity>

        {!showFullScreenPreview && (
          <View style={{ flexDirection: 'row', gap: normalize(10) }}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setFlash(flash === 'off' ? 'on' : 'off')}
            >
              <Text style={styles.flashIcon}>{flash === 'off' ? '⚡️' : '🔆'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={toggleCameraPosition}>
              <Image style={styles.iconImage} source={Images.refreshicon} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Footer ── */}
      <View style={styles.cameraFooter}>
        {!showFullScreenPreview && !isProcessing && (
          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        )}

        {showFullScreenPreview && showOverlay && (
          <View style={styles.previewControls}>
            <TouchableOpacity
              style={[styles.retakeButton, isSubmitting && styles.disabledButton]}
              onPress={retakePhoto}
              disabled={isSubmitting}
            >
              <Text style={styles.retakeButtonText}>↺  Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (isSubmitting || addressLoading || latitude == null) && styles.disabledButton,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || addressLoading || latitude == null}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting
                  ? 'Processing...'
                  : latitude == null
                  ? (locationError ? 'Continue without location' : 'Locating...')
                  : addressLoading
                  ? 'Resolving address...'
                  : 'Use Photo  →'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isProcessing && (
          <View style={styles.processingIndicator}>
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default CaptureEvidence;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.page, alignItems: 'center', justifyContent: 'center' },
  fullScreenContainer: { flex: 1, backgroundColor: '#000', position: 'relative' },

  frameHint: {
    position: 'absolute', top: normalize(110), left: 0, right: 0, alignItems: 'center', zIndex: 5,
  },
  frameHintText: {
    color: '#fff', fontSize: normalize(12), fontFamily: Fonts.MulishSemiBold,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: normalize(14),
    paddingVertical: normalize(7), borderRadius: normalize(20),
  },

  liveInfoBar: {
    position: 'absolute', bottom: normalize(140), left: normalize(16), right: normalize(16),
    flexDirection: 'row', alignItems: 'flex-start', gap: normalize(6),
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: normalize(10),
    paddingVertical: normalize(8), paddingHorizontal: normalize(12), zIndex: 5,
  },
  liveInfoDot: { color: Colors.red, fontSize: normalize(10), marginTop: normalize(2) },
  liveInfoText: { color: '#fff', fontSize: normalize(11), fontFamily: Fonts.MulishMedium, flex: 1 },

  // Preview
  previewContainer: { flex: 1, backgroundColor: '#000' },
  fullPreview: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, position: 'relative' },
  fullPreviewImage: { width: '100%', height: '100%' },

  stampBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(12, 35, 64, 0.82)', // Colors.navy w/ opacity
    paddingHorizontal: normalize(16), paddingTop: normalize(12),
    paddingBottom: normalize(120),
  },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: normalize(8), marginBottom: normalize(6) },
  stampBadge: {
    backgroundColor: Colors.primary, borderRadius: normalize(5),
    paddingHorizontal: normalize(7), paddingVertical: normalize(2),
  },
  stampBadgeText: { color: '#fff', fontSize: normalize(9), fontFamily: Fonts.MulishExtraBold, letterSpacing: 0.6 },
  stampDateTime: { color: '#fff', fontSize: normalize(12), fontFamily: Fonts.MulishExtraBold },
  stampAddress: { color: 'rgba(255,255,255,0.85)', fontSize: normalize(11), fontFamily: Fonts.MulishMedium, marginBottom: normalize(3) },
  stampCoords: { color: Colors.gold, fontSize: normalize(11), fontFamily: Fonts.MulishSemiBold },

  // Header / footer chrome
  cameraHeader: {
    flexDirection: 'row', position: 'absolute', top: normalize(50), left: 0, right: 0,
    paddingHorizontal: normalize(20), justifyContent: 'space-between', zIndex: 10,
  },
  cameraFooter: {
    position: 'absolute', bottom: normalize(40), left: 0, right: 0, alignItems: 'center', zIndex: 10,
  },
  closeButton: {
    width: normalize(40), height: normalize(40), borderRadius: normalize(20),
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  iconButton: {
    width: normalize(40), height: normalize(40), borderRadius: normalize(20),
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  flashIcon: { fontSize: normalize(18) },
  iconImage: { width: normalize(24), height: normalize(24), tintColor: '#fff' },
  iconImage1: { width: normalize(15), height: normalize(15), tintColor: '#fff' },

  captureButton: {
    width: normalize(70), height: normalize(70), borderRadius: normalize(35),
    backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center',
  },
  captureButtonInner: {
    width: normalize(58), height: normalize(58), borderRadius: normalize(29), backgroundColor: '#fff',
  },

  previewControls: { flexDirection: 'row', gap: normalize(12), width: '85%' },
  retakeButton: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: normalize(13),
    borderRadius: normalize(25), borderWidth: 1, borderColor: '#fff', alignItems: 'center',
  },
  retakeButtonText: { color: '#fff', fontSize: normalize(14), fontFamily: Fonts.MulishSemiBold },
  submitButton: {
    flex: 1.3, backgroundColor: Colors.govGreen, paddingVertical: normalize(13),
    borderRadius: normalize(25), alignItems: 'center',
  },
  submitButtonText: { color: '#fff', fontSize: normalize(14), fontFamily: Fonts.MulishExtraBold },
  disabledButton: { opacity: 0.5 },

  processingIndicator: { backgroundColor: 'rgba(0,0,0,0.7)', padding: normalize(10), borderRadius: normalize(8) },
  processingText: { color: '#fff', fontFamily: Fonts.MulishSemiBold },
});