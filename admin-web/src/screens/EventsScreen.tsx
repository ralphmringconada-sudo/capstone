import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";

import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheckBig,
  Clock3,
  Eye,
  Filter,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react-native";

import AdminLayout from "@/components/AdminLayout";
import DateRangeFilter from "@/components/DateRangeFilter";
import InteractiveLocationMap from "@/components/InteractiveLocationMap";

import { useAdminAuth } from "@/context/AdminAuthContext";

import {
  createEvent,
  fetchEventParticipants,
  fetchEvents,
  updateEventStatus,
} from "@/services/adminDataService";

import { uploadAdminEventImage } from "@/services/eventImageService";

import type {
  AdminEvent,
  EventParticipant,
} from "@/types/admin";

import { isWithinDateRange } from "@/utils/dateRange";
import { formatDateTime } from "@/utils/format";

// =========================================================
// TYPES
// =========================================================

type RejectedEventView = AdminEvent & {
  rejectedAt?: string;
  rejectionReason?: string;
};

type EventStatus = AdminEvent["status"];

type EventTab =
  | "All Events"
  | "Pending Approval"
  | "Rejected";
  
// =========================================================
// DEFAULT MAP LOCATION
// =========================================================

const VALENCIA_DEFAULT = {
  latitude: 9.2805,
  longitude: 123.2431,
};

// =========================================================
// DATE / TIME HELPERS
// =========================================================

function formatEventDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatEventTime(hhmm: string): string {
  const [hours, minutes] = hhmm
    .split(":")
    .map(Number);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return hhmm;
  }

  const date = new Date();

  date.setHours(
    hours,
    minutes,
    0,
    0
  );

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toHhMm(date: Date): string {
  return `${String(
    date.getHours()
  ).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

// =========================================================
// FILTER OPTIONS
// =========================================================

const CATEGORY_OPTIONS = [
  "All Types",
  "Clean-up",
  "Tree Planting",
  "Seminar",
  "Rehabilitation",
  "Collection",
];

const STATUS_OPTIONS = [
  "All Statuses",
  "Pending",
  "Upcoming",
  "Ongoing",
  "Completed",
  "Rejected",
];

const REJECTION_REASONS = [
  "Incomplete event details",
  "Invalid or unclear location",
  "Venue unavailable",
  "Inappropriate event content",
  "Duplicate event",
  "Other",
];

// =========================================================
// MAIN EVENTS SCREEN
// =========================================================

export default function EventsScreen() {

  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const [rejectionReason, setRejectionReason] = useState("");

  const [rejectionRemarks, setRejectionRemarks] = useState("");

  const [
    showRejectReasonDropdown,
    setShowRejectReasonDropdown,
  ] = useState(false);

  const { width, height } =
    useWindowDimensions();

  const s = Math.max(
    0.72,
    Math.min(
      width / 1920,
      height / 1080
    )
  );

  const { admin } = useAdminAuth();

  // =======================================================
  // EVENTS
  // =======================================================

  const [events, setEvents] =
    useState<AdminEvent[]>([]);

  const [activeTab, setActiveTab] =
    useState<EventTab>("All Events");

  const [search, setSearch] =
    useState("");

  const [category, setCategory] =
    useState("All Types");

  const [status, setStatus] =
    useState("All Statuses");

  const [sortOrder, setSortOrder] =
    useState("Newest First");

  const [fromDate, setFromDate] =
    useState("");

  const [toDate, setToDate] =
    useState("");

  const [page, setPage] =
    useState(1);

  const [
    selectionMenu,
    setSelectionMenu,
  ] = useState<
    "category" | "status" | "sort" | null
  >(null);

  // =======================================================
  // ADD EVENT MODAL
  // =======================================================

  const [
    addModalOpen,
    setAddModalOpen,
  ] = useState(false);

  // =======================================================
  // SELECTED EVENT
  // =======================================================

  const [
    selectedEvent,
    setSelectedEvent,
  ] = useState<AdminEvent | null>(null);

  const [
    eventParticipants,
    setEventParticipants,
  ] = useState<EventParticipant[]>([]);

  const [
    loadingParticipants,
    setLoadingParticipants,
  ] = useState(false);

  // =======================================================
  // NEW EVENT FIELDS
  // =======================================================

  const [newTitle, setNewTitle] =
    useState("");

  const [
    newCategory,
    setNewCategory,
  ] = useState("Clean-up");

  const [
    newDescription,
    setNewDescription,
  ] = useState("");

  const [newDate, setNewDate] =
    useState("");

  const [newTime, setNewTime] =
    useState("");

  const [
    newLocation,
    setNewLocation,
  ] = useState("");

  const [
    newCapacity,
    setNewCapacity,
  ] = useState("");

  const [
    newImageUri,
    setNewImageUri,
  ] = useState<string | null>(null);

  const [
    newCoordinates,
    setNewCoordinates,
  ] = useState(
    VALENCIA_DEFAULT
  );

  // =======================================================
  // PROCESSING STATES
  // =======================================================

  const [
    isCreating,
    setIsCreating,
  ] = useState(false);

  const [
    isModerating,
    setIsModerating,
  ] = useState(false);

  const [
    showCategoryDropdown,
    setShowCategoryDropdown,
  ] = useState(false);

  const [
    showStatusDropdown,
    setShowStatusDropdown,
  ] = useState(false);

  const creatingRef =
    useRef(false);

  const moderatingRef =
    useRef(false);

  const pageSize = 5;

  // =======================================================
  // LOAD EVENTS
  // =======================================================

  const reloadEvents = async () => {
    try {
      setEvents(
        await fetchEvents()
      );
    } catch (error) {
      Alert.alert(
        "Events unavailable",
        error instanceof Error
          ? error.message
          : "Failed to load events."
      );
    }
  };

  useEffect(() => {
    void reloadEvents();
  }, []);

  // =======================================================
  // SUMMARY
  // =======================================================

  const stats = useMemo(
    () => ({
      total: events.length,

      pending: events.filter(
        (event) =>
          event.status === "Pending"
      ).length,

      ongoing: events.filter(
        (event) =>
          event.status === "Ongoing"
      ).length,

      completed: events.filter(
        (event) =>
          event.status === "Completed"
      ).length,
    }),
    [events]
  );

  // =======================================================
  // FILTERED EVENTS
  // =======================================================

  const filteredEvents =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      const matchingEvents =
        events.filter(
          (event) => {
            const matchesTab =
              activeTab ===
                "All Events" ||
              (activeTab ===
                "Pending Approval" &&
                event.status ===
                  "Pending") ||
              (activeTab ===
                "Rejected" &&
                event.status ===
                  "Rejected");

            const matchesSearch =
              !query ||
              event.title
                .toLowerCase()
                .includes(query) ||
              event.description
                .toLowerCase()
                .includes(query) ||
              event.location
                .toLowerCase()
                .includes(query) ||
              event.id
                .toLowerCase()
                .includes(query);

            const matchesCategory =
              category ===
                "All Types" ||
              event.category ===
                category;

            const matchesStatus =
              status ===
                "All Statuses" ||
              event.status ===
                status;

            const eventDay =
              new Date(
                event.date
              );

            const dateValue =
              Number.isNaN(
                eventDay.getTime()
              )
                ? event.createdAt
                : eventDay;

            const matchesDate =
              isWithinDateRange(
                dateValue,
                fromDate,
                toDate
              );

            return (
              matchesTab &&
              matchesSearch &&
              matchesCategory &&
              matchesStatus &&
              matchesDate
            );
          }
        );

      return [
        ...matchingEvents,
      ].sort(
        (
          first,
          second
        ) =>
          sortOrder ===
          "Newest First"
            ? second.createdAt.localeCompare(
                first.createdAt
              )
            : first.createdAt.localeCompare(
                second.createdAt
              )
      );
    }, [
      activeTab,
      category,
      events,
      search,
      sortOrder,
      status,
      fromDate,
      toDate,
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredEvents.length /
          pageSize
      )
    );

  const currentPage =
    Math.min(
      page,
      totalPages
    );

  const visibleEvents =
    filteredEvents.slice(
      (currentPage - 1) *
        pageSize,

      currentPage *
        pageSize
    );

  // =======================================================
  // TAB
  // =======================================================

  const changeTab = (
    tab: EventTab
  ) => {
    setActiveTab(tab);

    setStatus(
      tab ===
        "Pending Approval"
        ? "Pending"
        : tab ===
            "Rejected"
          ? "Rejected"
          : "All Statuses"
    );

    setPage(1);
  };

  // =======================================================
  // RESET FILTERS
  // =======================================================

  const resetFilters = () => {
    setSearch("");
    setCategory("All Types");
    setStatus("All Statuses");
    setSortOrder(
      "Newest First"
    );
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  // =======================================================
  // IMAGE PICKER
  // =======================================================

  const pickEventImage =
    async () => {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (
        !permission.granted
      ) {
        Alert.alert(
          "Permission required",
          "Allow photo access to select an event image."
        );

        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync(
          {
            mediaTypes: [
              "images",
            ],
            quality: 0.85,
          }
        );

      if (!result.canceled) {
        setNewImageUri(
          result.assets[0].uri
        );
      }
    };

  // =======================================================
  // MAP
  // =======================================================

  const handleMapPin = (
    coordinates: {
      latitude: number;
      longitude: number;
    }
  ) => {
    setNewCoordinates(
      coordinates
    );

    if (
      typeof window ===
        "undefined" ||
      !window.google?.maps ||
      newLocation.trim()
    ) {
      return;
    }

    const geocoder =
      new window.google.maps.Geocoder();

    geocoder.geocode(
      {
        location: {
          lat: coordinates.latitude,
          lng: coordinates.longitude,
        },
      },

      (
        results:
          | Array<{
              formatted_address?: string;
            }>
          | null,
        status: string
      ) => {
        if (
          status === "OK" &&
          results?.[0]
            ?.formatted_address
        ) {
          setNewLocation(
            results[0]
              .formatted_address
          );
        }
      }
    );
  };

  // =======================================================
  // CREATE EVENT
  // =======================================================

  const addEvent =
    async () => {
      if (
        creatingRef.current
      ) {
        return;
      }

      creatingRef.current =
        true;

      if (
        !newTitle.trim() ||
        !newDescription.trim() ||
        !newDate.trim() ||
        !newTime.trim() ||
        !newLocation.trim() ||
        !newCapacity.trim()
      ) {
        creatingRef.current =
          false;

        Alert.alert(
          "Incomplete event",
          "Complete all required event fields."
        );

        return;
      }

      const capacity =
        Number(newCapacity);

      if (
        !Number.isInteger(
          capacity
        ) ||
        capacity < 1
      ) {
        creatingRef.current =
          false;

        Alert.alert(
          "Invalid participants",
          "Maximum participants must be a positive whole number."
        );

        return;
      }

      if (!admin) {
        creatingRef.current =
          false;

        Alert.alert(
          "Not authorized",
          "Sign in as an administrator to create events."
        );

        return;
      }

      setIsCreating(true);

      try {
        let imageUrl = "";

        if (newImageUri) {
          imageUrl =
            await uploadAdminEventImage(
              newImageUri
            );
        }

        await createEvent(
          {
            title:
              newTitle.trim(),

            description:
              newDescription.trim(),

            category:
              newCategory,

            date:
              formatEventDate(
                newDate.trim()
              ),

            time:
              formatEventTime(
                newTime.trim()
              ),

            location:
              newLocation.trim(),

            status: "Pending",

            participants: 0,

            capacity,

            submittedBy:
              admin.fullName,

            submittedArea:
              "Admin Dashboard",

            submittedByUid:
              admin.uid,

            imageUrl,

            coordinates:
              newCoordinates,
          },

          admin
        );

        await reloadEvents();

        setNewTitle("");
        setNewCategory(
          "Clean-up"
        );
        setNewDescription("");
        setNewDate("");
        setNewTime("");
        setNewLocation("");
        setNewCapacity("");
        setNewImageUri(null);

        setNewCoordinates(
          VALENCIA_DEFAULT
        );

        setAddModalOpen(
          false
        );

        changeTab(
          "All Events"
        );

        Alert.alert(
          "Event created",
          "Saved successfully."
        );
      } catch (error) {
        Alert.alert(
          "Event not saved",
          error instanceof Error
            ? error.message
            : "Failed to create event."
        );

        creatingRef.current =
          false;

        setIsCreating(false);

        return;
      }

      setTimeout(() => {
        creatingRef.current =
          false;

        setIsCreating(false);
      }, 800);
    };

  // =======================================================
  // OPEN EVENT
  // =======================================================

  const openEventDetails =
    async (
      event: AdminEvent
    ) => {
      setSelectedEvent(
        event
      );

      setEventParticipants(
        []
      );

      setLoadingParticipants(
        true
      );

      try {
        setEventParticipants(
          await fetchEventParticipants(
            event.id
          )
        );
      } catch (error) {
        Alert.alert(
          "Participants unavailable",
          error instanceof Error
            ? error.message
            : "Failed to load participants."
        );
      } finally {
        setLoadingParticipants(
          false
        );
      }
    };

  // =======================================================
  // CLOSE EVENT
  // =======================================================

  const closeEventDetails =
    () => {
      setSelectedEvent(
        null
      );

      setEventParticipants(
        []
      );

      setLoadingParticipants(
        false
      );
    };

  // =======================================================
  // MODERATION
  // =======================================================

  const moderateEvent =
    async (
      nextStatus: EventStatus
    ) => {
      if (
        !selectedEvent ||
        !admin ||
        moderatingRef.current
      ) {
        return;
      }

      moderatingRef.current =
        true;

      setIsModerating(true);

      try {
        await updateEventStatus(
          selectedEvent.id,
          nextStatus,
          admin
        );

        closeEventDetails();

        await reloadEvents();
      } catch (error) {
        Alert.alert(
          "Event update failed",
          error instanceof Error
            ? error.message
            : "Failed to update event."
        );
      } finally {
        moderatingRef.current =
          false;

        setIsModerating(false);
      }
    };

const confirmRejectEvent = async () => {
  if (!rejectionReason) {
    Alert.alert(
      "Reason required",
      "Please select a reason for rejecting this event."
    );

    return;
  }

  setRejectModalOpen(false);
  setShowRejectReasonDropdown(false);

  // Existing backend logic remains unchanged.
  await moderateEvent("Rejected");

  setRejectionReason("");
  setRejectionRemarks("");
};

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <AdminLayout activePage="Events">
      {/* ================================================= */}
      {/* PENDING EVENT */}
      {/* ================================================= */}

      {selectedEvent?.status ===
      "Pending" ? (
        <PendingEventDetailsPage
          event={selectedEvent}
          isModerating={isModerating}
          onBack={closeEventDetails}
          onReject={() => {
            setRejectionReason("");
            setRejectionRemarks("");
            setShowRejectReasonDropdown(false);
            setRejectModalOpen(true);
          }}
          onApprove={() =>
            void moderateEvent("Upcoming")
          }
        />
      ) : (
        /* ================================================= */
        /* NORMAL EVENTS PAGE */
        /* ================================================= */

        <ScrollView
          style={styles.page}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop:
              height * 0.018,
            paddingBottom: 30,
            width: "100%",
          }}
          showsVerticalScrollIndicator={
            false
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* =============================================== */}
          {/* HEADER */}
          {/* =============================================== */}

          <View
            style={
              styles.headingRow
            }
          >
            <View>
              <Text
                style={[
                  styles.pageTitle,
                  {
                    fontSize:
                      40 * s,
                  },
                ]}
              >
                {activeTab ===
                "Pending Approval"
                  ? "PENDING APPROVAL"
                  : activeTab ===
                      "Rejected"
                    ? "REJECTED EVENTS"
                    : "EVENTS"}
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  {
                    fontSize:
                      16 * s,
                  },
                ]}
              >
                {activeTab ===
                "Pending Approval"
                  ? "Review and approve or reject event submissions from users."
                  : activeTab ===
                      "Rejected"
                    ? "Review event submissions that were not approved."
                    : "Manage and monitor all environmental events"}
              </Text>
            </View>

            {activeTab ===
              "All Events" && (
              <TouchableOpacity
                style={
                  styles.addButton
                }
                onPress={() =>
                  setAddModalOpen(
                    true
                  )
                }
              >
                <Plus
                  size={18 * s}
                  color="#ffffff"
                  strokeWidth={3}
                />

                <Text
                  style={[
                    styles.addButtonText,
                    {
                      fontSize:
                        14 * s,
                    },
                  ]}
                >
                  Add New Event
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* =============================================== */}
          {/* TABS */}
          {/* =============================================== */}

          <View style={styles.tabs}>
            {(
              [
                "All Events",
                "Pending Approval",
                "Rejected",
              ] as EventTab[]
            ).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.tab,
                  activeTab ===
                    tab &&
                    styles.activeTab,
                ]}
                onPress={() =>
                  changeTab(tab)
                }
              >
                {tab ===
                  "All Events" && (
                  <CalendarDays
                    size={17 * s}
                    color="#1b1b1b"
                  />
                )}

                {tab ===
                  "Pending Approval" && (
                  <Clock3
                    size={17 * s}
                    color="#1b1b1b"
                  />
                )}

                {tab ===
                  "Rejected" && (
                  <X
                    size={17 * s}
                    color="#1b1b1b"
                  />
                )}

                <Text
                  style={[
                    styles.tabText,
                    {
                      fontSize:
                        14 * s,
                    },
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* =============================================== */}
          {/* SUMMARY */}
          {/* =============================================== */}

          {activeTab ===
            "All Events" && (
            <View
              style={[
                styles.cards,
                {
                  gap: 28 * s,
                },
              ]}
            >
              <SummaryCard
                title="Total Events"
                value={
                  stats.total
                }
                color="#ffffff"
                icon={
                  CalendarCheck
                }
                iconColor="#0aa65b"
                scale={s}
              />

              <SummaryCard
                title="Pending Approval"
                value={
                  stats.pending
                }
                color="#fff1c9"
                icon={Clock3}
                iconColor="#111111"
                scale={s}
              />

              <SummaryCard
                title="Ongoing Events"
                value={
                  stats.ongoing
                }
                color="#cfe9fb"
                icon={
                  LoaderCircle
                }
                iconColor="#168df0"
                scale={s}
              />

              <SummaryCard
                title="Completed Events"
                value={
                  stats.completed
                }
                color="#cceecb"
                icon={
                  CircleCheckBig
                }
                iconColor="#42b94d"
                scale={s}
              />
            </View>
          )}

          {/* =============================================== */}
          {/* FILTER PANEL */}
          {/* =============================================== */}

          <View
            style={[
              styles.filterPanel,
              {
                padding: 14 * s,
              },
            ]}
          >
            {/* SEARCH */}

            <View
              style={
                styles.searchBox
              }
            >
              <TextInput
                value={search}
                onChangeText={(
                  value
                ) => {
                  setSearch(
                    value
                  );

                  setPage(1);
                }}
                placeholder="Search events..."
                placeholderTextColor="#777"
                style={[
                  styles.searchInput,
                  {
                    fontSize:
                      15 * s,
                  },
                ]}
              />

              <Search
                size={19 * s}
                color="#555"
              />
            </View>

            {/* CATEGORY */}

            <View
              style={
                styles.dropdownContainer
              }
            >
              <TouchableOpacity
                activeOpacity={0.82}
                style={[
                  styles.filterBox,
                  showCategoryDropdown &&
                    styles.filterBoxOpen,
                ]}
                onPress={() => {
                  setShowCategoryDropdown(
                    !showCategoryDropdown
                  );

                  setShowStatusDropdown(
                    false
                  );
                }}
              >
                <Text
                  style={
                    styles.filterLabel
                  }
                >
                  Event Type
                </Text>

                <View
                  style={
                    styles.filterValueRow
                  }
                >
                  <Text
                    style={[
                      styles.filterValue,
                      showCategoryDropdown &&
                        styles.filterValueOpen,
                    ]}
                  >
                    {category}
                  </Text>

                  <ChevronDown
                    size={16}
                    color={
                      showCategoryDropdown
                        ? "#34733B"
                        : "#333333"
                    }
                    style={{
                      transform: [
                        {
                          rotate:
                            showCategoryDropdown
                              ? "180deg"
                              : "0deg",
                        },
                      ],
                    }}
                  />
                </View>
              </TouchableOpacity>

              {showCategoryDropdown && (
                <View
                  style={
                    styles.dropdownMenu
                  }
                >
                  {CATEGORY_OPTIONS.map(
                    (item) => {
                      const selected =
                        category === item;

                      return (
                        <TouchableOpacity
                          key={
                            item
                          }
                          activeOpacity={
                            0.75
                          }
                          style={[
                            styles.dropdownItem,
                            selected &&
                              styles.dropdownItemSelected,
                          ]}
                          onPress={() => {
                            setCategory(
                              item
                            );

                            setPage(
                              1
                            );

                            setShowCategoryDropdown(
                              false
                            );
                          }}
                        >
                          <Text
                            style={[
                              styles.dropdownText,
                              selected &&
                                styles.dropdownTextSelected,
                            ]}
                          >
                            {
                              item
                            }
                          </Text>

                          {selected && (
                            <Check
                              size={
                                16
                              }
                              color="#34733B"
                              strokeWidth={
                                2.5
                              }
                            />
                          )}
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>
              )}
            </View>

            {/* STATUS */}

            <View
              style={
                styles.dropdownContainer
              }
            >
              <TouchableOpacity
                activeOpacity={0.82}
                style={[
                  styles.filterBox,
                  showStatusDropdown &&
                    styles.filterBoxOpen,
                ]}
                onPress={() => {
                  setShowStatusDropdown(
                    !showStatusDropdown
                  );

                  setShowCategoryDropdown(
                    false
                  );
                }}
              >
                <Text
                  style={
                    styles.filterLabel
                  }
                >
                  Status
                </Text>

                <View
                  style={
                    styles.filterValueRow
                  }
                >
                  <Text
                    style={[
                      styles.filterValue,
                      showStatusDropdown &&
                        styles.filterValueOpen,
                    ]}
                  >
                    {status}
                  </Text>

                  <ChevronDown
                    size={16}
                    color={
                      showStatusDropdown
                        ? "#34733B"
                        : "#333333"
                    }
                    style={{
                      transform: [
                        {
                          rotate:
                            showStatusDropdown
                              ? "180deg"
                              : "0deg",
                        },
                      ],
                    }}
                  />
                </View>
              </TouchableOpacity>

              {showStatusDropdown && (
                <View
                  style={
                    styles.dropdownMenu
                  }
                >
                  {STATUS_OPTIONS.map(
                    (item) => {
                      const selected =
                        status === item;

                      return (
                        <TouchableOpacity
                          key={
                            item
                          }
                          activeOpacity={
                            0.75
                          }
                          style={[
                            styles.dropdownItem,
                            selected &&
                              styles.dropdownItemSelected,
                          ]}
                          onPress={() => {
                            setStatus(
                              item
                            );

                            setPage(
                              1
                            );

                            setShowStatusDropdown(
                              false
                            );
                          }}
                        >
                          <Text
                            style={[
                              styles.dropdownText,
                              selected &&
                                styles.dropdownTextSelected,
                            ]}
                          >
                            {
                              item
                            }
                          </Text>

                          {selected && (
                            <Check
                              size={
                                16
                              }
                              color="#34733B"
                              strokeWidth={
                                2.5
                              }
                            />
                          )}
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>
              )}
            </View>

            {/* DATE / SORT */}

            {activeTab ===
            "All Events" ? (
              <DateRangeFilter
                label="Date Range"
                fromDate={
                  fromDate
                }
                toDate={toDate}
                onChangeFrom={(
                  value
                ) => {
                  setFromDate(
                    value
                  );

                  setPage(1);
                }}
                onChangeTo={(
                  value
                ) => {
                  setToDate(
                    value
                  );

                  setPage(1);
                }}
                style={{
                  flex: 1.5,
                  minWidth: 220,
                }}
              />
            ) : (
              <TouchableOpacity
                style={
                  styles.filterBox
                }
                onPress={() =>
                  setSelectionMenu(
                    "sort"
                  )
                }
              >
                <Text
                  style={[
                    styles.filterLabel,
                    {
                      fontSize:
                        11 * s,
                    },
                  ]}
                >
                  Sort By
                </Text>

                <View
                  style={
                    styles.filterValueRow
                  }
                >
                  <Text
                    style={[
                      styles.filterValue,
                      {
                        fontSize:
                          14 * s,
                      },
                    ]}
                  >
                    {sortOrder}
                  </Text>

                  <ChevronDown
                    size={12 * s}
                    color="#333"
                  />
                </View>
              </TouchableOpacity>
            )}

            {/* RESET */}

            <TouchableOpacity
              style={
                styles.resetButton
              }
              onPress={
                resetFilters
              }
            >
              <Filter
                size={15 * s}
                color="#43884c"
              />

              <Text
                style={[
                  styles.resetText,
                  {
                    fontSize:
                      12 * s,
                  },
                ]}
              >
                Reset
              </Text>
            </TouchableOpacity>
          </View>

          {/* =============================================== */}
          {/* TABLE */}
          {/* =============================================== */}

          <View
            style={
              styles.tablePanel
            }
          >
            <ScrollView
              horizontal={
                width < 1100
              }
              showsHorizontalScrollIndicator={
                width < 1100
              }
            >
              <View
                style={[
                  styles.table,
                  width >= 1100
                    ? styles.tableFullWidth
                    : null,
                ]}
              >
                {/* TABLE HEADER */}

                <View
                  style={
                    styles.tableHeader
                  }
                >
                  {activeTab ===
                    "All Events" && (
                    <Text
                      style={[
                        styles.th,
                        styles.idColumn,
                      ]}
                    >
                      ID
                    </Text>
                  )}

                  <Text
                    style={[
                      styles.th,
                      styles.detailsColumn,
                    ]}
                  >
                    Event Details
                  </Text>

                  {activeTab !==
                    "All Events" && (
                    <Text
                      style={[
                        styles.th,
                        styles.submittedColumn,
                      ]}
                    >
                      Submitted By
                    </Text>
                  )}

                  <Text
                    style={[
                      styles.th,
                      styles.categoryColumn,
                    ]}
                  >
                    Event Category
                  </Text>

                  <Text
                    style={[
                      styles.th,
                      styles.dateColumn,
                    ]}
                  >
                    Date & Time
                  </Text>

                  <Text
                    style={[
                      styles.th,
                      styles.locationColumn,
                    ]}
                  >
                    Location
                  </Text>

                  {activeTab ===
                    "All Events" && (
                    <Text
                      style={[
                        styles.th,
                        styles.statusColumn,
                      ]}
                    >
                      Status
                    </Text>
                  )}

                  <Text
                    style={[
                      styles.th,
                      styles.participantsColumn,
                    ]}
                  >
                    Participants
                  </Text>

                  <Text
                    style={[
                      styles.th,
                      styles.actionColumn,
                      {
                        transform: [
                          {
                            translateX: 50,
                          },
                        ],
                      },
                    ]}
                  >
                    Action
                  </Text>
                </View>

                {/* TABLE BODY */}

                {visibleEvents.length ? (
                  visibleEvents.map(
                    (event) => (
                      <View
                        key={
                          event.id
                        }
                        style={
                          styles.tableRow
                        }
                      >
                        {activeTab ===
                          "All Events" && (
                          <Text
                            style={[
                              styles.cellText,
                              styles.idColumn,
                            ]}
                            numberOfLines={
                              1
                            }
                          >
                            #
                            {event.id.slice(
                              0,
                              8
                            )}
                          </Text>
                        )}

                        {/* DETAILS */}

                        <View
                          style={[
                            styles.detailsCell,
                            styles.detailsColumn,
                          ]}
                        >
                          <View
                            style={
                              styles.eventThumbnail
                            }
                          >
                            {event.imageUrl ? (
                              <Image
                                source={{
                                  uri: event.imageUrl,
                                }}
                                style={
                                  styles.eventThumbnailImage
                                }
                              />
                            ) : (
                              <CalendarDays
                                size={
                                  18
                                }
                                color="#7d8c7c"
                              />
                            )}
                          </View>

                          <View
                            style={
                              styles.eventCopy
                            }
                          >
                            <Text
                              numberOfLines={
                                1
                              }
                              style={
                                styles.eventTitle
                              }
                            >
                              {
                                event.title
                              }
                            </Text>

                            <Text
                              numberOfLines={
                                2
                              }
                              style={
                                styles.eventDescription
                              }
                            >
                              {
                                event.description
                              }
                            </Text>
                          </View>
                        </View>

                        {/* SUBMITTED BY */}

                        {activeTab !==
                          "All Events" && (
                          <View
                            style={[
                              styles.submittedCell,
                              styles.submittedColumn,
                            ]}
                          >
                            <View
                              style={
                                styles.submitterIcon
                              }
                            >
                              <UserRound
                                size={
                                  13
                                }
                                color="#ffffff"
                              />
                            </View>

                            <View>
                              <Text
                                style={
                                  styles.eventTitle
                                }
                              >
                                {
                                  event.submittedBy
                                }
                              </Text>

                              <Text
                                style={
                                  styles.smallText
                                }
                              >
                                {
                                  event.submittedArea
                                }
                              </Text>
                            </View>
                          </View>
                        )}

                        {/* CATEGORY */}

                        <View
                          style={
                            styles.categoryColumn
                          }
                        >
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor:
                                  categoryColor(
                                    event.category
                                  ),
                              },
                            ]}
                          >
                            <Text
                              style={
                                styles.badgeText
                              }
                            >
                              {
                                event.category
                              }
                            </Text>
                          </View>
                        </View>

                        {/* DATE */}

                        <View
                          style={
                            styles.dateColumn
                          }
                        >
                          <Text
                            style={
                              styles.dateText
                            }
                          >
                            {
                              event.date
                            }
                          </Text>

                          <Text
                            style={
                              styles.smallText
                            }
                          >
                            {
                              event.time
                            }
                          </Text>
                        </View>

                        {/* LOCATION */}

                        <Text
                          numberOfLines={
                            2
                          }
                          style={[
                            styles.cellText,
                            styles.locationColumn,
                          ]}
                        >
                          {
                            event.location
                          }
                        </Text>

                        {/* STATUS */}

                        {activeTab ===
                          "All Events" && (
                          <View
                            style={
                              styles.statusColumn
                            }
                          >
                            <View
                              style={[
                                styles.badge,
                                {
                                  backgroundColor:
                                    statusColor(
                                      event.status
                                    ),
                                },
                              ]}
                            >
                              <Text
                                style={
                                  styles.badgeText
                                }
                              >
                                {
                                  event.status
                                }
                              </Text>
                            </View>
                          </View>
                        )}

                        {/* PARTICIPANTS */}

                        <View
                          style={
                            styles.participantsColumn
                          }
                        >
                          <Text
                            style={[
                              styles.smallText,
                              {
                                transform:
                                  [
                                    {
                                      translateX: 25,
                                    },
                                  ],
                              },
                            ]}
                          >
                            {
                              event.participants
                            }{" "}
                            /{" "}
                            {
                              event.capacity
                            }
                          </Text>

                          <Text
                            style={[
                              styles.smallText,
                              {
                                transform:
                                  [
                                    {
                                      translateX: 18,
                                    },
                                  ],
                              },
                            ]}
                          >
                            Expected
                          </Text>
                        </View>

                        {/* ACTION */}

                        <View
                          style={
                            styles.actionColumn
                          }
                        >
                          <TouchableOpacity
                            style={
                              styles.viewButton
                            }
                            onPress={() =>
                              void openEventDetails(
                                event
                              )
                            }
                          >
                            <Eye
                              size={
                                13
                              }
                              color="#377b3d"
                            />

                            <Text
                              style={
                                styles.viewButtonText
                              }
                            >
                              View Event
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )
                  )
                ) : (
                  <View
                    style={
                      styles.emptyRow
                    }
                  >
                    <Text
                      style={
                        styles.emptyText
                      }
                    >
                      No events match
                      the selected
                      filters.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* PAGINATION */}

            <View
              style={
                styles.pagination
              }
            >
              <Text
                style={
                  styles.paginationText
                }
              >
                Showing{" "}
                {filteredEvents.length
                  ? (currentPage -
                        1) *
                        pageSize +
                    1
                  : 0}{" "}
                to{" "}
                {Math.min(
                  currentPage *
                    pageSize,
                  filteredEvents.length
                )}{" "}
                of{" "}
                {
                  filteredEvents.length
                }{" "}
                events
              </Text>

              <View
                style={
                  styles.pageControls
                }
              >
                <TouchableOpacity
                  style={
                    styles.pageButton
                  }
                  disabled={
                    currentPage === 1
                  }
                  onPress={() =>
                    setPage(
                      (
                        value
                      ) =>
                        Math.max(
                          1,
                          value -
                            1
                        )
                    )
                  }
                >
                  <Text
                    style={
                      styles.pageButtonText
                    }
                  >
                    ‹
                  </Text>
                </TouchableOpacity>

                {Array.from(
                  {
                    length:
                      totalPages,
                  },
                  (_, index) =>
                    index + 1
                ).map(
                  (number) => (
                    <TouchableOpacity
                      key={
                        number
                      }
                      style={[
                        styles.pageButton,
                        currentPage ===
                          number &&
                          styles.activePageButton,
                      ]}
                      onPress={() =>
                        setPage(
                          number
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.pageButtonText,
                          currentPage ===
                            number &&
                            styles.activePageButtonText,
                        ]}
                      >
                        {
                          number
                        }
                      </Text>
                    </TouchableOpacity>
                  )
                )}

                <TouchableOpacity
                  style={
                    styles.pageButton
                  }
                  disabled={
                    currentPage ===
                    totalPages
                  }
                  onPress={() =>
                    setPage(
                      (
                        value
                      ) =>
                        Math.min(
                          totalPages,
                          value +
                            1
                        )
                    )
                  }
                >
                  <Text
                    style={
                      styles.pageButtonText
                    }
                  >
                    ›
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ================================================= */}
      {/* REJECT EVENT MODAL */}
      {/* ================================================= */}

      <Modal
        visible={rejectModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isModerating) {
            setRejectModalOpen(false);
            setShowRejectReasonDropdown(false);
          }
        }}
      >
        <Pressable
          style={styles.rejectModalOverlay}
          onPress={() => {
            if (!isModerating) {
              setRejectModalOpen(false);
              setShowRejectReasonDropdown(false);
            }
          }}
        >
          <Pressable
            style={styles.rejectModal}
            onPress={() => {
              // Prevent clicking inside from closing the modal.
            }}
          >
            {/* TITLE */}

            <Text style={styles.rejectModalTitle}>
              REJECT EVENT
            </Text>

            <Text style={styles.rejectModalDescription}>
              Please provide a reason for rejecting the event. The
              submitter will be notified of the reason.
            </Text>

            {/* REASON FOR REJECTION */}

<View
  style={[
    styles.rejectField,
    styles.rejectReasonField,
  ]}
>
  <Text style={styles.rejectLabel}>
    Reason for Rejection
  </Text>

  <View style={styles.rejectDropdownWrapper}>
    <Pressable
      style={({ pressed }) => [
        styles.rejectDropdownButton,
        pressed && {
          opacity: 0.85,
        },
        showRejectReasonDropdown &&
          styles.rejectDropdownButtonOpen,
      ]}
      onPress={() =>
        setShowRejectReasonDropdown(
          (previous) => !previous
        )
      }
    >
      <Text
        numberOfLines={1}
        style={[
          styles.rejectDropdownText,
          !rejectionReason &&
            styles.rejectDropdownPlaceholder,
        ]}
      >
        {rejectionReason || "Select a reason"}
      </Text>

      <ChevronDown
        size={18}
        color="#333333"
        style={{
          transform: [
            {
              rotate: showRejectReasonDropdown
                ? "180deg"
                : "0deg",
            },
          ],
        }}
      />
    </Pressable>

    {showRejectReasonDropdown && (
      <View style={styles.rejectDropdownMenu}>
        {REJECTION_REASONS.map((reason) => {
          const selected =
            rejectionReason === reason;

          return (
            <Pressable
              key={reason}
              style={({ pressed }) => [
                styles.rejectDropdownOption,
                selected &&
                  styles.rejectDropdownOptionSelected,
                pressed &&
                  styles.rejectDropdownOptionPressed,
              ]}
              onPress={() => {
                setRejectionReason(reason);
                setShowRejectReasonDropdown(false);
              }}
            >
              <Text
                style={[
                  styles.rejectDropdownOptionText,
                  selected &&
                    styles.rejectDropdownOptionTextSelected,
                ]}
              >
                {reason}
              </Text>

              {selected && (
                <Check
                  size={16}
                  color="#178126"
                  strokeWidth={2.5}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    )}
  </View>
</View>

{/* ADDITIONAL REMARKS */}

<View
  style={[
    styles.rejectField,
    styles.rejectRemarksField,
  ]}
>
  <Text style={styles.rejectLabel}>
    Additional Remarks (Optional)
  </Text>

  <TextInput
    value={rejectionRemarks}
    onChangeText={setRejectionRemarks}
    placeholder="Provide additional details..."
    placeholderTextColor="#8A8A8A"
    multiline
    textAlignVertical="top"
    style={styles.rejectRemarksInput}
  />
</View>

            {/* BUTTONS */}

            <View style={styles.rejectModalActions}>
              <TouchableOpacity
                style={[
                  styles.rejectCancelButton,
                  isModerating && {
                    opacity: 0.6,
                  },
                ]}
                disabled={isModerating}
                onPress={() => {
                  setRejectModalOpen(false);
                  setShowRejectReasonDropdown(false);
                }}
              >
                <Text style={styles.rejectCancelText}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.rejectConfirmButton,
                  isModerating && {
                    opacity: 0.7,
                  },
                ]}
                disabled={isModerating}
                onPress={() =>
                  void confirmRejectEvent()
                }
              >
                <Text style={styles.rejectConfirmText}>
                  {isModerating
                    ? "Rejecting..."
                    : "Confirm Reject"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>


      {/* ================================================= */}
      {/* OPTION MODAL */}
      {/* ================================================= */}

      <OptionModal
        visible={
          selectionMenu !==
          null
        }
        title={
          selectionMenu ===
          "category"
            ? "Select Event Type"
            : selectionMenu ===
                "sort"
              ? "Sort Events"
              : "Select Status"
        }
        options={
          selectionMenu ===
          "category"
            ? CATEGORY_OPTIONS
            : selectionMenu ===
                "sort"
              ? [
                  "Newest First",
                  "Oldest First",
                ]
              : STATUS_OPTIONS
        }
        selected={
          selectionMenu ===
          "category"
            ? category
            : selectionMenu ===
                "sort"
              ? sortOrder
              : status
        }
        onClose={() =>
          setSelectionMenu(null)
        }
        onSelect={(value) => {
          if (
            selectionMenu ===
            "category"
          ) {
            setCategory(value);
          }

          if (
            selectionMenu ===
            "status"
          ) {
            setStatus(value);
          }

          if (
            selectionMenu ===
            "sort"
          ) {
            setSortOrder(value);
          }

          setSelectionMenu(null);

          setPage(1);
        }}
      />

      {/* ================================================= */}
      {/* ADD EVENT MODAL */}
      {/* ================================================= */}

      <Modal
        visible={addModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setAddModalOpen(false)
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={
              styles.formModal
            }
          >
            <View
              style={
                styles.modalHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  Add New Event
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  Create an event
                  for administrator
                  approval.
                </Text>
              </View>

              <Pressable
                style={
                  styles.closeButton
                }
                onPress={() =>
                  setAddModalOpen(
                    false
                  )
                }
              >
                <X
                  size={20}
                  color="#222"
                />
              </Pressable>
            </View>

            <View
              style={
                styles.formColumns
              }
            >
              {/* LEFT */}

              <View
                style={
                  styles.formColumn
                }
              >
                <FormField
                  label="Event Title"
                  value={
                    newTitle
                  }
                  onChangeText={
                    setNewTitle
                  }
                  placeholder="Enter event title"
                />

                <Text
                  style={
                    styles.inputLabel
                  }
                >
                  Event Category
                </Text>

                <View
                  style={
                    styles.categoryChoices
                  }
                >
                  {CATEGORY_OPTIONS.slice(
                    1
                  ).map(
                    (
                      option
                    ) => (
                      <TouchableOpacity
                        key={
                          option
                        }
                        style={[
                          styles.choiceButton,
                          newCategory ===
                            option &&
                            styles.choiceButtonActive,
                        ]}
                        onPress={() =>
                          setNewCategory(
                            option
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            newCategory ===
                              option &&
                              styles.choiceTextActive,
                          ]}
                        >
                          {
                            option
                          }
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>

                <FormField
                  label="Description"
                  value={
                    newDescription
                  }
                  onChangeText={
                    setNewDescription
                  }
                  placeholder="Enter event description"
                  multiline
                />

                <View
                  style={
                    styles.inlineFields
                  }
                >
                  <View
                    style={
                      styles.inlineField
                    }
                  >
                    <DatePickerField
                      label="Date"
                      value={
                        newDate
                      }
                      onChange={
                        setNewDate
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.inlineField
                    }
                  >
                    <TimePickerField
                      label="Time"
                      value={
                        newTime
                      }
                      onChange={
                        setNewTime
                      }
                    />
                  </View>
                </View>

                <FormField
                  label="Maximum Participants"
                  value={
                    newCapacity
                  }
                  onChangeText={
                    setNewCapacity
                  }
                  placeholder="Enter maximum participants"
                />
              </View>

              {/* RIGHT */}

              <View
                style={
                  styles.formColumn
                }
              >
                <Text
                  style={
                    styles.inputLabel
                  }
                >
                  Location Map
                </Text>

                <InteractiveLocationMap
                  coordinates={
                    newCoordinates
                  }
                  height={180}
                  selectable
                  onSelect={
                    handleMapPin
                  }
                />

                <Text
                  style={
                    styles.mapHint
                  }
                >
                  Click the map to
                  pin a location,
                  or type the
                  address below.
                </Text>

                <FormField
                  label="Location"
                  value={
                    newLocation
                  }
                  onChangeText={
                    setNewLocation
                  }
                  placeholder="e.g., Barangay Hall, North Poblacion"
                />

                <Text
                  style={
                    styles.inputLabel
                  }
                >
                  Event Image
                </Text>

                <TouchableOpacity
                  style={
                    styles.uploadBox
                  }
                  onPress={
                    pickEventImage
                  }
                >
                  {newImageUri ? (
                    <Image
                      source={{
                        uri: newImageUri,
                      }}
                      style={
                        styles.uploadPreview
                      }
                      resizeMode="cover"
                    />
                  ) : (
                    <>
                      <Upload
                        size={
                          29
                        }
                        color="#333"
                      />

                      <Text
                        style={
                          styles.uploadTitle
                        }
                      >
                        Click to
                        upload image
                      </Text>

                      <Text
                        style={
                          styles.uploadHint
                        }
                      >
                        PNG, JPG up
                        to 5MB
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View
              style={
                styles.modalActions
              }
            >
              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  isCreating && {
                    opacity: 0.6,
                  },
                ]}
                onPress={() =>
                  !isCreating &&
                  setAddModalOpen(
                    false
                  )
                }
                disabled={
                  isCreating
                }
              >
                <Text
                  style={
                    styles.cancelText
                  }
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  isCreating && {
                    opacity: 0.7,
                  },
                ]}
                onPress={
                  addEvent
                }
                disabled={
                  isCreating
                }
                activeOpacity={
                  isCreating
                    ? 1
                    : 0.8
                }
              >
                <Check
                  size={17}
                  color="#ffffff"
                />

                <Text
                  style={
                    styles.saveText
                  }
                >
                  {isCreating
                    ? "Creating..."
                    : "Create Event"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================================================= */}
      {/* NON-PENDING EVENT DETAILS MODAL */}
      {/* Pending events DO NOT use this modal anymore */}
      {/* ================================================= */}

      <Modal
        visible={
          selectedEvent !==
            null &&
          selectedEvent.status !==
            "Pending"
        }
        transparent
        animationType="fade"
        onRequestClose={
          closeEventDetails
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          {selectedEvent && (
            <ScrollView
              style={
                styles.detailsModalScroll
              }
              contentContainerStyle={
                styles.detailsModal
              }
            >
              <View
                style={
                  styles.modalHeader
                }
              >
                <View
                  style={
                    styles.modalTitleWrap
                  }
                >
                  <Text
                    style={
                      styles.modalTitle
                    }
                  >
                    {
                      selectedEvent.title
                    }
                  </Text>

                  <Text
                    style={
                      styles.modalSubtitle
                    }
                  >
                    #
                    {
                      selectedEvent.id
                    }
                  </Text>
                </View>

                <Pressable
                  style={
                    styles.closeButton
                  }
                  onPress={
                    closeEventDetails
                  }
                >
                  <X
                    size={20}
                    color="#222"
                  />
                </Pressable>
              </View>

              {selectedEvent.imageUrl ? (
                <Image
                  source={{
                    uri: selectedEvent.imageUrl,
                  }}
                  style={
                    styles.detailsHeroImage
                  }
                />
              ) : null}

              <Text
                style={
                  styles.detailsDescription
                }
              >
                {
                  selectedEvent.description
                }
              </Text>

              <InteractiveLocationMap
                coordinates={
                  selectedEvent.coordinates
                }
                height={180}
              />

              <DetailRow
                label="Category"
                value={
                  selectedEvent.category
                }
              />

              <DetailRow
                label="Date & Time"
                value={`${selectedEvent.date} · ${selectedEvent.time}`}
              />

              <DetailRow
                label="Location"
                value={
                  selectedEvent.location
                }
              />

              {selectedEvent.coordinates ? (
                <DetailRow
                  label="GPS"
                  value={`${selectedEvent.coordinates.latitude.toFixed(
                    6
                  )}, ${selectedEvent.coordinates.longitude.toFixed(
                    6
                  )}`}
                />
              ) : null}

              <DetailRow
                label="Status"
                value={
                  selectedEvent.status
                }
              />

              <DetailRow
                label="Participants"
                value={`${selectedEvent.participants} of ${selectedEvent.capacity}`}
              />

              <DetailRow
                label="Submitted By"
                value={
                  selectedEvent.submittedBy
                }
              />

              {/* PARTICIPANTS */}

              <Text
                style={
                  styles.participantsHeading
                }
              >
                Participant List
              </Text>

              {loadingParticipants ? (
                <Text
                  style={
                    styles.smallText
                  }
                >
                  Loading
                  participants...
                </Text>
              ) : eventParticipants.length ===
                0 ? (
                <Text
                  style={
                    styles.smallText
                  }
                >
                  No users have
                  joined this event
                  yet.
                </Text>
              ) : (
                eventParticipants.map(
                  (
                    participant
                  ) => {
                    const joined =
                      participant.joinedAt
                        ? formatDateTime(
                            participant.joinedAt
                          )
                        : null;

                    return (
                      <View
                        key={
                          participant.uid
                        }
                        style={
                          styles.participantRow
                        }
                      >
                        <View
                          style={
                            styles.submitterIcon
                          }
                        >
                          <UserRound
                            size={
                              13
                            }
                            color="#ffffff"
                          />
                        </View>

                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={
                              styles.eventTitle
                            }
                          >
                            {
                              participant.name
                            }
                          </Text>

                          <Text
                            style={
                              styles.smallText
                            }
                          >
                            {
                              participant.email
                            }
                          </Text>

                          {joined ? (
                            <Text
                              style={
                                styles.smallText
                              }
                            >
                              Joined{" "}
                              {
                                joined.date
                              }{" "}
                              ·{" "}
                              {
                                joined.time
                              }
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  }
                )
              )}

              {/* ACTIONS */}

              <View
                style={
                  styles.moderationActions
                }
              >
                {selectedEvent.status ===
                  "Upcoming" && (
                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      isModerating && {
                        opacity: 0.7,
                      },
                    ]}
                    onPress={() =>
                      moderateEvent(
                        "Ongoing"
                      )
                    }
                    disabled={
                      isModerating
                    }
                  >
                    <Text
                      style={
                        styles.saveText
                      }
                    >
                      {isModerating
                        ? "Please wait..."
                        : "Mark Ongoing"}
                    </Text>
                  </TouchableOpacity>
                )}

                {selectedEvent.status ===
                  "Ongoing" && (
                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      isModerating && {
                        opacity: 0.7,
                      },
                    ]}
                    onPress={() =>
                      moderateEvent(
                        "Completed"
                      )
                    }
                    disabled={
                      isModerating
                    }
                  >
                    <Text
                      style={
                        styles.saveText
                      }
                    >
                      {isModerating
                        ? "Please wait..."
                        : "Mark Completed"}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    isModerating && {
                      opacity: 0.6,
                    },
                  ]}
                  onPress={() =>
                    !isModerating &&
                    closeEventDetails()
                  }
                  disabled={
                    isModerating
                  }
                >
                  <Text
                    style={
                      styles.cancelText
                    }
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </AdminLayout>
  );
}

// =========================================================
// PENDING EVENT FULL DETAILS PAGE
// =========================================================

function PendingEventDetailsPage({
  event,
  isModerating,
  onBack,
  onReject,
  onApprove,
}: {
  event: AdminEvent;
  isModerating: boolean;
  onBack: () => void;
  onReject: () => void;
  onApprove: () => void;
}) {
  const submitted =
    formatDateTime(
      event.createdAt
    );

  return (
    <ScrollView
      style={
        styles.pendingDetailsPage
      }
      contentContainerStyle={
        styles.pendingDetailsContent
      }
      showsVerticalScrollIndicator={
        false
      }
    >
      {/* BACK */}

      <TouchableOpacity
        style={
          styles.pendingBackButton
        }
        onPress={onBack}
        disabled={
          isModerating
        }
      >
        <ArrowLeft
          size={28}
          color="#1f1f1f"
          strokeWidth={2}
        />
      </TouchableOpacity>

      {/* TWO COLUMNS */}

      <View
        style={
          styles.pendingDetailsGrid
        }
      >
        {/* =============================================== */}
        {/* LEFT */}
        {/* =============================================== */}

        <View
          style={
            styles.pendingLeftColumn
          }
        >
          {/* MAIN INFORMATION */}

          <View
            style={
              styles.pendingMainCard
            }
          >
            <View
              style={
                styles.pendingTopSection
              }
            >
              {/* IMAGE */}

              <View
                style={
                  styles.pendingHeroWrapper
                }
              >
                {event.imageUrl ? (
                  <Image
                    source={{
                      uri: event.imageUrl,
                    }}
                    style={
                      styles.pendingHeroImage
                    }
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={
                      styles.pendingHeroPlaceholder
                    }
                  >
                    <CalendarDays
                      size={40}
                      color="#7d8c7c"
                    />

                    <Text
                      style={
                        styles.pendingNoImageText
                      }
                    >
                      No event image
                    </Text>
                  </View>
                )}
              </View>

              {/* TITLE */}

              <View
                style={
                  styles.pendingEventHeading
                }
              >
                <View
                  style={
                    styles.pendingNotice
                  }
                >
                  <Text
                    style={
                      styles.pendingNoticeText
                    }
                  >
                    This event is
                    pending for your
                    approval.
                  </Text>
                </View>

                <Text
                  style={
                    styles.pendingEventTitle
                  }
                >
                  {event.title}
                </Text>

                <View
                  style={[
                    styles.pendingCategoryBadge,
                    {
                      backgroundColor:
                        categoryColor(
                          event.category
                        ),
                    },
                  ]}
                >
                  <Text
                    style={
                      styles.pendingCategoryText
                    }
                  >
                    {
                      event.category
                    }
                  </Text>
                </View>

                <Text
                  style={
                    styles.pendingEventId
                  }
                >
                  #
                  {event.id
                    .slice(0, 8)
                    .toUpperCase()}
                </Text>
              </View>
            </View>

            {/* INFO ROWS */}

            <View
              style={
                styles.pendingInfoSection
              }
            >
              {/* DATE */}

              <View
                style={
                  styles.pendingInfoRow
                }
              >
                <View
                  style={
                    styles.pendingInfoIconContainer
                  }
                >
                  <CalendarDays
                    size={18}
                    color="#111"
                  />
                </View>

                <Text
                  style={
                    styles.pendingInfoLabel
                  }
                >
                  Date & Time
                </Text>

                <View
                  style={
                    styles.pendingInfoValueBox
                  }
                >
                  <Text
                    style={
                      styles.pendingInfoValue
                    }
                  >
                    {event.date}
                  </Text>

                  <Text
                    style={
                      styles.pendingInfoSubValue
                    }
                  >
                    {event.time}
                  </Text>
                </View>
              </View>

              {/* LOCATION */}

              <View
                style={
                  styles.pendingInfoRow
                }
              >
                <View
                  style={
                    styles.pendingInfoIconContainer
                  }
                >
                  <MapPin
                    size={18}
                    color="#111"
                  />
                </View>

                <Text
                  style={
                    styles.pendingInfoLabel
                  }
                >
                  Location
                </Text>

                <Text
                  style={
                    styles.pendingInfoValue
                  }
                >
                  {
                    event.location
                  }
                </Text>
              </View>

              {/* EXPECTED PARTICIPANTS */}

              <View
                style={
                  styles.pendingInfoRow
                }
              >
                <View
                  style={
                    styles.pendingInfoIconContainer
                  }
                >
                  <Users
                    size={18}
                    color="#111"
                  />
                </View>

                <Text
                  style={
                    styles.pendingInfoLabel
                  }
                >
                  Expected
                  Participants
                </Text>

                <Text
                  style={
                    styles.pendingInfoValue
                  }
                >
                  {
                    event.participants
                  }{" "}
                  /{" "}
                  {
                    event.capacity
                  }
                </Text>
              </View>

              {/* CREATED BY */}

              <View
                style={
                  styles.pendingInfoRow
                }
              >
                <View
                  style={
                    styles.pendingInfoIconContainer
                  }
                >
                  <UserRound
                    size={18}
                    color="#111"
                  />
                </View>

                <Text
                  style={
                    styles.pendingInfoLabel
                  }
                >
                  Created By
                </Text>

                <View
                  style={
                    styles.pendingInfoValueBox
                  }
                >
                  <Text
                    style={
                      styles.pendingInfoValue
                    }
                  >
                    {
                      event.submittedBy
                    }
                  </Text>

                  <Text
                    style={
                      styles.pendingInfoSubValue
                    }
                  >
                    {
                      event.submittedArea
                    }
                  </Text>
                </View>
              </View>

              {/* DATE SUBMITTED */}

              <View
                style={
                  styles.pendingInfoRow
                }
              >
                <View
                  style={
                    styles.pendingInfoIconContainer
                  }
                >
                  <Clock3
                    size={18}
                    color="#111"
                  />
                </View>

                <Text
                  style={
                    styles.pendingInfoLabel
                  }
                >
                  Date Submitted
                </Text>

                <Text
                  style={
                    styles.pendingInfoValue
                  }
                >
                  {submitted.date} ·{" "}
                  {submitted.time}
                </Text>
              </View>
            </View>
          </View>

          {/* EVENT IMAGES */}

          <View
            style={
              styles.pendingImagesCard
            }
          >
            <Text
              style={
                styles.pendingCardHeading
              }
            >
              Event Images
            </Text>

            <View
              style={
                styles.pendingImagesRow
              }
            >
              {event.imageUrl ? (
                <Image
                  source={{
                    uri: event.imageUrl,
                  }}
                  style={
                    styles.pendingGalleryImage
                  }
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={
                    styles.pendingEmptyGallery
                  }
                >
                  <CalendarDays
                    size={24}
                    color="#7d8c7c"
                  />

                  <Text
                    style={
                      styles.pendingEmptyGalleryText
                    }
                  >
                    No images
                    uploaded
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* =============================================== */}
        {/* RIGHT */}
        {/* =============================================== */}

        <View
          style={
            styles.pendingRightColumn
          }
        >
          {/* ABOUT */}

          <View
            style={
              styles.pendingAboutCard
            }
          >
            <Text
              style={
                styles.pendingCardHeading
              }
            >
              About the Event
            </Text>

            <Text
              style={
                styles.pendingDescription
              }
            >
              {event.description}
            </Text>
          </View>

          {/* MAP */}

          <View
            style={
              styles.pendingMapCard
            }
          >
            <InteractiveLocationMap
              coordinates={
                event.coordinates
              }
              height={190}
            />
          </View>

          {/* SUBMITTED BY */}

          <View
            style={
              styles.pendingSubmittedCard
            }
          >
            <Text
              style={
                styles.pendingCardHeading
              }
            >
              Submitted By
            </Text>

            <View
              style={
                styles.pendingSubmitterRow
              }
            >
              <View
                style={
                  styles.pendingSubmitterAvatar
                }
              >
                <UserRound
                  size={23}
                  color="#ffffff"
                />
              </View>

              <View
                style={{
                  flex: 1,
                }}
              >
                <Text
                  style={
                    styles.pendingSubmitterName
                  }
                >
                  {
                    event.submittedBy
                  }
                </Text>

                <Text
                  style={
                    styles.pendingSubmitterArea
                  }
                >
                  {
                    event.submittedArea
                  }
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* ACTIONS */}

      <View
        style={
          styles.pendingActions
        }
      >
        <TouchableOpacity
          style={[
            styles.pendingRejectButton,
            isModerating && {
              opacity: 0.6,
            },
          ]}
          onPress={onReject}
          disabled={
            isModerating
          }
        >
          <Text
            style={
              styles.pendingRejectButtonText
            }
          >
            {isModerating
              ? "Please wait..."
              : "Reject Event"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.pendingApproveButton,
            isModerating && {
              opacity: 0.6,
            },
          ]}
          onPress={onApprove}
          disabled={
            isModerating
          }
        >
          <Text
            style={
              styles.pendingApproveButtonText
            }
          >
            {isModerating
              ? "Please wait..."
              : "Approve Event"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// =========================================================
// SUMMARY CARD
// =========================================================

function SummaryCard({
  title,
  value,
  color,
  icon: Icon,
  iconColor,
  scale,
}: {
  title: string;
  value: number;
  color: string;
  icon: typeof CalendarCheck;
  iconColor: string;
  scale: number;
}) {
  return (
    <View
      style={[
        styles.summaryCard,
        {
          backgroundColor:
            color,
          minHeight:
            112 * scale,
        },
      ]}
    >
      <Icon
        size={54 * scale}
        color={iconColor}
        strokeWidth={2.5}
      />

      <View
        style={
          styles.summaryCopy
        }
      >
        <Text
          style={[
            styles.summaryTitle,
            {
              fontSize:
                14 * scale,
            },
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.summaryValue,
            {
              fontSize:
                35 * scale,
            },
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

// =========================================================
// OPTION MODAL
// =========================================================

function OptionModal({
  visible,
  title,
  options,
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selected: string;
  onClose: () => void;
  onSelect: (
    value: string
  ) => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={
        onClose
      }
    >
      <Pressable
        style={
          styles.modalOverlay
        }
        onPress={onClose}
      >
        <Pressable
          style={
            styles.optionModal
          }
        >
          <Text
            style={
              styles.optionTitle
            }
          >
            {title}
          </Text>

          {options.map(
            (option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionRow,
                  option ===
                    selected &&
                    styles.selectedOption,
                ]}
                onPress={() =>
                  onSelect(
                    option
                  )
                }
              >
                <Text
                  style={
                    styles.optionText
                  }
                >
                  {option}
                </Text>

                {option ===
                  selected && (
                  <Check
                    size={17}
                    color="#34733B"
                  />
                )}
              </TouchableOpacity>
            )
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// =========================================================
// FORM FIELD
// =========================================================

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (
    value: string
  ) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View
      style={styles.field}
    >
      <Text
        style={
          styles.inputLabel
        }
      >
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={
          onChangeText
        }
        placeholder={
          placeholder
        }
        placeholderTextColor="#888"
        multiline={
          multiline
        }
        textAlignVertical={
          multiline
            ? "top"
            : "center"
        }
        style={[
          styles.input,
          multiline &&
            styles.multilineInput,
        ]}
      />
    </View>
  );
}

// =========================================================
// DATE PICKER
// =========================================================

function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
}) {
  const [
    showPicker,
    setShowPicker,
  ] = useState(false);

  const selectedDate =
    value
      ? new Date(
          `${value}T00:00:00`
        )
      : new Date();

  if (
    Platform.OS === "web"
  ) {
    return (
      <View
        style={
          styles.field
        }
      >
        <Text
          style={
            styles.inputLabel
          }
        >
          {label}
        </Text>

        {createElement(
          "input",
          {
            type: "date",
            value,
            min: toIsoDate(
              new Date()
            ),

            onChange: (
              event: {
                target: {
                  value: string;
                };
              }
            ) =>
              onChange(
                event.target
                  .value
              ),

            style:
              webPickerStyle,
          }
        )}
      </View>
    );
  }

  return (
    <View
      style={styles.field}
    >
      <Text
        style={
          styles.inputLabel
        }
      >
        {label}
      </Text>

      <TouchableOpacity
        style={
          styles.pickerButton
        }
        onPress={() =>
          setShowPicker(
            true
          )
        }
      >
        <CalendarDays
          size={16}
          color="#34733B"
        />

        <Text
          style={
            styles.pickerButtonText
          }
        >
          {value
            ? formatEventDate(
                value
              )
            : "Select date"}
        </Text>
      </TouchableOpacity>

      {showPicker ? (
        <DateTimePicker
          value={
            Number.isNaN(
              selectedDate.getTime()
            )
              ? new Date()
              : selectedDate
          }
          mode="date"
          display="default"
          minimumDate={
            new Date()
          }
          onChange={(
            _,
            date
          ) => {
            setShowPicker(
              Platform.OS ===
                "ios"
            );

            if (date) {
              onChange(
                toIsoDate(date)
              );
            }
          }}
        />
      ) : null}
    </View>
  );
}

// =========================================================
// TIME PICKER
// =========================================================

function TimePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
}) {
  const [
    showPicker,
    setShowPicker,
  ] = useState(false);

  const selectedTime =
    (() => {
      const base =
        new Date();

      if (
        !value.includes(
          ":"
        )
      ) {
        return base;
      }

      const [
        hours,
        minutes,
      ] = value
        .split(":")
        .map(Number);

      base.setHours(
        hours || 0,
        minutes || 0,
        0,
        0
      );

      return base;
    })();

  if (
    Platform.OS === "web"
  ) {
    return (
      <View
        style={
          styles.field
        }
      >
        <Text
          style={
            styles.inputLabel
          }
        >
          {label}
        </Text>

        {createElement(
          "input",
          {
            type: "time",
            value,

            onChange: (
              event: {
                target: {
                  value: string;
                };
              }
            ) =>
              onChange(
                event.target
                  .value
              ),

            style:
              webPickerStyle,
          }
        )}
      </View>
    );
  }

  return (
    <View
      style={styles.field}
    >
      <Text
        style={
          styles.inputLabel
        }
      >
        {label}
      </Text>

      <TouchableOpacity
        style={
          styles.pickerButton
        }
        onPress={() =>
          setShowPicker(
            true
          )
        }
      >
        <Clock3
          size={16}
          color="#34733B"
        />

        <Text
          style={
            styles.pickerButtonText
          }
        >
          {value
            ? formatEventTime(
                value
              )
            : "Select time"}
        </Text>
      </TouchableOpacity>

      {showPicker ? (
        <DateTimePicker
          value={
            selectedTime
          }
          mode="time"
          display="default"
          onChange={(
            _,
            date
          ) => {
            setShowPicker(
              Platform.OS ===
                "ios"
            );

            if (date) {
              onChange(
                toHhMm(date)
              );
            }
          }}
        />
      ) : null}
    </View>
  );
}

// =========================================================
// WEB PICKER STYLE
// =========================================================

const webPickerStyle = {
  height: 44,
  width: "100%",
  border:
    "1px solid #cfcfcf",
  borderRadius: 8,
  paddingLeft: 12,
  paddingRight: 12,
  fontSize: 14,
  color: "#222",
  backgroundColor:
    "#ffffff",
  boxSizing:
    "border-box" as const,
  fontFamily:
    "Montserrat, sans-serif",
};

// =========================================================
// DETAIL ROW
// =========================================================

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.detailRow
      }
    >
      <Text
        style={
          styles.detailLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.detailValue
        }
      >
        {value}
      </Text>
    </View>
  );
}

// =========================================================
// COLORS
// =========================================================

function categoryColor(
  category: string
) {
  if (
    category ===
    "Clean-up"
  ) {
    return "#c9efca";
  }

  if (
    category ===
    "Tree Planting"
  ) {
    return "#bdecbf";
  }

  if (
    category ===
    "Seminar"
  ) {
    return "#e8c6ee";
  }

  if (
    category ===
    "Rehabilitation"
  ) {
    return "#f5dfab";
  }

  return "#cbe5f5";
}

function statusColor(
  status: EventStatus
) {
  if (
    status === "Pending"
  ) {
    return "#ffedbd";
  }

  if (
    status === "Upcoming"
  ) {
    return "#e7c1ef";
  }

  if (
    status === "Ongoing"
  ) {
    return "#bfe4fa";
  }

  if (
    status === "Completed"
  ) {
    return "#c4ebc3";
  }

  return "#f4c5c5";
}

// =========================================================
// STYLES
// =========================================================

const styles =
  StyleSheet.create({
    // =====================================================
    // PAGE
    // =====================================================

    page: {
      flex: 1,
      backgroundColor:
        "#ffffff",
    },

    headingRow: {
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
    },

    pageTitle: {
      fontFamily:
        "Montserrat_700Bold",
      color: "#145b22",
      lineHeight: 44,
    },

    subtitle: {
      color: "#4f8154",
      fontFamily:
        "Montserrat_700Bold",
      marginTop: 2,
    },

    addButton: {
      minHeight: 42,
      paddingHorizontal: 19,
      borderRadius: 10,
      backgroundColor:
        "#34733B",
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 7,
    },

    addButtonText: {
      color: "#ffffff",
      fontFamily:
        "Montserrat_700Bold",
    },

    // =====================================================
    // TABS
    // =====================================================

    tabs: {
      minHeight: 50,
      marginTop: 18,
      borderBottomWidth: 1,
      borderBottomColor:
        "#d7d7d7",
      flexDirection:
        "row",
      alignItems:
        "flex-end",
      gap: 8,
    },

    tab: {
      height: 42,
      paddingHorizontal: 10,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
      borderBottomWidth: 3,
      borderBottomColor:
        "transparent",
    },

    activeTab: {
      borderBottomColor:
        "#34733B",
    },

    tabText: {
      fontFamily:
        "Montserrat_700Bold",
      color: "#252525",
    },

    // =====================================================
    // SUMMARY
    // =====================================================

    cards: {
      flexDirection:
        "row",
      marginTop: 28,
    },

    summaryCard: {
      flex: 1,
      minWidth: 180,
      borderWidth: 1,
      borderColor:
        "#d7d7d7",
      borderRadius: 10,
      paddingHorizontal: 18,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 14,
    },

    summaryCopy: {
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    summaryTitle: {
      fontFamily:
        "Montserrat_700Bold",
      textAlign:
        "center",
    },

    summaryValue: {
      fontFamily:
        "Montserrat_700Bold",
      color: "#111",
      lineHeight: 40,
    },

    // =====================================================
    // FILTERS
    // =====================================================

    filterPanel: {
      marginTop: 22,
      flexDirection:
        "row",
      gap: 14,
      borderWidth: 1,
      borderColor:
        "#d3d3d3",
      borderRadius: 9,
      alignItems:
        "center",
      zIndex: 2,
    },

    searchBox: {
      flex: 1.15,
      minWidth: 180,
      height: 54,
      borderRadius: 8,
      backgroundColor:
        "#f4f4f4",
      borderWidth: 1,
      borderColor:
        "#dddddd",
      paddingHorizontal: 14,
      flexDirection:
        "row",
      alignItems:
        "center",
    },

    searchInput: {
      flex: 1,
      color: "#222",
      outlineStyle:
        "none",
    } as never,

    filterBox: {
      flex: 1,
      minWidth: 150,
      height: 54,
      borderRadius: 8,
      backgroundColor:
        "#f4f4f4",
      borderWidth: 1,
      borderColor:
        "#dddddd",
      paddingHorizontal: 12,
      paddingVertical: 6,
      justifyContent:
        "center",
      cursor: "pointer",
    } as any,

    filterBoxOpen: {
      borderColor:
        "#34733B",
      backgroundColor:
        "#F8FBF7",
    },

    filterValueOpen: {
      color:
        "#34733B",
    },

    filterLabel: {
      fontFamily:
        "Montserrat_700Bold",
      color: "#555",
      marginBottom: 1,
      fontSize: 11,
    },

    filterValueRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      minHeight: 18,
    },

    filterValue: {
      fontFamily:
        "Montserrat_700Bold",
      color: "#252525",
      flexShrink: 1,
    },

    resetButton: {
      height: 38,
      paddingHorizontal: 13,
      borderRadius: 8,
      borderWidth: 1,
      borderColor:
        "#86be8d",
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
    },

    resetText: {
      color: "#34733B",
      fontFamily:
        "Montserrat_700Bold",
    },

    // =====================================================
    // TABLE
    // =====================================================

    tablePanel: {
      marginTop: 14,
      borderWidth: 1,
      borderColor:
        "#d3d3d3",
      borderRadius: 10,
      overflow: "hidden",
    },

    table: {
      minWidth: 980,
    },

    tableFullWidth: {
      minWidth: "100%",
      width: "100%",
    },

    tableHeader: {
      height: 50,
      flexDirection:
        "row",
      alignItems:
        "center",
      borderBottomWidth: 1,
      borderBottomColor:
        "#d7d7d7",
      paddingHorizontal: 16,
    },

    th: {
      fontSize: 14,
      color: "#202020",
      fontFamily:
        "Montserrat_700Bold",
    },

    tableRow: {
      minHeight: 78,
      flexDirection:
        "row",
      alignItems:
        "center",
      borderBottomWidth: 1,
      borderBottomColor:
        "#dddddd",
      paddingHorizontal: 16,
    },

    idColumn: {
      flex: 0.8,
      minWidth: 90,
    },

    detailsColumn: {
      flex: 2,
      minWidth: 240,
    },

    submittedColumn: {
      flex: 1.3,
      minWidth: 150,
    },

    categoryColumn: {
      flex: 1.2,
      minWidth: 130,
    },

    dateColumn: {
      flex: 1.2,
      minWidth: 130,
    },

    locationColumn: {
      flex: 1,
      minWidth: 300,
    },

    statusColumn: {
      flex: 1,
      minWidth: 80,
    },

    participantsColumn: {
      flex: 1,
      minWidth: 110,
    },

    actionColumn: {
      flex: 1,
      minWidth: 130,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    cellText: {
      fontSize: 14,
      fontFamily:
        "Montserrat_700Bold",
      color: "#242424",
    },

    detailsCell: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 9,
    },

    submittedCell: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 8,
    },

    submitterIcon: {
      width: 25,
      height: 25,
      borderRadius: 13,
      backgroundColor:
        "#1ca33a",
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    eventThumbnail: {
      width: 42,
      height: 42,
      borderRadius: 6,
      backgroundColor:
        "#d9ddda",
      alignItems:
        "center",
      justifyContent:
        "center",
      overflow: "hidden",
    },

    eventThumbnailImage: {
      width: 42,
      height: 42,
    },

    eventCopy: {
      flex: 1,
      paddingRight: 6,
    },

    eventTitle: {
      fontSize: 14,
      fontFamily:
        "Montserrat_700Bold",
      color: "#1c1c1c",
    },

    eventDescription: {
      fontSize: 12,
      color: "#555",
      lineHeight: 12,
      marginTop: 2,
    },

    badge: {
      alignSelf:
        "flex-start",
      paddingVertical: 4,
      paddingHorizontal: 7,
      borderRadius: 5,
    },

    badgeText: {
      fontSize: 12,
      color: "#2e502f",
      fontFamily:
        "Montserrat_700Bold",
    },

    dateText: {
      fontSize: 13,
      fontFamily:
        "Montserrat_700Bold",
      color: "#222",
    },

    smallText: {
      fontSize: 12,
      color: "#555",
      marginTop: 2,
    },

    viewButton: {
      borderWidth: 1,
      borderColor:
        "#4b9b52",
      borderRadius: 6,
      paddingVertical: 5,
      paddingHorizontal: 7,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 4,
    },

    viewButtonText: {
      fontSize: 12,
      color: "#34733B",
      fontFamily:
        "Montserrat_700Bold",
    },

    emptyRow: {
      height: 120,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    emptyText: {
      fontSize: 14,
      color: "#777",
      fontFamily:
        "Montserrat_700Bold",
    },

    // =====================================================
    // PAGINATION
    // =====================================================

    pagination: {
      minHeight: 52,
      paddingHorizontal: 16,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
    },

    paginationText: {
      fontSize: 12,
      fontFamily:
        "Montserrat_700Bold",
      color: "#333",
    },

    pageControls: {
      flexDirection:
        "row",
      gap: 5,
    },

    pageButton: {
      width: 27,
      height: 27,
      borderWidth: 1,
      borderColor:
        "#aab1aa",
      borderRadius: 5,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    activePageButton: {
      backgroundColor:
        "#34733B",
      borderColor:
        "#34733B",
    },

    pageButtonText: {
      fontSize: 12,
      color: "#333",
      fontFamily:
        "Montserrat_700Bold",
    },

    activePageButtonText: {
      color: "#ffffff",
    },

    // =====================================================
    // MODALS
    // =====================================================

    // =====================================================
// REJECT EVENT MODAL
// =====================================================

rejectModalOverlay: {
  flex: 1,
  backgroundColor: "rgba(0, 0, 0, 0.38)",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
},

rejectModal: {
  width: "100%",
  maxWidth: 520,

  backgroundColor: "#ffffff",

  borderRadius: 12,

  paddingHorizontal: 24,
  paddingTop: 20,
  paddingBottom: 20,

  shadowColor: "#000000",
  shadowOffset: {
    width: 0,
    height: 5,
  },
  shadowOpacity: 0.2,
  shadowRadius: 12,

  elevation: 12,
},

rejectModalTitle: {
  fontSize: 20,
  lineHeight: 24,

  color: "#145B22",

  fontFamily: "Montserrat_700Bold",

  marginBottom: 7,
},

rejectModalDescription: {
  fontSize: 11,
  lineHeight: 16,

  color: "#555555",

  fontFamily: "Montserrat_500Medium",

  marginBottom: 18,
},

rejectField: {
  width: "100%",
  marginBottom: 16,
},

rejectLabel: {
  fontSize: 11,

  color: "#222222",

  fontFamily: "Montserrat_700Bold",

  marginBottom: 6,
},

// DROPDOWN

rejectReasonField: {
  position: "relative",
  zIndex: 100,
  elevation: 100,
},

rejectRemarksField: {
  position: "relative",
  zIndex: 1,
  elevation: 1,
},

rejectDropdownWrapper: {
  width: "100%",
  position: "relative",
  zIndex: 200,
  elevation: 200,
},

rejectDropdownButton: {
  height: 42,

  borderWidth: 1,
  borderColor: "#C9C9C9",
  borderRadius: 6,

  backgroundColor: "#FFFFFF",

  paddingHorizontal: 12,

  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
},

rejectDropdownButtonOpen: {
  borderColor: "#34733B",
},

rejectDropdownText: {
  flex: 1,

  fontSize: 13,
  lineHeight: 18,

  color: "#222222",

  fontFamily: "Montserrat_500Medium",

  marginRight: 10,
},

rejectDropdownPlaceholder: {
  color: "#777777",
},

rejectDropdownMenu: {
  position: "absolute",

  top: 46,
  left: 0,
  right: 0,

  backgroundColor: "#FFFFFF",

  borderWidth: 1,
  borderColor: "#D2D2D2",

  borderRadius: 7,

  overflow: "hidden",

  zIndex: 9999,
  elevation: 9999,

  shadowColor: "#000000",
  shadowOffset: {
    width: 0,
    height: 5,
  },
  shadowOpacity: 0.18,
  shadowRadius: 10,
},

rejectDropdownOption: {
  minHeight: 42,

  paddingHorizontal: 12,

  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",

  backgroundColor: "#FFFFFF",

  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: "#E8E8E8",
},

rejectDropdownOptionPressed: {
  backgroundColor: "#F3F8EF",
},

rejectDropdownOptionSelected: {
  backgroundColor: "#EDF6E9",
},

rejectDropdownOptionText: {
  flex: 1,

  fontSize: 13,

  color: "#222222",

  fontFamily: "Montserrat_500Medium",
},

rejectDropdownOptionTextSelected: {
  color: "#145B22",

  fontFamily: "Montserrat_700Bold",
},

// REMARKS

rejectRemarksInput: {
  minHeight: 75,

  borderWidth: 1,
  borderColor: "#CCCCCC",
  borderRadius: 5,

  backgroundColor: "#FFFFFF",

  paddingHorizontal: 10,
  paddingTop: 9,
  paddingBottom: 9,

  fontSize: 11,

  color: "#222222",

  fontFamily: "Montserrat_500Medium",

  outlineStyle: "none",
} as any,

// ACTION BUTTONS

rejectModalActions: {
  flexDirection: "row",

  justifyContent: "flex-end",
  alignItems: "center",

  gap: 8,

  marginTop: 2,
},

rejectCancelButton: {
  minWidth: 92,
  height: 34,

  borderWidth: 1,
  borderColor: "#D0D0D0",
  borderRadius: 6,

  backgroundColor: "#FFFFFF",

  alignItems: "center",
  justifyContent: "center",

  paddingHorizontal: 14,
},

rejectCancelText: {
  color: "#222222",

  fontSize: 11,

  fontFamily: "Montserrat_700Bold",
},

rejectConfirmButton: {
  minWidth: 105,
  height: 34,

  borderRadius: 6,

  backgroundColor: "#A93131",

  alignItems: "center",
  justifyContent: "center",

  paddingHorizontal: 14,
},

rejectConfirmText: {
  color: "#FFFFFF",

  fontSize: 11,

  fontFamily: "Montserrat_700Bold",
},

    modalOverlay: {
      flex: 1,
      backgroundColor:
        "rgba(0,0,0,0.42)",
      alignItems:
        "center",
      justifyContent:
        "center",
      padding: 20,
    },

    formModal: {
      width: "100%",
      maxWidth: 880,
      backgroundColor:
        "#fff",
      borderRadius: 14,
      padding: 24,
    },

    detailsModalScroll: {
      width: "94%",
      maxWidth: 720,
      maxHeight: "90%",
      backgroundColor:
        "#fff",
      borderRadius: 14,
    },

    detailsModal: {
      padding: 28,
      paddingBottom: 32,
    },

    detailsHeroImage: {
      width: "100%",
      height: 180,
      borderRadius: 10,
      marginBottom: 12,
      backgroundColor:
        "#d9ddda",
    },

    participantsHeading: {
      marginTop: 16,
      marginBottom: 10,
      fontSize: 15,
      color: "#1c1c1c",
      fontFamily:
        "Montserrat_700Bold",
    },

    participantRow: {
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor:
        "#ececec",
    },

    modalHeader: {
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",
      marginBottom: 18,
    },

    modalTitleWrap: {
      flex: 1,
      paddingRight: 12,
    },

    modalTitle: {
      fontSize: 22,
      color: "#145b22",
      fontFamily:
        "Montserrat_700Bold",
    },

    modalSubtitle: {
      fontSize: 12,
      color: "#777",
      marginTop: 3,
    },

    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor:
        "#f0f0f0",
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    // =====================================================
    // FORMS
    // =====================================================

    field: {
      marginBottom: 14,
    },

    inputLabel: {
      fontSize: 12,
      color: "#333",
      fontFamily:
        "Montserrat_700Bold",
      marginBottom: 6,
    },

    input: {
      height: 44,
      borderWidth: 1,
      borderColor:
        "#cfcfcf",
      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 14,
      color: "#222",
    },

    pickerButton: {
      height: 44,
      borderWidth: 1,
      borderColor:
        "#cfcfcf",
      borderRadius: 8,
      paddingHorizontal: 12,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 8,
      backgroundColor:
        "#fff",
    },

    pickerButtonText: {
      fontSize: 14,
      color: "#222",
      fontFamily:
        "Montserrat_700Bold",
    },

    multilineInput: {
      height: 88,
      paddingTop: 11,
    },

    formColumns: {
      flexDirection:
        "row",
      gap: 18,
    },

    formColumn: {
      flex: 1,
      minWidth: 0,
    },

    mapHint: {
      fontSize: 11,
      color: "#555",
      marginTop: 6,
      marginBottom: 10,
      fontFamily:
        "Montserrat_700Bold",
    },

    inlineFields: {
      flexDirection:
        "row",
      gap: 10,
    },

    inlineField: {
      flex: 1,
    },

    mapPreview: {
      height: 180,
      borderRadius: 9,
      backgroundColor:
        "#dce8d5",
      overflow: "hidden",
      alignItems:
        "center",
      justifyContent:
        "center",
      marginBottom: 14,
    },

    mapRoadHorizontal: {
      position:
        "absolute",
      width: "120%",
      height: 32,
      backgroundColor:
        "#f6f2e9",
      transform: [
        {
          rotate: "-12deg",
        },
      ],
    },

    mapRoadVertical: {
      position:
        "absolute",
      width: 28,
      height: "130%",
      backgroundColor:
        "#b4dcf3",
      transform: [
        {
          rotate: "13deg",
        },
      ],
    },

    mapCaption: {
      position:
        "absolute",
      bottom: 8,
      right: 9,
      backgroundColor:
        "rgba(255,255,255,0.85)",
      borderRadius: 5,
      paddingHorizontal: 7,
      paddingVertical: 3,
      color: "#555",
      fontSize: 9,
      fontFamily:
        "Montserrat_700Bold",
    },

    uploadBox: {
      height: 104,
      borderWidth: 1,
      borderStyle:
        "dashed",
      borderColor:
        "#bfc4bf",
      borderRadius: 9,
      alignItems:
        "center",
      justifyContent:
        "center",
      overflow: "hidden",
    },

    uploadTitle: {
      fontSize: 12,
      color: "#222",
      fontFamily:
        "Montserrat_700Bold",
      marginTop: 5,
    },

    uploadHint: {
      fontSize: 9,
      color: "#777",
      marginTop: 2,
    },

    uploadPreview: {
      width: "100%",
      height: "100%",
    },

    categoryChoices: {
      flexDirection:
        "row",
      flexWrap: "wrap",
      gap: 7,
      marginBottom: 14,
    },

    choiceButton: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 7,
      borderWidth: 1,
      borderColor:
        "#c6c6c6",
    },

    choiceButtonActive: {
      backgroundColor:
        "#34733B",
      borderColor:
        "#34733B",
    },

    choiceText: {
      fontSize: 11,
      color: "#333",
      fontFamily:
        "Montserrat_700Bold",
    },

    choiceTextActive: {
      color: "#fff",
    },

    modalActions: {
      flexDirection:
        "row",
      justifyContent:
        "flex-end",
      gap: 10,
      marginTop: 8,
    },

    moderationActions: {
      flexDirection:
        "row",
      justifyContent:
        "flex-end",
      gap: 10,
      marginTop: 18,
    },

    rejectEventButton: {
      minHeight: 42,
      borderRadius: 8,
      backgroundColor:
        "#b73535",
      paddingHorizontal: 18,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    cancelButton: {
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 8,
      justifyContent:
        "center",
    },

    cancelText: {
      color: "#555",
      fontFamily:
        "Montserrat_700Bold",
    },

    saveButton: {
      minHeight: 42,
      borderRadius: 8,
      backgroundColor:
        "#34733B",
      paddingHorizontal: 18,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 6,
    },

    saveText: {
      color: "#ffffff",
      fontFamily:
        "Montserrat_700Bold",
      fontSize: 13,
    },

    optionModal: {
      width: "100%",
      maxWidth: 360,
      backgroundColor:
        "#fff",
      borderRadius: 12,
      padding: 16,
    },

    optionTitle: {
      fontSize: 17,
      color: "#145b22",
      fontFamily:
        "Montserrat_700Bold",
      marginBottom: 8,
    },

    optionRow: {
      minHeight: 42,
      borderRadius: 7,
      paddingHorizontal: 10,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
    },

    selectedOption: {
      backgroundColor:
        "#edf5e7",
    },

    optionText: {
      fontSize: 13,
      color: "#222",
      fontFamily:
        "Montserrat_700Bold",
    },

    detailsDescription: {
      fontSize: 14,
      lineHeight: 20,
      color: "#555",
      marginBottom: 16,
    },

    detailRow: {
      minHeight: 43,
      borderTopWidth: 1,
      borderTopColor:
        "#ededed",
      flexDirection:
        "row",
      alignItems:
        "center",
    },

    detailLabel: {
      width: 120,
      fontSize: 13,
      color: "#555",
      fontFamily:
        "Montserrat_700Bold",
    },

    detailValue: {
      flex: 1,
      fontSize: 13,
      color: "#222",
      fontFamily:
        "Montserrat_700Bold",
    },

    // =====================================================
    // DROPDOWNS
    // =====================================================

    dropdownContainer: {
      flex: 1,
      minWidth: 150,
      position:
        "relative",
      zIndex: 100,
      overflow:
        "visible",
    },

    dropdownMenu: {
      position:
        "absolute",
      top: 58,
      left: 0,
      right: 0,
      backgroundColor:
        "#ffffff",
      borderRadius: 8,
      borderWidth: 1,
      borderColor:
        "#d5d5d5",
      overflow:
        "hidden",
      zIndex: 1000,
      elevation: 10,
      shadowColor:
        "#000000",
      shadowOpacity: 0.14,
      shadowRadius: 9,
      shadowOffset: {
        width: 0,
        height: 4,
      },
    },

    dropdownItem: {
      minHeight: 42,
      paddingVertical: 11,
      paddingHorizontal: 14,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      backgroundColor:
        "#ffffff",
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#ececec",
      cursor: "pointer",
    } as any,

    dropdownItemSelected: {
      backgroundColor:
        "#F1F8EE",
    },

    dropdownText: {
      flex: 1,
      fontSize: 13,
      fontFamily:
        "Montserrat_700Bold",
      color: "#222222",
    },

    dropdownTextSelected: {
      color:
        "#34733B",
    },

    // =====================================================
    // PENDING DETAILS PAGE
    // =====================================================

    pendingDetailsPage: {
      flex: 1,
      backgroundColor:
        "#ffffff",
    },

    pendingDetailsContent: {
      width: "100%",
      paddingHorizontal: 38,
      paddingTop: 26,
      paddingBottom: 50,
    },

    pendingBackButton: {
      width: 42,
      height: 42,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginBottom: 28,
    },

    pendingDetailsGrid: {
      width: "100%",
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap: 14,
    },

    pendingLeftColumn: {
      flex: 1.45,
      minWidth: 0,
    },

    pendingRightColumn: {
      flex: 1,
      minWidth: 0,
    },

    // MAIN CARD

    pendingMainCard: {
      minHeight: 400,
      borderWidth: 1,
      borderColor:
        "#D0D0D0",
      borderRadius: 7,
      backgroundColor:
        "#ffffff",
      padding: 18,
    },

    pendingTopSection: {
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap: 14,
    },

    pendingHeroWrapper: {
      width: 185,
      height: 135,
      borderRadius: 6,
      overflow: "hidden",
      backgroundColor:
        "#E4E7E4",
    },

    pendingHeroImage: {
      width: "100%",
      height: "100%",
    },

    pendingHeroPlaceholder: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    pendingNoImageText: {
      fontSize: 10,
      color: "#667066",
      marginTop: 5,
      fontFamily:
        "Montserrat_600SemiBold",
    },

    pendingEventHeading: {
      flex: 1,
      alignItems:
        "flex-start",
    },

    pendingNotice: {
      width: "100%",
      minHeight: 34,
      borderRadius: 4,
      backgroundColor:
        "#FFE8C9",
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 10,
      marginBottom: 7,
    },

    pendingNoticeText: {
      color: "#E47920",
      fontSize: 14,
      fontFamily:
        "Montserrat_700Bold",
      textAlign:
        "center",
    },

    pendingEventTitle: {
      fontSize: 21,
      lineHeight: 26,
      color: "#111111",
      fontFamily:
        "Montserrat_700Bold",
      marginBottom: 5,
    },

    pendingCategoryBadge: {
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 6,
    },

    pendingCategoryText: {
      color: "#207529",
      fontSize: 14,
      fontFamily:
        "Montserrat_700Bold",
    },

    pendingEventId: {
      color: "#222222",
      fontSize: 10,
      fontFamily:
        "Montserrat_700Bold",
    },

    // INFORMATION

    pendingInfoSection: {
      marginTop: 24,
      gap: 13,
    },

    pendingInfoRow: {
      minHeight: 37,
      flexDirection:
        "row",
      alignItems:
        "flex-start",
    },

    pendingInfoIconContainer: {
      width: 30,
      paddingTop: 2,
      alignItems:
        "center",
    },

    pendingInfoLabel: {
      width: 170,
      paddingLeft: 8,
      paddingTop: 2,
      color: "#666666",
      fontSize: 14,
      fontFamily:
        "Montserrat_600SemiBold",
    },

    pendingInfoValueBox: {
      flex: 1,
    },

    pendingInfoValue: {
      flex: 1,
      color: "#444444",
      fontSize: 14,
      lineHeight: 18,
      fontFamily: "Montserrat_600SemiBold",
      paddingLeft: 25,
    },

    pendingInfoSubValue: {
      color: "#555555",
      fontSize: 12,
      lineHeight: 15,
      fontFamily: "Montserrat_500Medium",
      paddingLeft: 25,
    },

    // EVENT IMAGES

    pendingImagesCard: {
      minHeight: 125,
      marginTop: 14,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#D0D0D0",
      borderRadius: 7,
      backgroundColor:
        "#ffffff",
    },

    pendingCardHeading: {
      fontSize: 13,
      color: "#111111",
      fontFamily:
        "Montserrat_700Bold",
      marginBottom: 12,
    },

    pendingImagesRow: {
      flexDirection:
        "row",
      flexWrap: "wrap",
      gap: 12,
    },

    pendingGalleryImage: {
      width: 115,
      height: 62,
      borderRadius: 6,
      backgroundColor:
        "#E1E1E1",
    },

    pendingEmptyGallery: {
      width: 150,
      height: 62,
      borderRadius: 6,
      backgroundColor:
        "#F0F2F0",
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    pendingEmptyGalleryText: {
      fontSize: 9,
      color: "#777777",
      marginTop: 2,
      fontFamily:
        "Montserrat_500Medium",
    },

    // ABOUT

    pendingAboutCard: {
      minHeight: 205,
      borderWidth: 1,
      borderColor:
        "#D0D0D0",
      borderRadius: 7,
      backgroundColor:
        "#ffffff",
      padding: 18,
    },

    pendingDescription: {
      color: "#444444",
      fontSize: 11,
      lineHeight: 17,
      fontFamily:
        "Montserrat_500Medium",
    },

    // MAP

    pendingMapCard: {
      minHeight: 205,
      marginTop: 14,
      borderWidth: 1,
      borderColor:
        "#D0D0D0",
      borderRadius: 7,
      overflow: "hidden",
      backgroundColor:
        "#ffffff",
      padding: 7,
    },

    // SUBMITTED BY

    pendingSubmittedCard: {
      minHeight: 115,
      marginTop: 14,
      borderWidth: 1,
      borderColor:
        "#D0D0D0",
      borderRadius: 7,
      backgroundColor:
        "#ffffff",
      padding: 18,
    },

    pendingSubmitterRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
    },

    pendingSubmitterAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor:
        "#0B981B",
      alignItems:
        "center",
      justifyContent:
        "center",
      marginRight: 10,
    },

    pendingSubmitterName: {
      color: "#111111",
      fontSize: 16,
      fontFamily:
        "Montserrat_700Bold",
    },

    pendingSubmitterArea: {
      marginTop: 2,
      color: "#555555",
      fontSize: 9,
      fontFamily:
        "Montserrat_500Medium",
    },

    // ACTIONS

    pendingActions: {
      marginTop: 32,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "flex-end",
      gap: 10,
    },

    pendingRejectButton: {
      width: 145,
      minHeight: 39,
      borderWidth: 1,
      borderColor:
        "#E43131",
      borderRadius: 6,
      backgroundColor:
        "#ffffff",
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    pendingRejectButtonText: {
      color: "#DE1919",
      fontSize: 11,
      fontFamily:
        "Montserrat_700Bold",
    },

    pendingApproveButton: {
      width: 145,
      minHeight: 39,
      borderRadius: 6,
      backgroundColor:
        "#14951B",
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    pendingApproveButtonText: {
      color: "#ffffff",
      fontSize: 11,
      fontFamily:
        "Montserrat_700Bold",
    },
  });