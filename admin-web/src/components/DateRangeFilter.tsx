import { createElement } from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { formatIsoDayLabel } from "@/utils/dateRange";

type DateRangeFilterProps = {
  label?: string;
  fromDate: string;
  toDate: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Purpose: Lets admins pick an inclusive From–To date range for table filters.
 * How it works: Uses native HTML date inputs on web; shows a readable summary of the range.
 */
export default function DateRangeFilter({
  label = "Date Range",
  fromDate,
  toDate,
  onChangeFrom,
  onChangeTo,
  style,
}: DateRangeFilterProps) {
  const summary =
    fromDate || toDate
      ? `${fromDate ? formatIsoDayLabel(fromDate) : "Any"} – ${toDate ? formatIsoDayLabel(toDate) : "Any"}`
      : "Any dates";

  return (
    <View style={[styles.box, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
        <CalendarDays size={16} color="#333" />
      </View>
      {Platform.OS === "web" ? (
        <View style={styles.inputsRow}>
          {createElement("input", {
            type: "date",
            value: fromDate,
            max: toDate || undefined,
            onChange: (event: { target: { value: string } }) => onChangeFrom(event.target.value),
            style: webInputStyle,
            title: "From date",
          })}
          <Text style={styles.dash}>–</Text>
          {createElement("input", {
            type: "date",
            value: toDate,
            min: fromDate || undefined,
            onChange: (event: { target: { value: string } }) => onChangeTo(event.target.value),
            style: webInputStyle,
            title: "To date",
          })}
        </View>
      ) : null}
    </View>
  );
}

const webInputStyle = {
  flex: 1,
  minWidth: 0,
  height: 32,
  borderRadius: 6,
  border: "1px solid #cfcfcf",
  paddingLeft: 8,
  paddingRight: 8,
  fontFamily: "Montserrat_700Bold",
  fontSize: 12,
  color: "#222",
  backgroundColor: "#fff",
} as const;

const styles = StyleSheet.create({
  box: {
    flex: 1.4,
    minWidth: 200,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
    justifyContent: "center",
    gap: 4,
  },
  label: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    color: "#555",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  summary: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#222",
  },
  inputsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  dash: {
    fontFamily: "Montserrat_700Bold",
    color: "#555",
  },
});
