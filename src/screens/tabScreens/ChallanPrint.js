import {
  ActivityIndicator,
  FlatList,
  Image,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import moment from 'moment';
import Modal from 'react-native-modal';
import QRCode from 'react-native-qrcode-svg';
import { BLEPrinter } from 'react-native-thermal-receipt-printer';
import Header from '../../components/Header';
import { Colors, Fonts } from '../../themes/ThemePath';
import showErrorAlert from '../../utils/helpers/Toast';
import normalize from '../../utils/helpers/normalize';
import connectionrequest from '../../utils/helpers/NetInfo';
import Loader from '../../utils/helpers/Loader';
import { useDispatch, useSelector } from 'react-redux';
import { useIsFocused } from '@react-navigation/native';
import { challanListRequest } from '../../redux/reducer/ProfileReducer';

const PAGE_LIMIT = 10;

// ── Thermal printer paper width in characters. 32 for common 58mm rolls,
// 48 for 80mm rolls. Used to hand-pad label/value rows for the receipt. ──
const PRINT_WIDTH = 32;

// How often (ms) to re-poll the challan's own status while the QR sheet is
// open, and how long (ms) to keep polling before giving up automatically.
const QR_POLL_INTERVAL = 4000;
const QR_POLL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// ── Builds a "1 2 … 5 6 7 … 12" style page list ────────────────────────────
const buildPageList = (current, total) => {
  const delta = 1;
  const range = [];
  const withDots = [];
  let last;

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }

  range.forEach(i => {
    if (last) {
      if (i - last === 2) {
        withDots.push(last + 1);
      } else if (i - last !== 1) {
        withDots.push('...');
      }
    }
    withDots.push(i);
    last = i;
  });

  return withDots;
};

// ── Builds a standard UPI "intent" deep link that any UPI app can scan ────
const buildUpiIntent = ({ vpa, payeeName, amount, note, txnRef }) => {
  const qs = [
    ['pa', vpa],
    ['pn', payeeName],
    ['am', Number(amount || 0).toFixed(2)],
    ['cu', 'INR'],
    ['tn', note],
    ['tr', txnRef],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v ?? '')}`)
    .join('&');

  return `upi://pay?${qs}`;
};

// ── Configure these for your Razorpay/bank UPI collection VPA (Scan to Pay) ─
const MERCHANT_VPA = 'yourmerchant@upi'; // TODO: replace with your real VPA
const MERCHANT_NAME = 'WB Municipal E-Challan';

const ChallanPrint = ({ navigation }) => {
  const dispatch = useDispatch();
  const isFocused = useIsFocused();
  const ProfileReducer = useSelector(state => state.ProfileReducer);

  const [challans, setChallans] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    totalRecords: 0,
    totalPages: 1,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [selectedChallan, setSelectedChallan] = useState(null);
  const [fullscreenUri, setFullscreenUri] = useState(null);

  // ── Bluetooth thermal printer flow state ───────────────────────────────
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [printerDevices, setPrinterDevices] = useState([]);
  const [printerScanning, setPrinterScanning] = useState(false);
  const [printerConnecting, setPrinterConnecting] = useState(false);
  const [printingItem, setPrintingItem] = useState(null);
  const [printerError, setPrinterError] = useState('');
  // Remembers the last mac address we successfully connected to, so
  // subsequent "Print" taps can skip straight to reconnect + print.
  const lastPrinterRef = useRef(null);

  // ── QR payment flow state ──────────────────────────────────────────────
  const [qrVisible, setQrVisible] = useState(false);
  const [qrChallan, setQrChallan] = useState(null);
  const [qrLink, setQrLink] = useState('');
  const [qrPolling, setQrPolling] = useState(false);
  const [qrTimedOut, setQrTimedOut] = useState(false);
  const qrPollRef = useRef(null);
  const qrTimeoutRef = useRef(null);

  const isInitialLoading =
    ProfileReducer?.status === 'Profile/challanListRequest' &&
    page === 1 &&
    !refreshing &&
    !pageLoading;

  // ─── Status → color token mapping ───────────────────────────────────────────
  const getStatusToken = status => {
    switch ((status || '').toLowerCase()) {
      case 'paid':
      case 'settled':
        return {
          strip: Colors.govGreen,
          badgeBg: Colors.lightgreen,
          badgeText: Colors.govGreenDark || Colors.govGreen,
        };
      case 'disputed':
      case 'rejected':
      case 'cancelled':
        return {
          strip: Colors.red,
          badgeBg: Colors.lightred,
          badgeText: Colors.red,
        };
      case 'pending':
      default:
        return {
          strip: Colors.gold,
          badgeBg: Colors.lightYellow,
          badgeText: Colors.saffronDark || Colors.gold,
        };
    }
  };

  const STATUS_LABELS = {
    paid: 'Paid',
    pending: 'Pending',
    disputed: 'Disputed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };

  const statusLabel = status =>
    STATUS_LABELS[(status || '').toLowerCase()] ||
    (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown');

  // ─── Normalize a raw API challan record into a consistent shape ────────────
  const normalizeChallan = raw => ({
    id: raw?.id ?? raw?._id,
    challanNo: raw?.challan_no ?? '',
    offenceName: raw?.offense_name ?? raw?.offence_name ?? 'Offence',
    fineAmount: raw?.fine_amount ?? raw?.amount ?? '0.00',
    offenderName: raw?.offender_name ?? '—',
    offenderPhone: raw?.offender_phone ?? '',
    vehicleNo: raw?.vehicle_no ?? '',
    address: raw?.offender_address ?? raw?.address ?? '',
    remarks: raw?.remarks ?? '',
    status: raw?.payment_status ?? raw?.status ?? 'pending',
    createdAt: raw?.created_at ?? raw?.createdAt ?? raw?.date,
    images: raw?.images ?? raw?.multiple_images ?? raw?.evidence_images ?? [],
    latitude: raw?.latitude,
    longitude: raw?.longitude,
  });

  const isPending = status => (status || '').toLowerCase() === 'pending';

  // ─── Fetch a specific page ──────────────────────────────────────────────────
  const fetchChallans = useCallback(
    pageToFetch => {
      connectionrequest()
        .then(() =>
          dispatch(challanListRequest({ page: pageToFetch, limit: PAGE_LIMIT })),
        )
        .catch(() => {
          showErrorAlert('Please connect to internet');
          setRefreshing(false);
          setPageLoading(false);
        });
    },
    [dispatch],
  );

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchChallans(1);
  };

  // ─── Jump to a given page number ────────────────────────────────────────────
  const goToPage = targetPage => {
    const totalPages = pagination.totalPages || 1;
    if (
      targetPage < 1 ||
      targetPage > totalPages ||
      targetPage === page ||
      pageLoading ||
      refreshing
    ) {
      return;
    }
    setPage(targetPage);
    setPageLoading(true);
    fetchChallans(targetPage);
  };

  // ─── Load data when the screen mounts / comes back into focus ─────────────
  useEffect(() => {
    if (isFocused) {
      fetchChallans(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, fetchChallans]);

  // ─── Silent background refetch used only to poll a challan's own status ───
  const pollChallanStatus = useCallback(() => {
    connectionrequest()
      .then(() => dispatch(challanListRequest({ page, limit: PAGE_LIMIT, silent: true })))
      .catch(() => {});
  }, [dispatch, page]);

  const stopQrPolling = () => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
    if (qrTimeoutRef.current) {
      clearTimeout(qrTimeoutRef.current);
      qrTimeoutRef.current = null;
    }
    setQrPolling(false);
  };

  const closeQrModal = () => {
    stopQrPolling();
    setQrVisible(false);
    setQrChallan(null);
    setQrLink('');
    setQrTimedOut(false);
  };

  // ─── Open the "Scan to Pay" sheet for a given challan ──────────────────────
  const openQrPay = item => {
    const link = buildUpiIntent({
      vpa: MERCHANT_VPA,
      payeeName: MERCHANT_NAME,
      amount: item.fineAmount,
      note: `Challan ${item.challanNo || item.id}`,
      txnRef: String(item.id),
    });

    setQrChallan(item);
    setQrLink(link);
    setQrVisible(true);
    setQrTimedOut(false);

    stopQrPolling();
    setQrPolling(true);
    qrPollRef.current = setInterval(pollChallanStatus, QR_POLL_INTERVAL);
    qrTimeoutRef.current = setTimeout(() => {
      stopQrPolling();
      setQrTimedOut(true);
    }, QR_POLL_TIMEOUT);
  };

  // Stop polling / close the printer connection if the component unmounts
  useEffect(() => {
    return () => {
      stopQrPolling();
      BLEPrinter.closeConn?.();
    };
  }, []);

  // If the challan being watched via QR turns "paid" in the refreshed list,
  // close the sheet automatically.
  useEffect(() => {
    if (!qrVisible || !qrChallan) return;
    const updated = challans.find(c => String(c.id) === String(qrChallan.id));
    if (updated && !isPending(updated.status)) {
      closeQrModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challans, qrVisible, qrChallan]);

  // ─── React to Redux status changes (single source of truth) ───────────────
  useEffect(() => {
    const status = ProfileReducer?.status;
    if (!status) return;

    switch (status) {
      case 'Profile/challanListSuccess': {
        const raw = ProfileReducer?.challanListResponse;
        const list = Array.isArray(raw) ? raw : raw?.rows ?? raw?.data ?? [];
        setChallans(list.map(normalizeChallan));

        const meta = raw?.pagination;
        setPagination(prev => ({
          page: meta?.page ?? page,
          limit: meta?.limit ?? PAGE_LIMIT,
          totalRecords: meta?.totalRecords ?? list.length,
          totalPages: meta?.totalPages ?? prev.totalPages ?? 1,
        }));

        setRefreshing(false);
        setPageLoading(false);
        break;
      }
      case 'Profile/challanListFailure':
        setRefreshing(false);
        setPageLoading(false);
        showErrorAlert('Failed to load challans. Pull down to retry.');
        break;
      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ProfileReducer?.status]);

  // ─── Bluetooth thermal printer: permissions ────────────────────────────
  // Android 12+ (API 31+) uses the new runtime BLUETOOTH_SCAN / BLUETOOTH_CONNECT
  // permissions; older Android needs ACCESS_FINE_LOCATION for BLE scanning.
  // Make sure these are also declared in AndroidManifest.xml.
  const ensureBluetoothPermissions = async () => {
    if (Platform.OS !== 'android') return true;

    if (Platform.Version < 31) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  };

  // ─── Bluetooth thermal printer: scan for paired/nearby BLE printers ───────
  const scanForPrinters = useCallback(async () => {
    setPrinterError('');
    setPrinterScanning(true);
    try {
      const allowed = await ensureBluetoothPermissions();
      if (!allowed) {
        setPrinterError('Bluetooth permission was not granted.');
        return;
      }
      await BLEPrinter.init();
      const devices = await BLEPrinter.getDeviceList();
      setPrinterDevices(devices || []);
      if (!devices || devices.length === 0) {
        setPrinterError('No paired printer found. Pair it in phone Bluetooth settings first.');
      }
    } catch (err) {
      setPrinterError(
        err?.message || 'Could not scan for printers. Make sure Bluetooth is turned on.',
      );
    } finally {
      setPrinterScanning(false);
    }
  }, []);

  const openPrinterPicker = item => {
    setPrintingItem(item);
    setPrinterDevices([]);
    setPrinterError('');
    setPrinterModalVisible(true);
    scanForPrinters();
  };

  const closePrinterModal = () => {
    setPrinterModalVisible(false);
    setPrintingItem(null);
    setPrinterDevices([]);
    setPrinterError('');
  };

  // Right-pads a label/value pair to the configured paper width so columns
  // line up on a monospace thermal font.
  const padRow = (label, value) => {
    const l = String(label);
    const v = String(value);
    const spaces = Math.max(1, PRINT_WIDTH - l.length - v.length);
    return `${l}${' '.repeat(spaces)}${v}`;
  };

  // ─── Bluetooth thermal printer: build & send the receipt ──────────────────
  // Tags like <C>...</C> (center) and <B>...</B> (bold) are the markup this
  // library's printText() understands. Check node_modules/react-native-thermal-receipt-printer's
  // README for your installed version if formatting looks off on your printer.
  const printChallanReceipt = async item => {
    const divider = '-'.repeat(PRINT_WIDTH);
    const rows = [
      ['Challan No:', item.challanNo || '-'],
      ['Date:', item.createdAt ? moment(item.createdAt).format('DD-MM-YYYY hh:mm A') : '-'],
      ['Offence:', item.offenceName || '-'],
      ['Offender:', item.offenderName || '-'],
      ['Vehicle No:', item.vehicleNo || '-'],
      ['Phone:', item.offenderPhone || '-'],
      ['Fine Amount:', `Rs. ${parseFloat(item.fineAmount || 0).toFixed(2)}`],
      ['Status:', statusLabel(item.status)],
    ];

    let receipt = '<C><B>WB MUNICIPAL E-CHALLAN</B></C>\n';
    receipt += `<C>${divider}</C>\n`;
    rows.forEach(([label, value]) => {
      receipt += `${padRow(label, value)}\n`;
    });
    receipt += `<C>${divider}</C>\n`;
    if (item.address) {
      receipt += `Address:\n${item.address}\n`;
    }
    if (item.remarks) {
      receipt += `Remarks:\n${item.remarks}\n`;
    }
    receipt += `<C>${divider}</C>\n`;
    receipt += '<C>Thank you</C>\n\n\n';

    await BLEPrinter.printText(receipt, { beep: true, cut: true });
  };

  const connectAndPrint = async device => {
    if (!printingItem) return;
    setPrinterConnecting(true);
    setPrinterError('');
    try {
      await BLEPrinter.connectPrinter(device.inner_mac_address);
      lastPrinterRef.current = device.inner_mac_address;
      await printChallanReceipt(printingItem);
      closePrinterModal();
    } catch (err) {
      setPrinterError(err?.message || 'Could not connect to the printer.');
    } finally {
      setPrinterConnecting(false);
    }
  };

  // "Print" tap: reuse the last connected printer silently if we have one,
  // otherwise open the picker so the user can choose a paired device.
  const handlePrint = item => {
    if (!lastPrinterRef.current) {
      openPrinterPicker(item);
      return;
    }

    setPrintingItem(item);
    setPrinterConnecting(true);
    setPrinterError('');
    BLEPrinter.connectPrinter(lastPrinterRef.current)
      .then(() => printChallanReceipt(item))
      .then(() => {
        setPrinterConnecting(false);
        setPrintingItem(null);
      })
      .catch(() => {
        // Silent reconnect failed (printer off / out of range / different
        // device) — fall back to letting the user pick a printer again.
        setPrinterConnecting(false);
        openPrinterPicker(item);
      });
  };

  const totalFine = challans.reduce(
    (sum, c) => sum + (parseFloat(c.fineAmount) || 0),
    0,
  );
  const paidCount = challans.filter(c => !isPending(c.status)).length;
  const pendingCount = challans.filter(c => isPending(c.status)).length;

  // ─── Renderers ───────────────────────────────────────────────────
  const renderSummary = () => (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryEyebrow}>Challans overview</Text>
        <Text style={styles.summaryTotal}>
          {pagination.totalRecords || challans.length} total
        </Text>
      </View>
      <View style={styles.statsGrid}>
        <View style={[styles.statCell, { backgroundColor: Colors.card }]}>
          <Text style={[styles.statValue, { color: Colors.primary }]}>
            {pagination.totalRecords || challans.length}
          </Text>
          <Text style={styles.statLabel}>Total challans</Text>
        </View>
        <View style={[styles.statCell, { backgroundColor: Colors.card }]}>
          <Text style={[styles.statValue, { color: Colors.govGreen }]}>
            {paidCount}
          </Text>
          <Text style={styles.statLabel}>Paid (this page)</Text>
        </View>
        <View style={[styles.statCell, { backgroundColor: Colors.card }]}>
          <Text style={[styles.statValue, { color: Colors.gold }]}>
            {pendingCount}
          </Text>
          <Text style={styles.statLabel}>Pending (this page)</Text>
        </View>
        <View style={[styles.statCell, { backgroundColor: Colors.card }]}>
          <Text style={[styles.statValue, { color: Colors.navy }]}>
            ₹{totalFine.toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Fine (this page)</Text>
        </View>
      </View>
    </View>
  );

  const renderChallanCard = ({ item }) => {
    const tok = getStatusToken(item.status);
    const pending = isPending(item.status);
    const isThisItemPrinting =
      (printerConnecting || printerScanning) && printingItem?.id === item.id;

    return (
      <TouchableOpacity
        style={styles.challanCard}
        activeOpacity={0.85}
        onPress={() => setSelectedChallan(item)}
      >
        <View style={[styles.cardStrip, { backgroundColor: tok.strip }]} />
        <View style={styles.cardRow}>
          {item.images?.[0] ? (
            <Image
              source={{ uri: item.images[0] }}
              style={styles.cardThumb}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.cardThumb, styles.cardThumbPlaceholder]}>
              <Text style={styles.cardThumbPlaceholderText}>
                {item.offenceName?.charAt(0) ?? '?'}
              </Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.cardOffence} numberOfLines={1}>
              {item.offenceName}
            </Text>
            <Text style={styles.cardOffender} numberOfLines={1}>
              {item.offenderName}
              {item.vehicleNo ? `  ·  ${item.vehicleNo}` : ''}
            </Text>
            <Text style={styles.cardDate}>
              {item.createdAt
                ? moment(item.createdAt).format('MMM D, YYYY  h:mm A')
                : ''}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.cardFine}>
              ₹{parseFloat(item.fineAmount || 0).toFixed(0)}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: tok.badgeBg }]}>
              <Text style={[styles.statusBadgeText, { color: tok.badgeText }]}>
                {statusLabel(item.status)}
              </Text>
            </View>
          </View>
        </View>

        {pending && (
          <View style={styles.payButtonsRow}>
            <TouchableOpacity
              style={[styles.printNowInline, styles.payNowHalf]}
              activeOpacity={0.85}
              disabled={isThisItemPrinting}
              onPress={() => handlePrint(item)}
            >
              {isThisItemPrinting ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={styles.printNowInlineText}>Print</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.qrNowInline, styles.payNowHalf]}
              activeOpacity={0.85}
              onPress={() => openQrPay(item)}
            >
              <Text style={styles.qrNowInlineText}>Scan to Pay</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ─── Pagination bar: ‹  1  2  …  8  9  › ───────────────────────────────────
  const renderPagination = () => {
    const totalPages = pagination.totalPages || 1;
    const currentPage = pagination.page || page;
    const pages = buildPageList(currentPage, totalPages);
    const disabled = pageLoading || refreshing;

    return (
      <View style={styles.paginationBar}>
        <TouchableOpacity
          style={[
            styles.pageArrow,
            (currentPage === 1 || disabled) && styles.pageArrowDisabled,
          ]}
          disabled={currentPage === 1 || disabled}
          onPress={() => goToPage(currentPage - 1)}
        >
          <Text
            style={[
              styles.pageArrowText,
              (currentPage === 1 || disabled) && styles.pageArrowTextDisabled,
            ]}
          >
            ‹
          </Text>
        </TouchableOpacity>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pageNumbersRow}
        >
          {pages.map((p, idx) =>
            p === '...' ? (
              <Text key={`dots-${idx}`} style={styles.pageDots}>
                …
              </Text>
            ) : (
              <TouchableOpacity
                key={p}
                style={[
                  styles.pageNumber,
                  p === currentPage && styles.pageNumberActive,
                ]}
                disabled={disabled}
                onPress={() => goToPage(p)}
              >
                <Text
                  style={[
                    styles.pageNumberText,
                    p === currentPage && styles.pageNumberTextActive,
                  ]}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            ),
          )}
        </ScrollView>

        <TouchableOpacity
          style={[
            styles.pageArrow,
            (currentPage === totalPages || disabled) && styles.pageArrowDisabled,
          ]}
          disabled={currentPage === totalPages || disabled}
          onPress={() => goToPage(currentPage + 1)}
        >
          <Text
            style={[
              styles.pageArrowText,
              (currentPage === totalPages || disabled) &&
                styles.pageArrowTextDisabled,
            ]}
          >
            ›
          </Text>
        </TouchableOpacity>

        {pageLoading && (
          <ActivityIndicator
            size="small"
            color={Colors.primary}
            style={styles.pageLoadingSpinner}
          />
        )}
      </View>
    );
  };

  const renderDetailModal = () => {
    if (!selectedChallan) return null;
    const item = selectedChallan;
    const tok = getStatusToken(item.status);
    const pending = isPending(item.status);
    const isThisItemPrinting =
      (printerConnecting || printerScanning) && printingItem?.id === item.id;

    return (
      <Modal
        isVisible={!!selectedChallan}
        onBackdropPress={() => setSelectedChallan(null)}
        style={styles.modalWrap}
        swipeDirection="down"
        onSwipeComplete={() => setSelectedChallan(null)}
      >
        <View style={styles.detailSheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.detailHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailOffence}>{item.offenceName}</Text>
              {!!item.challanNo && (
                <Text style={styles.detailChallanNo}>{item.challanNo}</Text>
              )}
              <Text style={styles.detailDate}>
                {item.createdAt
                  ? moment(item.createdAt).format('dddd, MMM D YYYY  h:mm A')
                  : ''}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: tok.badgeBg }]}>
              <Text style={[styles.statusBadgeText, { color: tok.badgeText }]}>
                {statusLabel(item.status)}
              </Text>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: normalize(420) }}
          >
            {item.images?.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.imageRow}
              >
                {item.images.map(uri => (
                  <TouchableOpacity
                    key={uri}
                    activeOpacity={0.88}
                    onPress={() => setFullscreenUri(uri)}
                  >
                    <Image
                      source={{ uri }}
                      style={styles.detailImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.noImageBox}>
                <Text style={styles.noImageText}>No evidence images</Text>
              </View>
            )}

            <View style={styles.detailFineRow}>
              <Text style={styles.detailFineLabel}>Fine amount</Text>
              <Text style={styles.detailFineValue}>
                ₹{parseFloat(item.fineAmount || 0).toFixed(2)}
              </Text>
            </View>

            <View style={styles.detailField}>
              <Text style={styles.detailFieldLabel}>Offender</Text>
              <Text style={styles.detailFieldValue}>{item.offenderName}</Text>
              {!!item.offenderPhone && (
                <Text style={styles.detailFieldSub}>{item.offenderPhone}</Text>
              )}
            </View>

            {!!item.vehicleNo && (
              <View style={styles.detailField}>
                <Text style={styles.detailFieldLabel}>Vehicle no.</Text>
                <Text style={styles.detailFieldValue}>{item.vehicleNo}</Text>
              </View>
            )}

            {!!item.address && (
              <View style={styles.detailField}>
                <Text style={styles.detailFieldLabel}>Address</Text>
                <Text style={styles.detailFieldValue}>{item.address}</Text>
              </View>
            )}

            {!!item.remarks && (
              <View style={styles.detailField}>
                <Text style={styles.detailFieldLabel}>Remarks</Text>
                <Text style={styles.detailFieldValue}>{item.remarks}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.sheetFooter}>
            {pending && (
              <>
                <TouchableOpacity
                  style={styles.printBtn}
                  activeOpacity={0.88}
                  disabled={isThisItemPrinting}
                  onPress={() => handlePrint(item)}
                >
                  {isThisItemPrinting ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Text style={styles.printBtnText}>Print challan</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.qrNowBtn}
                  activeOpacity={0.88}
                  onPress={() => openQrPay(item)}
                >
                  <Text style={styles.qrNowBtnText}>Pay via QR (scan on another device)</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={[styles.doneBtn, pending && styles.doneBtnSecondary]}
              onPress={() => setSelectedChallan(null)}
            >
              <Text
                style={[styles.doneBtnText, pending && styles.doneBtnTextSecondary]}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ─── QR "Scan to Pay" sheet ─────────────────────────────────────────────
  const renderQrModal = () => {
    if (!qrChallan) return null;

    return (
      <Modal
        isVisible={qrVisible}
        onBackdropPress={closeQrModal}
        style={styles.modalWrap}
        swipeDirection="down"
        onSwipeComplete={closeQrModal}
      >
        <View style={styles.detailSheet}>
          <View style={styles.sheetHandle} />

          <Text style={styles.qrTitle}>Scan with any UPI app</Text>
          <Text style={styles.qrSubtitle}>
            {qrChallan.offenceName} · ₹{parseFloat(qrChallan.fineAmount || 0).toFixed(0)}
          </Text>

          <View style={styles.qrBox}>
            {!!qrLink && <QRCode value={qrLink} size={normalize(200)} />}
          </View>

          <View style={styles.qrStatusRow}>
            {qrTimedOut ? (
              <Text style={styles.qrStatusTextWarn}>
                Still haven't seen the payment. Tap refresh once it's done, or generate a new code.
              </Text>
            ) : (
              <>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.qrStatusText}>Waiting for payment…</Text>
              </>
            )}
          </View>

          <View style={styles.sheetFooter}>
            <TouchableOpacity
              style={styles.printBtn}
              activeOpacity={0.88}
              onPress={() => {
                setQrTimedOut(false);
                pollChallanStatus();
                if (!qrPolling) {
                  qrPollRef.current = setInterval(pollChallanStatus, QR_POLL_INTERVAL);
                  qrTimeoutRef.current = setTimeout(() => {
                    stopQrPolling();
                    setQrTimedOut(true);
                  }, QR_POLL_TIMEOUT);
                  setQrPolling(true);
                }
              }}
            >
              <Text style={styles.printBtnText}>Check now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtnSecondaryFull} onPress={closeQrModal}>
              <Text style={styles.doneBtnTextSecondary}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ─── Bluetooth printer picker sheet ─────────────────────────────────────
  const renderPrinterModal = () => (
    <Modal
      isVisible={printerModalVisible}
      onBackdropPress={printerConnecting ? undefined : closePrinterModal}
      style={styles.modalWrap}
      swipeDirection={printerConnecting ? undefined : 'down'}
      onSwipeComplete={printerConnecting ? undefined : closePrinterModal}
    >
      <View style={styles.detailSheet}>
        <View style={styles.sheetHandle} />

        <Text style={styles.qrTitle}>Select a Bluetooth printer</Text>
        {!!printingItem && (
          <Text style={styles.qrSubtitle}>
            {printingItem.offenceName} · {printingItem.challanNo}
          </Text>
        )}

        <View style={{ marginTop: normalize(16), minHeight: normalize(120) }}>
          {printerScanning ? (
            <View style={styles.printerLoadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.qrStatusText}>Scanning for paired printers…</Text>
            </View>
          ) : printerDevices.length === 0 ? (
            <Text style={styles.qrStatusTextWarn}>
              {printerError || 'No printers found.'}
            </Text>
          ) : (
            printerDevices.map(device => (
              <TouchableOpacity
                key={device.inner_mac_address}
                style={styles.printerRow}
                activeOpacity={0.85}
                disabled={printerConnecting}
                onPress={() => connectAndPrint(device)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.printerRowName}>{device.device_name || 'Unknown printer'}</Text>
                  <Text style={styles.printerRowMac}>{device.inner_mac_address}</Text>
                </View>
                {printerConnecting ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.printerRowAction}>Connect &amp; Print</Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.sheetFooter}>
          <TouchableOpacity
            style={styles.printBtn}
            activeOpacity={0.88}
            disabled={printerScanning}
            onPress={scanForPrinters}
          >
            <Text style={styles.printBtnText}>
              {printerScanning ? 'Scanning…' : 'Rescan'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.doneBtnSecondaryFull}
            disabled={printerConnecting}
            onPress={closePrinterModal}
          >
            <Text style={styles.doneBtnTextSecondary}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <Header
        HeaderLogo
        Title
        placeText={'Challans'}
        onPress_back_button={() => navigation.goBack()}
      />

      <Loader visible={isInitialLoading} />

      {/* ── Fullscreen evidence viewer ── */}
      <Modal
        isVisible={!!fullscreenUri}
        onBackdropPress={() => setFullscreenUri(null)}
        style={styles.zoomModalWrap}
      >
        <TouchableOpacity
          style={styles.zoomOverlay}
          activeOpacity={1}
          onPress={() => setFullscreenUri(null)}
        >
          <Image
            source={{ uri: fullscreenUri }}
            style={styles.zoomImage}
            resizeMode="contain"
          />
          <Text style={styles.zoomClose}>✕ Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>

      <FlatList
        data={challans}
        keyExtractor={item => String(item.id)}
        renderItem={renderChallanCard}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: normalize(10) }} />}
        ListHeaderComponent={challans.length > 0 ? renderSummary : null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          !isInitialLoading && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No challans yet</Text>
              <Text style={styles.emptySubtitle}>
                Registered complaints will show up here
              </Text>
            </View>
          )
        }
      />

      {renderPagination()}

      {renderDetailModal()}
      {renderQrModal()}
      {renderPrinterModal()}
    </View>
  );
};

export default ChallanPrint;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.page },
  listContent: {
    padding: normalize(14),
    paddingBottom: normalize(10),
  },

  // ── Summary card ──
  summaryCard: {
    backgroundColor: Colors.card,
    borderRadius: normalize(16),
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: Colors.border,
    marginBottom: normalize(12),
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: normalize(14),
    paddingBottom: normalize(10),
  },
  summaryEyebrow: {
    fontSize: normalize(11),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryTotal: {
    fontSize: normalize(11),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.primary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  statCell: {
    width: '50%',
    padding: normalize(12),
    paddingLeft: normalize(14),
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  statValue: { fontSize: normalize(20), fontFamily: Fonts.MulishExtraBold },
  statLabel: {
    fontSize: normalize(11),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
    marginTop: normalize(2),
  },

  // ── Challan card ──
  challanCard: {
    backgroundColor: Colors.card,
    borderRadius: normalize(12),
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  cardStrip: { height: normalize(3) },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: normalize(11),
    paddingHorizontal: normalize(12),
    gap: normalize(10),
  },
  cardThumb: {
    width: normalize(48),
    height: normalize(48),
    borderRadius: normalize(8),
    backgroundColor: Colors.lightgreybg,
  },
  cardThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardThumbPlaceholderText: {
    fontSize: normalize(18),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.mutedText,
  },
  cardInfo: { flex: 1 },
  cardOffence: {
    fontSize: normalize(13),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.text,
  },
  cardOffender: {
    fontSize: normalize(11),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
    marginTop: normalize(1),
  },
  cardDate: {
    fontSize: normalize(10),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
    marginTop: normalize(2),
  },
  cardRight: { alignItems: 'flex-end', gap: normalize(4) },
  cardFine: {
    fontSize: normalize(15),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.navy,
  },
  statusBadge: {
    borderRadius: normalize(20),
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(4),
  },
  statusBadgeText: {
    fontSize: normalize(10),
    fontFamily: Fonts.MulishExtraBold,
  },

  // ── Inline Print / Scan to Pay (on card) ──
  payButtonsRow: {
    flexDirection: 'row',
  },
  payNowHalf: { flex: 1 },
  printNowInline: {
    backgroundColor: Colors.primary,
    paddingVertical: normalize(10),
    alignItems: 'center',
  },
  printNowInlineText: {
    fontSize: normalize(12),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.white,
    letterSpacing: 0.3,
  },
  qrNowInline: {
    backgroundColor: Colors.navy,
    paddingVertical: normalize(10),
    alignItems: 'center',
  },
  qrNowInlineText: {
    fontSize: normalize(12),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.white,
    letterSpacing: 0.3,
  },

  // ── Pagination bar ──
  paginationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: normalize(14),
    paddingVertical: normalize(10),
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
    gap: normalize(8),
    paddingBottom: normalize(100),
  },
  pageArrow: {
    width: normalize(32),
    height: normalize(32),
    borderRadius: normalize(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lightgreybg2,
  },
  pageArrowDisabled: {
    opacity: 0.4,
  },
  pageArrowText: {
    fontSize: normalize(18),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.primary,
  },
  pageArrowTextDisabled: {
    color: Colors.mutedText,
  },
  pageNumbersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: normalize(6),
    flexGrow: 1,
    justifyContent: 'center',
  },
  pageNumber: {
    minWidth: normalize(32),
    height: normalize(32),
    borderRadius: normalize(16),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: normalize(8),
    backgroundColor: Colors.lightgreybg2,
  },
  pageNumberActive: {
    backgroundColor: Colors.primary,
  },
  pageNumberText: {
    fontSize: normalize(13),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.text,
  },
  pageNumberTextActive: {
    color: Colors.white,
    fontFamily: Fonts.MulishExtraBold,
  },
  pageDots: {
    fontSize: normalize(13),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.mutedText,
    marginHorizontal: normalize(2),
  },
  pageLoadingSpinner: {
    marginLeft: normalize(4),
  },

  // ── Detail modal ──
  modalWrap: { justifyContent: 'flex-end', margin: 0 },
  detailSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: normalize(24),
    borderTopRightRadius: normalize(24),
    paddingTop: normalize(10),
    paddingHorizontal: normalize(16),
    paddingBottom: normalize(20),
  },
  sheetHandle: {
    width: normalize(36),
    height: normalize(4),
    backgroundColor: Colors.border,
    borderRadius: normalize(2),
    alignSelf: 'center',
    marginBottom: normalize(14),
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: normalize(12),
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  detailOffence: {
    fontSize: normalize(16),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.text,
  },
  detailChallanNo: {
    fontSize: normalize(11),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.primary,
    marginTop: normalize(2),
  },
  detailDate: {
    fontSize: normalize(11),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
    marginTop: normalize(2),
  },

  imageRow: { marginTop: normalize(12) },
  detailImage: {
    width: normalize(140),
    height: normalize(140),
    borderRadius: normalize(10),
    marginRight: normalize(10),
    backgroundColor: Colors.lightgreybg,
  },
  noImageBox: {
    marginTop: normalize(12),
    paddingVertical: normalize(20),
    borderRadius: normalize(10),
    backgroundColor: Colors.lightgreybg2,
    alignItems: 'center',
  },
  noImageText: {
    fontSize: normalize(12),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
  },

  detailFineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.lightgreybg2,
    borderRadius: normalize(10),
    padding: normalize(12),
    marginTop: normalize(14),
  },
  detailFineLabel: {
    fontSize: normalize(12),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
  },
  detailFineValue: {
    fontSize: normalize(18),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.navy,
  },

  detailField: { marginTop: normalize(14) },
  detailFieldLabel: {
    fontSize: normalize(10),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailFieldValue: {
    fontSize: normalize(13),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.text,
    marginTop: normalize(3),
  },
  detailFieldSub: {
    fontSize: normalize(11),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
    marginTop: normalize(1),
  },

  // ── Modal footer buttons ──
  sheetFooter: { marginTop: normalize(18), gap: normalize(10) },
  printBtn: {
    backgroundColor: Colors.primary,
    borderRadius: normalize(10),
    paddingVertical: normalize(14),
    alignItems: 'center',
  },
  printBtnText: {
    fontSize: normalize(14),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.white,
  },
  qrNowBtn: {
    backgroundColor: Colors.navy,
    borderRadius: normalize(10),
    paddingVertical: normalize(14),
    alignItems: 'center',
  },
  qrNowBtnText: {
    fontSize: normalize(14),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.white,
  },
  doneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: normalize(10),
    paddingVertical: normalize(13),
    alignItems: 'center',
  },
  doneBtnSecondary: {
    backgroundColor: Colors.lightgreybg2,
  },
  doneBtnSecondaryFull: {
    backgroundColor: Colors.lightgreybg2,
    borderRadius: normalize(10),
    paddingVertical: normalize(13),
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: normalize(14),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.white,
  },
  doneBtnTextSecondary: {
    color: Colors.text,
    fontSize: normalize(14),
    fontFamily: Fonts.MulishExtraBold,
  },

  // ── QR sheet ──
  qrTitle: {
    fontSize: normalize(16),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.text,
    textAlign: 'center',
  },
  qrSubtitle: {
    fontSize: normalize(12),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
    textAlign: 'center',
    marginTop: normalize(4),
  },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderRadius: normalize(14),
    padding: normalize(20),
    marginTop: normalize(18),
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  qrStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: normalize(8),
    marginTop: normalize(16),
  },
  qrStatusText: {
    fontSize: normalize(12),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.mutedText,
  },
  qrStatusTextWarn: {
    fontSize: normalize(12),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.gold,
    textAlign: 'center',
  },

  // ── Printer picker sheet ──
  printerLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: normalize(8),
    paddingVertical: normalize(20),
  },
  printerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: normalize(12),
    paddingHorizontal: normalize(4),
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    gap: normalize(8),
  },
  printerRowName: {
    fontSize: normalize(13),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.text,
  },
  printerRowMac: {
    fontSize: normalize(11),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
    marginTop: normalize(1),
  },
  printerRowAction: {
    fontSize: normalize(12),
    fontFamily: Fonts.MulishExtraBold,
    color: Colors.primary,
  },

  // ── Fullscreen zoom viewer ──
  zoomModalWrap: { margin: 0 },
  zoomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomImage: { width: '95%', height: '80%' },
  zoomClose: {
    marginTop: normalize(14),
    color: Colors.tintGrey,
    fontFamily: Fonts.MulishMedium,
    fontSize: normalize(13),
  },

  // ── Empty state ──
  emptyState: {
    backgroundColor: Colors.card,
    borderRadius: normalize(16),
    padding: normalize(32),
    alignItems: 'center',
    marginTop: normalize(60),
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  emptyTitle: {
    fontSize: normalize(15),
    fontFamily: Fonts.MulishSemiBold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: normalize(6),
  },
  emptySubtitle: {
    fontSize: normalize(13),
    fontFamily: Fonts.MulishMedium,
    color: Colors.mutedText,
    textAlign: 'center',
  },
});