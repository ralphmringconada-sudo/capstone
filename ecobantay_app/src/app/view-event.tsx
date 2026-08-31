import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Shadow } from 'react-native-shadow-2';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useAuth } from '@/context/AuthContext';
import {
  deleteUserEvent,
  fetchEventById,
  fetchEventParticipants,
  hasJoinedEvent,
  joinEvent,
  leaveEvent,
} from '@/services/eventService';
import {
  getEventStatusColors,
  getUserFacingEventStatus,
} from '@/utils/eventStatus';
import type { EcoEvent, EventParticipant } from '@/types/event';

const DEFAULT_COORDS = { latitude: 9.2805, longitude: 123.2431 };

export default function ViewEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();

  const scrollX = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollViewWidth, setScrollViewWidth] = useState(0);

  const [event, setEvent] = useState<EcoEvent | null>(null);
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);

  const loadEvent = async () => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    try {
      const item = await fetchEventById(String(id));
      setEvent(item);
      if (item) {
        setParticipants(await fetchEventParticipants(item.id));
      } else {
        setParticipants([]);
      }
      if (item && user?.uid) {
        setJoined(await hasJoinedEvent(item.id, user.uid));
      } else {
        setJoined(false);
      }
    } catch {
      setEvent(null);
      setParticipants([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadEvent();
  }, [id, user?.uid]);

  const isOwner = !!(event && user?.uid && event.submittedByUid === user.uid);
  // Removed the 'Pending' status restriction so the owner can always edit/delete
  const canEdit = isOwner;
  const canJoin =
    !!event &&
    !isOwner &&
    (event.status === 'Upcoming' || event.status === 'Ongoing') &&
    !!user?.uid;
  const facingStatus = event ? getUserFacingEventStatus(event.status) : '';
  const statusColors = getEventStatusColors(facingStatus);
  const photos =
    event?.images?.length
      ? event.images.map((uri, index) => ({ id: String(index), uri }))
      : event?.imageUrl
        ? [{ id: '1', uri: event.imageUrl }]
        : [];
  const coords = event?.coordinates || DEFAULT_COORDS;

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

  const handleDelete = () => {
    if (!event || !user?.uid) return;
    Alert.alert('Delete Event', 'Are you sure you want to delete this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsActing(true);
            await deleteUserEvent(event.id, user.uid);
            Alert.alert('Deleted', 'Your event was deleted.');
            router.replace('/home');
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete event.');
          } finally {
            setIsActing(false);
          }
        },
      },
    ]);
  };

  const handleJoinToggle = async () => {
    if (!event || !user?.uid) return;
    setIsActing(true);
    try {
      if (joined) {
        await leaveEvent(event.id, user.uid);
        setJoined(false);
        setEvent({ ...event, participants: Math.max(0, event.participants - 1) });
        Alert.alert('Left event', 'You are no longer joined to this event.');
      } else {
        await joinEvent(event.id, {
          uid: user.uid,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
        });
        setJoined(true);
        setEvent({ ...event, participants: event.participants + 1 });
        Alert.alert('Joined', 'You successfully joined this event.');
      }
      setParticipants(await fetchEventParticipants(event.id));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not update join status.');
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#375e55" />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Event not found.</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.linkText}>Go back</Text>
          </TouchableOpacity>
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Shadow
          distance={2}
          startColor={'rgba(0, 0, 0, 0.05)'}
          offset={[0, 2]}
          style={styles.cardShadowWrapper}
        >
          <View style={styles.card}>
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                region={{
                  ...coords,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker coordinate={coords} />
              </MapView>
            </View>

            {photos.length > 0 ? (
              <View style={styles.photoCarouselContainer}>
                <Animated.ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoScrollContent}
                  onLayout={(e) => setScrollViewWidth(e.nativeEvent.layout.width)}
                  onContentSizeChange={(w) => setContentWidth(w)}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false },
                  )}
                  scrollEventThrottle={16}
                >
                  {photos.map((photo, index) => (
                    <View
                      key={photo.id}
                      style={[
                        styles.photoWrapper,
                        index === photos.length - 1 && { marginRight: 0 },
                      ]}
                    >
                      <Image source={{ uri: photo.uri }} style={styles.eventPhoto} resizeMode="cover" />
                    </View>
                  ))}
                </Animated.ScrollView>
                <View style={styles.scrollIndicatorContainer}>
                  <View
                    style={styles.scrollIndicatorTrack}
                    onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                  >
                    <Animated.View
                      style={[
                        styles.scrollIndicatorBar,
                        { width: thumbWidth, transform: [{ translateX: scrollBarTranslate }] },
                      ]}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </Shadow>

        <Shadow
          distance={2}
          startColor={'rgba(0, 0, 0, 0.05)'}
          offset={[0, 2]}
          style={styles.cardShadowWrapper}
        >
          <View style={styles.detailsCard}>
            <View style={[styles.statusBadge, { backgroundColor: statusColors.backgroundColor }]}>
              <Text style={[styles.statusBadgeText, { color: statusColors.color }]}>
                {facingStatus}
              </Text>
            </View>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.eventCategory}>{event.category}</Text>
            <Text style={styles.eventTimestamp}>
              {event.time} · {event.date}
            </Text>
            <Text style={styles.eventAddress}>{event.location}</Text>
            <Text style={styles.participantsText}>
              {event.participants}/{event.capacity} participants
            </Text>
            <View style={styles.participantList}>
              <Text style={styles.participantListTitle}>Participants</Text>
              {participants.length === 0 ? (
                <Text style={styles.participantEmpty}>No one has joined yet.</Text>
              ) : (
                participants.map((person) => (
                  <View key={person.uid} style={styles.participantRow}>
                    <Text style={styles.participantName}>{person.name}</Text>
                    <Text style={styles.participantEmail}>{person.email || 'No email'}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </Shadow>

        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionText}>{event.description}</Text>
        </View>

        <View style={styles.actionButtonsContainer}>
          {canJoin ? (
            <Shadow
              distance={2}
              startColor={'rgba(0, 0, 0, 0.15)'}
              offset={[0, 2]}
              style={{ width: '100%', marginBottom: 16 }}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.actionButton, joined ? styles.leaveButton : styles.joinButton]}
                onPress={handleJoinToggle}
                disabled={isActing}
              >
                {isActing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>
                    {joined ? 'LEAVE EVENT' : 'JOIN EVENT'}
                  </Text>
                )}
              </TouchableOpacity>
            </Shadow>
          ) : null}

          {canEdit ? (
            <>
              <Shadow
                distance={2}
                startColor={'rgba(0, 0, 0, 0.15)'}
                offset={[0, 2]}
                style={{ width: '100%', marginBottom: 16 }}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.actionButton, styles.editButton]}
                  onPress={() =>
                    router.push({
                      pathname: '/edit-event',
                      params: { id: event.id },
                    })
                  }
                >
                  <Text style={styles.actionButtonText}>EDIT EVENT</Text>
                </TouchableOpacity>
              </Shadow>

              <Shadow
                distance={2}
                startColor={'rgba(0, 0, 0, 0.15)'}
                offset={[0, 2]}
                style={{ width: '100%' }}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={handleDelete}
                  disabled={isActing}
                >
                  <Text style={styles.actionButtonText}>DELETE EVENT</Text>
                </TouchableOpacity>
              </Shadow>
            </>
          ) : null}

          {isOwner && event.status === 'Pending' ? (
            <Text style={styles.pendingHint}>
              Waiting for admin approval. Other users cannot see this event yet.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 16,
    color: '#555',
    marginBottom: 12,
  },
  linkText: {
    fontFamily: 'Montserrat-Bold',
    color: '#375e55',
    textDecorationLine: 'underline',
  },
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
  cardShadowWrapper: { width: '100%', marginBottom: 16 },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  mapContainer: {
    width: '100%',
    height: 160,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 16,
  },
  map: { width: '100%', height: '100%' },
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
  eventPhoto: { width: '100%', height: '100%' },
  scrollIndicatorContainer: { alignItems: 'center', width: '100%', marginTop: 8, marginBottom: 4 },
  scrollIndicatorTrack: {
    width: '95%',
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scrollIndicatorBar: { height: '100%', backgroundColor: '#a0a0a0', borderRadius: 3 },
  detailsCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 10,
  },
  statusBadgeText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 11,
    includeFontPadding: false,
  },
  eventTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 18,
    color: '#333333',
    marginBottom: 4,
    includeFontPadding: false,
  },
  eventCategory: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 13,
    color: '#375e55',
    marginBottom: 8,
  },
  eventTimestamp: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 16,
    color: '#333333',
    marginBottom: 12,
    includeFontPadding: false,
  },
  eventAddress: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    color: '#000000',
    includeFontPadding: false,
    lineHeight: 18,
    marginBottom: 8,
  },
  participantsText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 13,
    color: '#3f5c2b',
    marginTop: 8,
  },
  participantList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e6e6e6',
    paddingTop: 10,
  },
  participantListTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 14,
    color: '#111',
    marginBottom: 8,
  },
  participantEmpty: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    color: '#777',
  },
  participantRow: {
    marginBottom: 8,
  },
  participantName: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 13,
    color: '#222',
  },
  participantEmail: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 11,
    color: '#666',
  },
  descriptionContainer: { paddingHorizontal: 4, marginBottom: 32 },
  descriptionText: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 16,
    color: '#333333',
    lineHeight: 24,
  },
  actionButtonsContainer: { width: '100%', marginTop: 8 },
  // Updated actionButton style to match the asymmetrical borders of ViewReportScreen
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
  joinButton: { backgroundColor: '#375e55' },
  leaveButton: { backgroundColor: '#6b7c74' },
  editButton: { backgroundColor: '#3B703C' },
  deleteButton: { backgroundColor: '#e74c3c' },
  actionButtonText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
    color: '#ffffff',
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  pendingHint: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    color: '#D99A00',
    lineHeight: 18,
  },
});