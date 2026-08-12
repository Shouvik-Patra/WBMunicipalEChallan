import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

import Header from '../../components/Header';
import { Colors } from '../../themes/ThemePath';
import normalize from '../../utils/helpers/normalize';
import showErrorAlert from '../../utils/helpers/Toast';
import { useIsFocused } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { logoutRequest } from '../../redux/reducer/AuthReducer';
import { userDetailsRequest } from '../../redux/reducer/ProfileReducer';
import connectionrequest from '../../utils/helpers/NetInfo';
import Loader from '../../utils/helpers/Loader';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const getInitials = name => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatDate = iso => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const parseWards = wardsRaw => {
  if (!wardsRaw) return [];
  if (Array.isArray(wardsRaw)) return wardsRaw;
  return String(wardsRaw)
    .split(',')
    .map(w => w.trim())
    .filter(Boolean);
};

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

const SectionCard = ({ label, children }) => (
  <View style={styles.card}>
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelBar} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
    {children}
  </View>
);

const FieldRow = ({ icon, fieldKey, value, isLast }) => (
  <View style={[styles.fieldRow, isLast && styles.fieldRowLast]}>
    <View style={styles.fieldIcon}>
      <Text style={styles.fieldIconText}>{icon}</Text>
    </View>
    <View style={styles.fieldInfo}>
      <Text style={styles.fieldKey}>{fieldKey}</Text>
      <Text style={styles.fieldVal}>{value || '—'}</Text>
    </View>
  </View>
);

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

let status = '';

const MyProfile = props => {
  const dispatch = useDispatch();
  const ProfileReducer = useSelector(state => state.ProfileReducer);
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(false);
  const [userDetails, setUserDetails] = useState(
    ProfileReducer?.userDetailsResponse || {},
  );

  const d = userDetails;

  useEffect(() => {
    getUserDetails();
  }, [isFocused]);

  function getUserDetails() {
    connectionrequest()
      .then(() => dispatch(userDetailsRequest()))
      .catch(() => showErrorAlert('Please connect to internet'));
  }

  if (status === '' || ProfileReducer.status !== status) {
    switch (ProfileReducer.status) {
      case 'Profile/userDetailsRequest':
        status = ProfileReducer.status;
        setLoading(true);
        break;
      case 'Profile/userDetailsSuccess':
        status = ProfileReducer.status;
        setUserDetails(ProfileReducer.userDetailsResponse);
        setLoading(false);
        break;
      case 'Profile/userDetailsFailure':
        status = ProfileReducer.status;
        setLoading(false);
        break;
    }
  }

  const initials = getInitials(d?.name);
  const wards = parseWards(d?.wards);
  const appVersion = d?.app_info?.app_version;

  return (
    <View style={styles.root}>
      <Header
        HeaderLogo
        Title
        placeText={'My Profile'}
        onPress_back_button={() => props.navigation.goBack()}
        onPress_right_button={() => props.navigation.navigate('Notification')}
      />

      <Loader visible={loading} loadingText="Loading..." />

      {/* Tricolor accent strip */}
      <View style={styles.triColorStrip}>
        <View style={[styles.triColorBand, { backgroundColor: Colors.saffron }]} />
        <View style={[styles.triColorBand, { backgroundColor: Colors.white }]} />
        <View style={[styles.triColorBand, { backgroundColor: Colors.govGreen }]} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* ── AVATAR & IDENTITY ── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          <Text style={styles.fullName}>{d?.name || 'User'}</Text>
          <Text style={styles.designation}>{d?.designation || '—'}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.badgeRole}>
              <Text style={styles.badgeRoleText}>
                {d?.role_id ? `Role #${d.role_id}` : '—'}
              </Text>
            </View>
            {!!appVersion && (
              <View style={styles.badgeVersion}>
                <Text style={styles.badgeVersionText}>v{appVersion}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── ACCOUNT CARD ── */}
        <SectionCard label="Account">
          <FieldRow icon="✉️" fieldKey="Email" value={d?.email} />
          <FieldRow icon="📞" fieldKey="Phone number" value={d?.phone} isLast />
        </SectionCard>

        {/* ── LOCATION CARD ── */}
        <SectionCard label="Location">
          <FieldRow icon="📍" fieldKey="District" value={d?.district_name} />
          <FieldRow
            icon="🏢"
            fieldKey="Municipality"
            value={d?.municipality_name}
          />
          <View style={[styles.fieldRow, styles.fieldRowLast]}>
            <View style={styles.fieldIcon}>
              <Text style={styles.fieldIconText}>🗺️</Text>
            </View>
            <View style={styles.fieldInfo}>
              <Text style={styles.fieldKey}>
                Assigned wards ({wards.length})
              </Text>
              <View style={styles.wardRow}>
                {wards.length > 0 ? (
                  wards.map((ward, index) => (
                    <View key={index} style={styles.wardPill}>
                      <Text style={styles.wardPillText}>{ward}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.fieldVal}>—</Text>
                )}
              </View>
            </View>
          </View>
        </SectionCard>

        {/* ── ACCOUNT DETAILS CARD ── */}
        <SectionCard label="Account details">
          <FieldRow
            icon="🪪"
            fieldKey="Account ID"
            value={d?.id ? `#${d.id}` : '—'}
          />
          <FieldRow
            icon="📅"
            fieldKey="Joined"
            value={formatDate(d?.created_at)}
            isLast
          />
        </SectionCard>

        {/* ── LOGOUT ── */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => dispatch(logoutRequest())}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

export default MyProfile;

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  triColorStrip: {
    flexDirection: 'row',
    height: normalize(4),
  },
  triColorBand: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  scrollContent: {
    paddingBottom: normalize(40),
  },

  // ── AVATAR SECTION ──
  avatarSection: {
    alignItems: 'center',
    paddingTop: normalize(30),
    paddingBottom: normalize(24),
    paddingHorizontal: normalize(20),
  },
  avatarRing: {
    width: normalize(92),
    height: normalize(92),
    borderRadius: normalize(46),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: normalize(14),
    borderWidth: normalize(2.5),
    borderColor: Colors.saffron,
  },
  avatar: {
    width: normalize(78),
    height: normalize(78),
    borderRadius: normalize(39),
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: normalize(26),
    fontWeight: '700',
    color: Colors.white,
  },
  fullName: {
    fontSize: normalize(22),
    fontWeight: '700',
    color: Colors.navy,
    textAlign: 'center',
  },
  designation: {
    fontSize: normalize(13),
    color: Colors.greytext,
    marginTop: normalize(4),
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: normalize(8),
    marginTop: normalize(12),
  },
  badgeRole: {
    backgroundColor: Colors.navy,
    borderRadius: normalize(20),
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(5),
  },
  badgeRoleText: {
    fontSize: normalize(12),
    color: Colors.white,
    fontWeight: '600',
  },
  badgeVersion: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.saffron,
    borderRadius: normalize(20),
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(5),
  },
  badgeVersionText: {
    fontSize: normalize(12),
    color: Colors.saffronDark,
    fontWeight: '600',
  },

  // ── CARD ──
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: normalize(16),
    marginBottom: normalize(12),
    borderRadius: normalize(20),
    paddingHorizontal: normalize(16),
    paddingTop: normalize(14),
    paddingBottom: normalize(6),
    shadowColor: Colors.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: normalize(6),
    marginBottom: normalize(10),
  },
  sectionLabelBar: {
    width: normalize(3),
    height: normalize(12),
    borderRadius: normalize(2),
    backgroundColor: Colors.govGreen,
  },
  sectionLabel: {
    fontSize: normalize(11),
    fontWeight: '700',
    color: Colors.saffronDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── FIELD ROW ──
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: normalize(12),
    paddingVertical: normalize(10),
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  fieldRowLast: {
    borderBottomWidth: 0,
    marginBottom: normalize(6),
  },
  fieldIcon: {
    width: normalize(36),
    height: normalize(36),
    borderRadius: normalize(10),
    backgroundColor: Colors.lightgreybg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fieldIconText: {
    fontSize: normalize(16),
  },
  fieldInfo: {
    flex: 1,
  },
  fieldKey: {
    fontSize: normalize(11),
    color: Colors.mutedText,
    marginBottom: normalize(2),
  },
  fieldVal: {
    fontSize: normalize(14),
    color: Colors.navy,
    fontWeight: '600',
  },

  // ── WARDS ──
  wardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: normalize(6),
    marginTop: normalize(4),
  },
  wardPill: {
    backgroundColor: Colors.lightgreen,
    borderWidth: 1,
    borderColor: Colors.govGreen,
    borderRadius: normalize(8),
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(4),
    minWidth: normalize(28),
    alignItems: 'center',
  },
  wardPillText: {
    fontSize: normalize(12),
    color: Colors.govGreenDark,
    fontWeight: '700',
  },

  // ── LOGOUT ──
  buttonContainer: {
    paddingHorizontal: normalize(16),
    marginTop: normalize(8),
    marginBottom: normalize(100),
  },
  logoutButton: {
    backgroundColor: Colors.navy,
    paddingVertical: normalize(16),
    borderRadius: normalize(16),
    alignItems: 'center',
  },
  logoutText: {
    color: Colors.white,
    fontSize: normalize(15),
    fontWeight: '700',
  },
});