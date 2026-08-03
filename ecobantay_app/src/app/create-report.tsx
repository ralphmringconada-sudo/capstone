import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Shadow } from 'react-native-shadow-2';
import { useRouter, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import MapView, { Marker, type MapPressEvent, PROVIDER_GOOGLE } from 'react-native-maps';
import { useAuth } from '@/context/AuthContext';
import {
  buildImageLocationText,
  formatReportTimestamp,
  submitReport,
} from '@/services/reportService';
import type { ReportCoordinates, ReportImageMetadata } from '@/types/report';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 72;
const CAROUSEL_WIDTH = SCREEN_WIDTH - CARD_PADDING;
const ITEM_SIZE = 80;
const CENTER_OFFSET = (CAROUSEL_WIDTH - ITEM_SIZE) / 2;
const VALENCIA_CITY = 'Valencia, Negros Oriental';
const DEFAULT_REGION = {
  latitude: 9.3167,
  longitude: 123.245,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

const categories = [
  { id: 'deforestation', name: 'Deforestation', icon: require('@/assets/images/calendar_icon.png') },
  { id: 'forest_fires', name: 'Forest Fires', icon: require('@/assets/images/information_icon.png') },
  { id: 'illegal_logging', name: 'Illegal Logging', icon: require('@/assets/images/warning_icon.png') },
  { id: 'waste_dumping', name: 'Waste Dumping', icon: require('@/assets/images/location_icon.png') },
  { id: 'other', name: 'Other', icon: require('@/assets/images/settings_icon.png') },
];

/**
 * Purpose: Displays visible verification metadata on a captured proof image.
 * How it works: 1) renders capture time and address. 2) adds the fixed city. 3) includes GPS when available.
 * Technologies Used: React, React Native, TypeScript geographic data.
 * Why this implementation: A visible watermark lets reviewers verify when and where evidence was captured.
 */
function WatermarkOverlay({
  timestamp,
  locationInfo,
  coordinates,
}: {
  timestamp: string;
  locationInfo: string;
  coordinates: ReportCoordinates | null;
}) {
  return (
    <View style={styles.watermarkOverlay}>
      <Text style={styles.watermarkText}>{timestamp}</Text>
      <Text style={styles.watermarkText}>{locationInfo}</Text>
      {coordinates ? (
        <Text style={styles.watermarkText}>
          GPS: {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Purpose: Guides a citizen through creating a location-verified environmental report.
 * How it works: 1) selects a category. 2) records GPS/address. 3) captures watermarked evidence. 4) persists the report.
 * Technologies Used: React Native, Expo Router, Expo Location, Expo ImagePicker, Expo ImageManipulator, Google Maps, Firebase.
 * Why this implementation: A single guided workflow binds report details to verifiable field evidence before submission.
 */
export default function CreateReportScreen() {
  const router = useRouter();
  const { user } = useAuth();

  /*
   * Report form state: these values collect the selected place, written narrative,
   * and exact coordinates that become the Firestore report and image metadata.
   */
  const [barangay, setBarangay] = useState('');
  const [locationText, setLocationText] = useState('');
  const [description, setDescription] = useState('');
  const [coordinates, setCoordinates] = useState<ReportCoordinates | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | undefined>();
  /*
   * Evidence state: attachmentUri feeds the watermark preview, stampedImageUri
   * stores the processed upload file, and photoTimestamp records capture time.
   */
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [stampedImageUri, setStampedImageUri] = useState<string | null>(null);
  const [photoTimestamp, setPhotoTimestamp] = useState<string | null>(null);
  /*
   * Workflow state: independent flags prevent duplicate submission, communicate
   * image processing and GPS retrieval, and surface recoverable errors.
   */
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryIndex, setCategoryIndex] = useState(2);
  const currentIndexRef = useRef(2);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollX = useRef(new Animated.Value(2 * ITEM_SIZE)).current;

  /* Carousel initialization: position the category list at the default selection after layout. */
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: 2 * ITEM_SIZE, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  /*
   * Carousel synchronization: translate animated scroll position into a bounded
   * category index so displayed metadata and submitted category remain aligned.
   */
  useEffect(() => {
    const listener = scrollX.addListener(({ value }) => {
      const newIndex = Math.max(0, Math.min(categories.length - 1, Math.round(value / ITEM_SIZE)));
      if (newIndex !== currentIndexRef.current) {
        currentIndexRef.current = newIndex;
        setCategoryIndex(newIndex);
      }
    });
    return () => {
      scrollX.removeListener(listener);
    };
  }, [scrollX]);

  const selectedCategory = categories[categoryIndex];
  const locationInfo = buildImageLocationText(locationText, coordinates ?? { latitude: 0, longitude: 0 });
  const region = coordinates
    ? {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : DEFAULT_REGION;

  /**
   * Purpose: Applies a coordinate selected directly from the map.
   * How it works: 1) reads the press coordinate. 2) updates GPS state. 3) reverse-geocodes the location.
   * Technologies Used: React Native Maps, Expo Location, React state.
   * Why this implementation: Manual map selection supports reporting when device GPS is inaccurate or unavailable.
   */
  const handleMapPress = async (event: MapPressEvent) => {
    const nextCoordinates = event.nativeEvent.coordinate;
    setCoordinates(nextCoordinates);
    setLocationAccuracy(undefined);
    await updateAddressForCoords(nextCoordinates);
  };

  /**
   * Purpose: Converts GPS coordinates into editable human-readable address fields.
   * How it works: 1) calls reverse geocoding. 2) composes available address parts. 3) updates address and barangay.
   * Technologies Used: Expo Location reverse geocoding and React state.
   * Why this implementation: Reviewers need a readable place name while coordinates preserve precise evidence.
   */
  const updateAddressForCoords = async (coords: ReportCoordinates) => {
    try {
      /* Reverse-geocoding API call: request the nearest address for the selected GPS point. */
      const results = await Location.reverseGeocodeAsync(coords);
      if (!results.length) return;

      const place = results[0];
      const streetName = (place.street || '').toString();
      const district = (place.district || place.subregion || place.name || '').toString();
      const city = (place.city || '').toString();
      const region = (place.region || '').toString();
      const addressParts = [streetName, district, city || VALENCIA_CITY, region].filter(Boolean);
      const fullAddress = addressParts.join(', ');

      /*
       * Consequential state update: preserve manually entered values when geocoding
       * lacks data, but populate reliable address and district results when present.
       */
      if (fullAddress) {
        setLocationText(fullAddress);
      }
      if (district && !barangay) {
        setBarangay(district);
      }
    } catch {
      /*
       * Error handling: reverse geocoding is supportive rather than mandatory,
       * so precise coordinates remain valid and the user can type an address.
       */
    }
  };

  /**
   * Purpose: Obtains the reporter's current GPS position for evidence verification.
   * How it works: 1) requests permission. 2) retrieves balanced-accuracy GPS. 3) stores accuracy. 4) resolves the address.
   * Technologies Used: Expo Location permissions and geolocation, React state.
   * Why this implementation: Explicit consent and accuracy metadata make mobile location capture transparent and reviewable.
   */
  const requestLocation = async () => {
    try {
      setLocating(true);
      setError(null);
      /* Permission flow: location access must be granted before any GPS retrieval occurs. */
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Location permission is needed to verify where the report happened.');
        return;
      }

      /* GPS API call: balanced accuracy limits delay and battery use while retaining report-level precision. */
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };

      /*
       * Consequential state update: bind the coordinates and reported accuracy
       * that will later be embedded into image and Firestore metadata.
       */
      setCoordinates(coords);
      setLocationAccuracy(current.coords.accuracy ?? undefined);
      await updateAddressForCoords(coords);
    } catch {
      /* Error handling: report GPS failures without discarding previously entered form data. */
      Alert.alert('Location Error', 'Failed to get your current location. Please try again.');
    } finally {
      setLocating(false);
    }
  };

  /**
   * Purpose: Produces a clear upload image while preserving verification data separately.
   * How it works: 1) stores the capture time for the preview. 2) normalizes the original photo. 3) returns the clear JPEG for upload.
   * Technologies Used: React state and Expo ImageManipulator.
   * Why this implementation: Keeping metadata outside the bitmap avoids Android screenshot color changes while Firestore retains verification details.
   */
  const captureStampedImage = async (imageUri: string, timestamp: string): Promise<string> => {
    /* Convert camera HDR/wide-color data into a standard JPEG before any view capture occurs. */
    const normalized = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 1600 } }],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
    );

    setAttachmentUri(normalized.uri);
    setPhotoTimestamp(timestamp);
    return normalized.uri;
  };

  /**
   * Purpose: Captures a new camera photo and converts it into report evidence.
   * How it works: 1) requires location. 2) requests camera permission. 3) launches capture. 4) stamps and stores the image.
   * Technologies Used: Expo ImagePicker, Expo ImageManipulator, and React state.
   * Why this implementation: Requiring an in-app camera capture after location reduces unverifiable gallery submissions.
   */
  const takePhotoWithCamera = async () => {
    /* Validation: location must be established before evidence is captured and watermarked. */
    if (!coordinates) {
      Alert.alert('Location required', 'Please use your location first before taking a photo.');
      return;
    }

    /* Permission flow: camera access is requested only when the reporter starts image capture. */
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera permission is needed to take a photo.');
      return;
    }

    /* Camera API call: collect a compressed 4:3 image and available EXIF metadata. */
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 1,
      aspect: [4, 3],
      exif: true,
    });

    if (result.canceled) return;

    /*
     * Async image flow: expose processing state, generate one capture timestamp,
     * and store only the completed stamped image as upload-ready evidence.
     */
    try {
      setImageProcessing(true);
      const timestamp = formatReportTimestamp();
      const stampedUri = await captureStampedImage(result.assets[0].uri, timestamp);
      setStampedImageUri(stampedUri);
    } catch (processingError) {
      /* Error handling: clear partial evidence so stale image metadata cannot be submitted. */
      const message =
        processingError instanceof Error
          ? processingError.message
          : 'Failed to process the photo. Please try again.';
      console.error('Proof photo processing failed:', processingError);
      Alert.alert('Image Error', message);
      setAttachmentUri(null);
      setStampedImageUri(null);
      setPhotoTimestamp(null);
    } finally {
      setImageProcessing(false);
    }
  };

  /**
   * Purpose: Removes the current proof image and its associated capture metadata.
   * How it works: 1) clears source URI. 2) clears processed URI. 3) clears capture time.
   * Technologies Used: React state.
   * Why this implementation: Atomic cleanup prevents a replacement image from retaining stale evidence details.
   */
  const clearAttachment = () => {
    setAttachmentUri(null);
    setStampedImageUri(null);
    setPhotoTimestamp(null);
  };

  /**
   * Purpose: Validates report readiness and asks the reporter to classify urgency.
   * How it works: 1) checks authentication and required evidence. 2) displays validation feedback. 3) opens urgency choice.
   * Technologies Used: React Native Alert and React state.
   * Why this implementation: Validation occurs before persistence and urgency remains an explicit user decision.
   */
  const handleSubmit = () => {
    setError(null);

    /* Authentication validation: reports must always have a traceable signed-in owner. */
    if (!user) {
      Alert.alert('Sign in required', 'Please log in before submitting a report.');
      return;
    }

    /*
     * Evidence validation: narrative, GPS, processed image, and capture timestamp
     * must all exist before the submission flow can proceed.
     */
    if (!description.trim() || !coordinates || !stampedImageUri || !photoTimestamp) {
      const message =
        'Please add your location, take a proof photo, and write a description before submitting.';
      setError(message);
      Alert.alert('Missing fields', message);
      return;
    }

    finalizeSubmit();
  };

  /**
   * Purpose: Builds the final evidence payload and persists the report.
   * How it works: 1) guards duplicate work. 2) composes capture metadata. 3) uploads and writes through the service. 4) navigates.
   * Technologies Used: React state, React Native Platform, Expo Router, Firebase Storage, Firebase Firestore.
   * Why this implementation: One final async boundary keeps evidence metadata and persistence status synchronized.
   */
  const finalizeSubmit = async () => {
    if (!user || !coordinates || !stampedImageUri || !photoTimestamp) return;
    if (submittingRef.current || submitting) return;

    submittingRef.current = true;
    try {
      setSubmitting(true);
      setError(null);

      /*
       * Evidence metadata: preserve human-readable and machine-readable time,
       * GPS, platform, barangay, city, and accuracy for later administrative review.
       */
      const imageMetadata: ReportImageMetadata = {
        capturedAt: photoTimestamp,
        capturedAtIso: new Date().toISOString(),
        locationText: locationText || `${barangay}, ${VALENCIA_CITY}`,
        coordinates,
        city: VALENCIA_CITY,
        barangay: barangay.trim() || undefined,
        platform: Platform.OS,
        accuracy: locationAccuracy,
      };

      /*
       * Firebase persistence flow: the service uploads the proof image to Storage
       * before creating the complete report document in Firestore.
       */
      await submitReport({
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        description,
        locationText: locationText || `${barangay}, ${VALENCIA_CITY}`,
        barangay,
        coordinates,
        imageUri: stampedImageUri,
        photoTimestamp,
        imageMetadata,
        user: {
          uid: user.uid,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        },
      });

      Alert.alert('Success', 'Report submitted successfully with timestamped image proof.');
      router.replace('/home');
      // Keep locked after success to block rapid re-submits before navigation finishes.
    } catch (submitError) {
      /* Error handling: retain the completed form and evidence so the reporter can retry. */
      const message =
        submitError instanceof Error ? submitError.message : 'Failed to submit report. Please try again.';
      setError(message);
      Alert.alert('Error', message);
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  /**
   * Purpose: Advances the category carousel by one bounded position.
   * How it works: 1) checks the upper boundary. 2) scrolls to the next item.
   * Technologies Used: React Native ScrollView.
   * Why this implementation: Programmatic snapping matches the carousel's item-based selection model.
   */
  const handleNext = () => {
    if (categoryIndex < categories.length - 1) {
      scrollViewRef.current?.scrollTo({ x: (categoryIndex + 1) * ITEM_SIZE, animated: true });
    }
  };

  /**
   * Purpose: Moves the category carousel to the previous bounded position.
   * How it works: 1) checks the lower boundary. 2) scrolls to the previous item.
   * Technologies Used: React Native ScrollView.
   * Why this implementation: Explicit bounds prevent navigation outside available categories.
   */
  const handlePrev = () => {
    if (categoryIndex > 0) {
      scrollViewRef.current?.scrollTo({ x: (categoryIndex - 1) * ITEM_SIZE, animated: true });
    }
  };

  /**
   * Purpose: Selects a category by tapping its carousel item.
   * How it works: 1) converts the item index to a scroll offset. 2) animates to that position.
   * Technologies Used: React Native ScrollView.
   * Why this implementation: Direct selection and arrow navigation share the same scroll-driven category state.
   */
  const handleCategoryTap = (index: number) => {
    scrollViewRef.current?.scrollTo({ x: index * ITEM_SIZE, animated: true });
  };

  const isBusy = submitting || imageProcessing;

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

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.05)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
            <View style={styles.card}>
              <Text style={styles.sectionTitleCenter}>CATEGORY</Text>

              <View style={styles.carouselContainer}>
                <View style={styles.carouselWrapper}>
                  <Animated.ScrollView
                    ref={scrollViewRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={ITEM_SIZE}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    contentContainerStyle={{ paddingHorizontal: CENTER_OFFSET }}
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                      useNativeDriver: false,
                    })}
                    scrollEventThrottle={16}
                  >
                    {categories.map((cat, index) => {
                      const inputRange = [(index - 1) * ITEM_SIZE, index * ITEM_SIZE, (index + 1) * ITEM_SIZE];
                      const scale = scrollX.interpolate({
                        inputRange,
                        outputRange: [0.7, 1, 0.7],
                        extrapolate: 'clamp',
                      });
                      const borderRadius = scrollX.interpolate({
                        inputRange,
                        outputRange: [16, 32, 16],
                        extrapolate: 'clamp',
                      });
                      const backgroundColor = scrollX.interpolate({
                        inputRange,
                        outputRange: ['#98a58d', '#3f5c2b', '#98a58d'],
                        extrapolate: 'clamp',
                      });
                      const opacity = scrollX.interpolate({
                        inputRange: [
                          (index - 2) * ITEM_SIZE,
                          (index - 1) * ITEM_SIZE,
                          index * ITEM_SIZE,
                          (index + 1) * ITEM_SIZE,
                          (index + 2) * ITEM_SIZE,
                        ],
                        outputRange: [0, 1, 1, 1, 0],
                        extrapolate: 'clamp',
                      });

                      return (
                        <Animated.View key={cat.id} style={[styles.slotContainer, { opacity }]}>
                          <TouchableOpacity activeOpacity={0.9} onPress={() => handleCategoryTap(index)}>
                            <Animated.View
                              style={[styles.slotCircle, { backgroundColor, borderRadius, transform: [{ scale }] }]}
                            >
                              <Image source={cat.icon} style={styles.slotIcon} />
                            </Animated.View>
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })}
                  </Animated.ScrollView>

                  <TouchableOpacity
                    style={styles.arrowLeftAbsolute}
                    onPress={handlePrev}
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  >
                    <Image
                      source={require('@/assets/images/Pointer_Left.png')}
                      style={[styles.arrowIcon, categoryIndex === 0 && styles.arrowDisabled]}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.arrowRightAbsolute}
                    onPress={handleNext}
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  >
                    <Image
                      source={require('@/assets/images/Pointer_Right.png')}
                      style={[styles.arrowIcon, categoryIndex === categories.length - 1 && styles.arrowDisabled]}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.activeCategoryText}>{selectedCategory.name}</Text>
              </View>
            </View>
          </Shadow>

          <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.05)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Image source={require('@/assets/images/location_icon.png')} style={styles.sectionIcon} />
                <Text style={styles.sectionTitle}>Location</Text>
              </View>

              <View style={styles.mapWrapper}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.map}
                  initialRegion={DEFAULT_REGION}
                  region={region}
                  onPress={handleMapPress}
                >
                  {coordinates ? <Marker coordinate={coordinates} /> : null}
                </MapView>
                <View style={styles.mapOverlay}>
                  <Text style={styles.mapOverlayTitle}>{VALENCIA_CITY}</Text>
                  <Text style={styles.mapOverlayText}>
                    {coordinates
                      ? `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`
                      : 'Tap the map or use your location to set the report area'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.locationButton, locating && styles.locationButtonDisabled]}
                onPress={requestLocation}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.locationButtonText}>USE MY LOCATION</Text>
                )}
              </TouchableOpacity>

              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                placeholder="Street / landmark (optional)"
                placeholderTextColor="#a0a0a0"
                value={locationText}
                onChangeText={setLocationText}
              />

              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                placeholder="Barangay in Valencia"
                placeholderTextColor="#a0a0a0"
                value={barangay}
                onChangeText={setBarangay}
              />
            </View>
          </Shadow>

          <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.05)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Image source={require('@/assets/images/information_icon.png')} style={styles.sectionIcon} />
                <Text style={styles.sectionTitle}>Proof Image (Required)</Text>
              </View>

              {attachmentUri ? (
                <View>
                  <View style={styles.attachmentPreview}>
                    <Image
                      source={{ uri: attachmentUri }}
                      style={styles.attachmentImage}
                      resizeMode="cover"
                    />
                    <TouchableOpacity style={styles.clearAttachment} onPress={clearAttachment}>
                      <Image source={require('@/assets/images/back_arrow.png')} style={styles.clearIcon} />
                    </TouchableOpacity>
                  </View>
                  <WatermarkOverlay
                    timestamp={photoTimestamp || 'No timestamp'}
                    locationInfo={locationInfo}
                    coordinates={coordinates}
                  />
                </View>
              ) : null}

              <View style={styles.photoUploadContainer}>
                <Shadow distance={1} startColor={'rgba(0, 0, 0, 0.1)'} offset={[0, 2]} style={{ width: '100%' }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.photoButton, imageProcessing && styles.photoButtonDisabled]}
                    onPress={takePhotoWithCamera}
                    disabled={imageProcessing || isBusy}
                  >
                    <Text style={styles.photoButtonText}>
                      {imageProcessing ? 'PROCESSING PHOTO...' : 'TAKE PHOTO'}
                    </Text>
                  </TouchableOpacity>
                </Shadow>
              </View>

              <Text style={styles.helpText}>
                The photo is stamped with the capture time, Valencia location, and GPS coordinates to help verify the
                report.
              </Text>
            </View>
          </Shadow>

          <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.05)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Image source={require('@/assets/images/information_icon.png')} style={styles.sectionIcon} />
                <Text style={styles.sectionTitle}>Additional Information</Text>
              </View>

              <TextInput
                style={styles.textArea}
                placeholder="Describe what happened"
                placeholderTextColor="#a0a0a0"
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
              />
            </View>
          </Shadow>

          <View style={styles.mainButtonContainer}>
            <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.15)'} offset={[0, 2]} style={{ width: '100%' }}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.submitButton, isBusy && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={isBusy}
              >
                <Text style={styles.submitButtonText}>
                  {submitting ? 'SUBMITTING...' : imageProcessing ? 'PROCESSING IMAGE...' : 'SUBMIT REPORT'}
                </Text>
              </TouchableOpacity>
            </Shadow>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
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
  headerIcon: { width: 24, height: 24, tintColor: '#3B703C' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  cardShadowWrapper: { width: '100%', marginBottom: 20 },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  sectionTitleCenter: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
    marginBottom: 16,
    includeFontPadding: false,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionIcon: { width: 18, height: 18, tintColor: '#000000', marginRight: 8 },
  sectionTitle: { fontFamily: 'Montserrat-Bold', fontSize: 16, color: '#000000', includeFontPadding: false },
  carouselContainer: { width: '100%', alignItems: 'center' },
  carouselWrapper: { width: '100%', height: 70, position: 'relative', justifyContent: 'center' },
  slotContainer: { width: ITEM_SIZE, alignItems: 'center', justifyContent: 'center' },
  slotCircle: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  slotIcon: { width: 32, height: 32, tintColor: '#ffffff' },
  activeCategoryText: {
    marginTop: 12,
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 14,
    color: '#000000',
    textAlign: 'center',
    includeFontPadding: false,
  },
  arrowLeftAbsolute: { position: 'absolute', left: 0, zIndex: 10, elevation: 10 },
  arrowRightAbsolute: { position: 'absolute', right: 0, zIndex: 10, elevation: 10 },
  arrowIcon: { width: 24, height: 24, tintColor: '#a0a0a0' },
  arrowDisabled: { opacity: 0.2 },
  mapWrapper: {
    width: '100%',
    height: 220,
    borderRadius: 6,
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: '#e9ecef',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mapOverlayTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 14,
    color: '#3f5c2b',
    includeFontPadding: false,
  },
  mapOverlayText: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    color: '#666666',
    marginTop: 6,
    includeFontPadding: false,
  },
  locationButton: {
    backgroundColor: '#3B703C',
    borderRadius: 24,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationButtonDisabled: { opacity: 0.7 },
  locationButtonText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 13,
    color: '#ffffff',
    includeFontPadding: false,
  },
  textInput: {
    width: '100%',
    height: 44,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    fontFamily: 'Montserrat-Regular',
    fontSize: 14,
    color: '#333333',
    includeFontPadding: false,
  },
  photoUploadContainer: { width: '100%', marginTop: 8 },
  photoButton: {
    backgroundColor: '#ffffff',
    height: 40,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  photoButtonDisabled: { opacity: 0.6 },
  photoButtonText: { fontFamily: 'Montserrat-Bold', fontSize: 14, color: '#000000', includeFontPadding: false },
  attachmentPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
    backgroundColor: '#d9d9d9',
  },
  attachmentImage: { width: '100%', height: '100%' },
  watermarkOverlay: {
    width: '100%',
    backgroundColor: '#f4f7f2',
    borderWidth: 1,
    borderColor: '#d8e3d4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  watermarkText: {
    color: '#263b28',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Montserrat-Semi-Bold',
    marginBottom: 2,
  },
  clearAttachment: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 16,
    padding: 6,
  },
  clearIcon: { width: 14, height: 14, tintColor: '#ffffff', transform: [{ rotate: '45deg' }] },
  helpText: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
    marginTop: 12,
    fontFamily: 'Montserrat-Regular',
    includeFontPadding: false,
  },
  textArea: {
    width: '100%',
    height: 120,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: 'Montserrat-Regular',
    fontSize: 14,
    color: '#333333',
    includeFontPadding: false,
  },
  mainButtonContainer: { width: '100%', marginTop: 8 },
  submitButton: {
    width: '100%',
    backgroundColor: '#3B703C',
    height: 52,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 18,
    color: '#ffffff',
    letterSpacing: 1,
    includeFontPadding: false,
  },
  errorContainer: {
    backgroundColor: '#FFE6E6',
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF4444',
  },
  errorText: { color: '#FF4444', fontSize: 14, textAlign: 'center', fontFamily: 'Montserrat-Regular' },
});
