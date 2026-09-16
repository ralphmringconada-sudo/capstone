import { createElement, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";

import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  Filter,
  MapPin,
  Plus,
  Search,
  Upload,
  UserRound,
  Users,
  TriangleAlert,
  X,
} from "lucide-react-native";

import AdminLayout from "@/components/AdminLayout";
import InteractiveLocationMap from "@/components/InteractiveLocationMap";

import { useAdminAuth } from "@/context/AdminAuthContext";

import {
  createEvent,
  fetchEventParticipants,
  fetchEvents,
  updateEvent,
  updateEventStatus,
} from "@/services/adminDataService";

import { uploadAdminEventImage } from "@/services/eventImageService";

import type {
  AdminEvent,
  EventParticipant,
} from "@/types/admin";

import { isWithinDateRange } from "@/utils/dateRange";
import { formatDateTime } from "@/utils/format";

const MONTSERRAT_FONT = "Montserrat_700Bold";

type ScreenTextProps = ComponentProps<typeof RNText>;
type ScreenTextInputProps = ComponentProps<typeof RNTextInput>;

function Text({ style, ...props }: ScreenTextProps) {
  return (
    <RNText
      {...props}
      style={[{ fontFamily: MONTSERRAT_FONT }, style]}
    />
  );
}

function TextInput({ style, ...props }: ScreenTextInputProps) {
  return (
    <RNTextInput
      {...props}
      style={[{ fontFamily: MONTSERRAT_FONT }, style]}
    />
  );
}

type EventFormField =
  | "title"
  | "description"
  | "date"
  | "time"
  | "endTime"
  | "location"
  | "capacity";

type EventFormErrors = Partial<
  Record<EventFormField, string>
>;

type EventFormAlertState = {
  visible: boolean;
  title: string;
  message: string;
  variant: "error" | "warning" | "success";
};


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

function combineEventDateTime(
  isoDate: string,
  hhmm: string
): string {
  const [year, month, day] = isoDate
    .split("-")
    .map(Number);

  const [hours, minutes] = hhmm
    .split(":")
    .map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return "";
  }

  const value = new Date(
    year,
    month - 1,
    day,
    hours,
    minutes,
    0,
    0
  );

  return Number.isNaN(value.getTime())
    ? ""
    : value.toISOString();
}

function getEventImages(event: {
  imageUrl?: string;
  images?: string[];
}): string[] {
  if (event.images?.length) return event.images.filter(Boolean);
  if (event.imageUrl) return [event.imageUrl];
  return [];
}

function resolveAutomaticEventStatus(
  event: AdminEvent,
  now = new Date()
): AdminEvent {
  if (
    event.status === "Pending" ||
    event.status === "Rejected" ||
    event.status === "Completed"
  ) {
    return event;
  }

  const nowMs = now.getTime();

  const startMs = event.startAt
    ? new Date(event.startAt).getTime()
    : Number.NaN;

  const endMs = event.endAt
    ? new Date(event.endAt).getTime()
    : Number.NaN;

  if (
    Number.isFinite(endMs) &&
    nowMs >= endMs
  ) {
    return {
      ...event,
      status: "Completed",
    };
  }

  if (
    Number.isFinite(startMs) &&
    nowMs >= startMs
  ) {
    return {
      ...event,
      status: "Ongoing",
    };
  }

  if (
    event.status === "Approved" ||
    event.status === "Upcoming"
  ) {
    return {
      ...event,
      // Legacy "Upcoming" events are shown as Approved.
      // Approved remains Approved until the event start time.
      status: "Approved",
    };
  }

  return event;
}

function EventImageLightbox({
  uri,
  onClose,
}: {
  uri: string | null;
  onClose: () => void;
}) {
  if (!uri) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.88)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
        onPress={onClose}
      >
        <Image
          source={{ uri }}
          style={{ width: "92%", height: "82%" }}
          resizeMode="contain"
        />
        <Text
          style={{
            color: "#ffffff",
            marginTop: 12,
          }}
        >
          Tap anywhere to close
        </Text>
      </Pressable>
    </Modal>
  );
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
  "Approved",
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

  const [eventImageFailed, setEventImageFailed] = useState(false);

  const [
    eventFormAlert,
    setEventFormAlert,
  ] = useState<EventFormAlertState>({
    visible: false,
    title: "",
    message: "",
    variant: "warning",
  });

  const formAlertAnimation = useRef(
    new Animated.Value(0)
  ).current;

  useEffect(() => {
    if (
      eventFormAlert.visible &&
      eventFormAlert.variant !== "success"
    ) {
      formAlertAnimation.setValue(0);

      Animated.timing(
        formAlertAnimation,
        {
          toValue: 1,
          duration: 220,
          easing: Easing.out(
            Easing.cubic
          ),
          useNativeDriver: true,
        }
      ).start();
    }
  }, [
    eventFormAlert.visible,
    eventFormAlert.variant,
    formAlertAnimation,
  ]);

  const showEventFormAlert = (
    title: string,
    message: string,
    variant: EventFormAlertState["variant"] = "warning"
  ) => {
    setEventFormAlert({
      visible: true,
      title,
      message,
      variant,
    });
  };

  const closeEventFormAlert = () => {
    setEventFormAlert(
      (previous) => ({
        ...previous,
        visible: false,
      })
    );
  };

  const closeAddEventModal = () => {
    setEditingEventId(null);
    setEventFormErrors({});
    setEventFormAlert((previous) => ({
      ...previous,
      visible: false,
    }));
    setAddModalOpen(false);
  };

  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const [rejectionReason, setRejectionReason] = useState("");

  const [rejectionRemarks, setRejectionRemarks] = useState("");

  const [
    showRejectReasonDropdown,
    setShowRejectReasonDropdown,
  ] = useState(false);

  const { width, height } =
    useWindowDimensions();

  const [tableContainerWidth, setTableContainerWidth] =
    useState(0);

  // Responsive table breakpoints. The table always stays inside its panel
  // and never becomes horizontally scrollable.
  const compactTable =
    tableContainerWidth > 0 &&
    tableContainerWidth < 1120;

  const veryCompactTable =
    tableContainerWidth > 0 &&
    tableContainerWidth < 900;

  const s = Math.max(
    0.72,
    Math.min(
      width / 1920,
      height / 1080
    )
  );

  const { admin } = useAdminAuth();
  const { eventId: eventIdParam } = useLocalSearchParams<{ eventId?: string }>();
  const openedEventFromQueryRef = useRef<string | null>(null);

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

  const [editingEventId, setEditingEventId] =
    useState<string | null>(null);

  // =======================================================
  // SELECTED EVENT
  // =======================================================

  const [
    selectedEvent,
    setSelectedEvent,
  ] = useState<AdminEvent | null>(null);

  const [previewImageUrl, setPreviewImageUrl] =
    useState<string | null>(null);

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

  const [newEndTime, setNewEndTime] =
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
    eventFormErrors,
    setEventFormErrors,
  ] = useState<EventFormErrors>({});

  const clearEventFormError = (
    field: EventFormField
  ) => {
    setEventFormErrors(
      (previous) => {
        if (!previous[field]) {
          return previous;
        }

        const next = {
          ...previous,
        };

        delete next[field];

        return next;
      }
    );
  };

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
      const loadedEvents =
        await fetchEvents();

      const now = new Date();

      setEvents(
        loadedEvents.map(
          (event) =>
            resolveAutomaticEventStatus(
              event,
              now
            )
        )
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

    const statusTimer = setInterval(() => {
      const now = new Date();

      setEvents(
        (currentEvents) =>
          currentEvents.map(
            (event) =>
              resolveAutomaticEventStatus(
                event,
                now
              )
          )
      );
    }, 10_000);

    const refreshTimer = setInterval(() => {
      void reloadEvents();
    }, 30_000);

    return () => {
      clearInterval(statusTimer);
      clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    const latestEvent =
      events.find(
        (event) =>
          event.id ===
          selectedEvent.id
      );

    if (
      latestEvent &&
      latestEvent.status !==
        selectedEvent.status
    ) {
      setSelectedEvent(
        latestEvent
      );
    }
  }, [
    events,
    selectedEvent,
  ]);


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


    const filteredStats = useMemo(() => {
  const query = search.trim().toLowerCase();

  // Search + date are the shared/base filters.
  const baseEvents = events.filter((event) => {
    const matchesSearch =
      !query ||
      event.title.toLowerCase().includes(query) ||
      event.description.toLowerCase().includes(query) ||
      event.location.toLowerCase().includes(query) ||
      event.id.toLowerCase().includes(query);

    const eventDay = new Date(event.date);

    const dateValue = Number.isNaN(eventDay.getTime())
      ? event.createdAt
      : eventDay;

    const matchesDate = isWithinDateRange(
      dateValue,
      fromDate,
      toDate
    );

    return matchesSearch && matchesDate;
  });

  const categoryCount =
    category === "All Types"
      ? baseEvents.length
      : baseEvents.filter(
          (event) => event.category === category
        ).length;

  const statusCount =
    status === "All Statuses"
      ? baseEvents.length
      : baseEvents.filter(
          (event) => event.status === status
        ).length;

  return {
    total: filteredEvents.length,
    categoryCount,
    statusCount,
  };
}, [
  events,
  filteredEvents,
  search,
  category,
  status,
  fromDate,
  toDate,
]);

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

    setShowCategoryDropdown(false);
    setShowStatusDropdown(false);
    setSelectionMenu(null);
    setPage(1);
  };

  // =======================================================
  // RESET FILTERS
  // =======================================================

  const resetFilters = () => {
    setSearch("");
    setCategory("All Types");
    setStatus(
      activeTab === "Pending Approval"
        ? "Pending"
        : activeTab === "Rejected"
          ? "Rejected"
          : "All Statuses"
    );
    setSortOrder(
      "Newest First"
    );
    setFromDate("");
    setToDate("");
    setShowCategoryDropdown(false);
    setShowStatusDropdown(false);
    setSelectionMenu(null);
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

      const validationErrors: EventFormErrors = {};

      if (!newTitle.trim()) {
        validationErrors.title =
          "Event title is required.";
      }

      if (!newDescription.trim()) {
        validationErrors.description =
          "Event description is required.";
      }

      if (!newDate.trim()) {
        validationErrors.date =
          "Event date is required.";
      }

      if (!newTime.trim()) {
        validationErrors.time =
          "Start time is required.";
      }

      if (!newEndTime.trim()) {
        validationErrors.endTime =
          "End time is required.";
      }

      if (!newLocation.trim()) {
        validationErrors.location =
          "Event location is required.";
      }

      const capacity =
        Number(newCapacity);

      if (!newCapacity.trim()) {
        validationErrors.capacity =
          "Maximum participants is required.";
      } else if (
        !Number.isInteger(capacity) ||
        capacity < 1
      ) {
        validationErrors.capacity =
          "Enter a positive whole number.";
      }

      if (
        Object.keys(validationErrors).length > 0
      ) {
        setEventFormErrors(
          validationErrors
        );

        creatingRef.current =
          false;

        showEventFormAlert(
          "Incomplete Event",
          "Please complete the required fields highlighted in red before creating the event.",
          "warning"
        );

        return;
      }

      const startAt = combineEventDateTime(
        newDate.trim(),
        newTime.trim()
      );

      const endAt = combineEventDateTime(
        newDate.trim(),
        newEndTime.trim()
      );

      if (!startAt || !endAt) {
        creatingRef.current = false;

        showEventFormAlert(
          "Invalid Event Time",
          "Please select a valid event date, start time, and end time.",
          "warning"
        );

        return;
      }

      if (
        new Date(endAt).getTime() <=
        new Date(startAt).getTime()
      ) {
        setEventFormErrors({
          endTime: "End time must be later than start time.",
        });

        creatingRef.current = false;

        showEventFormAlert(
          "Invalid End Time",
          "The event end time must be later than the start time.",
          "warning"
        );

        return;
      }

      setEventFormErrors({});

      if (!admin) {
        creatingRef.current =
          false;

        showEventFormAlert(
          "Not Authorized",
          "Please sign in as an administrator before creating an event.",
          "error"
        );

        return;
      }

      setIsCreating(true);

      try {
        let imageUrl = "";

        if (newImageUri) {
          // Keep existing remote URL when editing without picking a new local file.
          if (
            editingEventId &&
            newImageUri.startsWith("http")
          ) {
            imageUrl = newImageUri;
          } else {
            imageUrl =
              await uploadAdminEventImage(
                newImageUri
              );
          }
        }

        if (editingEventId) {
          await updateEvent(
            editingEventId,
            {
              title: newTitle.trim(),
              description: newDescription.trim(),
              category: newCategory,
              date: newDate.includes("-")
                ? formatEventDate(newDate.trim())
                : newDate.trim(),
              time: /^\d{1,2}:\d{2}$/.test(newTime.trim())
                ? formatEventTime(newTime.trim())
                : newTime.trim(),
              endTime: /^\d{1,2}:\d{2}$/.test(newEndTime.trim())
                ? formatEventTime(newEndTime.trim())
                : newEndTime.trim(),
              startAt,
              endAt,
              location: newLocation.trim(),
              capacity,
              imageUrl: imageUrl || undefined,
              coordinates: newCoordinates,
            },
            admin
          );
        } else {
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

              endTime:
                formatEventTime(
                  newEndTime.trim()
                ),

              startAt,

              endAt,

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
        }

        await reloadEvents();

        setEditingEventId(null);
        setNewTitle("");
        setNewCategory(
          "Clean-up"
        );
        setNewDescription("");
        setNewDate("");
        setNewTime("");
        setNewEndTime("");
        setNewLocation("");
        setNewCapacity("");
        setEventFormErrors({});
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

        showEventFormAlert(
          editingEventId
            ? "Event Updated"
            : "Event Created",
          editingEventId
            ? "The event changes were saved successfully."
            : "The new event was created successfully.",
          "success"
        );
      } catch (error) {
        showEventFormAlert(
          "Event Not Saved",
          error instanceof Error
            ? error.message
            : "Failed to create the event. Please try again.",
          "error"
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

  const openEventDetails = async (event: AdminEvent) => {
  setSelectedEvent(event);
  setEventImageFailed(false);

  setEventParticipants([]);
  setLoadingParticipants(true);

  try {
    setEventParticipants(
      await fetchEventParticipants(event.id)
    );
  } catch (error) {
    Alert.alert(
      "Participants unavailable",
      error instanceof Error
        ? error.message
        : "Failed to load participants."
    );
  } finally {
    setLoadingParticipants(false);
  }
};

  // Open an event when arriving from a notification deep link (?eventId=...).
  useEffect(() => {
    const eventId = typeof eventIdParam === "string" ? eventIdParam : undefined;
    if (!eventId || events.length === 0) return;
    if (openedEventFromQueryRef.current === eventId) return;
    const match = events.find((item) => item.id === eventId);
    if (!match) return;
    openedEventFromQueryRef.current = eventId;
    void openEventDetails(match);
  }, [eventIdParam, events]);

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
      nextStatus: EventStatus,
      details?: { rejectionReason?: string; rejectionRemarks?: string }
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
          admin,
          details
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

  await moderateEvent("Rejected", {
    rejectionReason,
    rejectionRemarks,
  });

  setRejectionReason("");
  setRejectionRemarks("");
};

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <AdminLayout activePage="Events">
      {/* ================================================= */}
      {/* EVENT FORM ALERT */}
      {/* ================================================= */}

      <Modal
        visible={
          eventFormAlert.visible &&
          eventFormAlert.variant === "success"
        }
        transparent
        animationType="fade"
        onRequestClose={closeEventFormAlert}
      >
        <Pressable
          style={styles.formAlertOverlay}
          onPress={closeEventFormAlert}
        >
          <Pressable
            style={styles.formAlertCard}
            onPress={() => {
              // Keep clicks inside the alert from closing it.
            }}
          >
            <View
              style={[
                styles.formAlertIconWrap,
                eventFormAlert.variant === "success"
                  ? styles.formAlertIconSuccess
                  : eventFormAlert.variant === "error"
                    ? styles.formAlertIconError
                    : styles.formAlertIconWarning,
              ]}
            >
              {eventFormAlert.variant === "success" ? (
                <Check
                  size={28}
                  color="#FFFFFF"
                  strokeWidth={3}
                />
              ) : (
                <TriangleAlert
                  size={28}
                  color="#FFFFFF"
                  strokeWidth={2.7}
                />
              )}
            </View>

            <Text style={styles.formAlertTitle}>
              {eventFormAlert.title}
            </Text>

            <Text style={styles.formAlertMessage}>
              {eventFormAlert.message}
            </Text>

            <TouchableOpacity
              style={[
                styles.formAlertButton,
                eventFormAlert.variant === "success"
                  ? styles.formAlertButtonSuccess
                  : eventFormAlert.variant === "error"
                    ? styles.formAlertButtonError
                    : styles.formAlertButtonWarning,
              ]}
              onPress={closeEventFormAlert}
              activeOpacity={0.85}
            >
              <Text style={styles.formAlertButtonText}>
                {eventFormAlert.variant === "success"
                  ? "Done"
                  : "Got it"}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ================================================= */}
      {/* PENDING EVENT */}
      {/* ================================================= */}

      {selectedEvent?.status ===
      "Pending" ? (
        <PendingEventDetailsPage
          event={selectedEvent}
          isModerating={isModerating}
          onBack={closeEventDetails}
          onOpenImage={setPreviewImageUrl}
          onReject={() => {
            setRejectionReason("");
            setRejectionRemarks("");
            setShowRejectReasonDropdown(false);
            setRejectModalOpen(true);
          }}
          onApprove={() =>
            void moderateEvent("Approved")
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
                onPress={() => {
                  setEditingEventId(null);
                  setEventFormErrors({});
                  setEventFormAlert((previous) => ({
                    ...previous,
                    visible: false,
                  }));
                  setAddModalOpen(true);
                }}
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

          {activeTab === "All Events" && (
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
      value={filteredStats.total}
      color="#ffffff"
      icon={CalendarCheck}
      iconColor="#0aa65b"
      scale={s}
    />

    <SummaryCard
      title={
        category === "All Types"
          ? "All Event Types"
          : category
      }
      value={filteredStats.categoryCount}
      color="#fff1c9"
      icon={CalendarDays}
      iconColor="#D99A00"
      scale={s}
    />

    <SummaryCard
      title={
        status === "All Statuses"
          ? "All Statuses"
          : status
      }
      value={filteredStats.statusCount}
      color="#cfe9fb"
      icon={Clock3}
      iconColor="#168df0"
      scale={s}
    />
  </View>
)}

          {/* =============================================== */}
          {/* FILTER PANEL */}
          {/* =============================================== */}

          <View style={styles.filterPanel}>
            {/* SEARCH */}

            <View style={styles.searchBox}>
              <TextInput
                value={search}
                onChangeText={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                placeholder="Search events..."
                placeholderTextColor="#777"
                style={styles.searchInput}
              />

              <Search
                size={17}
                color="#555"
              />
            </View>

            {/* EVENT TYPE */}

            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                activeOpacity={0.82}
                style={[
                  styles.filterBox,
                  showCategoryDropdown && styles.filterBoxOpen,
                ]}
                onPress={() => {
                  setShowCategoryDropdown(!showCategoryDropdown);
                  setShowStatusDropdown(false);
                }}
              >
                <Text style={styles.filterLabel}>
                  Event Type
                </Text>

                <View style={styles.filterValueRow}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.filterValue,
                      showCategoryDropdown && styles.filterValueOpen,
                    ]}
                  >
                    {category}
                  </Text>

                  <ChevronDown
                    size={16}
                    color={showCategoryDropdown ? "#34733B" : "#333333"}
                    style={{
                      transform: [
                        {
                          rotate: showCategoryDropdown ? "180deg" : "0deg",
                        },
                      ],
                    }}
                  />
                </View>
              </TouchableOpacity>

              {showCategoryDropdown && (
                <View style={styles.dropdownMenu}>
                  {CATEGORY_OPTIONS.map((item) => {
                    const selected = category === item;

                    return (
                      <TouchableOpacity
                        key={item}
                        activeOpacity={0.75}
                        style={[
                          styles.dropdownItem,
                          selected && styles.dropdownItemSelected,
                        ]}
                        onPress={() => {
                          setCategory(item);
                          setPage(1);
                          setShowCategoryDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownText,
                            selected && styles.dropdownTextSelected,
                          ]}
                        >
                          {item}
                        </Text>

                        {selected && (
                          <Check
                            size={16}
                            color="#34733B"
                            strokeWidth={2.5}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* STATUS */}

            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                activeOpacity={activeTab === "All Events" ? 0.82 : 1}
                disabled={activeTab !== "All Events"}
                style={[
                  styles.filterBox,
                  activeTab === "All Events" &&
                    showStatusDropdown &&
                    styles.filterBoxOpen,
                ]}
                onPress={() => {
                  if (activeTab !== "All Events") return;

                  setShowStatusDropdown(!showStatusDropdown);
                  setShowCategoryDropdown(false);
                }}
              >
                <Text style={styles.filterLabel}>
                  Status
                </Text>

                <View style={styles.filterValueRow}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.filterValue,
                      activeTab === "All Events" &&
                        showStatusDropdown &&
                        styles.filterValueOpen,
                    ]}
                  >
                    {activeTab === "Pending Approval"
                      ? "Pending"
                      : activeTab === "Rejected"
                        ? "Rejected"
                        : status}
                  </Text>

                  {activeTab === "All Events" ? (
                    <ChevronDown
                      size={16}
                      color={showStatusDropdown ? "#34733B" : "#333333"}
                      style={{
                        transform: [
                          {
                            rotate: showStatusDropdown ? "180deg" : "0deg",
                          },
                        ],
                      }}
                    />
                  ) : null}
                </View>
              </TouchableOpacity>

              {activeTab === "All Events" && showStatusDropdown && (
                <View style={styles.dropdownMenu}>
                  {STATUS_OPTIONS.map((item) => {
                    const selected = status === item;

                    return (
                      <TouchableOpacity
                        key={item}
                        activeOpacity={0.75}
                        style={[
                          styles.dropdownItem,
                          selected && styles.dropdownItemSelected,
                        ]}
                        onPress={() => {
                          setStatus(item);
                          setPage(1);
                          setShowStatusDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownText,
                            selected && styles.dropdownTextSelected,
                          ]}
                        >
                          {item}
                        </Text>

                        {selected && (
                          <Check
                            size={16}
                            color="#34733B"
                            strokeWidth={2.5}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* DATE RANGE */}

            <DateRangeBox
              fromDate={fromDate}
              toDate={toDate}
              onChangeFrom={(value) => {
                setFromDate(value);
                setPage(1);
              }}
              onChangeTo={(value) => {
                setToDate(value);
                setPage(1);
              }}
            />

            {/* RESET */}

            <TouchableOpacity
              style={styles.resetButton}
              onPress={resetFilters}
              activeOpacity={0.82}
            >
              <Filter
                size={15}
                color="#43884c"
              />

              <Text style={styles.resetText}>
                Reset
              </Text>
            </TouchableOpacity>
          </View>

          {/* TABLE */}
          {/* =============================================== */}

          <View
            style={
              styles.tablePanel
            }
            onLayout={(event) => {
              setTableContainerWidth(
                event.nativeEvent.layout.width
              );
            }}
          >
            <View
              style={[
                styles.table,
                styles.tableFullWidth,
              ]}
            >
                {/* TABLE HEADER */}

                <View
                  style={
                    styles.tableHeader
                  }
                >
                  {activeTab ===
                    "All Events" &&
                    !compactTable && (
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
                        styles.centerHeaderText,
                      ]}
                    >
                      Status
                    </Text>
                  )}

                  <Text
                    style={[
                      styles.th,
                      styles.participantsColumn,
                      styles.centerHeaderText,
                    ]}
                  >
                    Participants
                  </Text>

                  <Text
                    style={[
                      styles.th,
                      styles.actionColumn,
                      styles.centerHeaderText,
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
                          "All Events" &&
                          !compactTable && (
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
                          {!veryCompactTable ? (
                            <View
                              style={
                                styles.eventThumbnail
                              }
                            >
                              {getEventImages(event)[0] ? (
                                <Pressable
                                  onPress={() =>
                                    setPreviewImageUrl(
                                      getEventImages(event)[0]
                                    )
                                  }
                                >
                                  <Image
                                    source={{
                                      uri: getEventImages(event)[0],
                                    }}
                                    style={
                                      styles.eventThumbnailImage
                                    }
                                  />
                                </Pressable>
                              ) : (
                                <CalendarDays
                                  size={
                                    18
                                  }
                                  color="#7d8c7c"
                                />
                              )}
                            </View>
                          ) : null}

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
                            {event.endTime
                              ? `${event.time} - ${event.endTime}`
                              : event.time}
                          </Text>
                        </View>

                        {/* LOCATION */}

                        <Text
                          numberOfLines={
                            veryCompactTable ? 1 : 2
                          }
                          ellipsizeMode="tail"
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
                                styles.statusBadge,
                                {
                                  backgroundColor:
                                    statusColor(
                                      event.status
                                    ),
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.badgeText,
                                  {
                                    color:
                                      statusTextColor(
                                        event.status
                                      ),
                                  },
                                ]}
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
                              styles.centerCellText,
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
                              styles.centerCellText,
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
                              numberOfLines={1}
                              style={
                                styles.viewButtonText
                              }
                            >
                              {compactTable
                                ? "View"
                                : "View Event"}
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
        onRequestClose={closeAddEventModal}
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
            {eventFormAlert.visible &&
            eventFormAlert.variant !== "success" ? (
              <View style={styles.inlineFormAlertOverlay}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.inlineFormAlertBackdrop,
                    {
                      opacity: formAlertAnimation,
                    },
                  ]}
                />

                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={closeEventFormAlert}
                />

                <Animated.View
                  style={[
                    styles.inlineFormAlertCenter,
                    {
                      opacity: formAlertAnimation,
                      transform: [
                        {
                          translateY:
                            formAlertAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [10, 0],
                            }),
                        },
                        {
                          scale:
                            formAlertAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.96, 1],
                            }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.formAlertCard}>
                    <View
                      style={[
                        styles.formAlertIconWrap,
                        eventFormAlert.variant === "error"
                          ? styles.formAlertIconError
                          : styles.formAlertIconWarning,
                      ]}
                    >
                      <TriangleAlert
                        size={28}
                        color="#FFFFFF"
                        strokeWidth={2.7}
                      />
                    </View>

                    <Text style={styles.formAlertTitle}>
                      {eventFormAlert.title}
                    </Text>

                    <Text style={styles.formAlertMessage}>
                      {eventFormAlert.message}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.formAlertButton,
                        eventFormAlert.variant === "error"
                          ? styles.formAlertButtonError
                          : styles.formAlertButtonWarning,
                      ]}
                      onPress={closeEventFormAlert}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.formAlertButtonText}>
                        Got it
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              </View>
            ) : null}

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
                  {editingEventId ? "Edit Event" : "Add New Event"}
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  {editingEventId
                    ? "Update event details and save changes"
                    : "Create an event for administrator approval."}
                </Text>
              </View>

              <Pressable
                style={
                  styles.closeButton
                }
                onPress={closeAddEventModal}
              >
                <X
                  size={20}
                  color="#222"
                />
              </Pressable>
            </View>

            {Object.keys(eventFormErrors).length > 0 ? (
              <View style={styles.formErrorBanner}>
                <Text style={styles.formErrorBannerTitle}>
                  Please complete the required fields.
                </Text>

                <Text style={styles.formErrorBannerText}>
                  Check the fields highlighted in red before creating the event.
                </Text>
              </View>
            ) : null}

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
                  label="Event Title *"
                  value={
                    newTitle
                  }
                  onChangeText={(value) => {
                    setNewTitle(value);
                    clearEventFormError("title");
                  }}
                  placeholder="Enter event title"
                  error={eventFormErrors.title}
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
                  label="Description *"
                  value={
                    newDescription
                  }
                  onChangeText={(value) => {
                    setNewDescription(value);
                    clearEventFormError("description");
                  }}
                  placeholder="Enter event description"
                  multiline
                  error={eventFormErrors.description}
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
                      label="Date *"
                      value={
                        newDate
                      }
                      onChange={(value) => {
                        setNewDate(value);
                        clearEventFormError("date");
                      }}
                      error={eventFormErrors.date}
                    />
                  </View>

                  <View
                    style={
                      styles.inlineField
                    }
                  >
                    <TimePickerField
                      label="Start Time *"
                      value={
                        newTime
                      }
                      onChange={(value) => {
                        setNewTime(value);
                        clearEventFormError("time");
                      }}
                      error={eventFormErrors.time}
                    />
                  </View>

                  <View
                    style={
                      styles.inlineField
                    }
                  >
                    <TimePickerField
                      label="End Time *"
                      value={
                        newEndTime
                      }
                      onChange={(value) => {
                        setNewEndTime(value);
                        clearEventFormError("endTime");
                      }}
                      error={eventFormErrors.endTime}
                    />
                  </View>
                </View>

                <FormField
                  label="Maximum Participants *"
                  value={
                    newCapacity
                  }
                  onChangeText={(value) => {
                    setNewCapacity(value);
                    clearEventFormError("capacity");
                  }}
                  placeholder="Enter maximum participants"
                  error={eventFormErrors.capacity}
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
                  label="Location *"
                  value={
                    newLocation
                  }
                  onChangeText={(value) => {
                    setNewLocation(value);
                    clearEventFormError("location");
                  }}
                  placeholder="e.g., Barangay Hall, North Poblacion"
                  error={eventFormErrors.location}
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
                onPress={() => {
                  if (!isCreating) {
                    closeAddEventModal();
                  }
                }}
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
                    ? editingEventId
                      ? "Saving..."
                      : "Creating..."
                    : editingEventId
                      ? "Save Changes"
                      : "Create Event"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================================================= */}
{/* EVENT DETAILS MODAL */}
{/* ================================================= */}

<Modal
  visible={
    selectedEvent !== null &&
    selectedEvent.status !== "Pending"
  }
  transparent
  animationType="fade"
  onRequestClose={closeEventDetails}
>
  <View style={styles.modalOverlay}>
    {selectedEvent ? (
      <View style={styles.eventDetailsModal}>
        {/* HEADER */}
        <View style={styles.eventDetailsHeader}>
          <View style={styles.eventDetailsHeaderLeft}>
            <Text style={styles.eventDetailsTitle}>
              {selectedEvent.title}
            </Text>

            <Text style={styles.eventDetailsId}>
              Event ID: #{selectedEvent.id.slice(0, 10).toUpperCase()}
            </Text>

            <View style={styles.eventDetailsBadges}>
              <View
                style={[
                  styles.eventDetailsBadge,
                  {
                    backgroundColor: categoryColor(
                      selectedEvent.category
                    ),
                  },
                ]}
              >
                <Text style={styles.eventDetailsBadgeText}>
                  {selectedEvent.category}
                </Text>
              </View>

              <View
                style={[
                  styles.eventDetailsBadge,
                  {
                    backgroundColor: statusColor(
                      selectedEvent.status
                    ),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.eventDetailsBadgeText,
                    {
                      color:
                        statusTextColor(
                          selectedEvent.status
                        ),
                    },
                  ]}
                >
                  {selectedEvent.status}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            style={styles.eventDetailsClose}
            onPress={closeEventDetails}
          >
            <X size={22} color="#333333" />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.eventDetailsScrollContent}
        >
          <View style={styles.eventDetailsColumns}>
            {/* ================= LEFT ================= */}
            <View style={styles.eventDetailsLeft}>
              {/* IMAGE */}
              <View style={styles.eventHeroCard}>
                {getEventImages(selectedEvent)[0] && !eventImageFailed ? (
                  <Pressable
                    style={styles.eventHeroPressable}
                    onPress={() =>
                      setPreviewImageUrl(
                        getEventImages(selectedEvent)[0]
                      )
                    }
                  >
                    <Image
                      source={{
                        uri: getEventImages(selectedEvent)[0],
                      }}
                      style={styles.eventDetailsHeroImage}
                      resizeMode="cover"
                      onError={() => setEventImageFailed(true)}
                    />
                  </Pressable>
                ) : (
                  <View style={styles.eventDetailsImagePlaceholder}>
                    <CalendarDays
                      size={48}
                      color="#7d8c7c"
                    />

                    <Text style={styles.eventDetailsPlaceholderText}>
                      No event image available
                    </Text>
                  </View>
                )}
              </View>

              {/* ABOUT */}
              <View style={styles.eventDetailsCard}>
                <Text style={styles.eventDetailsSectionTitle}>
                  About the Event
                </Text>

                <Text style={styles.eventDetailsDescription}>
                  {selectedEvent.description}
                </Text>
              </View>

              {/* INFORMATION */}
              <View style={styles.eventDetailsCard}>
                <Text style={styles.eventDetailsSectionTitle}>
                  Event Information
                </Text>

                <View style={styles.eventInfoGrid}>
                  <View style={styles.eventInfoItem}>
                    <View style={styles.eventInfoIcon}>
                      <CalendarDays
                        size={20}
                        color="#34733B"
                      />
                    </View>

                    <View style={styles.eventInfoCopy}>
                      <Text style={styles.eventInfoLabel}>
                        Date
                      </Text>

                      <Text style={styles.eventInfoValue}>
                        {selectedEvent.date}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.eventInfoItem}>
                    <View style={styles.eventInfoIcon}>
                      <Clock3
                        size={20}
                        color="#34733B"
                      />
                    </View>

                    <View style={styles.eventInfoCopy}>
                      <Text style={styles.eventInfoLabel}>
                        Time
                      </Text>

                      <Text style={styles.eventInfoValue}>
                        {selectedEvent.endTime
                          ? `${selectedEvent.time} - ${selectedEvent.endTime}`
                          : selectedEvent.time}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.eventInfoItem}>
                    <View style={styles.eventInfoIcon}>
                      <Users
                        size={20}
                        color="#34733B"
                      />
                    </View>

                    <View style={styles.eventInfoCopy}>
                      <Text style={styles.eventInfoLabel}>
                        Participants
                      </Text>

                      <Text style={styles.eventInfoValue}>
                        {selectedEvent.participants} /{" "}
                        {selectedEvent.capacity}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.eventInfoItem}>
                    <View style={styles.eventInfoIcon}>
                      <UserRound
                        size={20}
                        color="#34733B"
                      />
                    </View>

                    <View style={styles.eventInfoCopy}>
                      <Text style={styles.eventInfoLabel}>
                        Submitted By
                      </Text>

                      <Text style={styles.eventInfoValue}>
                        {selectedEvent.submittedBy}
                      </Text>

                      <Text style={styles.eventInfoSubValue}>
                        {selectedEvent.submittedArea}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.eventLocationRow}>
                  <View style={styles.eventInfoIcon}>
                    <MapPin
                      size={20}
                      color="#34733B"
                    />
                  </View>

                  <View style={styles.eventInfoCopy}>
                    <Text style={styles.eventInfoLabel}>
                      Location
                    </Text>

                    <Text style={styles.eventInfoValue}>
                      {selectedEvent.location}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ================= RIGHT ================= */}
            <View style={styles.eventDetailsRight}>
              {/* MAP */}
              <View style={styles.eventDetailsCard}>
                <Text style={styles.eventDetailsSectionTitle}>
                  Event Location
                </Text>

                <View style={styles.eventDetailsMap}>
                  <InteractiveLocationMap
                    coordinates={selectedEvent.coordinates}
                    height={250}
                  />
                </View>

                {selectedEvent.coordinates ? (
                  <Text style={styles.eventCoordinates}>
                    GPS:{" "}
                    {selectedEvent.coordinates.latitude.toFixed(6)},{" "}
                    {selectedEvent.coordinates.longitude.toFixed(6)}
                  </Text>
                ) : null}
              </View>

              {/* PARTICIPANTS */}
              <View style={styles.eventDetailsCard}>
                <View style={styles.participantHeader}>
                  <View>
                    <Text style={styles.eventDetailsSectionTitle}>
                      Participant List
                    </Text>

                    <Text style={styles.participantCount}>
                      {eventParticipants.length} registered participant
                      {eventParticipants.length === 1 ? "" : "s"}
                    </Text>
                  </View>

                  <View style={styles.participantCapacityBadge}>
                    <Users
                      size={15}
                      color="#34733B"
                    />

                    <Text style={styles.participantCapacityText}>
                      {selectedEvent.participants}/
                      {selectedEvent.capacity}
                    </Text>
                  </View>
                </View>

                {loadingParticipants ? (
                  <View style={styles.participantEmpty}>
                    <Text style={styles.participantEmptyText}>
                      Loading participants...
                    </Text>
                  </View>
                ) : eventParticipants.length === 0 ? (
                  <View style={styles.participantEmpty}>
                    <Users
                      size={34}
                      color="#AAB4AA"
                    />

                    <Text style={styles.participantEmptyTitle}>
                      No participants yet
                    </Text>

                    <Text style={styles.participantEmptyText}>
                      Users who join this event will appear here.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.participantList}>
                    {eventParticipants.map((participant) => {
                      const joined = participant.joinedAt
                        ? formatDateTime(participant.joinedAt)
                        : null;

                      return (
                        <View
                          key={participant.uid}
                          style={styles.eventParticipantRow}
                        >
                          <View style={styles.eventParticipantAvatar}>
                            <UserRound
                              size={18}
                              color="#ffffff"
                            />
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text style={styles.eventParticipantName}>
                              {participant.name}
                            </Text>

                            <Text style={styles.eventParticipantEmail}>
                              {participant.email}
                            </Text>
                          </View>

                          {joined ? (
                            <View style={styles.eventParticipantJoined}>
                              <Text
                                style={
                                  styles.eventParticipantJoinedLabel
                                }
                              >
                                Joined
                              </Text>

                              <Text
                                style={
                                  styles.eventParticipantJoinedDate
                                }
                              >
                                {joined.date}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        {/* FOOTER */}
        <View style={styles.eventDetailsFooter}>
          <TouchableOpacity
            style={styles.eventDetailsCloseButton}
            onPress={closeEventDetails}
            disabled={isModerating}
          >
            <Text style={styles.eventDetailsCloseButtonText}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : null}
  </View>
</Modal>
      <EventImageLightbox
        uri={previewImageUrl}
        onClose={() => setPreviewImageUrl(null)}
      />
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
  onOpenImage,
}: {
  event: AdminEvent;
  isModerating: boolean;
  onBack: () => void;
  onReject: () => void;
  onApprove: () => void;
  onOpenImage: (uri: string) => void;
}) {
  const submitted =
    formatDateTime(
      event.createdAt
    );
  const eventImages = getEventImages(event);

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
                {eventImages[0] ? (
                  <Pressable onPress={() => onOpenImage(eventImages[0])}>
                    <Image
                      source={{
                        uri: eventImages[0],
                      }}
                      style={
                        styles.pendingHeroImage
                      }
                      resizeMode="cover"
                    />
                  </Pressable>
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
                    {event.endTime
                      ? `${event.time} - ${event.endTime}`
                      : event.time}
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
              {eventImages.length ? (
                eventImages.map((imageUrl, index) => (
                  <Pressable
                    key={`${imageUrl}-${index}`}
                    onPress={() => onOpenImage(imageUrl)}
                  >
                    <Image
                      source={{
                        uri: imageUrl,
                      }}
                      style={
                        styles.pendingGalleryImage
                      }
                      resizeMode="cover"
                    />
                  </Pressable>
                ))
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
  error,
}: {
  label: string;
  value: string;
  onChangeText: (
    value: string
  ) => void;
  placeholder: string;
  multiline?: boolean;
  error?: string;
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
          error &&
            styles.inputError,
        ]}
      />

      {error ? (
        <Text style={styles.fieldErrorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// =========================================================
// DATE RANGE FILTER
// =========================================================

function DateRangeBox({
  fromDate,
  toDate,
  onChangeFrom,
  onChangeTo,
}: {
  fromDate: string;
  toDate: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
}) {
  return (
    <View style={styles.dateRangeBox}>
      <Text style={styles.dateRangeLabel}>
        Date Range
      </Text>

      <View style={styles.dateRangeInputRow}>
        <View style={styles.dateRangeSingleBox}>
          {Platform.OS === "web"
            ? createElement("input", {
                type: "date",
                value: fromDate,
                "aria-label": "From date",
                onChange: (event: {
                  target: { value: string };
                }) => onChangeFrom(event.target.value),
                style: dateRangeWebInputStyle,
              })
            : (
              <TextInput
                value={fromDate}
                onChangeText={onChangeFrom}
                placeholder="From date"
                placeholderTextColor="#888888"
                style={styles.dateRangeNativeInput}
              />
            )}
        </View>

        <Text style={styles.dateRangeSeparator}>–</Text>

        <View style={styles.dateRangeSingleBox}>
          {Platform.OS === "web"
            ? createElement("input", {
                type: "date",
                value: toDate,
                min: fromDate || undefined,
                "aria-label": "To date",
                onChange: (event: {
                  target: { value: string };
                }) => onChangeTo(event.target.value),
                style: dateRangeWebInputStyle,
              })
            : (
              <TextInput
                value={toDate}
                onChangeText={onChangeTo}
                placeholder="To date"
                placeholderTextColor="#888888"
                style={styles.dateRangeNativeInput}
              />
            )}
        </View>
      </View>
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
  error,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  error?: string;
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

            style: error
              ? {
                  ...webPickerStyle,
                  border: "1px solid #D93025",
                  backgroundColor: "#FFF8F7",
                }
              : webPickerStyle,
          }
        )}

        {error ? (
          <Text style={styles.fieldErrorText}>
            {error}
          </Text>
        ) : null}
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
        style={[
          styles.pickerButton,
          error && styles.inputError,
        ]}
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

      {error ? (
        <Text style={styles.fieldErrorText}>
          {error}
        </Text>
      ) : null}

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
  error,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  error?: string;
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

            style: error
              ? {
                  ...webPickerStyle,
                  border: "1px solid #D93025",
                  backgroundColor: "#FFF8F7",
                }
              : webPickerStyle,
          }
        )}

        {error ? (
          <Text style={styles.fieldErrorText}>
            {error}
          </Text>
        ) : null}
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
        style={[
          styles.pickerButton,
          error && styles.inputError,
        ]}
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

const dateRangeWebInputStyle = {
  width: "100%",
  height: 23,
  minWidth: 0,
  maxWidth: "100%",
  border: "none",
  outline: "none",
  padding: 0,
  margin: 0,
  fontSize: 10,
  lineHeight: "23px",
  color: "#252525",
  backgroundColor: "transparent",
  boxSizing: "border-box" as const,
  fontFamily: MONTSERRAT_FONT,
  cursor: "pointer",
};

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
  fontFamily: MONTSERRAT_FONT,
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
    status === "Approved" ||
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

function statusTextColor(
  status: EventStatus
) {
  if (
    status === "Pending"
  ) {
    return "#A66A00";
  }

  if (
    status === "Approved" ||
    status === "Upcoming"
  ) {
    return "#8A2BA6";
  }

  if (
    status === "Ongoing"
  ) {
    return "#1673B1";
  }

  if (
    status === "Completed"
  ) {
    return "#237A36";
  }

  return "#B42318";
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
        MONTSERRAT_FONT,
      color: "#145b22",
      lineHeight: 44,
    },

    subtitle: {
      color: "#4f8154",
      fontFamily:
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
      textAlign:
        "center",
    },

    summaryValue: {
      fontFamily:
        MONTSERRAT_FONT,
      color: "#111",
      lineHeight: 40,
    },

    // =====================================================
    // FILTERS
    // =====================================================

    filterPanel: {
      marginTop: 18,
      width: "100%",
      padding: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: "#D9DEDA",
      borderRadius: 10,
      backgroundColor: "#FFFFFF",
      zIndex: 20,
      overflow: "visible",
    },

    searchBox: {
      height: 52,
      flexGrow: 1.35,
      flexShrink: 1,
      flexBasis: 250,
      minWidth: 220,
      borderRadius: 8,
      backgroundColor: "#F7F8F7",
      borderWidth: 1,
      borderColor: "#D9DEDA",
      paddingHorizontal: 13,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    searchInput: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      color: "#252525",
      fontFamily: MONTSERRAT_FONT,
      outlineStyle: "none",
    } as never,

    filterBox: {
      width: "100%",
      height: 52,
      borderRadius: 8,
      backgroundColor: "#F7F8F7",
      borderWidth: 1,
      borderColor: "#D9DEDA",
      paddingHorizontal: 12,
      paddingVertical: 6,
      justifyContent: "center",
      cursor: "pointer",
    } as any,

    filterBoxOpen: {
      borderColor: "#34733B",
      backgroundColor: "#F7FBF5",
    },

    filterValueOpen: {
      color: "#34733B",
    },

    filterLabel: {
      fontFamily: MONTSERRAT_FONT,
      color: "#686F68",
      marginBottom: 2,
      fontSize: 10,
      lineHeight: 12,
    },

    filterValueRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 20,
      gap: 8,
    },

    filterValue: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: MONTSERRAT_FONT,
      color: "#252525",
    },

    dateRangeBox: {
      height: 52,
      flexGrow: 0,
      flexShrink: 1,
      flexBasis: 300,
      minWidth: 286,
      maxWidth: 320,
      borderRadius: 8,
      backgroundColor: "#F7F8F7",
      borderWidth: 1,
      borderColor: "#D9DEDA",
      paddingHorizontal: 10,
      paddingTop: 4,
      paddingBottom: 5,
      justifyContent: "center",
      overflow: "hidden",
    },

    dateRangeLabel: {
      fontSize: 10,
      lineHeight: 12,
      color: "#686F68",
      fontFamily: MONTSERRAT_FONT,
      marginBottom: 2,
    },

    dateRangeInputRow: {
      height: 27,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 5,
    },

    dateRangeSingleBox: {
      width: 128,
      height: 27,
      borderWidth: 1,
      borderColor: "#CDD3CD",
      borderRadius: 6,
      backgroundColor: "#FFFFFF",
      paddingHorizontal: 7,
      justifyContent: "center",
      overflow: "hidden",
    },

    dateRangeSeparator: {
      width: 10,
      textAlign: "center",
      fontSize: 11,
      lineHeight: 14,
      color: "#656B65",
      fontFamily: MONTSERRAT_FONT,
    },

    dateRangeNativeInput: {
      width: "100%",
      minWidth: 0,
      height: 23,
      padding: 0,
      margin: 0,
      borderWidth: 0,
      fontSize: 10,
      color: "#252525",
      fontFamily: MONTSERRAT_FONT,
    },

    resetButton: {
      width: 94,
      height: 52,
      flexShrink: 0,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#D9DEDA",
      backgroundColor: "#F7F8F7",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },

    resetText: {
      fontSize: 12,
      color: "#34733B",
      fontFamily: MONTSERRAT_FONT,
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
      width: "100%",
      minWidth: 0,
    },

    tableFullWidth: {
      width: "100%",
      minWidth: 0,
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
      paddingHorizontal: 8,
    },

    th: {
      fontSize: 13,
      lineHeight: 16,
      color: "#202020",
      fontFamily:
        MONTSERRAT_FONT,
      flexShrink: 1,
    },

    centerHeaderText: {
      textAlign: "center",
    },

    centerCellText: {
      textAlign: "center",
      width: "100%",
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
      paddingHorizontal: 8,
    },

    idColumn: {
      flex: 0.55,
      minWidth: 0,
      paddingHorizontal: 6,
    },

    detailsColumn: {
      flex: 1.65,
      minWidth: 0,
      paddingHorizontal: 6,
    },

    submittedColumn: {
      flex: 1.15,
      minWidth: 0,
      paddingHorizontal: 6,
    },

    categoryColumn: {
      flex: 1.0,
      minWidth: 0,
      paddingHorizontal: 6,
    },

    dateColumn: {
      flex: 1.15,
      minWidth: 0,
      paddingHorizontal: 6,
    },

    locationColumn: {
      flex: 1.45,
      minWidth: 0,
      paddingHorizontal: 6,
    },

    statusColumn: {
      flex: 0.9,
      minWidth: 0,
      paddingHorizontal: 5,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    participantsColumn: {
      flex: 0.85,
      minWidth: 0,
      paddingHorizontal: 5,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    actionColumn: {
      flex: 0.9,
      minWidth: 0,
      paddingLeft: 5,
      paddingRight: 8,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    cellText: {
      fontSize: 13,
      lineHeight: 17,
      fontFamily:
        MONTSERRAT_FONT,
      color: "#242424",
      flexShrink: 1,
    },

    detailsCell: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 7,
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
        MONTSERRAT_FONT,
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

    statusBadge: {
      alignSelf: "center",
      minWidth: 82,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
    },

    badgeText: {
      fontSize: 14,
      color: "#2e502f",
      fontFamily:
        MONTSERRAT_FONT,
    },

    dateText: {
      fontSize: 14,
      fontFamily:
        MONTSERRAT_FONT,
      color: "#222",
    },

    smallText: {
      fontSize: 12,
      color: "#555",
      marginTop: 2,
    },

    viewButton: {
      width: "100%",
      maxWidth: 112,
      minWidth: 0,
      minHeight: 32,
      borderWidth: 1,
      borderColor:
        "#4b9b52",
      borderRadius: 6,
      paddingVertical: 5,
      paddingHorizontal: 5,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 4,
      overflow: "hidden",
      flexShrink: 1,
    },

    viewButtonText: {
      fontSize: 12,
      color: "#34733B",
      fontFamily:
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
    },

    activePageButtonText: {
      color: "#ffffff",
    },

    // =====================================================
    // MODALS
    // =====================================================

    // =====================================================
    // EVENT FORM ALERT
    // =====================================================

    formAlertOverlay: {
      flex: 1,
      backgroundColor: "rgba(20, 28, 21, 0.42)",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },

    inlineFormAlertOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 9999,
      elevation: 9999,
    },

    inlineFormAlertBackdrop: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: "rgba(20, 28, 21, 0.42)",
    },

    inlineFormAlertCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },

    formAlertCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 18,
      backgroundColor: "#FFFFFF",
      paddingHorizontal: 26,
      paddingTop: 28,
      paddingBottom: 22,
      alignItems: "center",
      shadowColor: "#000000",
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: 0.18,
      shadowRadius: 18,
      elevation: 18,
    },

    formAlertIconWrap: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },

    formAlertIconWarning: {
      backgroundColor: "#E29B17",
    },

    formAlertIconError: {
      backgroundColor: "#C43D36",
    },

    formAlertIconSuccess: {
      backgroundColor: "#2E8B45",
    },

    formAlertTitle: {
      fontSize: 19,
      lineHeight: 24,
      color: "#173B1E",
      fontFamily: MONTSERRAT_FONT,
      textAlign: "center",
    },

    formAlertMessage: {
      marginTop: 9,
      maxWidth: 330,
      fontSize: 11,
      lineHeight: 17,
      color: "#5F675F",
      fontFamily: MONTSERRAT_FONT,
      textAlign: "center",
    },

    formAlertButton: {
      width: "100%",
      height: 42,
      marginTop: 22,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },

    formAlertButtonWarning: {
      backgroundColor: "#34733B",
    },

    formAlertButtonError: {
      backgroundColor: "#A93131",
    },

    formAlertButtonSuccess: {
      backgroundColor: "#34733B",
    },

    formAlertButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontFamily: MONTSERRAT_FONT,
    },

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

  fontFamily: MONTSERRAT_FONT,

  marginBottom: 7,
},

rejectModalDescription: {
  fontSize: 11,
  lineHeight: 16,

  color: "#555555",

  fontFamily: MONTSERRAT_FONT,

  marginBottom: 18,
},

rejectField: {
  width: "100%",
  marginBottom: 16,
},

rejectLabel: {
  fontSize: 11,

  color: "#222222",

  fontFamily: MONTSERRAT_FONT,

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

  fontFamily: MONTSERRAT_FONT,

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

  fontFamily: MONTSERRAT_FONT,
},

rejectDropdownOptionTextSelected: {
  color: "#145B22",

  fontFamily: MONTSERRAT_FONT,
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

  fontFamily: MONTSERRAT_FONT,

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

  fontFamily: MONTSERRAT_FONT,
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

  fontFamily: MONTSERRAT_FONT,
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
      position: "relative",
      overflow: "hidden",
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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

    formErrorBanner: {
      width: "100%",
      marginBottom: 16,
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: "#F2B8B5",
      borderRadius: 8,
      backgroundColor: "#FFF1F0",
    },

    formErrorBannerTitle: {
      fontSize: 12,
      lineHeight: 17,
      color: "#B42318",
      fontFamily: MONTSERRAT_FONT,
    },

    formErrorBannerText: {
      marginTop: 2,
      fontSize: 10,
      lineHeight: 15,
      color: "#8A312A",
      fontFamily: MONTSERRAT_FONT,
    },

    fieldErrorText: {
      marginTop: 5,
      fontSize: 10,
      lineHeight: 14,
      color: "#B42318",
      fontFamily: MONTSERRAT_FONT,
    },

    inputError: {
      borderColor: "#D93025",
      backgroundColor: "#FFF8F7",
    },

    inputLabel: {
      fontSize: 12,
      color: "#333",
      fontFamily:
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
    },

    inlineFields: {
      flexDirection:
        "row",
      flexWrap: "wrap",
      gap: 10,
    },

    inlineField: {
      flex: 1,
      minWidth: 120,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
    },

    detailValue: {
      flex: 1,
      fontSize: 13,
      color: "#222",
      fontFamily:
        MONTSERRAT_FONT,
    },

    // =====================================================
    // DROPDOWNS
    // =====================================================

    dropdownContainer: {
      height: 52,
      flexGrow: 0.8,
      flexShrink: 1,
      flexBasis: 165,
      minWidth: 155,
      position: "relative",
      zIndex: 100,
      overflow: "visible",
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
      textAlign:
        "center",
    },

    pendingEventTitle: {
      fontSize: 21,
      lineHeight: 26,
      color: "#111111",
      fontFamily:
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
    },

    pendingEventId: {
      color: "#222222",
      fontSize: 10,
      fontFamily:
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
    },

    pendingInfoValueBox: {
      flex: 1,
    },

    pendingInfoValue: {
      flex: 1,
      color: "#444444",
      fontSize: 14,
      lineHeight: 18,
      fontFamily: MONTSERRAT_FONT,
      paddingLeft: 25,
    },

    pendingInfoSubValue: {
      color: "#555555",
      fontSize: 12,
      lineHeight: 15,
      fontFamily: MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
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
        MONTSERRAT_FONT,
    },

    pendingSubmitterArea: {
      marginTop: 2,
      color: "#555555",
      fontSize: 9,
      fontFamily:
        MONTSERRAT_FONT,
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
      fontSize: 13,
      fontFamily:
        MONTSERRAT_FONT,
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
      fontSize: 13,
      fontFamily:
        MONTSERRAT_FONT,
    },

  eventDetailsModal: {
  width: "94%",
  maxWidth: 1120,
  maxHeight: "92%",
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  overflow: "hidden",
  shadowColor: "#000000",
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: {
    width: 0,
    height: 7,
  },

  elevation: 15,
},

eventDetailsHeader: {
  minHeight: 100,
  paddingHorizontal: 28,
  paddingVertical: 20,

  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "space-between",

  borderBottomWidth: 1,
  borderBottomColor: "#E7E7E7",

  backgroundColor: "#FAFCFA",
},

eventDetailsHeaderLeft: {
  flex: 1,
  paddingRight: 20,
},

eventDetailsTitle: {
  fontSize: 26,
  lineHeight: 32,
  color: "#145B22",
  fontFamily: MONTSERRAT_FONT,
},

eventDetailsId: {
  marginTop: 4,
  fontSize: 11,
  color: "#777777",
  fontFamily: MONTSERRAT_FONT,
},

eventDetailsBadges: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  marginTop: 10,
},

eventDetailsBadge: {
  borderRadius: 20,
  paddingHorizontal: 12,
  paddingVertical: 5,
},

eventDetailsBadgeText: {
  fontSize: 11,
  color: "#264D2A",
  fontFamily: MONTSERRAT_FONT,
},

eventDetailsClose: {
  width: 38,
  height: 38,
  borderRadius: 19,
  backgroundColor: "#EEEEEE",
  alignItems: "center",
  justifyContent: "center",
},

eventDetailsScrollContent: {
  padding: 24,
},

eventDetailsColumns: {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 20,
  flexWrap: "wrap",
},

eventDetailsLeft: {
  flex: 1.25,
  minWidth: 420,
  gap: 16,
},

eventDetailsRight: {
  flex: 0.85,
  minWidth: 320,
  gap: 16,
},

eventHeroCard: {
  width: "100%",
  height: 270,
  borderRadius: 12,
  overflow: "hidden",
  backgroundColor: "#E7EBE7",
},

eventHeroPressable: {
  width: "100%",
  height: "100%",
},

eventDetailsHeroImage: {
  width: "100%",
  height: "100%",
},

eventDetailsImagePlaceholder: {
  width: "100%",
  height: "100%",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#EEF2EE",
},

eventDetailsPlaceholderText: {
  marginTop: 8,
  fontSize: 12,
  color: "#778077",
  fontFamily: MONTSERRAT_FONT,
},

eventDetailsCard: {
  width: "100%",
  borderWidth: 1,
  borderColor: "#DFE3DF",
  borderRadius: 12,
  backgroundColor: "#FFFFFF",
  padding: 18,
},

eventDetailsSectionTitle: {
  fontSize: 16,
  color: "#145B22",
  fontFamily: MONTSERRAT_FONT,
  marginBottom: 13,
},

eventDetailsDescription: {
  fontSize: 13,
  lineHeight: 21,
  color: "#555555",
  fontFamily: MONTSERRAT_FONT,
},

eventInfoGrid: {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 12,
},

eventInfoItem: {
  width: "48%",
  minHeight: 72,
  borderRadius: 9,
  backgroundColor: "#F7F9F7",
  paddingHorizontal: 12,
  paddingVertical: 11,

  flexDirection: "row",
  alignItems: "flex-start",
},

eventInfoIcon: {
  width: 34,
  height: 34,
  borderRadius: 17,
  backgroundColor: "#E8F2E7",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 10,
},

eventInfoCopy: {
  flex: 1,
},

eventInfoLabel: {
  fontSize: 10,
  color: "#777777",
  fontFamily: MONTSERRAT_FONT,
},

eventInfoValue: {
  marginTop: 3,
  fontSize: 13,
  lineHeight: 18,
  color: "#222222",
  fontFamily: MONTSERRAT_FONT,
},

eventInfoSubValue: {
  marginTop: 2,
  fontSize: 10,
  color: "#777777",
  fontFamily: MONTSERRAT_FONT,
},

eventLocationRow: {
  marginTop: 12,
  minHeight: 68,
  borderRadius: 9,
  backgroundColor: "#F7F9F7",
  paddingHorizontal: 12,
  paddingVertical: 11,
  flexDirection: "row",
  alignItems: "flex-start",
},

eventDetailsMap: {
  borderRadius: 9,
  overflow: "hidden",
},

eventCoordinates: {
  marginTop: 8,
  fontSize: 10,
  color: "#777777",
  fontFamily: MONTSERRAT_FONT,
},

participantHeader: {
  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "space-between",
},

participantCount: {
  marginTop: -8,
  marginBottom: 12,
  fontSize: 10,
  color: "#777777",
  fontFamily: MONTSERRAT_FONT,
},

participantCapacityBadge: {
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  backgroundColor: "#EDF5EB",
  borderRadius: 16,
  paddingHorizontal: 10,
  paddingVertical: 6,
},

participantCapacityText: {
  color: "#34733B",
  fontSize: 11,
  fontFamily: MONTSERRAT_FONT,
},

participantList: {
  width: "100%",
},

eventParticipantRow: {
  minHeight: 62,
  flexDirection: "row",
  alignItems: "center",
  borderTopWidth: 1,
  borderTopColor: "#EEEEEE",
  paddingVertical: 9,
},

eventParticipantAvatar: {
  width: 38,
  height: 38,
  borderRadius: 19,
  backgroundColor: "#34733B",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 11,
},

eventParticipantName: {
  fontSize: 12,
  color: "#222222",
  fontFamily: MONTSERRAT_FONT,
},

eventParticipantEmail: {
  marginTop: 2,
  fontSize: 10,
  color: "#777777",
  fontFamily: MONTSERRAT_FONT,
},

eventParticipantJoined: {
  alignItems: "flex-end",
  marginLeft: 8,
},

eventParticipantJoinedLabel: {
  fontSize: 9,
  color: "#888888",
  fontFamily: MONTSERRAT_FONT,
},

eventParticipantJoinedDate: {
  marginTop: 2,
  fontSize: 10,
  color: "#444444",
  fontFamily: MONTSERRAT_FONT,
},

participantEmpty: {
  minHeight: 160,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 20,
},

participantEmptyTitle: {
  marginTop: 7,
  fontSize: 12,
  color: "#333333",
  fontFamily: MONTSERRAT_FONT,
},

participantEmptyText: {
  marginTop: 4,
  fontSize: 10,
  color: "#888888",
  textAlign: "center",
  fontFamily: MONTSERRAT_FONT,
},

eventDetailsFooter: {
  minHeight: 70,
  paddingHorizontal: 24,

  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,

  borderTopWidth: 1,
  borderTopColor: "#E7E7E7",

  backgroundColor: "#FAFCFA",
},

eventDetailsCloseButton: {
  minWidth: 95,
  height: 40,

  borderWidth: 1,
  borderColor: "#CACACA",
  borderRadius: 7,

  alignItems: "center",
  justifyContent: "center",
},

eventDetailsCloseButtonText: {
  color: "#444444",
  fontSize: 12,
  fontFamily: MONTSERRAT_FONT,
},

eventStatusButton: {
  minWidth: 155,
  height: 40,
  backgroundColor: "#34733B",
  borderRadius: 7,
  paddingHorizontal: 16,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
},

eventStatusButtonText: {
  color: "#FFFFFF",
  fontSize: 12,
  fontFamily: MONTSERRAT_FONT,
},
  });