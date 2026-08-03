import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Shadow } from 'react-native-shadow-2';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker, type MapPressEvent, PROVIDER_GOOGLE } from 'react-native-maps';
import { useAuth } from '@/context/AuthContext';
import { submitEvent } from '@/services/eventService';
import type { EventCoordinates } from '@/types/event';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 72;
const ITEM_SIZE = 80;
const CENTER_OFFSET = (SCREEN_WIDTH - CARD_PADDING - ITEM_SIZE) / 2;
const VALENCIA_CITY = 'Valencia, Negros Oriental';
const DEFAULT_REGION = {
  latitude: 9.2805,
  longitude: 123.2431,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

const categories = [
  { name: 'Clean-up', icon: require('@/assets/images/calendar_icon.png') },
  { name: 'Tree Planting', icon: require('@/assets/images/information_icon.png') },
  { name: 'Seminar', icon: require('@/assets/images/warning_icon.png') },
  { name: 'Rehabilitation', icon: require('@/assets/images/location_icon.png') },
  { name: 'Collection', icon: require('@/assets/images/settings_icon.png') },
];

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDisplayTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function CreateEventScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [barangay, setBarangay] = useState('');
  const [locationText, setLocationText] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('50');
  const [coordinates, setCoordinates] = useState<EventCoordinates | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState(new Date());
  const [eventTime, setEventTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryIndex, setCategoryIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: 0, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({});
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setCoordinates(next);
      await updateAddressForCoords(next);
    })().catch(() => undefined);
  }, []);

  const region = coordinates
    ? {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : DEFAULT_REGION;

  const updateAddressForCoords = async (coords: EventCoordinates) => {
    try {
      const results = await Location.reverseGeocodeAsync(coords);
      if (!results.length) return;
      const place = results[0];
      const district = (place.district || place.subregion || place.name || '').toString();
      const parts = [
        place.street,
        district,
        place.city || VALENCIA_CITY,
        place.region,
      ].filter(Boolean);
      if (parts.length) setLocationText(parts.join(', '));
      if (district && !barangay) setBarangay(district);
    } catch {
      /* keep manual address fields */
    }
  };

  const handleMapPress = async (event: MapPressEvent) => {
    const next = event.nativeEvent.coordinate;
    setCoordinates(next);
    await updateAddressForCoords(next);
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach an event image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to create an event.');
      return;
    }
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }
    if (!coordinates) {
      setError('Please set the event location on the map.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const eventId = await submitEvent({
        title,
        description,
        category: categories[categoryIndex].name,
        date: formatDisplayDate(eventDate),
        time: formatDisplayTime(eventTime),
        location: locationText,
        barangay,
        capacity: Number(capacity) || 50,
        coordinates,
        imageUri,
        user: {
          uid: user.uid,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
        },
      });
      Alert.alert(
        'Submitted for approval',
        'Your event is Pending. Other users will see it after an admin accepts it.',
        [
          {
            text: 'OK',
            onPress: () =>
              router.replace({
                pathname: '/view-event',
                params: { id: eventId },
              }),
          },
        ],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#9FC37F" />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Image
            source={require('@/assets/images/back_arrow.png')}
            style={styles.backArrowImage}
            resizeMode="contain"
          />
        </TouchableOpacity>
        <Image
          source={require('@/assets/images/Ecobantay_Logo_2.png')}
          style={styles.brandImage}
          resizeMode="contain"
        />
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.settingsButton}
          onPress={() => router.push('/profile')}
        >
          <Image source={require('@/assets/images/settings_icon.png')} style={styles.headerIcon} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Shadow
            distance={2}
            startColor={'rgba(0, 0, 0, 0.05)'}
            offset={[0, 2]}
            style={styles.cardShadowWrapper}
          >
            <View style={styles.card}>
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
                    onScroll={Animated.event(
                      [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                      { useNativeDriver: false },
                    )}
                    scrollEventThrottle={16}
                  >
                    {categories.map((cat, index) => {
                      const inputRange = [
                        (index - 1) * ITEM_SIZE,
                        index * ITEM_SIZE,
                        (index + 1) * ITEM_SIZE,
                      ];
                      const scale = scrollX.interpolate({
                        inputRange,
                        outputRange: [0.7, 1.1, 0.7],
                        extrapolate: 'clamp',
                      });
                      const borderRadius = scrollX.interpolate({
                        inputRange,
                        outputRange: [32, 6, 32],
                        extrapolate: 'clamp',
                      });
                      const backgroundColor = scrollX.interpolate({
                        inputRange,
                        outputRange: ['#9db0a6', '#2d5a52', '#9db0a6'],
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
                        <Animated.View key={cat.name} style={[styles.slotContainer, { opacity }]}>
                          <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() =>
                              scrollViewRef.current?.scrollTo({
                                x: index * ITEM_SIZE,
                                animated: true,
                              })
                            }
                          >
                            <Animated.View
                              style={[
                                styles.slotCircle,
                                { backgroundColor, borderRadius, transform: [{ scale }] },
                              ]}
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
                    onPress={() => {
                      if (categoryIndex > 0) {
                        scrollViewRef.current?.scrollTo({
                          x: (categoryIndex - 1) * ITEM_SIZE,
                          animated: true,
                        });
                      }
                    }}
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  >
                    <Image
                      source={require('@/assets/images/Pointer_Left.png')}
                      style={[styles.arrowIcon, categoryIndex === 0 && styles.arrowDisabled]}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.arrowRightAbsolute}
                    onPress={() => {
                      if (categoryIndex < categories.length - 1) {
                        scrollViewRef.current?.scrollTo({
                          x: (categoryIndex + 1) * ITEM_SIZE,
                          animated: true,
                        });
                      }
                    }}
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  >
                    <Image
                      source={require('@/assets/images/Pointer_Right.png')}
                      style={[
                        styles.arrowIcon,
                        categoryIndex === categories.length - 1 && styles.arrowDisabled,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.activeCategoryText}>{categories[categoryIndex].name}</Text>
              </View>
            </View>
          </Shadow>

          <Shadow
            distance={2}
            startColor={'rgba(0, 0, 0, 0.05)'}
            offset={[0, 2]}
            style={styles.cardShadowWrapper}
          >
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Image
                  source={require('@/assets/images/location_icon.png')}
                  style={styles.sectionIcon}
                />
                <Text style={styles.sectionTitle}>Location</Text>
              </View>

              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  provider={PROVIDER_GOOGLE}
                  region={region}
                  onPress={handleMapPress}
                >
                  {coordinates ? <Marker coordinate={coordinates} /> : null}
                </MapView>
              </View>

              <TextInput
                style={styles.textInput}
                placeholder="Barangay"
                placeholderTextColor="#a0a0a0"
                value={barangay}
                onChangeText={setBarangay}
              />
              <TextInput
                style={[styles.textInput, { marginTop: 10 }]}
                placeholder="Full address / landmark"
                placeholderTextColor="#a0a0a0"
                value={locationText}
                onChangeText={setLocationText}
              />
            </View>
          </Shadow>

          <View style={styles.photoUploadRow}>
            <Shadow distance={1} startColor={'rgba(0, 0, 0, 0.1)'} offset={[0, 2]}>
              <TouchableOpacity activeOpacity={0.8} style={styles.photoButton} onPress={handlePickPhoto}>
                <Text style={styles.photoButtonText}>
                  {imageUri ? 'CHANGE PHOTO' : 'SUBMIT PHOTO'}
                </Text>
              </TouchableOpacity>
            </Shadow>
            <View style={styles.photoBadgeWrapper}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.photoPreview} />
              ) : (
                <>
                  <View style={styles.photoStackIconBase} />
                  <View style={styles.photoStackIconTop} />
                </>
              )}
              <View style={styles.badgeCircle}>
                <Text style={styles.badgeText}>{imageUri ? '1' : '0'}</Text>
              </View>
            </View>
          </View>

          <Shadow
            distance={2}
            startColor={'rgba(0, 0, 0, 0.05)'}
            offset={[0, 2]}
            style={styles.cardShadowWrapper}
          >
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Image
                  source={require('@/assets/images/information_icon.png')}
                  style={styles.sectionIcon}
                />
                <Text style={styles.sectionTitle}>Details</Text>
              </View>

              <TextInput
                style={[styles.textInput, styles.titleInput]}
                placeholder="Title"
                placeholderTextColor="#a0a0a0"
                value={title}
                onChangeText={setTitle}
              />

              <View style={styles.dateTimeRow}>
                <TouchableOpacity
                  style={styles.pill}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pillText}>{formatDisplayDate(eventDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pill}
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pillText}>{formatDisplayTime(eventTime)}</Text>
                </TouchableOpacity>
              </View>

              {showDatePicker ? (
                <DateTimePicker
                  value={eventDate}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={(_, date) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (date) setEventDate(date);
                  }}
                />
              ) : null}
              {showTimePicker ? (
                <DateTimePicker
                  value={eventTime}
                  mode="time"
                  onChange={(_, date) => {
                    setShowTimePicker(Platform.OS === 'ios');
                    if (date) setEventTime(date);
                  }}
                />
              ) : null}

              <TextInput
                style={[styles.textInput, { marginBottom: 12 }]}
                placeholder="Max participants"
                placeholderTextColor="#a0a0a0"
                keyboardType="number-pad"
                value={capacity}
                onChangeText={setCapacity}
              />

              <TextInput
                style={styles.textArea}
                placeholder="Description"
                placeholderTextColor="#a0a0a0"
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
              />
            </View>
          </Shadow>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.mainButtonContainer}>
            <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.15)'} offset={[0, 2]} style={{ width: '100%' }}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.submitButton, submitting && styles.submitDisabled]}
                onPress={handleCreate}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitButtonText}>CREATE EVENT</Text>
                )}
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
  backArrowImage: { width: 24, height: 24, tintColor: '#194f24' },
  brandImage: { width: 130, height: 32 },
  settingsButton: { padding: 8, marginRight: -8 },
  headerIcon: { width: 24, height: 24, tintColor: '#194f24' },
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionIcon: { width: 18, height: 18, tintColor: '#000000', marginRight: 8 },
  sectionTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
    color: '#000000',
    includeFontPadding: false,
  },
  carouselContainer: { width: '100%', alignItems: 'center', paddingTop: 10 },
  carouselWrapper: { width: '100%', height: 70, position: 'relative', justifyContent: 'center' },
  slotContainer: { width: ITEM_SIZE, alignItems: 'center', justifyContent: 'center' },
  slotCircle: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  slotIcon: { width: 32, height: 32, tintColor: '#ffffff' },
  activeCategoryText: {
    marginTop: 16,
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    color: '#000000',
    textAlign: 'center',
    includeFontPadding: false,
  },
  arrowLeftAbsolute: { position: 'absolute', left: 0, zIndex: 10, elevation: 10 },
  arrowRightAbsolute: { position: 'absolute', right: 0, zIndex: 10, elevation: 10 },
  arrowIcon: { width: 24, height: 24, tintColor: '#4a5948' },
  arrowDisabled: { opacity: 0.2 },
  mapContainer: {
    width: '100%',
    height: 160,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  map: { width: '100%', height: '100%' },
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
  photoUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingRight: 40,
  },
  photoButton: {
    backgroundColor: '#ffffff',
    height: 40,
    width: 200,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  photoButtonText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 14,
    color: '#000000',
    includeFontPadding: false,
  },
  photoBadgeWrapper: {
    position: 'relative',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreview: { width: 36, height: 36, borderRadius: 6 },
  photoStackIconBase: {
    position: 'absolute',
    width: 30,
    height: 24,
    backgroundColor: '#b5c0b8',
    borderRadius: 4,
    transform: [{ rotate: '-10deg' }],
  },
  photoStackIconTop: {
    position: 'absolute',
    width: 30,
    height: 24,
    backgroundColor: '#d1dbd4',
    borderRadius: 4,
    transform: [{ rotate: '5deg' }],
  },
  badgeCircle: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: '#000000',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#f8f9fa',
  },
  badgeText: { color: '#ffffff', fontSize: 10, fontFamily: 'Montserrat-Bold' },
  titleInput: { marginBottom: 12 },
  dateTimeRow: { flexDirection: 'row', marginBottom: 12 },
  pill: {
    backgroundColor: '#eef2f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  pillText: { fontFamily: 'Montserrat-Medium', fontSize: 12, color: '#000000' },
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
  errorText: {
    color: '#c62828',
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  mainButtonContainer: { width: '100%', marginTop: 8 },
  submitButton: {
    width: '100%',
    backgroundColor: '#375e55',
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitButtonText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 18,
    color: '#ffffff',
    letterSpacing: 1,
    includeFontPadding: false,
  },
});
