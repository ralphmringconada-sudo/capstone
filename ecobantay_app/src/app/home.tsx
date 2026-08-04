import React, { useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StatusBar, StyleSheet, Image, Animated, Easing, ActivityIndicator, RefreshControl } from 'react-native';
import { Shadow } from 'react-native-shadow-2';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { fetchUserReports, formatReportDate } from '@/services/reportService';
import { fetchEventsForHome } from '@/services/eventService';
import { attachDisplayImagesToReports } from '@/services/reportImageService';
import { getReportStatusColors, USER_REPORT_TABS, type UserReportTabKey } from '@/utils/reportStatus';
import {
  getEventStatusColors,
  getUserFacingEventStatus,
  USER_EVENT_TABS,
  type UserEventTabKey,
} from '@/utils/eventStatus';
import type { EcoReport } from '@/types/report';
import type { EcoEvent } from '@/types/event';

type ReportWithImages = EcoReport & { displayImages: string[] };

/**
 * Purpose: Presents the signed-in user's report/event dashboard and status-based monitoring views.
 * How it works: 1) loads owned reports or events on focus. 2) resolves images. 3) filters by status. 4) exposes actions.
 * Technologies Used: React Native, Expo Router, Firebase Firestore, React hooks, React Native Animated.
 * Why this implementation: Focus-based refresh keeps citizen progress current when returning from other screens.
 */
export default function HomeScreen() {
  const [activeReportTab, setActiveReportTab] = useState<UserReportTabKey>('ALL');
  const [activeEventTab, setActiveEventTab] = useState<UserEventTabKey>('ALL');
  const [viewMode, setViewMode] = useState<'Reports' | 'Events'>('Reports');
  const router = useRouter();
  const { user } = useAuth();

  const userName = user?.firstName || 'there';

  const [reports, setReports] = useState<ReportWithImages[]>([]);
  const [events, setEvents] = useState<EcoEvent[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const spinValue = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const handleToggleView = () => {
    setViewMode((prev) => (prev === 'Reports' ? 'Events' : 'Reports'));
    spinValue.setValue(0);
    Animated.timing(spinValue, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const greetingHeight = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [140, 0],
    extrapolate: 'clamp',
  });

  const greetingOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const linksHeight = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [40, 0],
    extrapolate: 'clamp',
  });

  const linksOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
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

  useFocusEffect(
    useCallback(() => {
      loadReports();
      loadEvents();
    }, [loadReports, loadEvents]),
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadReports(), loadEvents()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadReports, loadEvents]);

  const filteredReports = reports.filter((report) => {
    const tab = USER_REPORT_TABS.find((item) => item.key === activeReportTab);
    if (!tab) return true;
    return tab.statuses.includes(report.status);
  });

  const filteredEvents = events.filter((event) => {
    const tab = USER_EVENT_TABS.find((item) => item.key === activeEventTab);
    if (!tab) return true;
    if (!tab.statuses.includes(event.status)) return false;

    if (activeEventTab === 'PENDING') {
      return event.submittedByUid === user?.uid;
    }
    if (activeEventTab === 'ACCEPTED') {
      return event.status === 'Upcoming' || event.status === 'Ongoing' || event.status === 'Completed';
    }
    // ALL: hide rejected events; pending only for the submitter.
    if (event.status === 'Rejected') {
      return false;
    }
    if (event.status === 'Pending') {
      return event.submittedByUid === user?.uid;
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
                <View style={styles.whiteCircleLogo} />
                <Image
                  source={require('@/assets/images/Ecobantay_Logo.png')}
                  style={styles.brandImage}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.topRight}>
                <TouchableOpacity activeOpacity={0.7}>
                  <Image source={require('@/assets/images/notification_icon.png')} style={styles.iconPlaceholder} />
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.7} onPress={() => router.navigate('/profile')}>
                  <Image source={require('@/assets/images/settings_icon.png')} style={styles.iconPlaceholder} />
                </TouchableOpacity>
              </View>
            </View>

            <Animated.View style={[styles.greetingContainer, { height: greetingHeight, opacity: greetingOpacity }]}>
              <Text style={styles.greetingName}>Hello {userName},</Text>
              <Text style={styles.welcomeText}>
                Welcome to{'\n'}
                <Text style={styles.welcomeBrand}>ecobantay</Text>
              </Text>
              <Text style={styles.tagline}>Where we monitor the marvelous lands{'\n'}of Valencia!</Text>
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

              <TouchableOpacity activeOpacity={0.75} style={styles.actionButton} onPress={handleToggleView}>
                <LinearGradient
                  colors={['#7ad5c433', '#e1ec6749']}
                  start={[0, 0]}
                  end={[0, 1]}
                  style={styles.actionSquare}
                >
                  <Text style={styles.topHugText}>{viewMode}</Text>
                  <Animated.Image
                    source={require('@/assets/images/toggle_icon.png')}
                    style={[styles.actionIcon, { transform: [{ rotate: spin }] }]}
                  />
                </LinearGradient>
                <Text style={styles.actionText}>Toggle View</Text>
              </TouchableOpacity>
            </View>

            <Animated.View style={[styles.headerLinksRow, { height: linksHeight, opacity: linksOpacity }]}>
              <Text style={styles.headerLink}>Contact</Text>
              <Text style={styles.headerLink}>FAQ</Text>
              <Text style={styles.headerLink}>Legal terms</Text>
            </Animated.View>
          </View>

          <View style={styles.tabsSection}>
            <View style={styles.tabsRow}>
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <Shadow
                    key={tab.key}
                    distance={isActive ? 0 : 2}
                    startColor={'rgba(0, 0, 0, 0.05)'}
                    offset={[0, 1]}
                    style={{ borderRadius: 16 }}
                  >
                    <TouchableOpacity
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
                  </Shadow>
                );
              })}
            </View>
          </View>
        </Animated.View>

        <Animated.ScrollView
          style={styles.bodyContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#9FC37F' },
  screenWrapper: { flex: 1, position: 'relative' },

  headerContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  greenSection: { backgroundColor: '#E1F0B9', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 5 },
  tabsSection: { backgroundColor: '#ffffff', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 },
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
  greetingContainer: { overflow: 'hidden', justifyContent: 'center' },
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
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  actionButton: { alignItems: 'center', width: '30%' },
  actionSquare: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#56C7B1',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.49)',
  },
  actionIcon: { width: 42, height: 42, tintColor: '#ffffff' },
  actionText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 11,
    color: '#3f5c2b',
    textAlign: 'center',
    includeFontPadding: false,
  },
  topHugText: {
    position: 'absolute',
    top: 8,
    fontFamily: 'Montserrat-Bold',
    fontSize: 12,
    color: '#fefffe',
    includeFontPadding: false,
  },
  headerLinksRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 24,
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  headerLink: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    color: '#3f5c2b',
    textDecorationLine: 'underline',
    includeFontPadding: false,
  },
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  tabButton: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tabButtonActive: { backgroundColor: '#000000', borderColor: '#ffffff' },
  tabText: { fontFamily: 'Montserrat-Bold', fontSize: 11, color: '#000000', includeFontPadding: false },
  tabTextActive: { color: '#ffffff' },

  bodyContainer: { flex: 1, backgroundColor: '#ffffff' },
  scrollContent: { flexGrow: 1, paddingTop: 490, paddingHorizontal: 24 },

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
    paddingTop: 12,
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
});
