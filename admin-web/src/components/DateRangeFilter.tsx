import { createElement } from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { formatIsoDayLabel } from "@/utils/dateRange";

type DateRangeFilterProps = {
  label?: string;
  fromDate: string;
  toDate: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  /** "card" = boxed summary (tables). "inline" = label + inputs aligned with export dropdowns. */
  variant?: "card" | "inline";
};

/**
 * Purpose: Lets admins pick an inclusive From–To date range for filters/exports.
 * How it works: Uses native HTML date inputs on web; values are stored as YYYY-MM-DD.
 */
export default function DateRangeFilter({
  label = "Date Range",
  fromDate,
  toDate,
  onChangeFrom,
  onChangeTo,
  style,
  variant = "card",
}: DateRangeFilterProps) {
  const summary =
    fromDate || toDate
      ? `${fromDate ? formatIsoDayLabel(fromDate) : "Any"} – ${toDate ? formatIsoDayLabel(toDate) : "Any"}`
      : "Any dates";

  const fromInput = createElement("input", {
    type: "date",
    value: fromDate,
    max: toDate || undefined,
    onChange: (event: { target: { value: string } }) => onChangeFrom(event.target.value),
    style: variant === "inline" ? inlineWebInputStyle : webInputStyle,
    title: "From date",
  });

  const toInput = createElement("input", {
    type: "date",
    value: toDate,
    min: fromDate || undefined,
    onChange: (event: { target: { value: string } }) => onChangeTo(event.target.value),
    style: variant === "inline" ? inlineWebInputStyle : webInputStyle,
    title: "To date",
  });

  if (variant === "inline") {
    return (
      <View style={[styles.inlineBox, style]}>
        <Text style={styles.inlineLabel}>{label}</Text>
        {Platform.OS === "web" ? (
          <View style={styles.inlineInputsRow}>
            {fromInput}
            <Text style={styles.dash}>–</Text>
            {toInput}
          </View>
        ) : (
          <Text style={styles.inlineFallback}>{summary}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.box, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
      </View>
      {Platform.OS === "web" ? (
        <View style={styles.inputsRow}>
          {fromInput}
          <Text style={styles.dash}>–</Text>
          {toInput}
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

const inlineWebInputStyle = {
  flex: 1,
  minWidth: 0,
  height: 42,
  borderRadius: 8,
  border: "1px solid #d6d6d6",
  paddingLeft: 10,
  paddingRight: 10,
  fontFamily: "Montserrat_700Bold",
  fontSize: 13,
  color: "#111",
  backgroundColor: "#fff",
  boxSizing: "border-box",
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
  inlineBox: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 260,
    maxWidth: 360,
  },
  inlineLabel: {
    fontSize: 14,
    fontFamily: "Montserrat_700Bold",
    color: "#111111",
    marginBottom: 3,
  },
  inlineInputsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 42,
  },
  inlineFallback: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#222",
    height: 42,
    textAlignVertical: "center",
  },
});
