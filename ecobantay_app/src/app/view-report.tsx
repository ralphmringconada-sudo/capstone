import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Image,
  ScrollView,
  Dimensions,
  Platform,
  Animated,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Shadow } from 'react-native-shadow-2';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { deleteUserReport, fetchReportById } from '@/services/reportService';
import { attachDisplayImages } from '@/services/reportImageService';
import { useAuth } from '@/context/AuthContext';
import { getReportStatusColors } from '@/utils/reportStatus';
import type { EcoReport } from '@/types/report';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const REPORT_MAP_ZOOM = {
  latitudeDelta: 0.003,
  longitudeDelta: 0.003,
};

function getReportMapRegion(coordinates: { latitude: number; longitude: number }) {
  return {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    ...REPORT_MAP_ZOOM,
  };
}

/**
 * Purpose: Formats a stored report timestamp for detailed display.
 * How it works: 1) parses the ISO value. 2) preserves invalid input. 3) renders date and 12-hour time.
 * Technologies Used: JavaScript Date internationalization and TypeScript.
 * Why this implementation: Defensive formatting supports readable evidence dates without hiding malformed legacy values.
 */
function formatDisplayDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Purpose: Presents one owned report with location, evidence images, status, and management actions.
 * How it works: 1) loads the user-scoped report. 2) resolves images. 3) renders map/details. 4) supports edit or deletion.
 * Technologies Used: React Native, Expo Router, React Native Maps, Firebase Firestore, React Native Animated.
 * Why this implementation: Combining evidence and management controls gives reporters one complete audit view.
 */
export default function ViewReportScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();

  const scrollX = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollViewWidth, setScrollViewWidth] = useState(0);
  /*
   * Report workflow state: report holds the owned Firestore document and resolved
   * images; loading, viewer, and deletion state coordinate async and modal feedback.
   */
  const [report, setReport] = useState<(EcoReport & { displayImages: string[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /*
   * Firestore read lifecycle: retrieve only the route-selected, user-owned report,
   * then normalize image references before releasing the loading state.
   */
  useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }

    /* Async report flow: combine the Firestore document with display-ready image references. */
    (async () => {
      try {
        const item = await fetchReportById(String(id), user?.uid);
        if (!item) {
          setReport(null);
          return;
        }
        setReport(await attachDisplayImages(item));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id, user?.uid]);

  const reportPhotos = report?.displayImages?.length
    ? report.displayImages.map((uri, index) => ({ id: String(index), uri }))
    : [];

  const thumbWidth =
    contentWidth > 0 && scrollViewWidth > 0
      ? Math.max((scrollViewWidth / contentWidth) * trackWidth, 40)
      : 40;

  const maxTravel = Math.max(trackWidth - thumbWidth, 0);
  const maxScroll = Math.max(contentWidth - scrollViewWidth, 1);

  const scrollBarTranslate = scrollX.interpolate({
    inputRange: [0, maxScroll],
    outputRange: [0, maxTravel],
    extrapolate: 'clamp',
  });

  /**
   * Purpose: Confirms and deletes the currently displayed report.
   * How it works: 1) validates report/user state. 2) asks destructive confirmation. 3) deletes Firestore. 4) navigates home.
   * Technologies Used: React Native Alert, Firebase Firestore, React state, Expo Router.
   * Why this implementation: Explicit confirmation and service-level ownership checks protect against accidental deletion.
   */
  const handleDelete = () => {
    if (!report || !user?.uid) return;
    Alert.alert('Delete Report', 'Are you sure you want to delete this report?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          /* Async Firestore flow: expose deletion state until the owned document is removed or fails. */
          try {
            setIsDeleting(true);
            await deleteUserReport(report.id, user.uid);
            Alert.alert('Deleted', 'Your report was deleted.');
            router.replace('/home');
          } catch (err) {
            /* Error handling: keep the report visible when deletion does not complete. */
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete report.');
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3f5c2b" />
        </View>
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>Report not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#9FC37F" />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Image source={require('@/assets/images/back_arrow.png')} style={styles.backArrowImage} resizeMode="contain" />
        </TouchableOpacity>
        <Image source={require('@/assets/images/Ecobantay_Logo_2.png')} style={styles.brandImage} resizeMode="contain" />
        <TouchableOpacity activeOpacity={0.7} style={styles.settingsButton} onPress={() => router.navigate('/profile')}>
          <Image source={require('@/assets/images/settings_icon.png')} style={styles.headerIcon} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.05)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
          <View style={styles.card}>
            {report.coordinates ? (
              <View style={styles.reportMapSection}>
                <View style={styles.reportMapContainer}>
                  <MapView
                    provider={PROVIDER_GOOGLE}
                    style={styles.reportMap}
                    initialRegion={getReportMapRegion(report.coordinates)}
                    scrollEnabled
                    zoomEnabled
                    zoomTapEnabled
                    zoomControlEnabled={Platform.OS === 'android'}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    minZoomLevel={12}
                    maxZoomLevel={20}
                    showsCompass={false}
                    toolbarEnabled={false}
                    mapType="standard"
                  >
                    <Marker
                      coordinate={report.coordinates}
                      title={report.city || 'Report location'}
                      description={report.location}
                    />
                  </MapView>
                </View>
                <Text style={styles.mapHintText}>Pinch or use +/- to zoom the map</Text>
              </View>
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.mapPinText}>Location coordinates unavailable</Text>
              </View>
            )}

            {reportPhotos.length > 0 ? (
              <View style={styles.photoCarouselContainer}>
                <Animated.ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoScrollContent}
                  onLayout={(e) => setScrollViewWidth(e.nativeEvent.layout.width)}
                  onContentSizeChange={(w) => setContentWidth(w)}
                  onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                    useNativeDriver: false,
                  })}
                  scrollEventThrottle={16}
                >
                  {reportPhotos.map((photo, index) => (
                    <TouchableOpacity
                      key={photo.id}
                      activeOpacity={0.85}
                      onPress={() => setViewerUri(photo.uri)}
                      style={[styles.photoWrapper, index === reportPhotos.length - 1 && { marginRight: 0 }]}
                    >
                      <Image source={{ uri: photo.uri }} style={styles.reportPhoto} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </Animated.ScrollView>

                {reportPhotos.length > 1 ? (
                  <View style={styles.scrollIndicatorContainer}>
                    <View style={styles.scrollIndicatorTrack} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
                      <Animated.View
                        style={[
                          styles.scrollIndicatorBar,
                          {
                            width: thumbWidth,
                            transform: [{ translateX: scrollBarTranslate }],
                          },
                        ]}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
            {reportPhotos.length > 0 ? <EvidenceMetadata report={report} /> : null}
          </View>
        </Shadow>

        <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.05)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
          <View style={styles.detailsCard}>
            <Text style={styles.reportTitle}>{report.title}</Text>
            <Text style={styles.reportTimestamp}>{formatDisplayDate(report.createdAt)}</Text>
            <Text style={styles.reportAddress}>{report.location}</Text>
            {report.imageTimestamp ? (
              <Text style={styles.metaText}>Photo captured: {report.imageTimestamp}</Text>
            ) : null}
            {report.imageLocation ? <Text style={styles.metaText}>{report.imageLocation}</Text> : null}
            <View style={[styles.statusBadge, getReportStatusColors(report.status)]}>
              <Text style={[styles.statusBadgeText, { color: getReportStatusColors(report.status).color }]}>
                {report.status}
              </Text>
            </View>
          </View>
        </Shadow>

        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionText}>{report.description}</Text>
        </View>

        <View style={styles.actionButtonsContainer}>
          <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.15)'} offset={[0, 2]} style={{ width: '100%', marginBottom: 16 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.actionButton, styles.editButton]}
              onPress={() =>
                router.navigate({
                  pathname: '/edit-report',
                  params: { id: id ?? '' },
                })
              }
            >
              <Text style={styles.actionButtonText}>EDIT DESCRIPTION</Text>
            </TouchableOpacity>
          </Shadow>

          <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.15)'} offset={[0, 2]} style={{ width: '100%' }}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.actionButton, styles.deleteButton]}
              onPress={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>DELETE REPORT</Text>
              )}
            </TouchableOpacity>
          </Shadow>
        </View>
      </ScrollView>

      <Modal visible={Boolean(viewerUri)} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Text style={styles.viewerCloseText}>Close</Text>
          </TouchableOpacity>
          {viewerUri ? (
            <View style={styles.viewerContent}>
              <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />
              <EvidenceMetadata report={report} />
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Displays the verification information stored with a report directly below its evidence image.
 */
function EvidenceMetadata({ report }: { report: EcoReport }) {
  return (
    <View style={styles.evidenceMetadata}>
      <Text style={styles.evidenceMetadataText}>
        Captured: {report.imageTimestamp || 'Not recorded'}
      </Text>
      <Text style={styles.evidenceMetadataText}>
        {report.imageLocation || report.location}
      </Text>
      {report.coordinates ? (
        <Text style={styles.evidenceMetadataText}>
          GPS: {report.coordinates.latitude.toFixed(6)}, {report.coordinates.longitude.toFixed(6)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Montserrat-Semi-Bold', fontSize: 14, color: '#808080' },
  topHeader: {
    backgroundColor: '#E1F0B9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    paddingTop: Platform.select({ android: 30, ios: 8, default: 0 }),
  },
  backButton: { padding: 8, marginLeft: -8 },
  backArrowImage: { width: 24, height: 24, tintColor: '#3f5c2b' },
  brandImage: { width: 130, height: 32 },
  settingsButton: { padding: 8, marginRight: -8 },
  headerIcon: { width: 24, height: 24, tintColor: '#3f5c2b' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  cardShadowWrapper: { width: '100%', marginBottom: 16 },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  mapPlaceholder: {
    width: '100%',
    minHeight: 120,
    backgroundColor: '#e9ecef',
    borderRadius: 6,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  reportMapSection: {
    width: '100%',
    marginBottom: 16,
  },
  reportMapContainer: {
    width: '100%',
    height: 220,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#e9ecef',
  },
  reportMap: { width: '100%', height: '100%' },
  mapHintText: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 10,
    color: '#666666',
    textAlign: 'center',
    marginTop: 6,
    includeFontPadding: false,
  },
  mapPinIcon: { width: 24, height: 24, tintColor: '#e74c3c', marginTop: 8 },
  mapPinText: { fontFamily: 'Montserrat-Semi-Bold', fontSize: 14, color: '#e74c3c', includeFontPadding: false },
  coordsText: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 11,
    color: '#666666',
    marginTop: 6,
    textAlign: 'center',
  },
  photoCarouselContainer: { width: '100%' },
  photoScrollContent: { paddingBottom: 12 },
  photoWrapper: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#d9d9d9',
  },
  reportPhoto: { width: '100%', height: '100%' },
  scrollIndicatorContainer: { alignItems: 'center', width: '100%', marginTop: 8, marginBottom: 4 },
  scrollIndicatorTrack: {
    width: '95%',
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  scrollIndicatorBar: { height: '100%', backgroundColor: '#a0a0a0', borderRadius: 3 },
  evidenceMetadata: {
    width: '100%',
    backgroundColor: '#f4f7f2',
    borderWidth: 1,
    borderColor: '#d8e3d4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  evidenceMetadataText: {
    color: '#263b28',
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 11,
    lineHeight: 16,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  reportTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 18,
    color: '#333333',
    marginBottom: 8,
    includeFontPadding: false,
  },
  reportTimestamp: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 16,
    color: '#333333',
    marginBottom: 12,
    includeFontPadding: false,
  },
  reportAddress: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    color: '#000000',
    includeFontPadding: false,
    lineHeight: 18,
  },
  metaText: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 11,
    color: '#666666',
    marginTop: 6,
    includeFontPadding: false,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    marginTop: 10,
  },
  statusBadgeText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    includeFontPadding: false,
  },
  descriptionContainer: { paddingHorizontal: 4, marginBottom: 32 },
  descriptionText: { fontFamily: 'Montserrat-Regular', fontSize: 16, color: '#333333', lineHeight: 24 },
  actionButtonsContainer: { width: '100%', marginTop: 8 },
  actionButton: {
    width: '100%',
    height: 52,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: { backgroundColor: '#3B703C' },
  deleteButton: { backgroundColor: '#e74c3c' },
  actionButtonText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
    color: '#ffffff',
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    right: 24,
    zIndex: 2,
    padding: 8,
  },
  viewerCloseText: { color: '#fff', fontFamily: 'Montserrat-Bold', fontSize: 16 },
  viewerContent: { width: SCREEN_WIDTH * 0.92, alignItems: 'center' },
  viewerImage: { width: '100%', height: SCREEN_HEIGHT * 0.65 },
});
