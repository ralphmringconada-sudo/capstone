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
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheckBig,
  Clock3,
  Eye,
  Filter,
  LoaderCircle,
  Plus,
  Search,
  Upload,
  UserRound,
  X,
} from "lucide-react-native";
import AdminLayout from "@/components/AdminLayout";
import InteractiveLocationMap from "@/components/InteractiveLocationMap";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  createEvent,
  fetchEventParticipants,
  fetchEvents,
  updateEventStatus,
} from "@/services/adminDataService";
import { uploadAdminEventImage } from "@/services/eventImageService";
import type { AdminEvent, EventParticipant } from "@/types/admin";
import { formatDateTime } from "@/utils/format";

type EventStatus = AdminEvent["status"];
type EventTab = "All Events" | "Pending Approval" | "Rejected";

const VALENCIA_DEFAULT = { latitude: 9.2805, longitude: 123.2431 };

function formatEventDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatEventTime(hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return hhmm;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toHhMm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

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

/**
 * Purpose: Provides an interactive administrator workspace for environmental events.
 * How it works: Summary cards, tabs, search and filters derive a paginated event table;
 * local modals support adding and reviewing event details with interactive maps.
 * Technologies Used: React hooks, React Native Web, Expo Router layout, Lucide icons, Leaflet maps, and Cloud Firestore.
 * Why this implementation: One responsive screen mirrors the supplied dashboard design while
 * keeping event discovery and basic management actions immediately usable.
 */
export default function EventsScreen() {
  const { width, height } = useWindowDimensions();
  const s = Math.max(0.72, Math.min(width / 1920, height / 1080));
  const { admin } = useAdminAuth();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [activeTab, setActiveTab] = useState<EventTab>("All Events");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Types");
  const [status, setStatus] = useState("All Statuses");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [page, setPage] = useState(1);
  const [selectionMenu, setSelectionMenu] = useState<"category" | "status" | "sort" | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AdminEvent | null>(null);
  const [eventParticipants, setEventParticipants] = useState<EventParticipant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Clean-up");
  const [newDescription, setNewDescription] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newCapacity, setNewCapacity] = useState("");
  const [newImageUri, setNewImageUri] = useState<string | null>(null);
  const [newCoordinates, setNewCoordinates] = useState(VALENCIA_DEFAULT);
  const [isCreating, setIsCreating] = useState(false);
  const [isModerating, setIsModerating] = useState(false);
  const creatingRef = useRef(false);
  const moderatingRef = useRef(false);
  const pageSize = 5;

  const reloadEvents = async () => {
    try {
      setEvents(await fetchEvents());
    } catch (error) {
      Alert.alert("Events unavailable", error instanceof Error ? error.message : "Failed to load events.");
    }
  };

  useEffect(() => {
    void reloadEvents();
  }, []);

  const stats = useMemo(
    () => ({
      total: events.length,
      pending: events.filter((event) => event.status === "Pending").length,
      ongoing: events.filter((event) => event.status === "Ongoing").length,
      completed: events.filter((event) => event.status === "Completed").length,
    }),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchingEvents = events.filter((event) => {
      const matchesTab =
        activeTab === "All Events" ||
        (activeTab === "Pending Approval" && event.status === "Pending") ||
        (activeTab === "Rejected" && event.status === "Rejected");
      const matchesSearch =
        !query ||
        event.title.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query) ||
        event.location.toLowerCase().includes(query) ||
        event.id.toLowerCase().includes(query);
      const matchesCategory = category === "All Types" || event.category === category;
      const matchesStatus = status === "All Statuses" || event.status === status;
      return matchesTab && matchesSearch && matchesCategory && matchesStatus;
    });
    return [...matchingEvents].sort((first, second) =>
      sortOrder === "Newest First"
        ? second.id.localeCompare(first.id)
        : first.id.localeCompare(second.id),
    );
  }, [activeTab, category, events, search, sortOrder, status]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleEvents = filteredEvents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const changeTab = (tab: EventTab) => {
    setActiveTab(tab);
    setStatus(
      tab === "Pending Approval" ? "Pending" : tab === "Rejected" ? "Rejected" : "All Statuses",
    );
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setCategory("All Types");
    setStatus("All Statuses");
    setSortOrder("Newest First");
    setPage(1);
  };

  const pickEventImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Allow photo access to select an event image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (!result.canceled) setNewImageUri(result.assets[0].uri);
  };

  const handleMapPin = (coordinates: { latitude: number; longitude: number }) => {
    setNewCoordinates(coordinates);

    // Fill location text from the pin only when the admin has not typed one yet.
    if (typeof window === "undefined" || !window.google?.maps || newLocation.trim()) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat: coordinates.latitude, lng: coordinates.longitude } },
      (results: Array<{ formatted_address?: string }> | null, status: string) => {
        if (status === "OK" && results?.[0]?.formatted_address) {
          setNewLocation(results[0].formatted_address);
        }
      },
    );
  };

  const addEvent = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;

    if (
      !newTitle.trim() ||
      !newDescription.trim() ||
      !newDate.trim() ||
      !newTime.trim() ||
      !newLocation.trim() ||
      !newCapacity.trim()
    ) {
      creatingRef.current = false;
      Alert.alert("Incomplete event", "Complete all required event fields.");
      return;
    }
    const capacity = Number(newCapacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      creatingRef.current = false;
      Alert.alert("Invalid participants", "Maximum participants must be a positive whole number.");
      return;
    }

    if (!admin) {
      creatingRef.current = false;
      Alert.alert("Not authorized", "Sign in as an administrator to create events.");
      return;
    }

    setIsCreating(true);
    try {
      let imageUrl = "";
      if (newImageUri) {
        imageUrl = await uploadAdminEventImage(newImageUri);
      }

      await createEvent(
        {
        title: newTitle.trim(),
        description: newDescription.trim(),
        category: newCategory,
        date: formatEventDate(newDate.trim()),
        time: formatEventTime(newTime.trim()),
        location: newLocation.trim(),
        status: "Pending",
        participants: 0,
        capacity,
        submittedBy: admin.fullName,
        submittedArea: "Admin Dashboard",
        submittedByUid: admin.uid,
        imageUrl,
        coordinates: newCoordinates,
      },
        admin,
      );
      await reloadEvents();
      setNewTitle("");
      setNewCategory("Clean-up");
      setNewDescription("");
      setNewDate("");
      setNewTime("");
      setNewLocation("");
      setNewCapacity("");
      setNewImageUri(null);
      setNewCoordinates(VALENCIA_DEFAULT);
      setAddModalOpen(false);
      changeTab("All Events");
      Alert.alert("Event created", "Saved successfully.");
      // Stay locked briefly so a second click cannot fire another create.
    } catch (error) {
      Alert.alert("Event not saved", error instanceof Error ? error.message : "Failed to create event.");
      creatingRef.current = false;
      setIsCreating(false);
      return;
    }

    setTimeout(() => {
      creatingRef.current = false;
      setIsCreating(false);
    }, 800);
  };

  const openEventDetails = async (event: AdminEvent) => {
    setSelectedEvent(event);
    setEventParticipants([]);
    setLoadingParticipants(true);
    try {
      setEventParticipants(await fetchEventParticipants(event.id));
    } catch (error) {
      Alert.alert(
        "Participants unavailable",
        error instanceof Error ? error.message : "Failed to load participants.",
      );
    } finally {
      setLoadingParticipants(false);
    }
  };

  const closeEventDetails = () => {
    setSelectedEvent(null);
    setEventParticipants([]);
    setLoadingParticipants(false);
  };

  const moderateEvent = async (nextStatus: EventStatus) => {
    if (!selectedEvent || !admin || moderatingRef.current) return;
    moderatingRef.current = true;
    setIsModerating(true);
    try {
      await updateEventStatus(selectedEvent.id, nextStatus, admin);
      closeEventDetails();
      await reloadEvents();
    } catch (error) {
      Alert.alert("Event update failed", error instanceof Error ? error.message : "Failed to update event.");
    } finally {
      moderatingRef.current = false;
      setIsModerating(false);
    }
  };

  return (
    <AdminLayout activePage="Events">
      <ScrollView
        style={styles.page}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: height * 0.018,
          paddingBottom: 30,
          width: "100%",
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <View>
            <Text style={[styles.pageTitle, { fontSize: 40 * s }]}>
              {activeTab === "Pending Approval"
                ? "PENDING APPROVAL"
                : activeTab === "Rejected"
                  ? "REJECTED EVENTS"
                  : "EVENTS"}
            </Text>
            <Text style={[styles.subtitle, { fontSize: 16 * s }]}>
              {activeTab === "Pending Approval"
                ? "Review and approve or reject event submissions from users."
                : activeTab === "Rejected"
                  ? "Review event submissions that were not approved."
                  : "Manage and monitor all environmental events"}
            </Text>
          </View>
          {activeTab === "All Events" && (
            <TouchableOpacity style={styles.addButton} onPress={() => setAddModalOpen(true)}>
              <Plus size={18 * s} color="#ffffff" strokeWidth={3} />
              <Text style={[styles.addButtonText, { fontSize: 14 * s }]}>Add New Event</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabs}>
          {(["All Events", "Pending Approval", "Rejected"] as EventTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => changeTab(tab)}
            >
              {tab === "All Events" && <CalendarDays size={17 * s} color="#1b1b1b" />}
              {tab === "Pending Approval" && <Clock3 size={17 * s} color="#1b1b1b" />}
              {tab === "Rejected" && <X size={17 * s} color="#1b1b1b" />}
              <Text style={[styles.tabText, { fontSize: 14 * s }]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === "All Events" && <View style={[styles.cards, { gap: 28 * s }]}>
          <SummaryCard
            title="Total Events"
            value={stats.total}
            color="#ffffff"
            icon={CalendarCheck}
            iconColor="#0aa65b"
            scale={s}
          />
          <SummaryCard
            title="Pending Approval"
            value={stats.pending}
            color="#fff1c9"
            icon={Clock3}
            iconColor="#111111"
            scale={s}
          />
          <SummaryCard
            title="Ongoing Events"
            value={stats.ongoing}
            color="#cfe9fb"
            icon={LoaderCircle}
            iconColor="#168df0"
            scale={s}
          />
          <SummaryCard
            title="Completed Events"
            value={stats.completed}
            color="#cceecb"
            icon={CircleCheckBig}
            iconColor="#42b94d"
            scale={s}
          />
        </View>}

        <View style={[styles.filterPanel, { padding: 14 * s }]}>
          <View style={styles.searchBox}>
            <TextInput
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search events..."
              placeholderTextColor="#777"
              style={[styles.searchInput, { fontSize: 14 * s }]}
            />
            <Search size={19 * s} color="#555" />
          </View>

          <TouchableOpacity style={styles.filterBox} onPress={() => setSelectionMenu("category")}>
            <Text style={[styles.filterLabel, { fontSize: 11 * s }]}>Event Type</Text>
            <View style={styles.filterValueRow}>
              <Text style={[styles.filterValue, { fontSize: 13 * s }]}>{category}</Text>
              <ChevronDown size={16 * s} color="#333" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.filterBox} onPress={() => setSelectionMenu("status")}>
            <Text style={[styles.filterLabel, { fontSize: 11 * s }]}>Status</Text>
            <View style={styles.filterValueRow}>
              <Text style={[styles.filterValue, { fontSize: 13 * s }]}>{status}</Text>
              <ChevronDown size={16 * s} color="#333" />
            </View>
          </TouchableOpacity>

          {activeTab === "All Events" ? (
            <View style={styles.filterBox}>
              <Text style={[styles.filterLabel, { fontSize: 11 * s }]}>Date Range</Text>
              <View style={styles.filterValueRow}>
                <Text style={[styles.filterValue, { fontSize: 12 * s }]}>
                  May 20, 2026 - Jun 26, 2026
                </Text>
                <CalendarDays size={16 * s} color="#333" />
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.filterBox} onPress={() => setSelectionMenu("sort")}>
              <Text style={[styles.filterLabel, { fontSize: 11 * s }]}>Sort By</Text>
              <View style={styles.filterValueRow}>
                <Text style={[styles.filterValue, { fontSize: 13 * s }]}>{sortOrder}</Text>
                <ChevronDown size={16 * s} color="#333" />
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
            <Filter size={15 * s} color="#43884c" />
            <Text style={[styles.resetText, { fontSize: 12 * s }]}>Reset</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tablePanel}>
          <ScrollView horizontal={width < 1100} showsHorizontalScrollIndicator={width < 1100}>
            <View style={[styles.table, width >= 1100 ? styles.tableFullWidth : null]}>
              <View style={styles.tableHeader}>
                {activeTab === "All Events" && <Text style={[styles.th, styles.idColumn]}>ID</Text>}
                <Text style={[styles.th, styles.detailsColumn]}>Event Details</Text>
                {activeTab !== "All Events" && (
                  <Text style={[styles.th, styles.submittedColumn]}>Submitted By</Text>
                )}
                <Text style={[styles.th, styles.categoryColumn]}>Event Category</Text>
                <Text style={[styles.th, styles.dateColumn]}>Date & Time</Text>
                <Text style={[styles.th, styles.locationColumn]}>Location</Text>
                {activeTab === "All Events" && (
                  <Text style={[styles.th, styles.statusColumn]}>Status</Text>
                )}
                <Text style={[styles.th, styles.participantsColumn]}>Participants</Text>
                <Text style={[styles.th, styles.actionColumn]}>Action</Text>
              </View>

              {visibleEvents.length ? (
                visibleEvents.map((event) => (
                  <View key={event.id} style={styles.tableRow}>
                    {activeTab === "All Events" && (
                      <Text style={[styles.cellText, styles.idColumn]} numberOfLines={1}>
                        #{event.id.slice(0, 8)}
                      </Text>
                    )}
                    <View style={[styles.detailsCell, styles.detailsColumn]}>
                      <View style={styles.eventThumbnail}>
                        {event.imageUrl ? (
                          <Image source={{ uri: event.imageUrl }} style={styles.eventThumbnailImage} />
                        ) : (
                          <CalendarDays size={18} color="#7d8c7c" />
                        )}
                      </View>
                      <View style={styles.eventCopy}>
                        <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                        <Text numberOfLines={2} style={styles.eventDescription}>
                          {event.description}
                        </Text>
                      </View>
                    </View>
                    {activeTab !== "All Events" && (
                      <View style={[styles.submittedCell, styles.submittedColumn]}>
                        <View style={styles.submitterIcon}>
                          <UserRound size={13} color="#ffffff" />
                        </View>
                        <View>
                          <Text style={styles.eventTitle}>{event.submittedBy}</Text>
                          <Text style={styles.smallText}>{event.submittedArea}</Text>
                        </View>
                      </View>
                    )}
                    <View style={styles.categoryColumn}>
                      <View style={[styles.badge, { backgroundColor: categoryColor(event.category) }]}>
                        <Text style={styles.badgeText}>{event.category}</Text>
                      </View>
                    </View>
                    <View style={styles.dateColumn}>
                      <Text style={styles.dateText}>{event.date}</Text>
                      <Text style={styles.smallText}>{event.time}</Text>
                    </View>
                    <Text numberOfLines={2} style={[styles.cellText, styles.locationColumn]}>
                      {event.location}
                    </Text>
                    {activeTab === "All Events" && (
                      <View style={styles.statusColumn}>
                        <View style={[styles.badge, { backgroundColor: statusColor(event.status) }]}>
                          <Text style={styles.badgeText}>{event.status}</Text>
                        </View>
                      </View>
                    )}
                    <View style={styles.participantsColumn}>
                      <Text style={styles.smallText}>
                        {event.participants} / {event.capacity}
                      </Text>
                      <Text style={styles.smallText}>Expected</Text>
                    </View>
                    <View style={styles.actionColumn}>
                      <TouchableOpacity style={styles.viewButton} onPress={() => void openEventDetails(event)}>
                        <Eye size={13} color="#377b3d" />
                        <Text style={styles.viewButtonText}>View Event</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>No events match the selected filters.</Text>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.pagination}>
            <Text style={styles.paginationText}>
              Showing {filteredEvents.length ? (currentPage - 1) * pageSize + 1 : 0} to{" "}
              {Math.min(currentPage * pageSize, filteredEvents.length)} of {filteredEvents.length} events
            </Text>
            <View style={styles.pageControls}>
              <TouchableOpacity
                style={styles.pageButton}
                disabled={currentPage === 1}
                onPress={() => setPage((value) => Math.max(1, value - 1))}
              >
                <Text style={styles.pageButtonText}>‹</Text>
              </TouchableOpacity>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
                <TouchableOpacity
                  key={number}
                  style={[styles.pageButton, currentPage === number && styles.activePageButton]}
                  onPress={() => setPage(number)}
                >
                  <Text
                    style={[
                      styles.pageButtonText,
                      currentPage === number && styles.activePageButtonText,
                    ]}
                  >
                    {number}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.pageButton}
                disabled={currentPage === totalPages}
                onPress={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                <Text style={styles.pageButtonText}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      <OptionModal
        visible={selectionMenu !== null}
        title={
          selectionMenu === "category"
            ? "Select Event Type"
            : selectionMenu === "sort"
              ? "Sort Events"
              : "Select Status"
        }
        options={
          selectionMenu === "category"
            ? CATEGORY_OPTIONS
            : selectionMenu === "sort"
              ? ["Newest First", "Oldest First"]
              : STATUS_OPTIONS
        }
        selected={
          selectionMenu === "category" ? category : selectionMenu === "sort" ? sortOrder : status
        }
        onClose={() => setSelectionMenu(null)}
        onSelect={(value) => {
          if (selectionMenu === "category") setCategory(value);
          if (selectionMenu === "status") setStatus(value);
          if (selectionMenu === "sort") setSortOrder(value);
          setSelectionMenu(null);
          setPage(1);
        }}
      />

      <Modal visible={addModalOpen} transparent animationType="fade" onRequestClose={() => setAddModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.formModal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add New Event</Text>
                <Text style={styles.modalSubtitle}>Create an event for administrator approval.</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setAddModalOpen(false)}>
                <X size={20} color="#222" />
              </Pressable>
            </View>
            <View style={styles.formColumns}>
              <View style={styles.formColumn}>
                <FormField label="Event Title" value={newTitle} onChangeText={setNewTitle} placeholder="Enter event title" />
                <Text style={styles.inputLabel}>Event Category</Text>
                <View style={styles.categoryChoices}>
                  {CATEGORY_OPTIONS.slice(1).map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.choiceButton, newCategory === option && styles.choiceButtonActive]}
                      onPress={() => setNewCategory(option)}
                    >
                      <Text style={[styles.choiceText, newCategory === option && styles.choiceTextActive]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <FormField
                  label="Description"
                  value={newDescription}
                  onChangeText={setNewDescription}
                  placeholder="Enter event description"
                  multiline
                />
                <View style={styles.inlineFields}>
                  <View style={styles.inlineField}>
                    <DatePickerField label="Date" value={newDate} onChange={setNewDate} />
                  </View>
                  <View style={styles.inlineField}>
                    <TimePickerField label="Time" value={newTime} onChange={setNewTime} />
                  </View>
                </View>
                <FormField
                  label="Maximum Participants"
                  value={newCapacity}
                  onChangeText={setNewCapacity}
                  placeholder="Enter maximum participants"
                />
              </View>

              <View style={styles.formColumn}>
                <Text style={styles.inputLabel}>Location Map</Text>
                <InteractiveLocationMap
                  coordinates={newCoordinates}
                  height={180}
                  selectable
                  onSelect={handleMapPin}
                />
                <Text style={styles.mapHint}>
                  Click the map to pin a location, or type the address below.
                </Text>
                <FormField
                  label="Location"
                  value={newLocation}
                  onChangeText={setNewLocation}
                  placeholder="e.g., Barangay Hall, North Poblacion"
                />
                <Text style={styles.inputLabel}>Event Image</Text>
                <TouchableOpacity style={styles.uploadBox} onPress={pickEventImage}>
                  {newImageUri ? (
                    <Image source={{ uri: newImageUri }} style={styles.uploadPreview} resizeMode="cover" />
                  ) : (
                    <>
                      <Upload size={29} color="#333" />
                      <Text style={styles.uploadTitle}>Click to upload image</Text>
                      <Text style={styles.uploadHint}>PNG, JPG up to 5MB</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelButton, isCreating && { opacity: 0.6 }]}
                onPress={() => !isCreating && setAddModalOpen(false)}
                disabled={isCreating}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isCreating && { opacity: 0.7 }]}
                onPress={addEvent}
                disabled={isCreating}
                activeOpacity={isCreating ? 1 : 0.8}
              >
                <Check size={17} color="#ffffff" />
                <Text style={styles.saveText}>{isCreating ? "Creating..." : "Create Event"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={selectedEvent !== null} transparent animationType="fade" onRequestClose={closeEventDetails}>
        <View style={styles.modalOverlay}>
          {selectedEvent && (
            <ScrollView style={styles.detailsModalScroll} contentContainerStyle={styles.detailsModal}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleWrap}>
                  <Text style={styles.modalTitle}>{selectedEvent.title}</Text>
                  <Text style={styles.modalSubtitle}>#{selectedEvent.id}</Text>
                </View>
                <Pressable style={styles.closeButton} onPress={closeEventDetails}>
                  <X size={20} color="#222" />
                </Pressable>
              </View>
              {selectedEvent.imageUrl ? (
                <Image source={{ uri: selectedEvent.imageUrl }} style={styles.detailsHeroImage} />
              ) : null}
              <Text style={styles.detailsDescription}>{selectedEvent.description}</Text>
              <InteractiveLocationMap
                coordinates={selectedEvent.coordinates}
                height={180}
              />
              <DetailRow label="Category" value={selectedEvent.category} />
              <DetailRow label="Date & Time" value={`${selectedEvent.date} · ${selectedEvent.time}`} />
              <DetailRow label="Location" value={selectedEvent.location} />
              {selectedEvent.coordinates ? (
                <DetailRow
                  label="GPS"
                  value={`${selectedEvent.coordinates.latitude.toFixed(6)}, ${selectedEvent.coordinates.longitude.toFixed(6)}`}
                />
              ) : null}
              <DetailRow label="Status" value={selectedEvent.status} />
              <DetailRow
                label="Participants"
                value={`${selectedEvent.participants} of ${selectedEvent.capacity}`}
              />
              <DetailRow label="Submitted By" value={selectedEvent.submittedBy} />

              <Text style={styles.participantsHeading}>Participant List</Text>
              {loadingParticipants ? (
                <Text style={styles.smallText}>Loading participants...</Text>
              ) : eventParticipants.length === 0 ? (
                <Text style={styles.smallText}>No users have joined this event yet.</Text>
              ) : (
                eventParticipants.map((participant) => {
                  const joined = participant.joinedAt
                    ? formatDateTime(participant.joinedAt)
                    : null;
                  return (
                    <View key={participant.uid} style={styles.participantRow}>
                      <View style={styles.submitterIcon}>
                        <UserRound size={13} color="#ffffff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eventTitle}>{participant.name}</Text>
                        <Text style={styles.smallText}>{participant.email}</Text>
                        {joined ? (
                          <Text style={styles.smallText}>
                            Joined {joined.date} · {joined.time}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}

              <View style={styles.moderationActions}>
                {selectedEvent.status === "Pending" && (
                  <>
                    <TouchableOpacity
                      style={[styles.rejectEventButton, isModerating && { opacity: 0.7 }]}
                      onPress={() => moderateEvent("Rejected")}
                      disabled={isModerating}
                    >
                      <Text style={styles.saveText}>{isModerating ? "Please wait..." : "Reject Event"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveButton, isModerating && { opacity: 0.7 }]}
                      onPress={() => moderateEvent("Upcoming")}
                      disabled={isModerating}
                    >
                      <Check size={17} color="#ffffff" />
                      <Text style={styles.saveText}>{isModerating ? "Please wait..." : "Approve Event"}</Text>
                    </TouchableOpacity>
                  </>
                )}
                {selectedEvent.status === "Upcoming" && (
                  <TouchableOpacity
                    style={[styles.saveButton, isModerating && { opacity: 0.7 }]}
                    onPress={() => moderateEvent("Ongoing")}
                    disabled={isModerating}
                  >
                    <Text style={styles.saveText}>{isModerating ? "Please wait..." : "Mark Ongoing"}</Text>
                  </TouchableOpacity>
                )}
                {selectedEvent.status === "Ongoing" && (
                  <TouchableOpacity
                    style={[styles.saveButton, isModerating && { opacity: 0.7 }]}
                    onPress={() => moderateEvent("Completed")}
                    disabled={isModerating}
                  >
                    <Text style={styles.saveText}>{isModerating ? "Please wait..." : "Mark Completed"}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.cancelButton, isModerating && { opacity: 0.6 }]}
                  onPress={() => !isModerating && closeEventDetails()}
                  disabled={isModerating}
                >
                  <Text style={styles.cancelText}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </AdminLayout>
  );
}

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
    <View style={[styles.summaryCard, { backgroundColor: color, minHeight: 112 * scale }]}>
      <Icon size={54 * scale} color={iconColor} strokeWidth={2.5} />
      <View style={styles.summaryCopy}>
        <Text style={[styles.summaryTitle, { fontSize: 14 * scale }]}>{title}</Text>
        <Text style={[styles.summaryValue, { fontSize: 35 * scale }]}>{value}</Text>
      </View>
    </View>
  );
}

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
  onSelect: (value: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.optionModal}>
          <Text style={styles.optionTitle}>{title}</Text>
          {options.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.optionRow, option === selected && styles.selectedOption]}
              onPress={() => onSelect(option)}
            >
              <Text style={styles.optionText}>{option}</Text>
              {option === selected && <Check size={17} color="#34733B" />}
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#888"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline && styles.multilineInput]}
      />
    </View>
  );
}

function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : new Date();

  if (Platform.OS === "web") {
    return (
      <View style={styles.field}>
        <Text style={styles.inputLabel}>{label}</Text>
        {createElement("input", {
          type: "date",
          value,
          min: toIsoDate(new Date()),
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
          style: webPickerStyle,
        })}
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity style={styles.pickerButton} onPress={() => setShowPicker(true)}>
        <CalendarDays size={16} color="#34733B" />
        <Text style={styles.pickerButtonText}>
          {value ? formatEventDate(value) : "Select date"}
        </Text>
      </TouchableOpacity>
      {showPicker ? (
        <DateTimePicker
          value={Number.isNaN(selectedDate.getTime()) ? new Date() : selectedDate}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(_, date) => {
            setShowPicker(Platform.OS === "ios");
            if (date) onChange(toIsoDate(date));
          }}
        />
      ) : null}
    </View>
  );
}

function TimePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const selectedTime = (() => {
    const base = new Date();
    if (!value.includes(":")) return base;
    const [hours, minutes] = value.split(":").map(Number);
    base.setHours(hours || 0, minutes || 0, 0, 0);
    return base;
  })();

  if (Platform.OS === "web") {
    return (
      <View style={styles.field}>
        <Text style={styles.inputLabel}>{label}</Text>
        {createElement("input", {
          type: "time",
          value,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
          style: webPickerStyle,
        })}
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity style={styles.pickerButton} onPress={() => setShowPicker(true)}>
        <Clock3 size={16} color="#34733B" />
        <Text style={styles.pickerButtonText}>
          {value ? formatEventTime(value) : "Select time"}
        </Text>
      </TouchableOpacity>
      {showPicker ? (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display="default"
          onChange={(_, date) => {
            setShowPicker(Platform.OS === "ios");
            if (date) onChange(toHhMm(date));
          }}
        />
      ) : null}
    </View>
  );
}

const webPickerStyle = {
  height: 44,
  width: "100%",
  border: "1px solid #cfcfcf",
  borderRadius: 8,
  paddingLeft: 12,
  paddingRight: 12,
  fontSize: 14,
  color: "#222",
  backgroundColor: "#ffffff",
  boxSizing: "border-box" as const,
  fontFamily: "Montserrat, sans-serif",
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function categoryColor(category: string) {
  if (category === "Clean-up") return "#c9efca";
  if (category === "Tree Planting") return "#bdecbf";
  if (category === "Seminar") return "#e8c6ee";
  if (category === "Rehabilitation") return "#f5dfab";
  return "#cbe5f5";
}

function statusColor(status: EventStatus) {
  if (status === "Pending") return "#ffedbd";
  if (status === "Upcoming") return "#e7c1ef";
  if (status === "Ongoing") return "#bfe4fa";
  if (status === "Completed") return "#c4ebc3";
  return "#f4c5c5";
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#ffffff" },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#145b22",
    lineHeight: 44,
  },
  subtitle: { color: "#4f8154", fontFamily: "Montserrat_700Bold", marginTop: 2 },
  addButton: {
    minHeight: 42,
    paddingHorizontal: 19,
    borderRadius: 10,
    backgroundColor: "#34733B",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  addButtonText: { color: "#ffffff", fontFamily: "Montserrat_700Bold" },
  tabs: {
    minHeight: 50,
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#d7d7d7",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  tab: {
    height: 42,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  activeTab: { borderBottomColor: "#34733B" },
  tabText: { fontFamily: "Montserrat_700Bold", color: "#252525" },
  cards: { flexDirection: "row", marginTop: 28 },
  summaryCard: {
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderColor: "#d7d7d7",
    borderRadius: 10,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  summaryCopy: { alignItems: "center", justifyContent: "center" },
  summaryTitle: { fontFamily: "Montserrat_700Bold", textAlign: "center" },
  summaryValue: { fontFamily: "Montserrat_700Bold", color: "#111", lineHeight: 40 },
  filterPanel: {
    marginTop: 22,
    flexDirection: "row",
    gap: 14,
    borderWidth: 1,
    borderColor: "#d3d3d3",
    borderRadius: 9,
    alignItems: "center",
    zIndex: 2,
  },
  searchBox: {
    flex: 1.15,
    minWidth: 180,
    height: 54,
    borderRadius: 8,
    backgroundColor: "#f4f4f4",
    borderWidth: 1,
    borderColor: "#dddddd",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: { flex: 1, color: "#222", outlineStyle: "none" } as never,
  filterBox: {
    flex: 1,
    minWidth: 150,
    height: 54,
    borderRadius: 8,
    backgroundColor: "#f4f4f4",
    borderWidth: 1,
    borderColor: "#dddddd",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  filterLabel: { fontFamily: "Montserrat_700Bold", color: "#555", marginBottom: 3 },
  filterValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filterValue: { fontFamily: "Montserrat_700Bold", color: "#252525", flexShrink: 1 },
  resetButton: {
    height: 38,
    paddingHorizontal: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#86be8d",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  resetText: { color: "#34733B", fontFamily: "Montserrat_700Bold" },
  tablePanel: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#d3d3d3",
    borderRadius: 10,
    overflow: "hidden",
  },
  table: { minWidth: 980 },
  tableFullWidth: { minWidth: "100%", width: "100%" },
  tableHeader: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#d7d7d7",
    paddingHorizontal: 16,
  },
  th: { fontSize: 13, color: "#202020", fontFamily: "Montserrat_700Bold" },
  tableRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    paddingHorizontal: 16,
  },
  idColumn: { flex: 0.7, minWidth: 90 },
  detailsColumn: { flex: 2.2, minWidth: 220 },
  submittedColumn: { flex: 1.2, minWidth: 140 },
  categoryColumn: { flex: 1.1, minWidth: 120 },
  dateColumn: { flex: 1.1, minWidth: 120 },
  locationColumn: { flex: 1.3, minWidth: 130 },
  statusColumn: { flex: 0.9, minWidth: 100 },
  participantsColumn: { flex: 0.9, minWidth: 100 },
  actionColumn: { flex: 1, minWidth: 110, alignItems: "center" },
  cellText: { fontSize: 12, fontFamily: "Montserrat_700Bold", color: "#242424" },
  detailsCell: { flexDirection: "row", alignItems: "center", gap: 9 },
  submittedCell: { flexDirection: "row", alignItems: "center", gap: 8 },
  submitterIcon: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#1ca33a",
    alignItems: "center",
    justifyContent: "center",
  },
  eventThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: "#d9ddda",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  eventThumbnailImage: {
    width: 42,
    height: 42,
  },
  eventCopy: { flex: 1, paddingRight: 6 },
  eventTitle: { fontSize: 12, fontFamily: "Montserrat_700Bold", color: "#1c1c1c" },
  eventDescription: { fontSize: 9, color: "#555", lineHeight: 12, marginTop: 2 },
  badge: { alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 7, borderRadius: 5 },
  badgeText: { fontSize: 10, color: "#2e502f", fontFamily: "Montserrat_700Bold" },
  dateText: { fontSize: 11, fontFamily: "Montserrat_700Bold", color: "#222" },
  smallText: { fontSize: 9, color: "#555", marginTop: 2 },
  viewButton: {
    borderWidth: 1,
    borderColor: "#4b9b52",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewButtonText: { fontSize: 9, color: "#34733B", fontFamily: "Montserrat_700Bold" },
  emptyRow: { height: 120, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 14, color: "#777", fontFamily: "Montserrat_700Bold" },
  pagination: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  paginationText: { fontSize: 11, fontFamily: "Montserrat_700Bold", color: "#333" },
  pageControls: { flexDirection: "row", gap: 5 },
  pageButton: {
    width: 27,
    height: 27,
    borderWidth: 1,
    borderColor: "#aab1aa",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  activePageButton: { backgroundColor: "#34733B", borderColor: "#34733B" },
  pageButtonText: { fontSize: 12, color: "#333", fontFamily: "Montserrat_700Bold" },
  activePageButtonText: { color: "#ffffff" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  formModal: { width: "100%", maxWidth: 880, backgroundColor: "#fff", borderRadius: 14, padding: 24 },
  detailsModalScroll: {
    width: "94%",
    maxWidth: 720,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 14,
  },
  detailsModal: { padding: 28, paddingBottom: 32 },
  detailsHeroImage: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: "#d9ddda",
  },
  participantsHeading: {
    marginTop: 16,
    marginBottom: 10,
    fontSize: 15,
    color: "#1c1c1c",
    fontFamily: "Montserrat_700Bold",
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ececec",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  modalTitleWrap: { flex: 1, paddingRight: 12 },
  modalTitle: { fontSize: 22, color: "#145b22", fontFamily: "Montserrat_700Bold" },
  modalSubtitle: { fontSize: 12, color: "#777", marginTop: 3 },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  field: { marginBottom: 14 },
  inputLabel: { fontSize: 12, color: "#333", fontFamily: "Montserrat_700Bold", marginBottom: 6 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: "#cfcfcf",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#222",
  },
  pickerButton: {
    height: 44,
    borderWidth: 1,
    borderColor: "#cfcfcf",
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
  },
  pickerButtonText: {
    fontSize: 14,
    color: "#222",
    fontFamily: "Montserrat_700Bold",
  },
  multilineInput: { height: 88, paddingTop: 11 },
  formColumns: { flexDirection: "row", gap: 18 },
  formColumn: { flex: 1, minWidth: 0 },
  mapHint: {
    fontSize: 11,
    color: "#555",
    marginTop: 6,
    marginBottom: 10,
    fontFamily: "Montserrat_700Bold",
  },
  inlineFields: { flexDirection: "row", gap: 10 },
  inlineField: { flex: 1 },
  mapPreview: {
    height: 180,
    borderRadius: 9,
    backgroundColor: "#dce8d5",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  mapRoadHorizontal: {
    position: "absolute",
    width: "120%",
    height: 32,
    backgroundColor: "#f6f2e9",
    transform: [{ rotate: "-12deg" }],
  },
  mapRoadVertical: {
    position: "absolute",
    width: 28,
    height: "130%",
    backgroundColor: "#b4dcf3",
    transform: [{ rotate: "13deg" }],
  },
  mapCaption: {
    position: "absolute",
    bottom: 8,
    right: 9,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    color: "#555",
    fontSize: 9,
    fontFamily: "Montserrat_700Bold",
  },
  uploadBox: {
    height: 104,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#bfc4bf",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  uploadTitle: { fontSize: 12, color: "#222", fontFamily: "Montserrat_700Bold", marginTop: 5 },
  uploadHint: { fontSize: 9, color: "#777", marginTop: 2 },
  uploadPreview: { width: "100%", height: "100%" },
  categoryChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  choiceButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#c6c6c6",
  },
  choiceButtonActive: { backgroundColor: "#34733B", borderColor: "#34733B" },
  choiceText: { fontSize: 11, color: "#333", fontFamily: "Montserrat_700Bold" },
  choiceTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  moderationActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  rejectEventButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#b73535",
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: { paddingHorizontal: 18, height: 42, borderRadius: 8, justifyContent: "center" },
  cancelText: { color: "#555", fontFamily: "Montserrat_700Bold" },
  saveButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#34733B",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  saveText: { color: "#ffffff", fontFamily: "Montserrat_700Bold", fontSize: 13 },
  optionModal: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  optionTitle: { fontSize: 17, color: "#145b22", fontFamily: "Montserrat_700Bold", marginBottom: 8 },
  optionRow: {
    minHeight: 42,
    borderRadius: 7,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectedOption: { backgroundColor: "#edf5e7" },
  optionText: { fontSize: 13, color: "#222", fontFamily: "Montserrat_700Bold" },
  detailsDescription: { fontSize: 13, lineHeight: 20, color: "#555", marginBottom: 16 },
  detailRow: {
    minHeight: 43,
    borderTopWidth: 1,
    borderTopColor: "#ededed",
    flexDirection: "row",
    alignItems: "center",
  },
  detailLabel: { width: 120, fontSize: 12, color: "#555", fontFamily: "Montserrat_700Bold" },
  detailValue: { flex: 1, fontSize: 12, color: "#222", fontFamily: "Montserrat_700Bold" },
});
