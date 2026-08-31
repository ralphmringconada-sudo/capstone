import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StatusBar, StyleSheet, Image, Animated, ActivityIndicator, RefreshControl, ScrollView, Modal, Alert } from 'react-native';
import { Shadow } from 'react-native-shadow-2';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { fetchUserReports, formatReportDate } from '@/services/reportService';
import { fetchEventsForHome } from '@/services/eventService';
import { attachDisplayImagesToReports } from '@/services/reportImageService';
import { countPendingOfflineReports, listPendingOfflineReports, type OfflineReportRow } from '@/services/offlineReportQueue';
import { syncPendingOfflineReports } from '@/services/offlineReportSync';
import { getReportStatusColors, USER_REPORT_TABS, type UserReportTabKey } from '@/utils/reportStatus';
import {
  getEventStatusColors,
  getUserFacingEventStatus,
  USER_EVENT_TABS,
  type UserEventTabKey,
} from '@/utils/eventStatus';
import type { EcoReport } from '@/types/report';
import type { EcoEvent } from '@/types/event';
import {
  fetchUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/services/notificationService';

type ReportWithImages = EcoReport & { displayImages: string[] };

const EVENT_OWNERSHIP_TABS: { key: 'ALL' | 'MINE' | 'PUBLIC'; label: string }[] = [
  { key: 'ALL', label: 'Everyone' },
  { key: 'MINE', label: 'Yours' },
  { key: 'PUBLIC', label: 'Public' },
];

/**
 * Purpose: Presents the signed-in user's report/event dashboard and status-based monitoring views.
 * How it works: 1) loads owned reports or events on focus. 2) resolves images. 3) filters by status. 4) exposes actions.
 * Technologies Used: React Native, Expo Router, Firebase Firestore, React hooks, React Native Animated.
 * Why this implementation: Focus-based refresh keeps citizen progress current when returning from other screens.
 */
export default function HomeScreen() {
  const [activeReportTab, setActiveReportTab] = useState<UserReportTabKey>('ALL');
  const [activeEventTab, setActiveEventTab] = useState<UserEventTabKey>('ALL');
  // Ownership filter is independent of event status (USER_EVENT_TABS), so it's kept
  // as its own bit of state and rendered as a second row of chips, only in Events
  // mode. Combined with the status tab as an AND in filteredEvents below.
  const [eventOwnershipFilter, setEventOwnershipFilter] = useState<'ALL' | 'MINE' | 'PUBLIC'>('ALL');
  const [viewMode, setViewMode] = useState<'Reports' | 'Events'>('Reports');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  const userName = user?.firstName || 'there';

  const [reports, setReports] = useState<ReportWithImages[]>([]);
  const [events, setEvents] = useState<EcoEvent[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineReportRow[]>([]);
  const [showOfflineDetails, setShowOfflineDetails] = useState(false);

  // Dynamic header height based on the active view
  const headerHeight = viewMode === 'Events' ? 482 : 440;
  
  // Natural (expanded) height of just the collapsible chunk of the header — the
  // greeting text. Fixed, not measured: measuring this at runtime means attaching
  // onLayout to a view whose height we're animating, and RN fires onLayout on every
  // frame the measured layout changes — i.e. on every scroll tick, not just once at
  // rest. That per-frame bridge crossing was the actual source of the added lag, not
  // the height animation itself. A fixed value avoids it, at the cost of needing to
  // update this number by hand if the greeting's content/font size changes.
  const collapsibleHeight = 140;

  // Drives the collapse as the list scrolls. Height can't be animated by RN's native
  // driver, so this has to run on the JS thread (useNativeDriver: false below) — a
  // real height collapse costs a bit more than a pure opacity/transform fade, but a
  // fade alone was the original bug: it left the reserved header space intact, which
  // is why the header never appeared to collapse. The action buttons are deliberately
  // kept outside the collapsing section (with their labels) and stay visible always.
  // Because headerHeight (the scroll content's top padding) is fixed while the
  // collapsible section shrinks by the same scrollY amount, the shrinking header's
  // bottom edge and the rising content stay lined up with no gap or overlap.
  const scrollY = useRef(new Animated.Value(0)).current;

  // View Mode Animation Ref
  const viewModeAnim = useRef(new Animated.Value(0)).current;

  // Trigger slider animation when viewMode changes
  useEffect(() => {
    Animated.spring(viewModeAnim, {
      toValue: viewMode === 'Events' ? 1 : 0,
      useNativeDriver: false,
      bounciness: 4,
      speed: 14,
    }).start();
  }, [viewMode, viewModeAnim]);

  // Interpolations for the slider position and text cross-fading
  const sliderPosition = viewModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });
  const reportsTextColor = viewModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#ffffff', '#3f5c2b'],
  });
  const eventsTextColor = viewModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#3f5c2b', '#ffffff'],
  });

  const collapsibleAnimHeight = scrollY.interpolate({
    inputRange: [0, Math.max(collapsibleHeight, 1)],
    outputRange: [collapsibleHeight, 0],
    extrapolate: 'clamp',
  });

  const collapsibleOpacity = scrollY.interpolate({
    inputRange: [0, Math.max(collapsibleHeight * 0.6, 1)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const greetingTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -16],
    extrapolate: 'clamp',
  });

  const loadReports = useCallback(async () => {
    if (!user?.uid) {
      setReports([]);
      return;
    }

    try {
      setIsLoadingReports(true);
      const items = await fetchUserReports(user.uid);
      setReports(await attachDisplayImagesToReports(items));
    } catch {
      setReports([]);
    } finally {
      setIsLoadingReports(false);
    }
  }, [user?.uid]);

  const loadEvents = useCallback(async () => {
    if (!user?.uid) {
      setEvents([]);
      return;
    }

    try {
      setIsLoadingEvents(true);
      setEvents(await fetchEventsForHome(user.uid));
    } catch {
      setEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [user?.uid]);

  const loadOfflinePending = useCallback(async () => {
    if (!user?.uid) {
      setOfflinePendingCount(0);
      setOfflineDrafts([]);
      return;
    }
    try {
      const drafts = await listPendingOfflineReports(user.uid);
      setOfflineDrafts(drafts);
      setOfflinePendingCount(drafts.length || (await countPendingOfflineReports(user.uid)));
    } catch {
      setOfflinePendingCount(0);
      setOfflineDrafts([]);
    }
  }, [user?.uid]);

  const loadNotifications = useCallback(async () => {
    if (!user?.uid) {
      setNotifications([]);
      return;
    }
    try {
      setLoadingNotifications(true);
      setNotifications(await fetchUserNotifications(user.uid));
    } catch {
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  }, [user?.uid]);

  const openNotifications = useCallback(async () => {
    setShowNotifications(true);
    await loadNotifications();
  }, [loadNotifications]);

  const handleNotificationPress = useCallback(
    async (item: AppNotification) => {
      if (!item.read) {
        try {
          await markNotificationRead(item.id);
          setNotifications((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
          );
        } catch {
          /* ignore */
        }
      }
      setShowNotifications(false);
      if (item.type === 'report' && item.relatedId) {
        router.push({ pathname: '/view-report', params: { id: item.relatedId } });
      } else if (item.type === 'event' && item.relatedId) {
        router.push({ pathname: '/view-event', params: { id: item.relatedId } });
      }
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      loadReports();
      loadEvents();
      loadOfflinePending();
      loadNotifications();
    }, [loadReports, loadEvents, loadOfflinePending, loadNotifications]),
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (user?.uid) {
        const result = await syncPendingOfflineReports(user.uid);
        if (result.synced > 0 || result.skippedDuplicates > 0 || result.failed > 0) {
          Alert.alert(
            'Offline sync',
            `Uploaded: ${result.synced}\nDuplicates skipped: ${result.skippedDuplicates}\nFailed: ${result.failed}\nStill waiting: ${result.remaining}`,
          );
        }
      }
      await Promise.all([loadReports(), loadEvents(), loadOfflinePending()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadReports, loadEvents, loadOfflinePending, user?.uid]);

  const filteredReports = reports.filter((report) => {
    const tab = USER_REPORT_TABS.find((item) => item.key === activeReportTab);
    if (!tab) return true;
    return tab.statuses.includes(report.status);
  });

  const filteredEvents = events.filter((event) => {
    const tab = USER_EVENT_TABS.find((item) => item.key === activeEventTab);
    let passesStatus = true;

    if (tab) {
      if (!tab.statuses.includes(event.status)) {
        passesStatus = false;
      } else if (activeEventTab === 'PENDING') {
        passesStatus = event.submittedByUid === user?.uid;
      } else if (activeEventTab === 'ACCEPTED') {
        passesStatus = event.status === 'Upcoming' || event.status === 'Ongoing' || event.status === 'Completed';
      } else {
        // ALL: hide rejected events; pending only for the submitter.
        if (event.status === 'Rejected') {
          passesStatus = false;
        } else if (event.status === 'Pending') {
          passesStatus = event.submittedByUid === user?.uid;
        }
      }
    }

    if (!passesStatus) return false;

    if (eventOwnershipFilter === 'MINE') {
      return event.submittedByUid === user?.uid;
    }
    if (eventOwnershipFilter === 'PUBLIC') {
      return event.submittedByUid !== user?.uid;
    }
    return true;
  });

  const isEventsMode = viewMode === 'Events';
  const isLoading = isEventsMode ? isLoadingEvents : isLoadingReports;
  const tabs = isEventsMode ? USER_EVENT_TABS : USER_REPORT_TABS;
  const activeTab = isEventsMode ? activeEventTab : activeReportTab;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#9FC37F" />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.screenWrapper}>
        <Animated.View style={styles.headerContainer}>
          <View style={styles.greenSection}>
            <View style={styles.topBar}>
              <View style={styles.topLeft}>
                <Image
                  source={require('@/assets/images/Valencia_Logo.png')}
                  style={styles.whiteCircleLogo}
                  resizeMode="contain"
                />
                <Image
                  source={require('@/assets/images/Ecobantay_Logo.png')}
                  style={styles.brandImage}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.topRight}>
                <TouchableOpacity activeOpacity={0.7} onPress={openNotifications}>
                  <Image source={require('@/assets/images/notification_icon.png')} style={styles.iconPlaceholder} />
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.7} onPress={() => router.navigate('/profile')}>
                  <Image source={require('@/assets/images/settings_icon.png')} style={styles.iconPlaceholder} />
                </TouchableOpacity>
              </View>
            </View>

            <Animated.View
              style={[styles.collapsibleSection, { height: collapsibleAnimHeight, opacity: collapsibleOpacity }]}
            >
              <Animated.View
                style={[styles.greetingContainer, { transform: [{ translateY: greetingTranslateY }] }]}
              >
                <Text style={styles.greetingName}>Hello {userName},</Text>
                <Text style={styles.welcomeText}>
                  Welcome to{'\n'}
                  <Text style={styles.welcomeBrand}>ecobantay</Text>
                </Text>
                <Text style={styles.tagline}>Where we monitor the marvelous lands{'\n'}of Valencia!</Text>
              </Animated.View>
            </Animated.View>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.actionButton}
                onPress={() => router.navigate('/create-report')}
              >
                <LinearGradient
                  colors={['#7ad5c433', '#e1ec6749']}
                  start={[0, 0]}
                  end={[0, 1]}
                  style={styles.actionSquare}
                >
                  <Image source={require('@/assets/images/report_icon.png')} style={styles.actionIcon} />
                </LinearGradient>
                <Text style={styles.actionText}>Create Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.actionButton}
                onPress={() => router.navigate('/create-event')}
              >
                <LinearGradient
                  colors={['#7ad5c433', '#e1ec6749']}
                  start={[0, 0]}
                  end={[0, 1]}
                  style={styles.actionSquare}
                >
                  <Image source={require('@/assets/images/event_icon.png')} style={styles.actionIcon} />
                </LinearGradient>
                <Text style={styles.actionText}>Create Event</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.segmentedControlWrapper}>
              <View style={styles.segmentedControl}>
                {/* Sliding Animated Background Background */}
                <Animated.View style={[styles.segmentedSlider, { left: sliderPosition }]} />
                
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.segmentedButton}
                  onPress={() => setViewMode('Reports')}
                >
                  <Animated.Text style={[styles.segmentedText, { color: reportsTextColor }]}>Reports</Animated.Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.segmentedButton}
                  onPress={() => setViewMode('Events')}
                >
                  <Animated.Text style={[styles.segmentedText, { color: eventsTextColor }]}>Events</Animated.Text>
                </TouchableOpacity>
              </View>
            </View>

            {offlinePendingCount > 0 ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setShowOfflineDetails(true)}>
                <Text style={styles.offlineBanner}>
                  {offlinePendingCount} offline report{offlinePendingCount === 1 ? '' : 's'} waiting to
                  upload. Tap for sync status · pull down to sync when online.
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.tabsSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    activeOpacity={0.8}
                    style={[styles.tabButton, isActive && styles.tabButtonActive]}
                    onPress={() => {
                      if (isEventsMode) {
                        setActiveEventTab(tab.key as UserEventTabKey);
                      } else {
                        setActiveReportTab(tab.key as UserReportTabKey);
                      }
                    }}
                  >
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {isEventsMode && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.ownershipTabsRow}
              >
                {EVENT_OWNERSHIP_TABS.map((tab) => {
                  const isActive = eventOwnershipFilter === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      activeOpacity={0.8}
                      style={[styles.ownershipTabButton, isActive && styles.ownershipTabButtonActive]}
                      onPress={() => setEventOwnershipFilter(tab.key)}
                    >
                      <Text
                        style={[styles.ownershipTabText, isActive && styles.ownershipTabTextActive]}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Horizontal Filter Fade Gradients */}
            <LinearGradient
              colors={['#ffffff', 'rgba(255, 255, 255, 0)']}
              start={[0, 0]}
              end={[1, 0]}
              style={styles.fadeLeft}
              pointerEvents="none"
            />
            <LinearGradient
              colors={['rgba(255, 255, 255, 0)', '#ffffff']}
              start={[0, 0]}
              end={[1, 0]}
              style={styles.fadeRight}
              pointerEvents="none"
            />
          </View>
        </Animated.View>

        <Animated.ScrollView
          style={styles.bodyContainer}
          contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight }]}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            // `collapsibleAnimHeight` above animates `height`, which the native driver
            // can never animate on any platform (it's a layout prop, not a view prop) —
            // so this has to stay JS-driven everywhere, not just on web.
            useNativeDriver: false,
          })}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={['#3f5c2b']}
              tintColor="#3f5c2b"
            />
          }
        >
          {isLoading ? (
            <View style={styles.emptyStateContainer}>
              <ActivityIndicator size="large" color="#3f5c2b" />
            </View>
          ) : isEventsMode ? (
            filteredEvents.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Image source={require('@/assets/images/warning_icon.png')} style={styles.emptyIcon} />
                <Text style={styles.emptyText}>
                  {events.length === 0
                    ? 'No events yet.\nCreate one or wait for accepted events!'
                    : `No ${USER_EVENT_TABS.find((tab) => tab.key === activeEventTab)?.label.toLowerCase() ?? 'matching'} events yet.`}
                </Text>
              </View>
            ) : (
              <View style={styles.cardsContainer}>
                {filteredEvents.map((event) => {
                  const facing = getUserFacingEventStatus(event.status);
                  const colors = getEventStatusColors(facing);
                  return (
                    <Shadow
                      key={event.id}
                      distance={2}
                      startColor={'rgba(0, 0, 0, 0.1)'}
                      offset={[0, 3]}
                      style={styles.cardShadow}
                    >
                      <View style={styles.reportCard}>
                        <View style={styles.cardMapContainer}>
                          {event.imageUrl ? (
                            <Image source={{ uri: event.imageUrl }} style={styles.cardMapImage} resizeMode="cover" />
                          ) : (
                            <Image
                              source={require('@/assets/images/event_icon.png')}
                              style={styles.cardMapImage}
                              resizeMode="contain"
                            />
                          )}
                          <View style={[styles.statusBadge, { backgroundColor: colors.backgroundColor }]}>
                            <Text style={[styles.statusBadgeText, { color: colors.color }]}>{facing}</Text>
                          </View>
                          <View
                            style={[
                              styles.ownerBadge,
                              event.submittedByUid === user?.uid
                                ? styles.ownerBadgeMine
                                : styles.ownerBadgePublic,
                            ]}
                          >
                            <Text
                              style={[
                                styles.ownerBadgeText,
                                event.submittedByUid === user?.uid
                                  ? styles.ownerBadgeTextMine
                                  : styles.ownerBadgeTextPublic,
                              ]}
                            >
                              {event.submittedByUid === user?.uid ? 'Yours' : 'Public'}
                            </Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() =>
                            router.navigate({
                              pathname: '/view-event',
                              params: { id: event.id },
                            })
                          }
                        >
                          <LinearGradient colors={['#849a62', '#3f5c2b']} style={styles.cardContent}>
                            <View style={styles.cardHeaderRow}>
                              <Text style={styles.cardTitle}>{event.title}</Text>
                              <View style={styles.cardDateContainer}>
                                <Image
                                  source={require('@/assets/images/calendar_icon.png')}
                                  style={styles.cardSmallIcon}
                                />
                                <Text style={styles.cardDate}>{event.date}</Text>
                              </View>
                            </View>

                            <View style={styles.cardAddressRow}>
                              <Image
                                source={require('@/assets/images/location_icon.png')}
                                style={styles.cardSmallIcon}
                              />
                              <Text style={styles.cardAddress}>{event.location}</Text>
                            </View>

                            <Text style={styles.cardDesc} numberOfLines={2}>
                              {event.description}
                            </Text>

                            <View style={styles.cardFooterRow}>
                              <View style={styles.cardCategoryContainer}>
                                <Image
                                  source={require('@/assets/images/event_icon.png')}
                                  style={styles.cardSmallIcon}
                                />
                                <Text style={styles.cardCategory}>{event.category}</Text>
                              </View>
                              <Text style={styles.viewDetailsText}>
                                {event.participants}/{event.capacity} · View
                              </Text>
                            </View>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </Shadow>
                  );
                })}
              </View>
            )
          ) : filteredReports.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Image source={require('@/assets/images/warning_icon.png')} style={styles.emptyIcon} />
              <Text style={styles.emptyText}>
                {reports.length === 0
                  ? 'No content made on this\naccount yet!'
                  : `No ${USER_REPORT_TABS.find((tab) => tab.key === activeReportTab)?.label.toLowerCase() ?? 'matching'} reports yet.`}
              </Text>
            </View>
          ) : (
            <View style={styles.cardsContainer}>
              {filteredReports.map((report) => (
                <Shadow
                  key={report.id}
                  distance={2}
                  startColor={'rgba(0, 0, 0, 0.1)'}
                  offset={[0, 3]}
                  style={styles.cardShadow}
                >
                  <View style={styles.reportCard}>
                    <View style={styles.cardMapContainer}>
                      {report.displayImages?.[0] ? (
                        <Image
                          source={{ uri: report.displayImages[0] }}
                          style={styles.cardMapImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Image
                          source={require('@/assets/images/warning_icon.png')}
                          style={styles.cardMapImage}
                          resizeMode="cover"
                        />
                      )}
                      <View style={[styles.statusBadge, getReportStatusColors(report.status)]}>
                        <Text
                          style={[styles.statusBadgeText, { color: getReportStatusColors(report.status).color }]}
                        >
                          {report.status}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() =>
                        router.navigate({
                          pathname: '/view-report',
                          params: { id: report.id },
                        })
                      }
                    >
                      <LinearGradient colors={['#849a62', '#3f5c2b']} style={styles.cardContent}>
                        <View style={styles.cardHeaderRow}>
                          <Text style={styles.cardTitle}>{report.title}</Text>
                          <View style={styles.cardDateContainer}>
                            <Image
                              source={require('@/assets/images/calendar_icon.png')}
                              style={styles.cardSmallIcon}
                            />
                            <Text style={styles.cardDate}>{formatReportDate(report.createdAt)}</Text>
                          </View>
                        </View>

                        <View style={styles.cardAddressRow}>
                          <Image
                            source={require('@/assets/images/location_icon.png')}
                            style={styles.cardSmallIcon}
                          />
                          <Text style={styles.cardAddress}>{report.location}</Text>
                        </View>

                        <Text style={styles.cardDesc} numberOfLines={2}>
                          {report.description}
                        </Text>

                        <View style={styles.cardFooterRow}>
                          <View style={styles.cardCategoryContainer}>
                            <Image
                              source={require('@/assets/images/warning_icon.png')}
                              style={styles.cardSmallIcon}
                            />
                            <Text style={styles.cardCategory}>{report.category}</Text>
                          </View>
                          <Text style={styles.viewDetailsText}>View Details</Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </Shadow>
              ))}
            </View>
          )}

          <View style={{ height: 100 }} />
        </Animated.ScrollView>

        {/* Bottom List Vertical Fade Gradient */}
        <LinearGradient
          colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.25)', '#ffffff']}
          locations={[0, 0.6, 1]}
          start={[0, 0]}
          end={[0, 1]}
          style={styles.listFadeBottom}
          pointerEvents="none"
        />
      </View>

      <Modal
        visible={showOfflineDetails}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOfflineDetails(false)}
      >
        <TouchableOpacity
          style={styles.notificationBackdrop}
          activeOpacity={1}
          onPress={() => setShowOfflineDetails(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.notificationCard}>
            <Text style={styles.notificationHeaderTitle}>Offline sync status</Text>
            {offlineDrafts.length === 0 ? (
              <Text style={styles.notificationEmpty}>No offline drafts.</Text>
            ) : (
              offlineDrafts.map((draft) => {
                let summary = 'Saved report';
                try {
                  const payload = JSON.parse(draft.payloadJson) as { categoryName?: string };
                  summary = payload.categoryName || summary;
                } catch {
                  /* ignore */
                }
                return (
                  <View key={draft.id} style={{ marginBottom: 12 }}>
                    <Text style={styles.notificationTitle}>{summary}</Text>
                    <Text style={styles.notificationDesc}>
                      Status: {draft.syncStatus.toUpperCase()}
                      {draft.lastError ? `\nError: ${draft.lastError}` : ''}
                    </Text>
                    <Text style={styles.notificationDesc}>
                      Saved: {formatReportDate(draft.createdAt)}
                    </Text>
                  </View>
                );
              })
            )}
            <TouchableOpacity
              style={{ marginTop: 8 }}
              onPress={async () => {
                setShowOfflineDetails(false);
                await onRefresh();
              }}
            >
              <Text style={styles.notificationMarkAll}>Sync now</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showNotifications}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifications(false)}
      >
        <TouchableOpacity
          style={styles.notificationBackdrop}
          activeOpacity={1}
          onPress={() => setShowNotifications(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.notificationCard}>
            <View style={styles.notificationHeaderRow}>
              <Text style={styles.notificationHeaderTitle}>Notifications</Text>
              {notifications.some((item) => !item.read) ? (
                <TouchableOpacity
                  onPress={async () => {
                    if (!user?.uid) return;
                    await markAllNotificationsRead(user.uid);
                    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
                  }}
                >
                  <Text style={styles.notificationMarkAll}>Mark all read</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {loadingNotifications ? (
              <ActivityIndicator color="#3B703C" style={{ marginVertical: 20 }} />
            ) : notifications.length === 0 ? (
              <Text style={styles.notificationEmpty}>No notifications yet.</Text>
            ) : (
              notifications.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <View style={styles.notificationDivider} /> : null}
                  <TouchableOpacity
                    style={styles.notificationItem}
                    activeOpacity={0.8}
                    onPress={() => handleNotificationPress(item)}
                  >
                    <View
                      style={[
                        styles.notificationIconCircle,
                        !item.read && styles.notificationIconUnread,
                      ]}
                    >
                      <Text style={styles.notificationIconText}>i</Text>
                    </View>
                    <View style={styles.notificationTextBlock}>
                      <Text style={styles.notificationTitle}>{item.title}</Text>
                      <Text style={styles.notificationDesc}>{item.body}</Text>
                      <View style={styles.notificationPillRow}>
                        {item.statusLabel ? (
                          <View style={styles.notificationPillBlue}>
                            <Text style={styles.notificationPillBlueText}>{item.statusLabel}</Text>
                          </View>
                        ) : null}
                        <View style={styles.notificationPillNeutral}>
                          <Text style={styles.notificationPillNeutralText}>
                            {formatReportDate(item.createdAt)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#9FC37F' },
  screenWrapper: { flex: 1, position: 'relative' },

  headerContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  greenSection: { backgroundColor: '#E1F0B9', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 5 },
  tabsSection: { backgroundColor: '#ffffff', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, position: 'relative' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 16,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center' },
  whiteCircleLogo: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff', marginRight: -15 },
  brandImage: { width: 140, height: 36 },
  topRight: { flexDirection: 'row', gap: 12 },
  iconPlaceholder: { width: 24, height: 24, tintColor: '#3f5c2b' },
  collapsibleSection: { overflow: 'hidden' },
  greetingContainer: { justifyContent: 'center' },
  greetingName: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 14,
    color: '#3f5c2b',
    marginBottom: 4,
    includeFontPadding: false,
  },
  welcomeText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 32,
    color: '#3f5c2b',
    lineHeight: 36,
    includeFontPadding: false,
  },
  welcomeBrand: { color: '#96ba12' },
  tagline: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    color: '#3f5c2b',
    marginTop: 8,
    lineHeight: 16,
    includeFontPadding: false,
  },
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 },
  actionButton: { alignItems: 'center', width: '42%' },
  actionSquare: {
    width: '100%',
    aspectRatio: 2.4,
    backgroundColor: '#56C7B1',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.49)',
  },
  actionIcon: { width: 26, height: 26, tintColor: '#ffffff' },
  actionText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 11,
    color: '#3f5c2b',
    textAlign: 'center',
    includeFontPadding: false,
  },
  offlineBanner: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 11,
    color: '#7a5a00',
    backgroundColor: '#FFF0B8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    includeFontPadding: false,
  },

  // Segmented Control Updated Styles
  segmentedControlWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 10,
    padding: 4,
    marginTop: 14,
  },
  segmentedControl: {
    flexDirection: 'row',
    position: 'relative',
  },
  segmentedSlider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    backgroundColor: '#3B703C',
    borderRadius: 8,
  },
  segmentedButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1, // Ensures text stays on top of the sliding background
  },
  segmentedText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 13,
    includeFontPadding: false,
  },

  tabsRow: { flexDirection: 'row', gap: 8, paddingRight: 8, flexGrow: 1, justifyContent: 'center' },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tabButtonActive: { backgroundColor: '#56C7B1', borderColor: '#56C7B1' },
  tabText: { fontFamily: 'Montserrat-Bold', fontSize: 12, color: '#3f5c2b', includeFontPadding: false },
  tabTextActive: { color: '#ffffff' },

  ownershipTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
    marginTop: 6,
    flexGrow: 1,
    justifyContent: 'center',
  },
  ownershipTabButton: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownershipTabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#3f5c2b',
  },
  ownershipTabText: { fontFamily: 'Montserrat-Semi-Bold', fontSize: 11, color: '#3f5c2b', includeFontPadding: false },
  ownershipTabTextActive: { color: '#3f5c2b' },

  fadeLeft: {
    position: 'absolute',
    left: 24, 
    top: 0,
    bottom: 0,
    width: 24,
    zIndex: 2,
  },
  fadeRight: {
    position: 'absolute',
    right: 24, 
    top: 0,
    bottom: 0,
    width: 24,
    zIndex: 2,
  },

  listFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 5,
  },

  bodyContainer: { flex: 1, backgroundColor: '#ffffff' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },

  emptyStateContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 120 },
  emptyIcon: { width: 48, height: 48, tintColor: '#828282', marginBottom: 16 },
  emptyText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 14,
    color: '#808080',
    textAlign: 'center',
    lineHeight: 20,
    includeFontPadding: false,
  },

  cardsContainer: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 20,
  },
  cardShadow: {
    width: '100%',
    marginBottom: 20,
  },
  reportCard: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  cardMapContainer: {
    width: '100%',
    height: 120,
    position: 'relative',
  },
  cardMapImage: {
    width: '100%',
    height: '100%',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 2,
  },
  statusBadgeText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 10,
    includeFontPadding: false,
  },
  ownerBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 2,
  },
  ownerBadgeMine: { backgroundColor: '#3B703C' },
  ownerBadgePublic: { backgroundColor: '#ffffff' },
  ownerBadgeText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 10,
    includeFontPadding: false,
  },
  ownerBadgeTextMine: { color: '#ffffff' },
  ownerBadgeTextPublic: { color: '#3f5c2b' },
  cardContent: {
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
    color: '#ffffff',
    includeFontPadding: false,
  },
  cardDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardDate: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    color: '#ffffff',
    includeFontPadding: false,
    marginLeft: 4,
  },
  cardAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardAddress: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    color: '#e2e2e2',
    flex: 1,
    marginLeft: 6,
    lineHeight: 16,
  },
  cardDesc: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    color: '#e2e2e2',
    marginBottom: 16,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCategoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardCategory: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    color: '#ffffff',
    marginLeft: 6,
    includeFontPadding: false,
  },
  viewDetailsText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    color: '#ffffff',
    textDecorationLine: 'underline',
    includeFontPadding: false,
  },
  cardSmallIcon: {
    width: 14,
    height: 14,
    tintColor: '#ffffff',
  },

  notificationBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  notificationCard: {
    marginTop: 64,
    marginHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    maxHeight: '70%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  notificationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  notificationHeaderTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
    color: '#1f3b20',
  },
  notificationMarkAll: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    color: '#3B703C',
  },
  notificationEmpty: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
    paddingVertical: 16,
  },
  notificationItem: {
    flexDirection: 'row',
    gap: 10,
  },
  notificationIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3f5c2b',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  notificationIconUnread: {
    backgroundColor: '#c2dc68',
  },
  notificationIconText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 11,
    color: '#3f5c2b',
    includeFontPadding: false,
  },
  notificationTextBlock: { flex: 1 },
  notificationTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 4,
    includeFontPadding: false,
  },
  notificationDesc: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    color: '#6b6b6b',
    lineHeight: 17,
    marginBottom: 10,
  },
  notificationPillRow: { flexDirection: 'row', gap: 8 },
  notificationPillNeutral: {
    backgroundColor: '#eeeeee',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  notificationPillNeutralText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    color: '#333333',
    includeFontPadding: false,
  },
  notificationPillBlue: {
    backgroundColor: '#2f7ff0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  notificationPillBlueText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 12,
    color: '#ffffff',
    includeFontPadding: false,
  },
  notificationDivider: {
    height: 1,
    backgroundColor: '#eeeeee',
    marginVertical: 14,
  },
});