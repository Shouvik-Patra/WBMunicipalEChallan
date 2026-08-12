import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { createEChallanRequest } from '../../redux/reducer/ProfileReducer';

// ─── Helpers ────────────────────────────────────────────────────────────────
// Builds the multipart file entry RN's FormData expects for a local file URI.
const toFormDataFile = (uri, index) => {
  const fileName = uri.split('/').pop() || `evidence_${index}.jpg`;
  const extMatch = /\.(\w+)$/.exec(fileName);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
  return { uri, name: fileName, type: mimeType };
};
const isValidPhone = phone => /^[0-9]{7,15}$/.test(phone.trim());
const MAX_IMAGES = 5;

// ─── Component ──────────────────────────────────────────────────────────────
// Expected route.params (passed from Home after a photo is captured/picked):
//   evidenceUri, latitude, longitude, address, capturedAt
const RegisterComplaint = props => {
  const dispatch = useDispatch();
  const isFocused = useIsFocused();
  const ProfileReducer = useSelector(s => s.ProfileReducer);
  // TODO: adjust to whichever slice registerComplaintRequest actually writes to.
  const ComplaintReducer = useSelector(s => s.ComplaintReducer);
  const params = props?.route?.params || {};
  const { evidenceUri, latitude, longitude, address, capturedAt } = params;

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Offence types come straight from the store — Home already dispatches
  // offenceTypesRequest() on focus, so this stays in sync with that.
  const offenceTypes = ProfileReducer?.offenceTypesResponse || [];
  const [selectedOffence, setSelectedOffence] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // ── Evidence images (multiple) ──
  // Seeded with the photo handed off from Home/CaptureEvidence; the officer
  // can attach more from the gallery, up to MAX_IMAGES.
  const [images, setImages] = useState(evidenceUri ? [evidenceUri] : []);
  const [fullscreenUri, setFullscreenUri] = useState(null);

  const [offenderName, setOffenderName] = useState('');
  const [offenderPhone, setOffenderPhone] = useState('');
  const [offenderAddress, setOffenderAddress] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [remarks, setRemarks] = useState('');

  const [errors, setErrors] = useState({});

  const hasLocation = useMemo(
    () => typeof latitude === 'number' && typeof longitude === 'number',
    [latitude, longitude],
  );

  // ── React to the dispatched request's outcome ──
  // TODO: match these status strings to whatever your saga/reducer actually
  // sets (mirrors the 'Profile/offenceTypesSuccess' pattern used in Home.js).
  useEffect(() => {
    switch (ComplaintReducer?.status) {
      case 'Complaint/registerComplaintRequest':
        setLoading(true);
        setLoadingMessage('Registering complaint...');
        break;
      case 'Complaint/registerComplaintSuccess':
        setLoading(false);
        setLoadingMessage('');
        Alert.alert('Success', 'Complaint registered successfully.', [
          { text: 'OK', onPress: () => props.navigation.navigate('Home') },
        ]);
        break;
      case 'Complaint/registerComplaintFailure':
        setLoading(false);
        setLoadingMessage('');
        showErrorAlert(ComplaintReducer?.error || 'Failed to register complaint. Please try again.');
        break;
      default:
        break;
    }
  }, [ComplaintReducer?.status]);

  const handleAddImages = async () => {
    if (images.length >= MAX_IMAGES) {
      showErrorAlert(`You can attach up to ${MAX_IMAGES} photos.`);
      return;
    }
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.9,
        selectionLimit: MAX_IMAGES - images.length,
      });
      if (result.didCancel || !result.assets?.length) return;

      const newUris = result.assets.map(a => a.uri).filter(Boolean);
      setImages(prev => {
        const merged = [...prev, ...newUris];
        return merged.slice(0, MAX_IMAGES);
      });
      setErrors(prev => ({ ...prev, multiple_images: undefined }));
    } catch (error) {
      showErrorAlert(error.message || 'Failed to attach photo. Please try again.');
    }
  };

  const handleRemoveImage = uri => {
    setImages(prev => prev.filter(item => item !== uri));
  };

  const validate = () => {
    const next = {};
    if (!selectedOffence) next.offense_id = 'Select an offence type';
    if (!images.length) next.multiple_images = 'Attach at least one evidence photo';
    if (!offenderName.trim()) next.offender_name = 'Offender name is required';
    if (!offenderPhone.trim()) next.offender_phone = 'Phone number is required';
    else if (!isValidPhone(offenderPhone))
      next.offender_phone = 'Enter a valid phone number';
    if (!offenderAddress.trim()) next.offender_address = 'Address is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    const online = await connectionrequest().then(() => true).catch(() => false);
    if (!online) {
      showErrorAlert('Please connect to internet');
      return;
    }

    const formData = new FormData();

    formData.append('offense_id', String(selectedOffence.id));
    formData.append('offender_name', offenderName.trim());
    formData.append('offender_phone', offenderPhone.trim());
    formData.append('offender_address', offenderAddress.trim());
    formData.append('vehicle_no', vehicleNo.trim());
    formData.append('latitude', String(latitude));
    formData.append('longitude', String(longitude));
    formData.append('remarks', remarks.trim());
    images.forEach((uri, index) => {
      formData.append('multiple_images', toFormDataFile(uri, index));
    });

    // TODO: Dispatch action to register the complaint on server
    dispatch(createEChallanRequest(formData));
  }, [
    selectedOffence,
    offenderName,
    offenderPhone,
    offenderAddress,
    vehicleNo,
    latitude,
    longitude,
    remarks,
    images,
  ]);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />

      <Header
        HeaderLogo
        Title
        placeText={'Register Complaint'}
        onPress_back_button={() => props.navigation.goBack()}
      />

      <Loader visible={loading} loadingText={loadingMessage || 'Loading...'} />

      {/* ── Fullscreen zoom viewer for evidence photos ── */}
      <Modal visible={!!fullscreenUri} transparent animationType="fade" onRequestClose={() => setFullscreenUri(null)}>
        <TouchableOpacity style={s.zoomOverlay} activeOpacity={1} onPress={() => setFullscreenUri(null)}>
          <Image source={{ uri: fullscreenUri }} style={s.zoomImage} resizeMode="contain" />
          <Text style={s.zoomClose}>✕  Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={normalize(60)}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Evidence photos ── */}
          <Text style={s.label}>Evidence Photos * ({images.length}/{MAX_IMAGES})</Text>
          <View style={s.imagesRow}>
            {images.map(uri => (
              <View key={uri} style={s.imageThumbWrap}>
                <TouchableOpacity activeOpacity={0.88} onPress={() => setFullscreenUri(uri)}>
                  <Image source={{ uri }} style={s.imageThumb} resizeMode="cover" />
                </TouchableOpacity>
                <TouchableOpacity style={s.imageRemoveBtn} onPress={() => handleRemoveImage(uri)}>
                  <Text style={s.imageRemoveBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {images.length < MAX_IMAGES && (
              <TouchableOpacity style={s.imageAddBtn} onPress={handleAddImages} activeOpacity={0.85}>
                <Text style={s.imageAddBtnIcon}>＋</Text>
                <Text style={s.imageAddBtnText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {!!errors.multiple_images && <Text style={s.errorText}>{errors.multiple_images}</Text>}

          {(!!address || hasLocation) && (
            <View style={s.locationCard}>
              {!!address && <Text style={s.locationAddress} numberOfLines={2}>{address}</Text>}
              <View style={s.locationMetaRow}>
                {hasLocation && (
                  <Text style={s.locationCoords}>
                    {latitude.toFixed(5)}, {longitude.toFixed(5)}
                  </Text>
                )}
                {!!capturedAt && (
                  <Text style={s.locationTime}>{moment(capturedAt).format('MMM D, h:mm A')}</Text>
                )}
              </View>
            </View>
          )}

          {/* ── Offence type dropdown ── */}
          <Text style={s.label}>Offence Type *</Text>
          <TouchableOpacity
            style={[s.dropdownField, errors.offense_id && s.fieldError]}
            activeOpacity={0.85}
            onPress={() => setDropdownOpen(true)}
          >
            {selectedOffence ? (
              <View style={{ flex: 1 }}>
                <Text style={s.dropdownValueText}>{selectedOffence.name}</Text>
                <Text style={s.dropdownSubText}>
                  Fine: ₹{selectedOffence.fine_amount}
                </Text>
              </View>
            ) : (
              <Text style={s.dropdownPlaceholder}>Select offence type</Text>
            )}
            <Text style={s.dropdownChevron}>▾</Text>
          </TouchableOpacity>
          {!!errors.offense_id && (
            <Text style={s.errorText}>{errors.offense_id}</Text>
          )}

          {/* ── Offender details ── */}
          <Text style={s.label}>Offender Name *</Text>
          <TextInput
            style={[s.input, errors.offender_name && s.fieldError]}
            placeholder="Full name"
            placeholderTextColor={Colors.mutedText}
            value={offenderName}
            onChangeText={setOffenderName}
          />
          {!!errors.offender_name && (
            <Text style={s.errorText}>{errors.offender_name}</Text>
          )}

          <Text style={s.label}>Phone Number *</Text>
          <TextInput
            style={[s.input, errors.offender_phone && s.fieldError]}
            placeholder="e.g. 9812345678"
            placeholderTextColor={Colors.mutedText}
            keyboardType="phone-pad"
            value={offenderPhone}
            onChangeText={setOffenderPhone}
          />
          {!!errors.offender_phone && (
            <Text style={s.errorText}>{errors.offender_phone}</Text>
          )}

          <Text style={s.label}>Address *</Text>
          <TextInput
            style={[s.input, errors.offender_address && s.fieldError]}
            placeholder="Offender's address"
            placeholderTextColor={Colors.mutedText}
            value={offenderAddress}
            onChangeText={setOffenderAddress}
          />
          {!!errors.offender_address && (
            <Text style={s.errorText}>{errors.offender_address}</Text>
          )}

          <Text style={s.label}>Vehicle No.</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. KA01AB1234"
            placeholderTextColor={Colors.mutedText}
            autoCapitalize="characters"
            value={vehicleNo}
            onChangeText={setVehicleNo}
          />

          <Text style={s.label}>Remarks</Text>
          <TextInput
            style={[s.input, s.textArea]}
            placeholder="Additional notes about the offence"
            placeholderTextColor={Colors.mutedText}
            multiline
            numberOfLines={4}
            value={remarks}
            onChangeText={setRemarks}
          />

          <TouchableOpacity
            style={s.submitBtn}
            onPress={handleSubmit}
            activeOpacity={0.86}
          >
            <Text style={s.submitBtnText}>Register Complaint</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Offence type picker modal ── */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}
        >
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Select Offence Type</Text>
            <FlatList
              data={offenceTypes}
              keyExtractor={item => String(item.id)}
              style={{ maxHeight: normalize(420) }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.offenceRow}
                  onPress={() => {
                    setSelectedOffence(item);
                    setErrors(prev => ({ ...prev, offense_id: undefined }));
                    setDropdownOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.offenceRowName}>{item.name}</Text>
                    <Text style={s.offenceRowDesc} numberOfLines={1}>
                      {item.description}
                    </Text>
                  </View>
                  <Text style={s.offenceRowFine}>₹{item.fine_amount}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={s.rowSeparator} />}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default RegisterComplaint;

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.page },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: normalize(14),
    paddingTop: normalize(10),
    paddingBottom: normalize(60),
  },

  // ── Evidence images ──
  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: normalize(10) },
  imageThumbWrap: { position: 'relative' },
  imageThumb: {
    width: normalize(84), height: normalize(84), borderRadius: normalize(10),
    borderWidth: 1, borderColor: Colors.border,
  },
  imageRemoveBtn: {
    position: 'absolute', top: -normalize(6), right: -normalize(6),
    width: normalize(20), height: normalize(20), borderRadius: normalize(10),
    backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center',
  },
  imageRemoveBtnText: { color: Colors.white, fontSize: normalize(11), fontFamily: Fonts.MulishExtraBold },
  imageAddBtn: {
    width: normalize(84), height: normalize(84), borderRadius: normalize(10),
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.lightgreybg,
  },
  imageAddBtnIcon: { fontSize: normalize(20), color: Colors.mutedText },
  imageAddBtnText: { fontSize: normalize(10), color: Colors.mutedText, fontFamily: Fonts.MulishSemiBold, marginTop: normalize(2) },

  locationCard: {
    marginTop: normalize(12), backgroundColor: Colors.card, borderRadius: normalize(12),
    borderWidth: 1, borderColor: Colors.border, padding: normalize(12),
  },
  locationAddress: { fontSize: normalize(12), color: Colors.text, fontFamily: Fonts.MulishSemiBold },
  locationMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: normalize(4),
  },
  locationCoords: { fontSize: normalize(10), color: Colors.mutedText, fontFamily: Fonts.MulishMedium },
  locationTime: { fontSize: normalize(10), color: Colors.mutedText, fontFamily: Fonts.MulishMedium },

  label: {
    fontSize: normalize(12),
    color: Colors.text,
    fontFamily: Fonts.MulishExtraBold,
    marginBottom: normalize(6),
    marginTop: normalize(12),
  },

  input: {
    backgroundColor: Colors.card,
    borderRadius: normalize(10),
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(10),
    fontSize: normalize(13),
    color: Colors.text,
    fontFamily: Fonts.MulishMedium,
  },
  textArea: { height: normalize(90), textAlignVertical: 'top' },

  fieldError: { borderColor: Colors.red },
  errorText: {
    fontSize: normalize(10),
    color: Colors.red,
    fontFamily: Fonts.MulishMedium,
    marginTop: normalize(4),
  },

  dropdownField: {
    backgroundColor: Colors.card,
    borderRadius: normalize(10),
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownPlaceholder: {
    fontSize: normalize(13),
    color: Colors.mutedText,
    fontFamily: Fonts.MulishMedium,
  },
  dropdownValueText: {
    fontSize: normalize(13),
    color: Colors.text,
    fontFamily: Fonts.MulishExtraBold,
  },
  dropdownSubText: {
    fontSize: normalize(11),
    color: Colors.mutedText,
    fontFamily: Fonts.MulishMedium,
    marginTop: normalize(2),
  },
  dropdownChevron: { fontSize: normalize(16), color: Colors.mutedText },

  submitBtn: {
    marginTop: normalize(22),
    borderRadius: normalize(14),
    paddingVertical: normalize(14),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnText: {
    fontSize: normalize(15),
    color: Colors.white,
    fontFamily: Fonts.MulishExtraBold,
    letterSpacing: 0.2,
  },

  // ── Modal picker ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: normalize(18),
    borderTopRightRadius: normalize(18),
    paddingHorizontal: normalize(16),
    paddingTop: normalize(10),
    paddingBottom: normalize(24),
  },
  modalHandle: {
    width: normalize(40),
    height: normalize(4),
    borderRadius: normalize(2),
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: normalize(10),
  },
  modalTitle: {
    fontSize: normalize(14),
    color: Colors.text,
    fontFamily: Fonts.MulishExtraBold,
    marginBottom: normalize(8),
  },
  offenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: normalize(12),
  },
  offenceRowName: {
    fontSize: normalize(13),
    color: Colors.text,
    fontFamily: Fonts.MulishExtraBold,
  },
  offenceRowDesc: {
    fontSize: normalize(11),
    color: Colors.mutedText,
    fontFamily: Fonts.MulishMedium,
    marginTop: normalize(2),
  },
  offenceRowFine: {
    fontSize: normalize(13),
    color: Colors.primary,
    fontFamily: Fonts.MulishExtraBold,
    marginLeft: normalize(10),
  },
  rowSeparator: { height: 1, backgroundColor: Colors.border },

  // ── Zoom viewer ──
  zoomOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center', alignItems: 'center' },
  zoomImage: { width: '95%', height: '80%' },
  zoomClose: { marginTop: normalize(14), color: '#94a3b8', fontFamily: Fonts.MulishMedium, fontSize: normalize(13) },
});