import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";
import type { SupabaseConnectionState } from "../context/AppContext";

type Props = {
  connection: SupabaseConnectionState;
  onRetry?: () => void;
  compact?: boolean;
};

export function ConnectionBanner({ connection, onRetry, compact }: Props) {
  if (connection.status === "checking") {
    return (
      <View style={[styles.row, styles.neutral, compact && styles.compact]}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.text}>Checking Supabase…</Text>
      </View>
    );
  }

  if (connection.status === "connected") {
    return null;
  }

  if (connection.status === "demo") {
    return (
      <View style={[styles.row, styles.demo, compact && styles.compact]}>
        <Ionicons name="albums-outline" size={18} color={colors.demo} />
        <View style={styles.demoTextWrap}>
          <Text style={[styles.text, styles.textDemo]}>Demo data</Text>
          <Text style={styles.hint}>{connection.hint}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.column, styles.error, compact && styles.compact]}>
      <View style={styles.row}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={[styles.text, styles.textWarn]}>Couldn’t load Supabase</Text>
      </View>
      <Text style={styles.errDetail} numberOfLines={3}>
        {connection.message}
      </Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  column: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  compact: { marginBottom: spacing.sm },
  neutral: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  live: {
    backgroundColor: colors.successMuted,
    borderColor: "rgba(61, 214, 140, 0.35)",
  },
  demo: {
    backgroundColor: colors.demoMuted,
    borderColor: "rgba(124, 124, 248, 0.35)",
  },
  error: {
    backgroundColor: colors.warningMuted,
    borderColor: "rgba(245, 165, 36, 0.4)",
  },
  text: { color: colors.textMuted, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  textLive: { color: colors.success },
  textDemo: { color: colors.demo },
  textWarn: { color: colors.warning },
  demoTextWrap: { flex: 1, gap: 2 },
  hint: { color: colors.textSubtle, fontSize: 12, lineHeight: 16 },
  errDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginLeft: 26 },
  retry: {
    alignSelf: "flex-start",
    marginLeft: 26,
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  retryText: { color: colors.text, fontWeight: "700", fontSize: 13 },
});
