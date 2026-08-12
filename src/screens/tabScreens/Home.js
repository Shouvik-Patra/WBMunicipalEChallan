import {
  Alert,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Easing,
  Modal,
  StatusBar,
} from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import Header from '../../components/Header';
import { Colors, Fonts } from '../../themes/ThemePath';
import showErrorAlert from '../../utils/helpers/Toast';
import normalize from '../../utils/helpers/normalize';
import moment from 'moment';
import Loader from '../../utils/helpers/Loader';
import connectionrequest from '../../utils/helpers/NetInfo';
import { launchImageLibrary } from 'react-native-image-picker';
import { useDispatch, useSelector } from 'react-redux';
import { useIsFocused } from '@react-navigation/native';
import { offenceTypesRequest, userDetailsRequest } from '../../redux/reducer/ProfileReducer';

// ─── Static dashboard data (swap for Redux selector later) ────────────────────
const STATS = {
  casesToday: 12,
  fineCollected: '₹8,500',
  pendingChallans: 4,
  thisMonth: 145,
};

const OFFICER = {
  name: 'Sub-Inspector R. Banerjee',
  badgeNo: 'WB-4471',
  station: 'Sheoraphully PS',
  onDuty: true,
};

// ─── Permission helpers ─────────────────────────────────────────────────────
const openAppSettings = () =>
  Platform.OS === 'ios' ? Linking.openURL('app-settings:') : Linking.openSettings();

const showSettingsAlert = permissionType => {
  Alert.alert(
    `${permissionType} Permission Required`,
    `${permissionType} access is needed to capture evidence. Enable it in Settings.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: openAppSettings },
    ],
  );
};

const requestCameraPermission = async () => {
  if (Platform.OS === 'ios') return true;
  const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  if (already) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Camera Permission Required',
    message: 'This app needs camera access to capture evidence photos.',
    buttonNeutral: 'Ask Me Later',
    buttonNegative: 'Cancel',
    buttonPositive: 'OK',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
};

// ─── Component ──────────────────────────────────────────────────────────────
const Home = props => {
  const dispatch = useDispatch();
  const isFocused = useIsFocused();
  const ProfileReducer = useSelector(s => s.ProfileReducer);

  // Read offence types straight from the store — no need to mirror it into
  // local state or hand-roll a status switch for it.
  const offenceTypes = ProfileReducer?.offenceTypesResponse || [];
  const offenceTypesLoading = ProfileReducer?.status === 'Profile/offenceTypesRequest';

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [lastEvidenceUri, setLastEvidenceUri] = useState(null);
  const [lastEvidenceMeta, setLastEvidenceMeta] = useState(null);
  const [fullscreenUri, setFullscreenUri] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── On focus: check connectivity once, then kick off the two requests ──
  useEffect(() => {
    if (!isFocused) return;
    connectionrequest()
      .then(() => {
        dispatch(userDetailsRequest());
        dispatch(offenceTypesRequest());
      })
      .catch(() => showErrorAlert('Please connect to internet'));
  }, [isFocused]);

  // ── Surface a load failure once, instead of failing silently ──
  useEffect(() => {
    if (ProfileReducer?.status === 'Profile/offenceTypesFailure') {
      showErrorAlert('Failed to load offence types. Pull to retry.');
    }
  }, [ProfileReducer?.status]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slideAnim, {
        toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.045, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  // ── Pick up the result handed back from CaptureEvidence ──
  useEffect(() => {
    const params = props?.route?.params;
    if (params?.evidenceUri) {
      setLastEvidenceUri(params.evidenceUri);
      setLastEvidenceMeta({
        latitude: params.latitude,
        longitude: params.longitude,
        address: params.address,
        capturedAt: params.capturedAt,
      });
      // clear so it doesn't re-trigger on the next focus
      props.navigation.setParams({
        evidenceUri: undefined,
        latitude: undefined,
        longitude: undefined,
        address: undefined,
        capturedAt: undefined,
      });
    }
  }, [props?.route?.params?.evidenceUri]);

  // ── Capture via camera screen ────────────────────────────────────────────────
  // NOTE: Location is intentionally NOT fetched here anymore. Previously this
  // screen waited on a GPS fix (enableHighAccuracy, up to 15s) before even
  // navigating to the camera screen, which made the camera feel slow to open.
  // Now we only do the fast permission check, then navigate immediately.
  // CaptureEvidence fetches location itself, in parallel with the camera
  // warming up.
  const handleCapture = async () => {
    try {
      setLoading(true);
      setLoadingMessage('Checking permissions...');
      const camGranted = await requestCameraPermission();
      setLoading(false);
      setLoadingMessage('');

      if (!camGranted) {
        showSettingsAlert('Camera');
        return;
      }

      props.navigation.navigate('CaptureEvidence', {});
    } catch (error) {
      setLoading(false);
      setLoadingMessage('');
      showErrorAlert(error.message || 'Failed to open camera. Please try again.');
    }
  };

  // ── Choose from gallery — routed through CaptureEvidence so the same
  //     geo-tag stamp gets baked in via ViewShot, just skipping the live camera ──
  const handleChooseFromGallery = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.9 });
      if (result.didCancel || !result.assets?.length) return;

      props.navigation.navigate('CaptureEvidence', {
        pickedImageUri: result.assets[0].uri,
      });
    } catch (error) {
      showErrorAlert(error.message || 'Failed to attach photo. Please try again.');
    }
  };

  const initials = OFFICER.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />

      <Header
        HeaderLogo Title placeText={'e-Challan'}
        onPress_back_button={() => {}}
        onPress_right_button={() => props.navigation.navigate('Notification')}
      />

      <Loader visible={loading} loadingText={loadingMessage || 'Loading...'} />

      {/* ── Fullscreen zoom viewer ── */}
      <Modal visible={!!fullscreenUri} transparent animationType="fade" onRequestClose={() => setFullscreenUri(null)}>
        <TouchableOpacity style={s.zoomOverlay} activeOpacity={1} onPress={() => setFullscreenUri(null)}>
          <Image source={{ uri: fullscreenUri }} style={s.zoomImage} resizeMode="contain" />
          <Text style={s.zoomClose}>✕  Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Officer hero card ── */}
          <View style={s.heroCard}>
            <View style={s.heroCircle1} />
            <View style={s.heroCircle2} />
            <View style={s.heroStripe} />

            <View style={s.heroTop}>
              <View style={s.avatarRing}>
                <View style={[s.avatar, s.initialsBox]}>
                  <Text style={s.initialsText}>{initials}</Text>
                </View>
                <View style={[s.onlineDot, { backgroundColor: OFFICER.onDuty ? Colors.govGreen : Colors.red }]} />
              </View>

              <View style={s.heroInfo}>
                <Text style={s.heroName} numberOfLines={1}>{OFFICER.name}</Text>
                <Text style={s.heroCode}>Badge No. {OFFICER.badgeNo}</Text>
                <View style={s.heroMeta}>
                  <View style={s.metaChip}>
                    <Text style={s.metaIcon}>🏢</Text>
                    <Text style={s.metaText}>{OFFICER.station}</Text>
                  </View>
                </View>
              </View>

              <View style={[s.dutyBadge, { backgroundColor: OFFICER.onDuty ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)' }]}>
                <Text style={[s.dutyBadgeText, { color: OFFICER.onDuty ? '#4ADE80' : '#FCA5A5' }]}>
                  {OFFICER.onDuty ? 'ON DUTY' : 'OFF DUTY'}
                </Text>
              </View>
            </View>

            <View style={s.heroDivider} />
            <View style={s.heroDateRow}>
              <Text style={s.heroWeekday}>{moment().format('dddd').toUpperCase()}</Text>
              <Text style={s.heroDate}>{moment().format('MMMM D, YYYY')}</Text>
            </View>
          </View>

          {/* ── Stats grid ── */}
          <View style={s.statsGrid}>
            <View style={[s.statCard, { borderLeftColor: Colors.primary }]}>
              <Text style={s.statValue}>{STATS.casesToday}</Text>
              <Text style={s.statLabel}>Cases Today</Text>
            </View>
            <View style={[s.statCard, { borderLeftColor: Colors.govGreen }]}>
              <Text style={s.statValue}>{STATS.fineCollected}</Text>
              <Text style={s.statLabel}>Fine Collected</Text>
            </View>
            <View style={[s.statCard, { borderLeftColor: Colors.red }]}>
              <Text style={s.statValue}>{STATS.pendingChallans}</Text>
              <Text style={s.statLabel}>Pending Challans</Text>
            </View>
            <View style={[s.statCard, { borderLeftColor: Colors.gold }]}>
              <Text style={s.statValue}>{STATS.thisMonth}</Text>
              <Text style={s.statLabel}>This Month</Text>
            </View>
          </View>

          {/* ── Capture section ── */}
          <View style={s.captureCard}>
            <Text style={s.captureTitle}>Capture Evidence</Text>
            <Text style={s.captureSubtitle}>Photo will be automatically geo-tagged with your current location</Text>

            {lastEvidenceUri ? (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setFullscreenUri(lastEvidenceUri)}
                style={s.lastCaptureThumbWrap}
              >
                <Image source={{ uri: lastEvidenceUri }} style={s.lastCaptureThumb} resizeMode="cover" />
                <View style={s.lastCaptureOverlay}>
                  <Text style={s.lastCaptureOverlayText}>
                    {lastEvidenceMeta?.capturedAt
                      ? `Captured ${moment(lastEvidenceMeta.capturedAt).format('h:mm A')}  ·  Tap to view`
                      : 'Tap to view'}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={s.captureIconWrap}>
                <Text style={s.captureIconEmoji}>📸</Text>
              </View>
            )}

            {/* ── Once a photo exists, this is the next step in the flow ── */}
            {lastEvidenceUri && (
              <TouchableOpacity
                style={s.proceedBtn}
                onPress={() =>
                  props.navigation.navigate('RegisterComplaint', {
                    evidenceUri: lastEvidenceUri,
                    latitude: lastEvidenceMeta?.latitude,
                    longitude: lastEvidenceMeta?.longitude,
                    address: lastEvidenceMeta?.address,
                    capturedAt: lastEvidenceMeta?.capturedAt,
                  })
                }
                activeOpacity={0.86}
              >
                <Text style={s.proceedBtnText}>Proceed to Lodge Complaint</Text>
              </TouchableOpacity>
            )}

            <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%', marginTop: normalize(14) }}>
              <TouchableOpacity style={s.captureBtn} onPress={handleCapture} activeOpacity={0.86}>
                <Text style={s.captureBtnIcon}>📷</Text>
                <Text style={s.captureBtnText}>
                  {lastEvidenceUri ? 'Retake Evidence Photo' : 'Capture Evidence Photo'}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity style={s.galleryBtn} onPress={handleChooseFromGallery} activeOpacity={0.86}>
              <Text style={s.galleryBtnIcon}>🖼️</Text>
              <Text style={s.galleryBtnText}>Choose from Gallery</Text>
            </TouchableOpacity>

            {offenceTypesLoading && (
              <Text style={s.offenceTypesHint}>Loading offence types…</Text>
            )}
          </View>

        </Animated.View>
      </ScrollView>
    </View>
  );
};

export default Home;

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.page },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: normalize(14),
    paddingTop: normalize(10),
    paddingBottom: normalize(100),
  },

  // ── Hero card ──
  heroCard: {
    backgroundColor: Colors.navy,
    borderRadius: normalize(18),
    padding: normalize(14),
    marginBottom: normalize(12),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  heroStripe: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
    backgroundColor: Colors.primary,
  },
  heroCircle1: {
    position: 'absolute', top: -normalize(30), right: -normalize(20),
    width: normalize(110), height: normalize(110), borderRadius: normalize(55),
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroCircle2: {
    position: 'absolute', bottom: normalize(20), right: normalize(10),
    width: normalize(60), height: normalize(60), borderRadius: normalize(30),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  heroTop: { flexDirection: 'row', alignItems: 'center', gap: normalize(10) },

  avatarRing: { position: 'relative' },
  avatar: {
    height: normalize(52), width: normalize(52), borderRadius: normalize(26),
    borderWidth: 2, borderColor: Colors.primary,
  },
  initialsBox: { backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  initialsText: { fontSize: normalize(18), color: Colors.fontWhite, fontFamily: Fonts.MulishExtraBold },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: normalize(11), height: normalize(11), borderRadius: normalize(6),
    borderWidth: 2, borderColor: Colors.navy,
  },

  heroInfo: { flex: 1 },
  heroName: { fontSize: normalize(15), color: Colors.fontWhite, fontFamily: Fonts.MulishExtraBold, marginBottom: 1 },
  heroCode: { fontSize: normalize(11), color: Colors.gold, fontFamily: Fonts.MulishSemiBold, marginBottom: normalize(4) },
  heroMeta: { flexDirection: 'row', gap: normalize(8), flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: normalize(3) },
  metaIcon: { fontSize: normalize(10) },
  metaText: { fontSize: normalize(10), color: 'rgba(255,255,255,0.72)', fontFamily: Fonts.MulishMedium },

  dutyBadge: { paddingHorizontal: normalize(8), paddingVertical: normalize(4), borderRadius: normalize(6) },
  dutyBadgeText: { fontSize: normalize(9), fontFamily: Fonts.MulishExtraBold, letterSpacing: 0.6 },

  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: normalize(10) },
  heroDateRow: { flexDirection: 'row', alignItems: 'center', gap: normalize(8) },
  heroWeekday: { fontSize: normalize(9), color: 'rgba(255,255,255,0.5)', fontFamily: Fonts.MulishSemiBold, letterSpacing: 1.2 },
  heroDate: { fontSize: normalize(11), color: Colors.fontWhite, fontFamily: Fonts.MulishExtraBold },

  // ── Stats grid ──
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: normalize(8),
    marginBottom: normalize(12),
  },
  statCard: {
    width: '48%', backgroundColor: Colors.card, borderRadius: normalize(12),
    borderLeftWidth: 3, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: normalize(12), paddingHorizontal: normalize(12),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: normalize(18), color: Colors.text, fontFamily: Fonts.MulishExtraBold },
  statLabel: { fontSize: normalize(10), color: Colors.mutedText, fontFamily: Fonts.MulishSemiBold, marginTop: normalize(2) },

  // ── Capture card ──
  captureCard: {
    backgroundColor: Colors.card, borderRadius: normalize(16),
    borderWidth: 1, borderColor: Colors.border,
    padding: normalize(16), alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  captureTitle: { fontSize: normalize(15), color: Colors.text, fontFamily: Fonts.MulishExtraBold },
  captureSubtitle: {
    fontSize: normalize(11), color: Colors.mutedText, fontFamily: Fonts.MulishMedium,
    textAlign: 'center', marginTop: normalize(4), marginBottom: normalize(14), lineHeight: normalize(16),
  },

  captureIconWrap: {
    width: normalize(110), height: normalize(110), borderRadius: normalize(55),
    backgroundColor: Colors.lightgreybg, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
  },
  captureIconEmoji: { fontSize: normalize(40) },

  lastCaptureThumbWrap: {
    width: '100%', height: normalize(180), borderRadius: normalize(12), overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  lastCaptureThumb: { width: '100%', height: '100%' },
  lastCaptureOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: normalize(6), alignItems: 'center',
  },
  lastCaptureOverlayText: { color: Colors.white, fontSize: normalize(11), fontFamily: Fonts.MulishSemiBold },

  proceedBtn: {
    width: '100%', borderRadius: normalize(14), paddingVertical: normalize(14),
    marginTop: normalize(12), backgroundColor: Colors.govGreen,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18, shadowRadius: 10, elevation: 6,
  },
  proceedBtnText: {
    fontSize: normalize(15), color: Colors.white,
    fontFamily: Fonts.MulishExtraBold, letterSpacing: 0.2,
  },

  captureBtn: {
    width: '100%', borderRadius: normalize(14), paddingVertical: normalize(14),
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: normalize(8),
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18, shadowRadius: 10, elevation: 6,
  },
  captureBtnIcon: { fontSize: normalize(17) },
  captureBtnText: { fontSize: normalize(15), color: Colors.white, fontFamily: Fonts.MulishExtraBold, letterSpacing: 0.2 },

  galleryBtn: {
    width: '100%', borderRadius: normalize(14), paddingVertical: normalize(12),
    marginTop: normalize(10), backgroundColor: 'transparent',
    borderWidth: 1.5, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: normalize(8),
  },
  galleryBtnIcon: { fontSize: normalize(15) },
  galleryBtnText: { fontSize: normalize(13), color: Colors.text, fontFamily: Fonts.MulishSemiBold },

  offenceTypesHint: {
    marginTop: normalize(10), fontSize: normalize(10),
    color: Colors.mutedText, fontFamily: Fonts.MulishMedium,
  },

  // ── Zoom viewer ──
  zoomOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center', alignItems: 'center' },
  zoomImage: { width: '95%', height: '80%' },
  zoomClose: { marginTop: normalize(14), color: '#94a3b8', fontFamily: Fonts.MulishMedium, fontSize: normalize(13) },
});