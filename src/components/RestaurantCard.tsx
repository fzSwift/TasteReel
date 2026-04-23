import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";

export type RestaurantCardData = {
  id: string;
  name: string;
  cuisine?: string | null;
  location?: string | null;
  image?: string | null;
  logo?: string | null;
  rating?: number | null;
  distanceKm?: number | null;
  eta?: string | null;
  likes?: number | null;
  isLiked?: boolean;
  tags?: string[];
};

type Props = {
  data: RestaurantCardData;
  onPress: () => void;
  onToggleLike?: () => void;
  showLikeButton?: boolean;
  variant?: "default" | "horizontal";
};

function initials(name: string): string {
  const safe = name.trim();
  if (!safe) return "?";
  const parts = safe.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || safe.slice(0, 1).toUpperCase();
}

export function RestaurantCard({
  data,
  onPress,
  onToggleLike,
  showLikeButton = true,
  variant = "default",
}: Props) {
  const hasImage = Boolean(data.image?.trim());
  const hasLogo = Boolean(data.logo?.trim());
  const metadataLine = [data.cuisine, data.location].filter((v) => !!v?.trim()).join(" · ");
  const metrics = [
    data.rating != null ? `★ ${data.rating.toFixed(1)}` : null,
    data.distanceKm != null ? `${data.distanceKm.toFixed(1)} km` : null,
    data.eta?.trim() ?? null,
  ].filter(Boolean) as string[];
  const tags = (data.tags ?? []).filter((t) => t.trim()).slice(0, 3);
  const rootHorizontal = variant === "horizontal";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, rootHorizontal && styles.cardHorizontal, pressed && styles.cardPressed]}>
      <ImageBackground
        source={hasImage ? { uri: data.image!.trim() } : undefined}
        style={[styles.cover, rootHorizontal && styles.coverHorizontal]}
        imageStyle={styles.coverImage}
      >
        {!hasImage ? (
          <View style={styles.coverFallback}>
            <Text style={styles.coverFallbackText}>{initials(data.name)}</Text>
          </View>
        ) : null}
        <View style={styles.coverOverlay} />
        {hasLogo ? <Image source={{ uri: data.logo!.trim() }} style={styles.logo} /> : <View style={styles.logoFallback}><Text style={styles.logoFallbackText}>{initials(data.name)}</Text></View>}
        {showLikeButton ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onToggleLike?.();
            }}
            style={[styles.likeBtn, data.isLiked && styles.likeBtnActive]}
            hitSlop={8}
          >
            <Ionicons name={data.isLiked ? "heart" : "heart-outline"} size={17} color={data.isLiked ? colors.accent : colors.text} />
          </Pressable>
        ) : null}
      </ImageBackground>

      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.title}>{data.name}</Text>
        {metadataLine ? <Text numberOfLines={1} style={styles.meta}>{metadataLine}</Text> : null}

        {metrics.length > 0 ? (
          <View style={styles.metricsRow}>
            {metrics.map((m) => (
              <View key={m} style={styles.metricChip}>
                <Text style={styles.metricText}>{m}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footerRow}>
          <View style={styles.likesRow}>
            <Ionicons name="heart" size={14} color={colors.accent} />
            <Text style={styles.likesText}>{data.likes ?? 0}</Text>
          </View>
          <View style={styles.ctaBtn}>
            <Text style={styles.ctaText}>View Menu</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function RestaurantCardSkeleton() {
  return (
    <View style={[styles.card, styles.skeletonCard]}>
      <View style={[styles.cover, styles.skeletonBlock]} />
      <View style={styles.content}>
        <View style={[styles.skeletonLine, { width: "62%" }]} />
        <View style={[styles.skeletonLine, { width: "84%" }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#14141c",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  cardHorizontal: { flexDirection: "row", minHeight: 150 },
  cardPressed: { opacity: 0.96, borderColor: colors.borderLight },
  cover: { height: 142, position: "relative", backgroundColor: "#1f1f2b" },
  coverHorizontal: { width: 128, height: "100%" },
  coverImage: { resizeMode: "cover" },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,5,8,0.34)",
  },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverFallbackText: { color: colors.text, fontSize: 26, fontWeight: "800" },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.surface2,
  },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  likeBtn: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(8,8,12,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  likeBtnActive: { borderColor: "rgba(255,106,61,0.44)", backgroundColor: "rgba(255,106,61,0.16)" },
  content: { padding: spacing.md, gap: spacing.xs },
  title: { color: colors.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  metricsRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", marginTop: 2 },
  metricChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metricText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  tagsRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", marginTop: 2 },
  tag: {
    borderWidth: 1,
    borderColor: "rgba(255,106,61,0.35)",
    borderRadius: 999,
    backgroundColor: "rgba(255,106,61,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: { color: "#ffc5b4", fontSize: 11, fontWeight: "700" },
  footerRow: { marginTop: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  likesRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  likesText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: "#FF6A3D",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  ctaText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  skeletonCard: { overflow: "hidden" },
  skeletonBlock: { backgroundColor: colors.surface2 },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface2,
    marginBottom: spacing.xs,
  },
});
