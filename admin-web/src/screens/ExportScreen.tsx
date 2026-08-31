import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";

import {
  Check,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  FileArchive,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderOpen,
  RefreshCw,
} from "lucide-react-native";

import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";

import AdminLayout from "../components/AdminLayout";
import DateRangeFilter from "@/components/DateRangeFilter";
import { exportFilteredReports } from "@/services/exportReportsService";

// =========================================================
// FILE TYPES
// =========================================================

const FILE_TYPES = [
  {
    id: "pdf",
    name: "PDF",
    description: "Best for printing\nand sharing",
    icon: FileText,
  },
  {
    id: "excel",
    name: "Excel (XLSX)",
    description: "Best for data\nanalysis",
    icon: FileSpreadsheet,
  },
  {
    id: "csv",
    name: "CSV",
    description: "Best for importing\ninto other systems",
    icon: FileArchive,
  },
  {
    id: "json",
    name: "JSON",
    description: "Best for developers\nand integrations",
    icon: FileJson,
  },
  {
    id: "word",
    name: "Word (DOCX)",
    description: "Best for editing\ndocuments",
    icon: FileText,
  },
];

// =========================================================
// SCREEN
// =========================================================

export default function ExportReports() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  // =======================================================
  // FILTER STATES
  // =======================================================

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const [category, setCategory] =
    useState("All Categories");

  // =======================================================
  // EXPORT STATES
  // =======================================================

  const [selectedFile, setSelectedFile] =
    useState("pdf");

  const [saveLocation, setSaveLocation] =
    useState("Downloads");

  const [fileName, setFileName] = useState("");

  const [openAfterSaving, setOpenAfterSaving] =
    useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // =======================================================
  // DROPDOWN STATES
  // =======================================================

  const [
    showStatusDropdown,
    setShowStatusDropdown,
  ] = useState(false);

  const [
    showCategoryDropdown,
    setShowCategoryDropdown,
  ] = useState(false);

  const [
    showSaveDropdown,
    setShowSaveDropdown,
  ] = useState(false);

  // =======================================================
  // OPTIONS
  // =======================================================

  const statuses = [
    "All Statuses",
    "Pending",
    "In Review",
    "Resolved",
    "Rejected",
  ];

  const categories = [
    "All Categories",
    "Illegal Dumping",
    "Air Pollution",
    "Water Pollution",
    "Waste Management",
    "Other",
  ];

  const locations = [
    "Downloads",
    "Documents",
    "Desktop",
  ];

  // =======================================================
  // DROPDOWN FUNCTIONS
  // =======================================================

  const toggleStatusDropdown = () => {
    setShowStatusDropdown((previous) => !previous);

    setShowCategoryDropdown(false);
    setShowSaveDropdown(false);
  };

  const toggleCategoryDropdown = () => {
    setShowCategoryDropdown((previous) => !previous);

    setShowStatusDropdown(false);
    setShowSaveDropdown(false);
  };

  const toggleSaveDropdown = () => {
    setShowSaveDropdown((previous) => !previous);

    setShowStatusDropdown(false);
    setShowCategoryDropdown(false);
  };

  // =======================================================
  // RESET FILTERS
  // =======================================================

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setStatus("All Statuses");
    setCategory("All Categories");

    setShowStatusDropdown(false);
    setShowCategoryDropdown(false);
    setShowSaveDropdown(false);
  };

  // =======================================================
  // EXPORT
  // =======================================================

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportFilteredReports({
        filters: {
          fromDate,
          toDate,
          status,
          category,
        },
        format: selectedFile,
        fileName: fileName || undefined,
        openAfterSaving,
      });
      Alert.alert(
        "Export ready",
        `${result.count} report(s) exported as ${result.format.toUpperCase()}.` +
          (selectedFile === "pdf" || selectedFile === "word"
            ? " Use the print dialog to save a printable PDF."
            : ""),
      );
    } catch (error) {
      Alert.alert(
        "Export failed",
        error instanceof Error ? error.message : "Unable to export reports.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AdminLayout activePage="Export Reports">
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ================================================= */}
        {/* PAGE HEADER */}
        {/* ================================================= */}

        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>
            EXPORT REPORTS
          </Text>

          <Text style={styles.pageSubtitle}>
            Export and download environmental reports
            based on your selected filters
          </Text>
        </View>

        {/* ================================================= */}
        {/* 1. SELECT FILTERS */}
        {/* ================================================= */}

        <View
          style={[
            styles.section,
            styles.filtersSection,
          ]}
        >
          <Text style={styles.sectionTitle}>
            1. SELECT FILTERS
          </Text>

          <View style={styles.filtersRow}>
            <DateRangeFilter
              label="Date Range"
              fromDate={fromDate}
              toDate={toDate}
              onChangeFrom={setFromDate}
              onChangeTo={setToDate}
              style={styles.dateRangeFilter}
            />

            {/* STATUS */}

            <View
              style={[
                styles.filterGroup,
                styles.statusFilter,
              ]}
            >
              <Text style={styles.filterLabel}>
                Status
              </Text>

              <View style={styles.dropdownContainer}>
                <Pressable
                  style={styles.dropdown}
                  onPress={toggleStatusDropdown}
                >
                  <Text style={styles.dropdownText}>
                    {status}
                  </Text>

                  <ChevronDown
                    size={17}
                    color="#111111"
                  />
                </Pressable>

                {showStatusDropdown && (
                  <View style={styles.dropdownMenu}>
                    {statuses.map((item) => (
                      <Pressable
                        key={item}
                        style={({ pressed }) => [
                          styles.dropdownOption,
                          pressed &&
                            styles.dropdownOptionPressed,
                          item === status &&
                            styles.dropdownOptionSelected,
                        ]}
                        onPress={() => {
                          setStatus(item);

                          setShowStatusDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            item === status &&
                              styles.dropdownOptionTextSelected,
                          ]}
                        >
                          {item}
                        </Text>

                        {item === status && (
                          <Check
                            size={14}
                            color="#159A1D"
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* REPORT CATEGORY */}

            <View
              style={[
                styles.filterGroup,
                styles.categoryFilter,
              ]}
            >
              <Text style={styles.filterLabel}>
                Report Category
              </Text>

              <View style={styles.dropdownContainer}>
                <Pressable
                  style={styles.dropdown}
                  onPress={toggleCategoryDropdown}
                >
                  <Text style={styles.dropdownText}>
                    {category}
                  </Text>

                  <ChevronDown
                    size={17}
                    color="#111111"
                  />
                </Pressable>

                {showCategoryDropdown && (
                  <View style={styles.dropdownMenu}>
                    {categories.map((item) => (
                      <Pressable
                        key={item}
                        style={({ pressed }) => [
                          styles.dropdownOption,
                          pressed &&
                            styles.dropdownOptionPressed,
                          item === category &&
                            styles.dropdownOptionSelected,
                        ]}
                        onPress={() => {
                          setCategory(item);

                          setShowCategoryDropdown(
                            false
                          );
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            item === category &&
                              styles.dropdownOptionTextSelected,
                          ]}
                        >
                          {item}
                        </Text>

                        {item === category && (
                          <Check
                            size={14}
                            color="#159A1D"
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* FILTER BUTTONS */}

          <View style={styles.filterActions}>
            <Pressable
              style={({ pressed }) => [
                styles.applyButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => {
                setShowStatusDropdown(false);
                setShowCategoryDropdown(false);
                setShowSaveDropdown(false);

                // Backend filtering will be added here.
              }}
            >
              <Filter
                size={16}
                color="#ffffff"
              />

              <Text style={styles.applyButtonText}>
                Apply Filters
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.resetButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={resetFilters}
            >
              <RefreshCw
                size={16}
                color="#159A1D"
              />

              <Text style={styles.resetButtonText}>
                Reset Filters
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ================================================= */}
        {/* 2. EXPORT SUMMARY */}
        {/* ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            2. EXPORT SUMMARY
          </Text>

          <View style={styles.summaryRow}>
            {/* TOTAL REPORTS */}

            <View
              style={[
                styles.summaryCard,
                styles.totalCard,
              ]}
            >
              <View
                style={[
                  styles.summaryIcon,
                  styles.totalIcon,
                ]}
              >
                <FileText
                  size={29}
                  color="#ffffff"
                />
              </View>

              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>
                  Total Reports
                </Text>

                <Text style={styles.summaryNumber}>
                  {/* Backend value */}
                </Text>
              </View>
            </View>

            {/* IN REVIEW */}

            <View
              style={[
                styles.summaryCard,
                styles.reviewCard,
              ]}
            >
              <View
                style={[
                  styles.summaryIcon,
                  styles.reviewIcon,
                ]}
              >
                <Eye
                  size={30}
                  color="#ffffff"
                />
              </View>

              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>
                  In Review
                </Text>

                <Text style={styles.summaryNumber}>
                  {/* Backend value */}
                </Text>
              </View>
            </View>

            {/* PENDING */}

            <View
              style={[
                styles.summaryCard,
                styles.pendingCard,
              ]}
            >
              <View
                style={[
                  styles.summaryIcon,
                  styles.pendingIcon,
                ]}
              >
                <Clock3
                  size={30}
                  color="#000000"
                />
              </View>

              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>
                  Pending
                </Text>

                <Text style={styles.summaryNumber}>
                  {/* Backend value */}
                </Text>
              </View>
            </View>

            {/* RESOLVED */}

            <View
              style={[
                styles.summaryCard,
                styles.resolvedCard,
              ]}
            >
              <View
                style={[
                  styles.summaryIcon,
                  styles.resolvedIcon,
                ]}
              >
                <Check
                  size={32}
                  color="#ffffff"
                  strokeWidth={3}
                />
              </View>

              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>
                  Resolved
                </Text>

                <Text style={styles.summaryNumber}>
                  {/* Backend value */}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.summaryNote}>
            Note: Summary is based on the selected
            filters.
          </Text>
        </View>

        {/* ================================================= */}
        {/* 3. CHOOSE FILE TYPE */}
        {/* ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            3. CHOOSE FILE TYPE
          </Text>

          <View style={styles.fileTypeRow}>
            {FILE_TYPES.map((file) => {
              const Icon = file.icon;

              const selected =
                selectedFile === file.id;

              return (
                <Pressable
                  key={file.id}
                  style={({ pressed }) => [
                    styles.fileTypeCard,
                    selected &&
                      styles.fileTypeCardSelected,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() =>
                    setSelectedFile(file.id)
                  }
                >
                  <View
                    style={
                      styles.fileIconContainer
                    }
                  >
                    <Icon
                      size={37}
                      color={
                        file.id === "pdf"
                          ? "#F44336"
                          : file.id === "excel"
                            ? "#1B9A50"
                            : file.id === "csv"
                              ? "#55A84F"
                              : file.id === "json"
                                ? "#8B6BA8"
                                : "#2875C7"
                      }
                    />
                  </View>

                  <View style={styles.fileTypeText}>
                    <Text
                      style={styles.fileTypeName}
                    >
                      {file.name}
                    </Text>

                    <Text
                      style={
                        styles.fileTypeDescription
                      }
                    >
                      {file.description}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.radio,
                      selected &&
                        styles.radioSelected,
                    ]}
                  >
                    {selected && (
                      <View
                        style={styles.radioInner}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ================================================= */}
        {/* 4. EXPORT */}
        {/* ================================================= */}

        <View
          style={[
            styles.section,
            styles.exportSection,
          ]}
        >
          <Text style={styles.sectionTitle}>
            4. EXPORT
          </Text>

          <View style={styles.exportRow}>
            {/* SAVE TO */}

            <View style={styles.saveLocationGroup}>
              <Text style={styles.filterLabel}>
                Save to
              </Text>

              <View style={styles.dropdownContainer}>
                <Pressable
                  style={styles.saveDropdown}
                  onPress={toggleSaveDropdown}
                >
                  <View
                    style={
                      styles.saveLocationContent
                    }
                  >
                    <FolderOpen
                      size={15}
                      color="#222222"
                    />

                    <Text
                      style={styles.dropdownText}
                    >
                      {saveLocation}
                    </Text>
                  </View>

                  <ChevronDown
                    size={16}
                    color="#111111"
                  />
                </Pressable>

                {showSaveDropdown && (
                  <View style={styles.dropdownMenu}>
                    {locations.map((item) => (
                      <Pressable
                        key={item}
                        style={({ pressed }) => [
                          styles.dropdownOption,
                          pressed &&
                            styles.dropdownOptionPressed,
                          item === saveLocation &&
                            styles.dropdownOptionSelected,
                        ]}
                        onPress={() => {
                          setSaveLocation(item);

                          setShowSaveDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            item === saveLocation &&
                              styles.dropdownOptionTextSelected,
                          ]}
                        >
                          {item}
                        </Text>

                        {item === saveLocation && (
                          <Check
                            size={14}
                            color="#159A1D"
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* FILE NAME */}

            <View style={styles.fileNameGroup}>
              <Text style={styles.filterLabel}>
                File Name
              </Text>

              <TextInput
                value={fileName}
                onChangeText={setFileName}
                placeholder=""
                style={styles.fileNameInput}
              />
            </View>

            {/* EXPORT BUTTON */}

            <Pressable
              style={({ pressed }) => [
                styles.exportButton,
                (pressed || isExporting) &&
                  styles.exportButtonPressed,
              ]}
              onPress={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Download
                    size={16}
                    color="#ffffff"
                  />

                  <Text style={styles.exportButtonText}>
                    Export
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* OPEN AFTER SAVING */}

         <Pressable
            style={[
              styles.checkboxRow,
              showSaveDropdown &&
                styles.checkboxRowDropdownOpen,
            ]}
            onPress={() =>
              setOpenAfterSaving(
                (previous) => !previous
              )
            }
          >
            <View
              style={[
                styles.checkbox,
                openAfterSaving &&
                  styles.checkboxChecked,
              ]}
            >
              {openAfterSaving && (
                <Check
                  size={12}
                  color="#ffffff"
                  strokeWidth={3}
                />
              )}
            </View>

            <Text style={styles.checkboxText}>
              Open file after saving
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </AdminLayout>
  );
}

// =========================================================
// STYLES
// =========================================================

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  pageContent: {
    paddingHorizontal: 36,
    paddingTop: 42,
    paddingBottom: 50,
  },

  // =======================================================
  // HEADER
  // =======================================================

  pageHeader: {
    marginBottom: 46,
  },

  pageTitle: {
    fontSize: 32,
    fontFamily: "Montserrat_700Bold",
    color: "#075A18",
    letterSpacing: -0.5,
  },

  pageSubtitle: {
    marginTop: -2,
    fontSize: 16,
    fontFamily: "Montserrat_500Medium",
    color: "#6C916C",
  },

  // =======================================================
  // SECTIONS
  // =======================================================

  section: {
    borderWidth: 1,
    borderColor: "#D4D4D4",
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    marginBottom: 22,
    backgroundColor: "#ffffff",
  },

  filtersSection: {
    position: "relative",
    zIndex: 1000,
    elevation: 1000,
  },

  exportSection: {
    position: "relative",
    zIndex: 900,
    elevation: 900,
  },

  sectionTitle: {
    fontSize: 19,
    fontFamily: "Montserrat_700Bold",
    color: "#145C1E",
    marginBottom: 8,
  },

  // =======================================================
  // FILTERS
  // =======================================================

  filtersRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 30,
    paddingLeft: 24,
    position: "relative",
    zIndex: 2000,
    elevation: 2000,
  },

  dateRangeFilter: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 260,
    maxWidth: 340,
  },

  filterGroup: {
    width: 198,
    position: "relative",
  },

  statusFilter: {
    zIndex: 3000,
    elevation: 3000,
  },

  categoryFilter: {
    zIndex: 2900,
    elevation: 2900,
  },

  filterLabel: {
    fontSize: 14,
    fontFamily: "Montserrat_700Bold",
    color: "#111111",
    marginBottom: 3,
  },

  dateInput: {
    height: 27,
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    backgroundColor: "#ffffff",
  },

  dateText: {
    flex: 1,
    height: 26,
    padding: 0,
    margin: 0,
    fontSize: 10.5,
    fontFamily: "Montserrat_500Medium",
    color: "#333333",
    backgroundColor: "transparent",

    outlineStyle: "none",
  } as any,

  // =======================================================
  // DROPDOWNS
  // =======================================================

  dropdownContainer: {
    position: "relative",
    zIndex: 9999,
    elevation: 9999,
  },

  dropdown: {
    height: 27,
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 5,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
  },

  dropdownText: {
    fontSize: 11,
    fontFamily: "Montserrat_500Medium",
    color: "#222222",
  },

  dropdownMenu: {
  position: "absolute",
  top: 31,
  left: 0,
  right: 0,

  backgroundColor: "#ffffff",

  borderWidth: 1,
  borderColor: "#D0D0D0",
  borderRadius: 5,

  overflow: "hidden",

  zIndex: 99999,
  elevation: 99999,

  shadowColor: "#000000",
  shadowOffset: {
    width: 0,
    height: 4,
  },
  shadowOpacity: 0.18,
  shadowRadius: 6,
},

  dropdownOption: {
    minHeight: 32,
    paddingVertical: 7,
    paddingHorizontal: 10,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    backgroundColor: "#ffffff",
  },

  dropdownOptionPressed: {
    backgroundColor: "#E9F6E5",
  },

  dropdownOptionSelected: {
    backgroundColor: "#F3FAEE",
  },

  dropdownOptionText: {
    fontSize: 11,
    fontFamily: "Montserrat_500Medium",
    color: "#222222",
  },

  dropdownOptionTextSelected: {
    fontFamily: "Montserrat_600SemiBold",
    color: "#145C1E",
  },

  // =======================================================
  // FILTER BUTTONS
  // =======================================================

  filterActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 15,
    paddingLeft: 24,
  },

  applyButton: {
    height: 28,
    paddingHorizontal: 14,
    borderRadius: 7,
    backgroundColor: "#159A1D",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  applyButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontFamily: "Montserrat_700Bold",
  },

  resetButton: {
    height: 28,
    paddingHorizontal: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#159A1D",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  resetButtonText: {
    color: "#159A1D",
    fontSize: 11,
    fontFamily: "Montserrat_700Bold",
  },

  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },

  // =======================================================
  // SUMMARY
  // =======================================================

  summaryRow: {
    flexDirection: "row",
    gap: 26,
    paddingHorizontal: 18,
    marginTop: 4,
  },

  summaryCard: {
    flex: 1,
    minWidth: 180,
    height: 91,
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },

  totalCard: {
    backgroundColor: "#DDE8D5",
  },

  reviewCard: {
    backgroundColor: "#D2EAFB",
  },

  pendingCard: {
    backgroundColor: "#FFF2CF",
  },

  resolvedCard: {
    backgroundColor: "#DDE8D5",
  },

  summaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },

  totalIcon: {
    backgroundColor: "#2BBE42",
  },

  reviewIcon: {
    backgroundColor: "#3498DB",
  },

  pendingIcon: {
    backgroundColor: "#F5D88B",
  },

  resolvedIcon: {
    backgroundColor: "#43B84E",
  },

  summaryInfo: {
    flex: 1,
    alignItems: "center",
  },

  summaryLabel: {
    fontSize: 13,
    fontFamily: "Montserrat_700Bold",
    color: "#111111",
  },

  summaryNumber: {
    fontSize: 30,
    lineHeight: 32,
    fontFamily: "Montserrat_700Bold",
    color: "#050505",
    minHeight: 32,
  },

  summaryNote: {
    marginTop: 15,
    marginLeft: 18,
    fontSize: 11,
    fontFamily: "Montserrat_600SemiBold",
    color: "#3E8A38",
  },

  // =======================================================
  // FILE TYPES
  // =======================================================

  fileTypeRow: {
    flexDirection: "row",
    gap: 28,
    paddingHorizontal: 24,
    marginTop: 4,
  },

  fileTypeCard: {
    flex: 1,
    minWidth: 145,
    height: 76,
    borderWidth: 1,
    borderColor: "#D3D3D3",
    borderRadius: 7,
    backgroundColor: "#ffffff",

    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 10,

    position: "relative",
  },

  fileTypeCardSelected: {
    borderColor: "#159A1D",
    borderWidth: 1.5,
  },

  fileIconContainer: {
    width: 43,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
  },

  fileTypeText: {
    flex: 1,
  },

  fileTypeName: {
    fontSize: 12,
    fontFamily: "Montserrat_700Bold",
    color: "#111111",
    marginBottom: 1,
  },

  fileTypeDescription: {
    fontSize: 9.5,
    lineHeight: 12,
    fontFamily: "Montserrat_500Medium",
    color: "#555555",
  },

  radio: {
    position: "absolute",
    right: 7,
    top: 7,

    width: 11,
    height: 11,

    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 10,

    alignItems: "center",
    justifyContent: "center",
  },

  radioSelected: {
    borderColor: "#159A1D",
  },

  radioInner: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#159A1D",
  },

  // =======================================================
  // EXPORT
  // =======================================================

  exportRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 26,
    paddingHorizontal: 24,
  },

  saveLocationGroup: {
  width: 220,
  position: "relative",
  zIndex: 10000,
  elevation: 10000,
},

  fileNameGroup: {
    width: 285,
  },

  saveDropdown: {
    height: 28,
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 5,

    paddingHorizontal: 9,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    backgroundColor: "#ffffff",
  },

  saveLocationContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  fileNameInput: {
    height: 28,

    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 5,

    paddingHorizontal: 10,
    paddingVertical: 0,

    margin: 0,

    fontSize: 10.5,
    fontFamily: "Montserrat_500Medium",

    color: "#333333",
    backgroundColor: "#ffffff",

    outlineStyle: "none",
  } as any,

  exportButton: {
    height: 28,
    paddingHorizontal: 13,
    borderRadius: 7,

    backgroundColor: "#47844A",

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 6,
  },

  exportButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },

  exportButtonText: {
    fontSize: 11,
    fontFamily: "Montserrat_700Bold",
    color: "#ffffff",
  },

  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,

    marginTop: 6,
    marginLeft: 24,
  },

  checkboxRowDropdownOpen: {
  marginTop: 105,
},

  checkbox: {
    width: 12,
    height: 12,

    borderWidth: 1,
    borderColor: "#BEBEBE",
    borderRadius: 2,

    alignItems: "center",
    justifyContent: "center",
  },

  checkboxChecked: {
    backgroundColor: "#3EAD3E",
    borderColor: "#3EAD3E",
  },

  checkboxText: {
    fontSize: 10,
    fontFamily: "Montserrat_500Medium",
    color: "#333333",
  },
});