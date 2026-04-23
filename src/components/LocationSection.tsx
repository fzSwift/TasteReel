import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";
import type { LocationStatus } from "../context/AppContext";

type Props = {
  locationStatus: LocationStatus;
  locationName: string | null;
  onUseCurrentLocation: () => void;
  onManualLocation: () => void;
};

export function LocationSection({
  locationStatus,
  locationName,
  onUseCurrentLocation,
  onManualLocation,
}: Props) {
  if (locationStatus === "granted" && locationName) {
    return (
      <View style={styles.pill}>
        <Ionicons name="location" size={16} color={colors.accent} />
        <View style={styles.pillTextWrap}>
          <Text style={styles.pillTitle}>{locationName}</Text>
          <Text style={styles.pillSub}>Sorted by distance</Text>
        </View>
      </View>
    );
  }

  if (locationStatus === "loading") {
    return (
      <View style={styles.card}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.cardTitle}>Detecting your location...</Text>
        </View>
      </View>
    );
  }

  const denied = locationStatus === "denied";
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {denied ? "Location access denied" : "Enable location to find food near you"}
      </Text>
      <Pressable style={styles.primaryBtn} onPress={onUseCurrentLocation}>
        <Text style={styles.primaryBtnText}>{denied ? "Try again" : "Use current location"}</Text>
      </Pressable>
      <Pressable onPress={onManualLocation} hitSlop={8}>
        <Text style={styles.secondaryTextBtn}>Enter location manually</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  primaryBtn: {
    backgroundColor: "#FF6A3D",
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryTextBtn: {
    alignSelf: "center",
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: "600",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pill: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255,106,61,0.28)",
    borderRadius: radius.md,
    backgroundColor: "rgba(255,106,61,0.10)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pillTextWrap: { flex: 1, gap: 2 },
  pillTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  pillSub: { color: colors.textSubtle, fontSize: 12, fontWeight: "600" },
});
