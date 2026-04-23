import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { ResizeMode, Video } from "expo-av";
import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConnectionBanner } from "../components/ConnectionBanner";
import { LocationSection } from "../components/LocationSection";
import { RestaurantCard } from "../components/RestaurantCard";
import { useAppData } from "../context/AppContext";
import type { AuthStackParamList } from "./SignInScreen";
import { SignInScreen } from "./SignInScreen";
import { SignUpScreen } from "./SignUpScreen";
import { colors, radius, spacing, typography } from "../theme";
import type { MenuItem, OrderTicket, ProfileRequestableRole, Restaurant, Role } from "../types";

type HomeRow =
  | { type: "header" }
  | { type: "section"; title: string }
  | { type: "item"; restaurant: Restaurant };

type RootStackParamList = {
  Tabs: undefined;
  Restaurant: { restaurantId: string };
  Checkout: undefined;
};

type HomeTabParamList = {
  Discover: undefined;
  Account: undefined;
};

type DriverTabParamList = {
  Requests: undefined;
  Scan: undefined;
  Earnings: undefined;
  Account: undefined;
};

type AdminTabParamList = {
  Overview: undefined;
  ProfileRequests: undefined;
  Restaurants: undefined;
  Account: undefined;
};

type RestaurantTabParamList = {
  Orders: undefined;
  Menu: undefined;
  Account: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<HomeTabParamList>();
const DriverTab = createBottomTabNavigator<DriverTabParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();
const RestaurantTab = createBottomTabNavigator<RestaurantTabParamList>();

function buildGoogleRouteUrl(destination: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=driving`;
}

function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 360 ? spacing.sm : spacing.md;
  const contentMaxWidth = width >= 1280 ? 1040 : width >= 1024 ? 920 : width >= 768 ? 760 : undefined;
  const contentContainerStyle = {
    paddingHorizontal: horizontalPadding,
    paddingBottom: spacing.xl * 2,
    ...(contentMaxWidth
      ? { width: "100%" as const, maxWidth: contentMaxWidth, alignSelf: "center" as const }
      : null),
  };
  const menuVideoHeight = Math.max(220, Math.min(380, Math.round(width * 0.62)));
  return {
    width,
    isNarrow: width < 390,
    contentContainerStyle,
    menuVideoHeight,
  };
}

function HomeScreen({ navigation }: { navigation: any }) {
  const responsive = useResponsiveLayout();
  const {
    restaurants,
    cartItems,
    distanceToRestaurantKm,
    refreshLocation,
    userLocation,
    locationStatus,
    setManualLocation,
    role,
    toggleRestaurantLike,
    customerLikedRestaurantIds,
  } = useAppData();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [manualLocationOpen, setManualLocationOpen] = React.useState(false);
  const [manualLatitude, setManualLatitude] = React.useState("");
  const [manualLongitude, setManualLongitude] = React.useState("");

  useFocusEffect(
    React.useCallback(() => {
      void refreshLocation();
    }, [refreshLocation]),
  );
  const filteredRestaurants = useMemo(() => {
    const eligible = restaurants.filter((restaurant) => restaurant.moderationStatus === "approved");
    const q = searchQuery.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.cuisine.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q),
    );
  }, [restaurants, searchQuery]);
  const sorted = useMemo(() => {
    return [...filteredRestaurants].sort((a, b) => {
      const ad = distanceToRestaurantKm(a);
      const bd = distanceToRestaurantKm(b);
      if (ad == null && bd == null) return Number(b.isRecommended) - Number(a.isRecommended);
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad - bd;
    });
  }, [filteredRestaurants, distanceToRestaurantKm]);
  const nearby = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  function openRestaurant(restaurantId: string) {
    const parent = navigation.getParent?.();
    if (parent) parent.navigate("Restaurant", { restaurantId });
    else navigation.navigate("Restaurant", { restaurantId });
  }

  const listData = useMemo((): HomeRow[] => {
    const sections: HomeRow[] = [{ type: "header" }];
    if (nearby.length > 0) {
      sections.push({ type: "section", title: "Nearest to you" });
      nearby.forEach((r) => sections.push({ type: "item", restaurant: r }));
    }
    if (rest.length > 0) {
      sections.push({ type: "section", title: "All restaurants" });
      rest.forEach((r) => sections.push({ type: "item", restaurant: r }));
    }
    return sections;
  }, [nearby, rest]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={listData}
        keyExtractor={(row, index) =>
          row.type === "item" ? row.restaurant.id : `${row.type}-${index}`
        }
        contentContainerStyle={responsive.contentContainerStyle}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: row }) => {
          if (row.type === "header") {
            return (
              <View style={styles.homeHeader}>
                <View style={styles.discoverTopRow}>
                  <Text style={typography.hero}>TasteReel</Text>
                  <Pressable
                    onPress={() => navigation.getParent?.()?.navigate("Checkout")}
                    style={styles.cartTopBtn}
                  >
                    <Ionicons name="bag-handle-outline" size={20} color={colors.text} />
                    {cartCount > 0 ? (
                      <View style={styles.cartTopBadge}>
                        <Text style={styles.cartTopBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
                <Text style={[typography.subtitle, styles.tagline]}>
                  Elevated food discovery near you. Curated menus, fast pickup, premium experience.
                </Text>
                <View style={styles.searchWrap}>
                  <Ionicons name="search-outline" size={16} color={colors.textSubtle} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search restaurant, cuisine, or address"
                    placeholderTextColor={colors.textSubtle}
                    style={styles.searchInput}
                  />
                </View>
                <LocationSection
                  locationStatus={locationStatus}
                  locationName={userLocation?.name ?? null}
                  onUseCurrentLocation={() => void refreshLocation()}
                  onManualLocation={() => {
                    setManualLatitude(userLocation ? String(userLocation.latitude) : "");
                    setManualLongitude(userLocation ? String(userLocation.longitude) : "");
                    setManualLocationOpen(true);
                  }}
                />
              </View>
            );
          }
          if (row.type === "section") {
            return (
              <Text style={styles.sectionLabel}>{row.title}</Text>
            );
          }
          const item = row.restaurant;
          const isLiked = customerLikedRestaurantIds.includes(item.id);
          const distanceKm = locationStatus === "granted" ? distanceToRestaurantKm(item) : null;
          const tags = [
            item.isRecommended ? "Popular" : null,
            distanceKm != null && distanceKm <= 2 ? "Fast Pickup" : null,
            item.likeCount >= 25 ? "Top Rated" : null,
          ].filter((x): x is string => Boolean(x));
          const eta = distanceKm != null ? `${Math.max(12, Math.round(distanceKm * 6 + 10))} min` : null;
          return (
            <RestaurantCard
              data={{
                id: item.id,
                name: item.name,
                cuisine: item.cuisine,
                location: item.address,
                rating: item.likeCount > 0 ? Math.min(5, 4 + Math.min(1, item.likeCount / 100)) : null,
                distanceKm,
                eta,
                likes: item.likeCount,
                isLiked,
                tags,
              }}
              onPress={() => openRestaurant(item.id)}
              showLikeButton={role === "customer"}
              onToggleLike={() => {
                void (async () => {
                  const res = await toggleRestaurantLike(item.id);
                  if (!res.ok) Alert.alert("Like", res.reason);
                })();
              }}
            />
          );
        }}
        ListEmptyComponent={
          <View style={[styles.infoCard, styles.customerEmptyCard]}>
            <Ionicons name="storefront-outline" size={30} color={colors.textSubtle} />
            <Text style={[typography.subtitle, styles.customerEmptyText]}>
              No restaurants yet. Check back after admin adds restaurants.
            </Text>
          </View>
        }
      />
      <Modal
        visible={manualLocationOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setManualLocationOpen(false)}
      >
        <View style={styles.focusVideoBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setManualLocationOpen(false)} />
          <View style={styles.manualLocationCard}>
            <Text style={styles.infoTitle}>Set manual location</Text>
            <Text style={styles.cardMeta}>Enter latitude and longitude used for distance/routing.</Text>
            <TextInput
              value={manualLatitude}
              onChangeText={setManualLatitude}
              placeholder="Latitude (e.g. 6.5244)"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              value={manualLongitude}
              onChangeText={setManualLongitude}
              placeholder="Longitude (e.g. 3.3792)"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
              style={styles.input}
            />
            <Pressable
              style={[styles.checkoutBtn, styles.inlineBtn]}
              onPress={() => {
                void (async () => {
                  const lat = Number(manualLatitude.trim());
                  const lng = Number(manualLongitude.trim());
                  const result = await setManualLocation(lat, lng);
                  if (!result.ok) {
                    Alert.alert("Invalid location", result.reason);
                    return;
                  }
                  setManualLocationOpen(false);
                })();
              }}
            >
              <Text style={styles.checkoutBtnText}>Save manual location</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function RestaurantScreen({ route, navigation }: { route: any; navigation: any }) {
  const responsive = useResponsiveLayout();
  const { restaurantId } = route.params as { restaurantId: string };
  const {
    restaurants,
    menuItems,
    addToCart,
    distanceToRestaurantKm,
    refreshLocation,
    cartItems,
    reportRestaurant,
    toggleRestaurantLike,
    role,
    customerDailyRestaurantActions,
    customerLikedRestaurantIds,
    resolveVideoPlaybackUrl,
  } = useAppData();

  useFocusEffect(
    React.useCallback(() => {
      if (role === "customer") void refreshLocation();
    }, [refreshLocation, role]),
  );

  const restaurant = restaurants.find((r) => r.id === restaurantId) as Restaurant | undefined;
  const items = menuItems.filter((item) => item.restaurantId === restaurantId);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const [focusedVideo, setFocusedVideo] = React.useState<{ uri: string; title: string } | null>(null);
  const [videoUriOverrides, setVideoUriOverrides] = React.useState<Record<string, string>>({});
  const [failedMenuVideoIds, setFailedMenuVideoIds] = React.useState<Record<string, boolean>>({});
  const lastVideoTapAtRef = React.useRef<number>(0);
  const reportedToday =
    restaurant != null &&
    customerDailyRestaurantActions.reportedRestaurantIds.includes(restaurant.id);
  const isLiked = restaurant != null && customerLikedRestaurantIds.includes(restaurant.id);
  const handleMenuVideoTap = React.useCallback((uri: string, title: string) => {
    const now = Date.now();
    if (now - lastVideoTapAtRef.current < 300) {
      setFocusedVideo({ uri, title });
      lastVideoTapAtRef.current = 0;
      return;
    }
    lastVideoTapAtRef.current = now;
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.restaurantHero}>
        <View style={styles.discoverTopRow}>
          <View style={styles.cardTopText}>
            <Text style={typography.title}>{restaurant?.name ?? "Restaurant"}</Text>
            <Text style={typography.subtitle}>{restaurant?.cuisine ?? ""}</Text>
            <Text style={styles.cardDistance}>
              {restaurant && distanceToRestaurantKm(restaurant) != null
                ? `${distanceToRestaurantKm(restaurant)!.toFixed(1)} km from you`
                : "Location needed for distance"}
            </Text>
          </View>
          <Pressable style={styles.cartTopBtn} onPress={() => navigation.navigate("Checkout")}>
            <Ionicons name="bag-handle-outline" size={20} color={colors.text} />
            {cartCount > 0 ? (
              <View style={styles.cartTopBadge}>
                <Text style={styles.cartTopBadgeText}>
                  {cartCount > 99 ? "99+" : cartCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        {role === "customer" && restaurant ? (
          <View style={styles.restaurantEngageBlock}>
            <View style={styles.restaurantEngageRow}>
              <Pressable
                style={[styles.engageChip, isLiked && styles.engageChipActive]}
                onPress={() => {
                  void (async () => {
                    const res = await toggleRestaurantLike(restaurant.id);
                    if (!res.ok) Alert.alert("Like", res.reason);
                  })();
                }}
              >
                <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={18}
                  color={isLiked ? colors.accent : colors.text}
                />
                <Text style={styles.engageChipText}>
                  {restaurant.likeCount} likes · tap to {isLiked ? "unlike" : "like"}
                </Text>
              </Pressable>
              <Text style={styles.engageHint}>Your like stays until you unlike.</Text>
            </View>
            <View style={styles.reportMetaRow}>
              <Ionicons name="flag-outline" size={14} color={colors.textSubtle} />
              <Text style={styles.reportMetaText}>
                Community reports: {restaurant.reportCount}
                {reportedToday ? " · You reported today" : ""}
              </Text>
            </View>
            <Pressable
              disabled={reportedToday}
              style={[
                styles.outlineBtnDanger,
                styles.inlineBtn,
                reportedToday && styles.outlineBtnDisabled,
              ]}
              onPress={() => {
                void (async () => {
                  const res = await reportRestaurant(restaurant.id);
                  if (!res.ok) {
                    Alert.alert("Report", res.reason);
                    return;
                  }
                  Alert.alert(
                    "Report submitted",
                    "This restaurant has been reported to admin for review. You cannot report the same venue again until tomorrow.",
                  );
                })();
              }}
            >
              <Text
                style={[
                  styles.outlineBtnDangerText,
                  reportedToday && styles.outlineBtnDangerTextMuted,
                ]}
              >
                {reportedToday ? "Reported today" : "Report restaurant"}
              </Text>
            </Pressable>
            {reportedToday ? (
              <Text style={styles.reportCooldownNote}>
                You can submit another report for this restaurant after midnight (local time).
              </Text>
            ) : (
              <Text style={styles.reportCooldownNote}>
                One report per restaurant per day as a customer.
              </Text>
            )}
          </View>
        ) : restaurant ? (
          <View style={styles.reportMetaRow}>
            <Ionicons name="heart-outline" size={14} color={colors.textSubtle} />
            <Text style={styles.reportMetaText}>
              {restaurant.likeCount} likes · {restaurant.reportCount} reports
            </Text>
          </View>
        ) : null}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={responsive.contentContainerStyle}
        ListEmptyComponent={
          <Text style={typography.subtitle}>No dishes yet — add items in Supabase.</Text>
        }
        renderItem={({ item }) => {
          const effectiveVideoUri = videoUriOverrides[item.id] ?? item.videoUrl?.trim() ?? "";
          return (
          <View style={[styles.menuVideoCard, { height: responsive.menuVideoHeight }]}>
            {effectiveVideoUri ? (
              <Pressable
                style={styles.menuVideoTapZone}
                onPress={() => handleMenuVideoTap(effectiveVideoUri, item.title)}
              >
                <Video
                  source={{ uri: effectiveVideoUri }}
                  style={styles.menuVideo}
                  shouldPlay
                  isLooping
                  isMuted
                  useNativeControls={false}
                  resizeMode={ResizeMode.COVER}
                  onError={(err) => {
                    console.warn("[menu video]", item.id, err);
                    setFailedMenuVideoIds((prev) => ({ ...prev, [item.id]: true }));
                    void (async () => {
                      const fallback = await resolveVideoPlaybackUrl(item.videoUrl?.trim() ?? "");
                      if (!fallback || fallback === effectiveVideoUri) return;
                      setVideoUriOverrides((prev) => ({ ...prev, [item.id]: fallback }));
                    })();
                  }}
                />
              </Pressable>
            ) : (
              <View style={[styles.menuVideo, styles.videoPlaceholder]}>
                <Ionicons name="videocam-off-outline" size={36} color={colors.textSubtle} />
              </View>
            )}
            <View style={styles.menuVideoDim} />
            <View style={styles.menuVideoOverlay}>
              <Text style={styles.menuVideoTitle}>{item.title}</Text>
              <Text style={styles.menuVideoMeta}>${item.price.toFixed(2)}</Text>
              <Text numberOfLines={2} style={styles.menuVideoDesc}>
                {item.description}
              </Text>
              <Pressable onPress={() => addToCart(item.id)} style={styles.primaryBtn}>
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Add to order</Text>
              </Pressable>
              {failedMenuVideoIds[item.id] ? (
                <Pressable
                  onPress={() => void Linking.openURL(effectiveVideoUri)}
                  style={[styles.outlineBtn, styles.inlineBtn]}
                >
                  <Text style={styles.outlineBtnText}>Open video directly</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      }}
      />
      <View style={styles.cartFooter}>
        <Pressable style={styles.checkoutBtn} onPress={() => navigation.navigate("Checkout")}>
          <Text style={styles.checkoutBtnText}>
            Review order ({cartItems.reduce((sum, item) => sum + item.quantity, 0)})
          </Text>
        </Pressable>
      </View>
      <Modal visible={focusedVideo != null} transparent animationType="fade" onRequestClose={() => setFocusedVideo(null)}>
        <View style={styles.focusVideoBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setFocusedVideo(null)} />
          <View style={styles.focusVideoCard}>
            <View style={styles.focusVideoHeader}>
              <Text numberOfLines={1} style={styles.focusVideoTitle}>
                {focusedVideo?.title ?? "Menu video"}
              </Text>
              <Pressable style={styles.focusVideoCloseBtn} onPress={() => setFocusedVideo(null)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            {focusedVideo?.uri ? (
              <Video
                source={{ uri: focusedVideo.uri }}
                style={styles.focusVideoPlayer}
                shouldPlay
                isLooping
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                onError={(err) => console.warn("[focused menu video]", err)}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FeedCard({ item, height, isActive }: { item: MenuItem; height: number; isActive: boolean }) {
  const { restaurants, addToCart, resolveVideoPlaybackUrl } = useAppData();
  const restaurant = restaurants.find((r) => r.id === item.restaurantId);
  const [videoUri, setVideoUri] = React.useState(item.videoUrl?.trim() ?? "");
  const [videoFailed, setVideoFailed] = React.useState(false);

  React.useEffect(() => {
    setVideoUri(item.videoUrl?.trim() ?? "");
    setVideoFailed(false);
  }, [item.videoUrl]);

  return (
    <View style={[styles.feedCard, { height }]}>
      {videoUri ? (
        <Video
          source={{ uri: videoUri }}
          style={styles.video}
          shouldPlay={isActive}
          isLooping
          isMuted
          useNativeControls={false}
          resizeMode={ResizeMode.COVER}
          onError={(err) => {
            console.warn("[feed video]", item.id, err);
            setVideoFailed(true);
            void (async () => {
              const fallback = await resolveVideoPlaybackUrl(item.videoUrl?.trim() ?? "");
              if (!fallback || fallback === videoUri) return;
              setVideoUri(fallback);
            })();
          }}
        />
      ) : (
        <View style={[styles.video, styles.videoPlaceholder]}>
          <Ionicons name="videocam-off-outline" size={40} color={colors.textSubtle} />
          <Text style={[typography.subtitle, styles.videoPlaceholderText]}>No video for this item</Text>
        </View>
      )}
      <View style={styles.feedDim} />
      <View style={styles.feedOverlay}>
        <Text style={styles.feedTitle}>{item.title}</Text>
        <Text style={styles.feedMeta}>
          {restaurant?.name} · ${item.price.toFixed(2)}
        </Text>
        <Pressable onPress={() => addToCart(item.id)} style={styles.feedBtn}>
          <Ionicons name="cart-outline" size={18} color="#fff" />
          <Text style={styles.feedBtnText}> Add to cart</Text>
        </Pressable>
        {videoFailed ? (
          <Pressable onPress={() => void Linking.openURL(videoUri)} style={[styles.outlineBtn, styles.inlineBtn]}>
            <Text style={styles.outlineBtnText}>Open video directly</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function FeedScreen({ navigation }: { navigation: any }) {
  const { menuItems, supabaseConnection } = useAppData();
  const { height: winH } = useWindowDimensions();
  const cardHeight = Math.min(winH * 0.68, 560);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (menuItems.length === 0) {
      setActiveVideoId(null);
      return;
    }
    setActiveVideoId((prev) =>
      prev && menuItems.some((m) => m.id === prev) ? prev : menuItems[0].id,
    );
  }, [menuItems]);

  const viewabilityConfig = React.useMemo(
    () => ({ itemVisiblePercentThreshold: 55, minimumViewTime: 100 }),
    [],
  );

  const onViewableItemsChanged = React.useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const top = viewableItems.find((t) => t.isViewable && t.item != null);
      const row = top?.item as MenuItem | undefined;
      if (row?.id) setActiveVideoId(row.id);
    },
    [],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.feedHeader}>
        <Text style={typography.title}>Watch & order</Text>
        <ConnectionBanner connection={supabaseConnection} compact />
        <Pressable
          onPress={() => navigation.getParent?.()?.navigate("Checkout")}
          style={[styles.checkoutBtn, styles.quickCheckoutBtn]}
        >
          <Ionicons name="bag-check-outline" size={18} color="#fff" />
          <Text style={styles.checkoutBtnText}>Review order</Text>
        </Pressable>
      </View>
      <FlatList
        data={menuItems}
        keyExtractor={(item) => item.id}
        pagingEnabled
        decelerationRate="fast"
        snapToInterval={cardHeight + spacing.md}
        snapToAlignment="start"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        contentContainerStyle={styles.feedList}
        getItemLayout={(_, index) => ({
          length: cardHeight + spacing.md,
          offset: (cardHeight + spacing.md) * index,
          index,
        })}
        renderItem={({ item }) => (
          <FeedCard item={item} height={cardHeight} isActive={activeVideoId === item.id} />
        )}
        ListEmptyComponent={
          <View style={[styles.infoCard, styles.customerEmptyCard]}>
            <Ionicons name="videocam-outline" size={30} color={colors.textSubtle} />
            <Text style={[typography.subtitle, styles.customerEmptyText]}>
              No menu videos yet. Admin needs to add menu items first.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function CheckoutScreen() {
  const {
    cartItems,
    menuItems,
    addToCart,
    removeFromCart,
    totalPrice,
    supabaseConnection,
    placeOrder,
  } = useAppData();

  const [orderMessage, setOrderMessage] = React.useState<string | null>(null);
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  function onPlaceOrder() {
    void (async () => {
      try {
        const result = await placeOrder();
        if (result.ok) {
          setOrderMessage("Order ticket sent to admin queue. Waiting for approval and QR generation.");
          return;
        }
        setOrderMessage(result.reason);
        Alert.alert("Could not place order", result.reason);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unexpected error.";
        setOrderMessage(msg);
        Alert.alert("Could not place order", msg);
      }
    })();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Review your order</Text>
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>{itemCount} item(s)</Text>
        <Text style={styles.summaryText}>Total ${totalPrice.toFixed(2)}</Text>
      </View>
      <ConnectionBanner connection={supabaseConnection} compact />
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {cartItems.length === 0 ? (
          <View style={styles.emptyCart}>
            <Ionicons name="cart-outline" size={48} color={colors.textSubtle} />
            <Text style={typography.subtitle}>Your order is empty. Add dishes from Discover or Feed.</Text>
            <View style={styles.customerHintCard}>
              <Ionicons name="information-circle-outline" size={16} color={colors.demo} />
              <Text style={styles.customerHintText}>
                Tip: add dishes from a single restaurant for a smoother checkout.
              </Text>
            </View>
          </View>
        ) : null}
        {cartItems.map((cart) => {
          const item = menuItems.find((m) => m.id === cart.menuItemId);
          if (!item) return null;
          return (
            <View key={cart.menuItemId} style={styles.cartCard}>
              <View style={styles.cartCardMain}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.cartLine}>${item.price.toFixed(2)} × {cart.quantity}</Text>
                <Text style={typography.price}>${(cart.quantity * item.price).toFixed(2)}</Text>
              </View>
              <View style={styles.qtyRow}>
                <Pressable
                  onPress={() => removeFromCart(item.id)}
                  style={styles.qtyBtn}
                  hitSlop={8}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={styles.qtyLabel}>{cart.quantity}</Text>
                <Pressable onPress={() => addToCart(item.id)} style={styles.qtyBtn} hitSlop={8}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.cartFooter}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>${totalPrice.toFixed(2)}</Text>
        {orderMessage ? <Text style={styles.orderMessage}>{orderMessage}</Text> : null}
        <Pressable style={styles.checkoutBtn} onPress={onPlaceOrder}>
          <Text style={styles.checkoutBtnText}>Confirm order request</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PollScreen() {
  const { restaurants, hasVotedThisWeek, voteForRestaurant, supabaseConnection } = useAppData();
  const sorted = [...restaurants].sort((a, b) => b.weeklyVotes - a.weeklyVotes);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Weekly poll</Text>
      <Text style={[typography.subtitle, styles.pollIntro]}>
        One vote per week. Leaders climb the ladder and get featured on Home.
      </Text>
      <ConnectionBanner connection={supabaseConnection} compact />
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          const rank = index + 1;
          const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
          return (
            <View style={styles.pollCard}>
              <View style={styles.pollRank}>
                <Text style={styles.pollRankText}>
                  {medal ?? `#${rank}`}
                </Text>
              </View>
              <View style={styles.pollBody}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardMeta}>{item.weeklyVotes} votes</Text>
                <Pressable
                  disabled={hasVotedThisWeek}
                  onPress={() => void voteForRestaurant(item.id)}
                  style={[styles.voteBtn, hasVotedThisWeek && styles.voteBtnDisabled]}
                >
                  <Ionicons
                    name={hasVotedThisWeek ? "checkmark-done" : "thumbs-up-outline"}
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.voteBtnText}>
                    {hasVotedThisWeek ? "Vote locked in" : "Vote"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function AccountScreen() {
  const {
    hasSupabaseAuth,
    session,
    userProfile,
    role,
    setRole,
    signOut,
    updateProfile,
    refreshUserProfile,
    refreshMyProfileChangeRequest,
    myPendingProfileChangeRequest,
    submitProfileChangeRequest,
    activeRestaurantId,
    setActiveRestaurantId,
    restaurants,
    addRestaurant,
    orders,
    refreshOrders,
    supabaseConnection,
    refreshSupabase,
  } = useAppData();
  const isFocused = useIsFocused();
  const myOrders = React.useMemo(() => {
    const uid = session?.user?.id;
    if (!uid) return orders;
    return orders.filter((o) => !o.customerUserId || o.customerUserId === uid);
  }, [orders, session?.user?.id]);
  const sortedMyOrders = React.useMemo(
    () => [...myOrders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [myOrders],
  );
  const [selectedOrderForQrId, setSelectedOrderForQrId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (role !== "customer") return;
    if (myOrders.length === 0) {
      setSelectedOrderForQrId(null);
      return;
    }
    if (myOrders.length === 1) {
      setSelectedOrderForQrId(myOrders[0].id);
      return;
    }
    setSelectedOrderForQrId((prev) => {
      if (prev && myOrders.some((o) => o.id === prev)) return prev;
      return null;
    });
  }, [myOrders, role]);

  const selectedOrderForQr = React.useMemo(
    () => (selectedOrderForQrId ? myOrders.find((o) => o.id === selectedOrderForQrId) : undefined),
    [myOrders, selectedOrderForQrId],
  );

  const [restaurantName, setRestaurantName] = React.useState("");
  const [restaurantCuisine, setRestaurantCuisine] = React.useState("");
  const [restaurantAddress, setRestaurantAddress] = React.useState("");
  const ownedRestaurantsForAccount = React.useMemo(() => {
    if (role !== "restaurant") return [];
    if (!hasSupabaseAuth) return restaurants;
    const uid = session?.user?.id;
    if (!uid) return [];
    return restaurants.filter((r) => r.ownerUserId === uid);
  }, [hasSupabaseAuth, restaurants, role, session?.user?.id]);
  const canRegisterVenue =
    role === "restaurant" &&
    (!hasSupabaseAuth || (Boolean(session?.user?.id) && ownedRestaurantsForAccount.length === 0));
  const [nameEdit, setNameEdit] = React.useState("");
  const [requestedRoleChoice, setRequestedRoleChoice] = React.useState<ProfileRequestableRole>("driver");
  const signedIn = Boolean(hasSupabaseAuth && session && userProfile);

  React.useEffect(() => {
    setNameEdit(userProfile?.fullName ?? "");
  }, [userProfile?.fullName]);

  React.useEffect(() => {
    if (!isFocused) return;
    if (!hasSupabaseAuth || !session?.user) return;
    void refreshUserProfile();
    if (role === "customer") {
      void refreshMyProfileChangeRequest();
      void refreshOrders();
    }
  }, [hasSupabaseAuth, isFocused, refreshMyProfileChangeRequest, refreshOrders, refreshUserProfile, role, session?.user]);

  React.useEffect(() => {
    if (!signedIn || role !== "customer" || !myPendingProfileChangeRequest) return;
    const interval = setInterval(() => {
      void refreshMyProfileChangeRequest();
      void refreshUserProfile();
    }, 12000);
    return () => clearInterval(interval);
  }, [myPendingProfileChangeRequest, refreshMyProfileChangeRequest, refreshUserProfile, role, signedIn]);

  function orderStatusLabel(status: string): string {
    if (status === "pending") return "Waiting for restaurant or admin approval";
    if (status === "accepted") return "Approved — show QR to driver";
    if (status === "driver_accepted") return "Driver accepted — meet for pickup";
    if (status === "picked_up") return "Picked up by driver";
    if (status === "completed") return "Completed";
    return status;
  }

  function customerOrderBadgeStyles(order: OrderTicket) {
    if (order.status === "pending") {
      return { wrap: styles.customerOrderBadgePending, text: styles.customerOrderBadgeTextPending };
    }
    return { wrap: styles.customerOrderBadgeSuccess, text: styles.customerOrderBadgeTextSuccess };
  }

  function roleLabel(value: Role): string {
    if (value === "customer") return "Customer";
    if (value === "driver") return "Driver";
    if (value === "restaurant") return "Restaurant";
    return "Admin";
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Account</Text>
      <ScrollView contentContainerStyle={styles.listContent}>
        <ConnectionBanner connection={supabaseConnection} onRetry={refreshSupabase} />
        {signedIn ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Your profile</Text>
            <Text style={styles.cardMeta}>{userProfile?.email ?? "—"}</Text>
            <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
              Signed in as <Text style={{ fontWeight: "800", color: colors.text }}>{roleLabel(role)}</Text>.
              {role === "customer"
                ? " You can request Driver or Restaurant access below; an admin must approve it."
                : " Your role is stored in Supabase."}
            </Text>
            {role === "customer" ? (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.infoTitle}>Request account type change</Text>
                {myPendingProfileChangeRequest ? (
                  <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                    Your request to become a{" "}
                    <Text style={{ fontWeight: "800", color: colors.text }}>
                      {myPendingProfileChangeRequest.requestedRole === "driver" ? "Driver" : "Restaurant"}
                    </Text>{" "}
                    is pending admin review. You will keep the customer experience until it is approved.
                  </Text>
                ) : (
                  <>
                    <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                      Choose the role you need. An admin will approve or reject your request.
                    </Text>
                    <View style={[styles.roleRow, { marginTop: spacing.sm }]}>
                      {(["driver", "restaurant"] as ProfileRequestableRole[]).map((value) => {
                        const selected = requestedRoleChoice === value;
                        return (
                          <Pressable
                            key={value}
                            onPress={() => setRequestedRoleChoice(value)}
                            style={[styles.roleChip, selected && styles.roleChipSelected]}
                          >
                            <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>
                              {value === "driver" ? "Driver" : "Restaurant"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Pressable
                      style={[styles.checkoutBtn, styles.inlineBtn, { marginTop: spacing.md }]}
                      onPress={() => {
                        void (async () => {
                          const res = await submitProfileChangeRequest(requestedRoleChoice);
                          if (!res.ok) Alert.alert("Request failed", res.reason);
                          else
                            Alert.alert(
                              "Request sent",
                              "An admin will review your request. Pull to refresh Account later, or revisit this tab after approval.",
                            );
                        })();
                      }}
                    >
                      <Text style={styles.checkoutBtnText}>Submit request</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : null}
            <Text style={[styles.infoTitle, { marginTop: spacing.md }]}>Display name</Text>
            <TextInput
              value={nameEdit}
              onChangeText={setNameEdit}
              placeholder="Your name"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
            />
            <Pressable
              style={[styles.checkoutBtn, styles.inlineBtn]}
              onPress={() => {
                void (async () => {
                  const res = await updateProfile(nameEdit);
                  if (!res.ok) Alert.alert("Could not save", res.reason);
                  else Alert.alert("Saved", "Your display name was updated.");
                })();
              }}
            >
              <Text style={styles.checkoutBtnText}>Save display name</Text>
            </Pressable>
            <Pressable
              style={[styles.outlineBtnDanger, styles.inlineBtn]}
              onPress={() => {
                void (async () => {
                  await signOut();
                })();
              }}
            >
              <Text style={styles.outlineBtnDangerText}>Sign out</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Demo mode</Text>
            <Text style={typography.subtitle}>
              Supabase env is not set. Switch roles below to preview each experience on this device.
            </Text>
            <View style={styles.roleRow}>
              {(["customer", "driver", "restaurant", "admin"] as Role[]).map((value) => {
                const selected = role === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setRole(value)}
                    style={[styles.roleChip, selected && styles.roleChipSelected]}
                  >
                    <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>
                      {roleLabel(value)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        {role === "restaurant" ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Your venue</Text>
            <Text style={typography.subtitle}>
              {hasSupabaseAuth
                ? "Signed-in operators only see their own venue, menu, and orders—not other businesses."
                : "Demo mode lists sample venues for UI preview."}
            </Text>
            {ownedRestaurantsForAccount.length === 0 ? (
              <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                {hasSupabaseAuth && session?.user?.id
                  ? "No venue linked yet. Submit the form below for admin approval."
                  : hasSupabaseAuth
                    ? "Sign in to register your restaurant."
                    : null}
              </Text>
            ) : (
              <View style={[styles.roleRow, { marginTop: spacing.sm }]}>
                {ownedRestaurantsForAccount.map((restaurant) => {
                  const selected = activeRestaurantId === restaurant.id;
                  return (
                    <Pressable
                      key={restaurant.id}
                      onPress={() => setActiveRestaurantId(restaurant.id)}
                      style={[styles.roleChip, selected && styles.roleChipSelected]}
                    >
                      <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>
                        {restaurant.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {canRegisterVenue ? (
              <>
                <Text style={[styles.infoTitle, { marginTop: spacing.md }]}>Register your restaurant</Text>
                <Text style={typography.subtitle}>
                  After admin approval your venue goes live. One venue per account.
                </Text>
                <TextInput
                  value={restaurantName}
                  onChangeText={setRestaurantName}
                  placeholder="Restaurant name"
                  placeholderTextColor={colors.textSubtle}
                  style={styles.input}
                />
                <TextInput
                  value={restaurantCuisine}
                  onChangeText={setRestaurantCuisine}
                  placeholder="Cuisine"
                  placeholderTextColor={colors.textSubtle}
                  style={styles.input}
                />
                <TextInput
                  value={restaurantAddress}
                  onChangeText={setRestaurantAddress}
                  placeholder="Address"
                  placeholderTextColor={colors.textSubtle}
                  style={styles.input}
                />
                <Pressable
                  style={[styles.checkoutBtn, styles.inlineBtn]}
                  onPress={async () => {
                    const result = await addRestaurant({
                      name: restaurantName,
                      cuisine: restaurantCuisine,
                      address: restaurantAddress,
                    });
                    if (!result.ok) {
                      Alert.alert("Unable to create", result.reason);
                      return;
                    }
                    setRestaurantName("");
                    setRestaurantCuisine("");
                    setRestaurantAddress("");
                    Alert.alert("Submitted", "Restaurant created and waiting for admin approval.");
                  }}
                >
                  <Text style={styles.checkoutBtnText}>Submit for approval</Text>
                </Pressable>
              </>
            ) : hasSupabaseAuth && session?.user?.id && ownedRestaurantsForAccount.length > 0 ? (
              <Text style={[typography.subtitle, { marginTop: spacing.md }]}>
                You already have a venue on this account. Manage it from Orders and Menu.
              </Text>
            ) : null}
          </View>
        ) : null}
        {!signedIn ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Backend</Text>
            <Text style={typography.subtitle}>
              With Supabase configured, sign-in opens the correct tabs from your profile role. Env keys:{" "}
              <Text style={styles.mono}>.env.local</Text>
            </Text>
            <View style={styles.codeBlock}>
              <Text style={styles.codeLine}>EXPO_PUBLIC_SUPABASE_URL</Text>
              <Text style={styles.codeLine}>EXPO_PUBLIC_SUPABASE_KEY</Text>
            </View>
          </View>
        ) : null}
        {role === "driver" ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Driver</Text>
            <Text style={typography.subtitle}>
              Use <Text style={{ fontWeight: "700" }}>Requests</Text> for nearby tickets and{" "}
              <Text style={{ fontWeight: "700" }}>Scan</Text> after you accept a delivery. Never hand over food
              before QR verification.
            </Text>
          </View>
        ) : null}
        {role === "admin" ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Admin</Text>
            <Text style={typography.subtitle}>
              Review customer role requests on the Profiles tab. Approve restaurants, reports, and orders from the
              Restaurants tab.
            </Text>
          </View>
        ) : null}
        {role === "customer" ? (
          <>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>My orders</Text>
              <Text style={typography.subtitle}>
                {sortedMyOrders.length > 1
                  ? "Tap a ticket to select it, then scroll to Pickup QR for that order."
                  : "Your tickets appear here. Pickup QR shows below when one is ready."}
              </Text>
              {sortedMyOrders.length === 0 ? (
                <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                  You have not placed an order yet.
                </Text>
              ) : (
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  {sortedMyOrders.map((order) => {
                    const restaurant = restaurants.find((r) => r.id === order.restaurantId);
                    const selected = order.id === selectedOrderForQrId;
                    const badge = customerOrderBadgeStyles(order);
                    return (
                      <Pressable
                        key={order.id}
                        onPress={() => setSelectedOrderForQrId(order.id)}
                        style={[styles.orderSelectRow, selected ? styles.orderSelectRowSelected : null]}
                      >
                        <View style={styles.customerOrderStatusRow}>
                          <View style={[styles.customerOrderBadge, badge.wrap]}>
                            <Text style={[styles.customerOrderBadgeText, badge.text]}>
                              {orderStatusLabel(order.status)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.cardMeta}>{restaurant?.name ?? "Restaurant"}</Text>
                        <Text style={styles.cardMeta}>Ticket: {order.id}</Text>
                        <Text style={styles.cardMeta}>Total: ${order.total.toFixed(2)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Pickup QR code</Text>
              <Text style={typography.subtitle}>
                After a restaurant or admin approves the selected order, the pickup code appears here. The driver scans
                it before handing over your food.
              </Text>
              {sortedMyOrders.length > 1 && selectedOrderForQrId == null ? (
                <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                  Select an order above to view its pickup QR.
                </Text>
              ) : null}
              {selectedOrderForQr &&
              (selectedOrderForQr.qrCode?.trim() || selectedOrderForQr.id.trim()).length > 0 &&
              (selectedOrderForQr.status === "accepted" || selectedOrderForQr.status === "driver_accepted") ? (
                <View style={styles.qrWrap}>
                  <QRCode
                    value={(selectedOrderForQr.qrCode ?? selectedOrderForQr.id).trim()}
                    size={180}
                    color={colors.text}
                    backgroundColor={colors.surface}
                  />
                  <Text style={styles.qrLabel}>Code: {selectedOrderForQr.qrCode}</Text>
                  {selectedOrderForQr.status === "driver_accepted" ? (
                    <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                      Driver accepted this delivery—show this screen for the final scan.
                    </Text>
                  ) : null}
                </View>
              ) : selectedOrderForQr && selectedOrderForQr.status === "pending" ? (
                <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                  This ticket is still waiting for approval. The QR will appear here once it is accepted.
                </Text>
              ) : selectedOrderForQr &&
                (selectedOrderForQr.status === "accepted" || selectedOrderForQr.status === "driver_accepted") ? (
                <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                  Approved—waiting for QR on the server. Pull to refresh Account or wait a few seconds.
                </Text>
              ) : selectedOrderForQr ? (
                <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                  This order no longer needs a pickup QR (already handed off or completed).
                </Text>
              ) : null}
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Pickup rule</Text>
              <View style={styles.driverWarningRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.success} />
                <Text style={styles.customerRuleText}>
                  Driver must scan your QR before handing over your food.
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CustomerTabs() {
  const { supabaseConnection } = useAppData();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
            Discover: "sparkles-outline",
            Account: "person-circle-outline",
          };
          const name = map[route.name] ?? "ellipse-outline";
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Discover" component={HomeScreen} />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarBadge:
            supabaseConnection.status === "connected"
              ? undefined
              : supabaseConnection.status === "checking"
                ? undefined
                : "!",
        }}
      />
    </Tab.Navigator>
  );
}

function DriverRequestsScreen({ navigation }: { navigation: any }) {
  const responsive = useResponsiveLayout();
  const {
    orders,
    restaurants,
    distanceToRestaurantKm,
    refreshLocation,
    userLocation,
    locationStatus,
    setManualLocation,
    acceptDelivery,
  } = useAppData();
  const [manualLocationOpen, setManualLocationOpen] = React.useState(false);
  const [manualLatitude, setManualLatitude] = React.useState("");
  const [manualLongitude, setManualLongitude] = React.useState("");

  useFocusEffect(
    React.useCallback(() => {
      void refreshLocation();
    }, [refreshLocation]),
  );

  const deliveryCandidates = useMemo(() => {
    const rows = orders
      .filter((order) => order.status === "accepted" || order.status === "driver_accepted")
      .map((order) => {
        const restaurant = restaurants.find((r) => r.id === order.restaurantId);
        const distanceKm = restaurant ? distanceToRestaurantKm(restaurant) : null;
        return { order, restaurant, distanceKm };
      });
    return rows.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }, [orders, restaurants, distanceToRestaurantKm]);
  const readyToAccept = deliveryCandidates.filter((row) => row.order.status === "accepted").length;
  const acceptedByDriver = deliveryCandidates.filter((row) => row.order.status === "driver_accepted").length;
  const completedToday = orders.filter((order) => order.status === "picked_up").length;
  const hasActiveLocation = locationStatus === "granted";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Delivery requests</Text>
      <View style={[styles.kpiRow, responsive.isNarrow && styles.kpiRowStack]}>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>{readyToAccept}</Text>
          <Text style={styles.kpiLabel}>Awaiting driver accept</Text>
        </View>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>{acceptedByDriver}</Text>
          <Text style={styles.kpiLabel}>Accepted by you</Text>
        </View>
      </View>
      <LocationSection
        locationStatus={locationStatus}
        locationName={userLocation?.name ?? null}
        onUseCurrentLocation={() => void refreshLocation()}
        onManualLocation={() => {
          setManualLatitude(userLocation ? String(userLocation.latitude) : "");
          setManualLongitude(userLocation ? String(userLocation.longitude) : "");
          setManualLocationOpen(true);
        }}
      />
      <FlatList
        data={deliveryCandidates}
        keyExtractor={(row) => row.order.id}
        contentContainerStyle={responsive.contentContainerStyle}
        ListEmptyComponent={
          <View style={[styles.infoCard, styles.driverEmptyCard]}>
            <Ionicons name="bicycle-outline" size={32} color={colors.textSubtle} />
            <Text style={[typography.subtitle, styles.driverEmptyText]}>
              No approved pickup tickets right now.
            </Text>
          </View>
        }
        renderItem={({ item: row }) => {
          const item = row.order;
          const restaurant = row.restaurant;
          return (
            <View style={[styles.infoCard, styles.driverTicketCard]}>
              <View style={styles.driverCardTop}>
                <View>
                  <Text style={styles.cardTitle}>{restaurant?.name ?? "Restaurant"}</Text>
                  <Text style={styles.cardMeta}>Ticket: {item.id}</Text>
                  {hasActiveLocation && row.distanceKm != null ? (
                    <Text style={styles.cardMeta}>{row.distanceKm.toFixed(1)} km away</Text>
                  ) : null}
                </View>
                <View style={styles.driverStatusChip}>
                  <Ionicons name="time-outline" size={14} color={colors.warning} />
                  <Text style={styles.driverStatusText}>
                    {item.status === "accepted" ? "Awaiting driver accept" : "Ready to scan"}
                  </Text>
                </View>
              </View>
              <View style={styles.driverQrLine}>
                <Ionicons name="qr-code-outline" size={14} color={colors.textSubtle} />
                <Text style={styles.cardMeta}>Customer QR: {item.qrCode}</Text>
              </View>
              <View style={styles.driverWarningRow}>
                <Ionicons name="warning-outline" size={14} color={colors.error} />
                <Text style={styles.driverWarningText}>Do not hand over food until QR is verified.</Text>
              </View>
              <Pressable
                style={[styles.outlineBtn, styles.inlineBtn]}
                onPress={() => {
                  if (restaurant?.latitude == null || restaurant?.longitude == null) {
                    Alert.alert("No route", "Restaurant coordinates are missing for this ticket.");
                    return;
                  }
                  void Linking.openURL(
                    buildGoogleRouteUrl({
                      latitude: restaurant.latitude,
                      longitude: restaurant.longitude,
                    }),
                  );
                }}
              >
                <Text style={styles.outlineBtnText}>Route to restaurant</Text>
              </Pressable>
              <Pressable
                style={[styles.outlineBtn, styles.inlineBtn]}
                onPress={() => {
                  if (item.customerLatitude == null || item.customerLongitude == null) {
                    Alert.alert("No route", "Customer location not available on this order.");
                    return;
                  }
                  void Linking.openURL(
                    buildGoogleRouteUrl({
                      latitude: item.customerLatitude,
                      longitude: item.customerLongitude,
                    }),
                  );
                }}
              >
                <Text style={styles.outlineBtnText}>Route to customer</Text>
              </Pressable>
              {item.status === "accepted" ? (
                <Pressable
                  style={[styles.checkoutBtn, styles.inlineBtn]}
                  onPress={() => {
                    void (async () => {
                      const result = await acceptDelivery(item.id);
                      if (!result.ok) Alert.alert("Cannot accept delivery", result.reason);
                    })();
                  }}
                >
                  <Text style={styles.checkoutBtnText}>Accept delivery</Text>
                </Pressable>
              ) : (
                <Pressable style={[styles.checkoutBtn, styles.inlineBtn]} onPress={() => navigation.navigate("Scan")}>
                  <Text style={styles.checkoutBtnText}>Go to scan page</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
      <Modal
        visible={manualLocationOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setManualLocationOpen(false)}
      >
        <View style={styles.focusVideoBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setManualLocationOpen(false)} />
          <View style={styles.manualLocationCard}>
            <Text style={styles.infoTitle}>Set manual location</Text>
            <Text style={styles.cardMeta}>Use your current coordinates when GPS is unavailable.</Text>
            <TextInput
              value={manualLatitude}
              onChangeText={setManualLatitude}
              placeholder="Latitude"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              value={manualLongitude}
              onChangeText={setManualLongitude}
              placeholder="Longitude"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
              style={styles.input}
            />
            <Pressable
              style={[styles.checkoutBtn, styles.inlineBtn]}
              onPress={() => {
                void (async () => {
                  const lat = Number(manualLatitude.trim());
                  const lng = Number(manualLongitude.trim());
                  const result = await setManualLocation(lat, lng);
                  if (!result.ok) {
                    Alert.alert("Invalid location", result.reason);
                    return;
                  }
                  setManualLocationOpen(false);
                })();
              }}
            >
              <Text style={styles.checkoutBtnText}>Save manual location</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DriverScanScreen() {
  const { orders, restaurants, pickupOrder } = useAppData();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanningOrderId, setScanningOrderId] = React.useState<string | null>(null);
  const [scanMessage, setScanMessage] = React.useState<string | null>(null);
  const [scanStatus, setScanStatus] = React.useState<"success" | "error" | null>(null);
  const acceptedOrders = orders.filter((order) => order.status === "driver_accepted");

  function onBarcodeScanned(result: BarcodeScanningResult) {
    if (!scanningOrderId) return;
    const targetOrder = acceptedOrders.find((order) => order.id === scanningOrderId);
    if (!targetOrder) return;
    if (result.data === targetOrder.qrCode) {
      void (async () => {
        await pickupOrder(targetOrder.id);
        setScanMessage("QR verified. Food can be handed over.");
        setScanStatus("success");
        setScanningOrderId(null);
      })();
      return;
    }
    setScanMessage("QR does not match this order.");
    setScanStatus("error");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Scan pickup QR</Text>
      <View style={styles.infoCard}>
        <Text style={typography.subtitle}>
          Select a delivery you accepted, then scan the customer's QR code before giving food.
        </Text>
        <View style={styles.driverWarningRow}>
          <Ionicons name="warning-outline" size={14} color={colors.error} />
          <Text style={styles.driverWarningText}>Do not hand over food until QR is verified.</Text>
        </View>
      </View>
      <FlatList
        data={acceptedOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={[styles.infoCard, styles.driverEmptyCard]}>
            <Text style={typography.subtitle}>No orders ready to scan.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const restaurant = restaurants.find((r) => r.id === item.restaurantId);
          const selected = scanningOrderId === item.id;
          return (
            <Pressable
              style={[styles.infoCard, selected && styles.scanOrderSelected]}
              onPress={async () => {
                if (!cameraPermission?.granted) {
                  const next = await requestCameraPermission();
                  if (!next.granted) {
                    setScanMessage("Camera permission is required to scan QR.");
                    setScanStatus("error");
                    return;
                  }
                }
                setScanningOrderId(item.id);
                setScanMessage(null);
                setScanStatus(null);
              }}
            >
              <Text style={styles.cardTitle}>{restaurant?.name ?? "Restaurant"}</Text>
              <Text style={styles.cardMeta}>Ticket: {item.id}</Text>
              <Text style={styles.cardMeta}>Tap to start scanner for this order</Text>
              <Pressable
                style={[styles.outlineBtn, styles.inlineBtn]}
                onPress={() => {
                  if (restaurant?.latitude == null || restaurant?.longitude == null) {
                    Alert.alert("No route", "Restaurant coordinates are missing for this ticket.");
                    return;
                  }
                  void Linking.openURL(
                    buildGoogleRouteUrl({
                      latitude: restaurant.latitude,
                      longitude: restaurant.longitude,
                    }),
                  );
                }}
              >
                <Text style={styles.outlineBtnText}>Route to restaurant</Text>
              </Pressable>
              <Pressable
                style={[styles.outlineBtn, styles.inlineBtn]}
                onPress={() => {
                  if (item.customerLatitude == null || item.customerLongitude == null) {
                    Alert.alert("No route", "Customer location not available on this order.");
                    return;
                  }
                  void Linking.openURL(
                    buildGoogleRouteUrl({
                      latitude: item.customerLatitude,
                      longitude: item.customerLongitude,
                    }),
                  );
                }}
              >
                <Text style={styles.outlineBtnText}>Route to customer</Text>
              </Pressable>
            </Pressable>
          );
        }}
      />
      {scanMessage ? (
        <Text style={[styles.scanMessage, scanStatus === "success" ? styles.scanSuccess : styles.scanError]}>
          {scanMessage}
        </Text>
      ) : null}
      {scanningOrderId ? (
        <View style={styles.scannerPanel}>
          <Text style={styles.scannerTitle}>Scanning selected order</Text>
          <Text style={styles.scannerSubtitle}>Align QR code within frame.</Text>
          <CameraView style={styles.cameraView} facing="back" onBarcodeScanned={onBarcodeScanned} />
          <Pressable style={styles.scannerCloseBtn} onPress={() => setScanningOrderId(null)}>
            <Text style={styles.scannerCloseText}>Close scanner</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function DriverEarningsScreen() {
  const { orders } = useAppData();
  const completedDeliveries = orders.filter((order) => order.status === "picked_up").length;
  const activePickups = orders.filter((order) => order.status === "driver_accepted").length;
  const gross = orders
    .filter((order) => order.status === "picked_up")
    .reduce((sum, order) => sum + order.total * 0.12, 0);
  const avgPayout = completedDeliveries === 0 ? 0 : gross / completedDeliveries;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Earnings</Text>
      <View style={styles.kpiRow}>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>{completedDeliveries}</Text>
          <Text style={styles.kpiLabel}>Completed</Text>
        </View>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>${gross.toFixed(2)}</Text>
          <Text style={styles.kpiLabel}>Estimated payout</Text>
        </View>
      </View>
      <View style={styles.kpiRow}>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>{activePickups}</Text>
          <Text style={styles.kpiLabel}>Active pickups</Text>
        </View>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>${avgPayout.toFixed(2)}</Text>
          <Text style={styles.kpiLabel}>Avg payout/order</Text>
        </View>
      </View>
      <View style={styles.infoCard}>
        <Text style={typography.subtitle}>
          Payout uses demo rate of 12% per completed pickup. This can be replaced by your live settlement logic.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function DriverTabs() {
  return (
    <DriverTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
            Requests: "bicycle-outline",
            Scan: "qr-code-outline",
            Earnings: "cash-outline",
            Account: "person-circle-outline",
          };
          const name = map[route.name] ?? "ellipse-outline";
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <DriverTab.Screen name="Requests" component={DriverRequestsScreen} />
      <DriverTab.Screen name="Scan" component={DriverScanScreen} />
      <DriverTab.Screen name="Earnings" component={DriverEarningsScreen} />
      <DriverTab.Screen name="Account" component={AccountScreen} />
    </DriverTab.Navigator>
  );
}

function AdminProfileRequestsScreen() {
  const {
    pendingProfileChangeRequestsForAdmin,
    resolveProfileChangeRequest,
    refreshAdminProfileChangeRequests,
    role,
    supabaseConnection,
  } = useAppData();

  useFocusEffect(
    React.useCallback(() => {
      void refreshAdminProfileChangeRequests();
    }, [refreshAdminProfileChangeRequests]),
  );

  function requestedRoleLabel(value: ProfileRequestableRole): string {
    return value === "driver" ? "Driver" : "Restaurant";
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Profile requests</Text>
      <ScrollView contentContainerStyle={styles.listContent}>
        <View style={styles.infoCard}>
          <Text style={typography.subtitle}>
            Customers ask to become drivers or restaurant operators. Approving updates their Supabase profile role
            immediately.
          </Text>
        </View>
        {pendingProfileChangeRequestsForAdmin.length === 0 ? (
          <View style={styles.infoCard}>
            <Text style={typography.subtitle}>No pending profile change requests.</Text>
            {supabaseConnection.status === "connected" && role === "admin" ? (
              <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
                If you see rows in the Supabase Table Editor but not here, the editor uses the service role (bypasses
                RLS). This app only loads other users{"'"} requests when your profile has{" "}
                <Text style={{ fontWeight: "700" }}>role = admin</Text> in the{" "}
                <Text style={{ fontWeight: "700" }}>profiles</Text> table. Update your row, sign out, sign back in,
                then open this tab again.
              </Text>
            ) : null}
          </View>
        ) : (
          pendingProfileChangeRequestsForAdmin.map((req) => (
            <View key={req.id} style={styles.infoCard}>
              <Text style={styles.cardTitle}>{req.requesterFullName?.trim() || "No display name"}</Text>
              <Text style={styles.cardMeta}>User id: {req.userId}</Text>
              <Text style={styles.cardMeta}>Requested role: {requestedRoleLabel(req.requestedRole)}</Text>
              <Text style={styles.cardMeta}>Submitted: {new Date(req.createdAt).toLocaleString()}</Text>
              <View style={styles.rowActions}>
                <Pressable
                  style={[styles.checkoutBtn, styles.inlineBtn]}
                  onPress={() => {
                    void (async () => {
                      const result = await resolveProfileChangeRequest(req.id, "approve");
                      if (!result.ok) Alert.alert("Cannot approve", result.reason);
                      else Alert.alert("Approved", "Their account type has been updated.");
                    })();
                  }}
                >
                  <Text style={styles.checkoutBtnText}>Approve</Text>
                </Pressable>
                <Pressable
                  style={[styles.outlineBtnDanger, styles.inlineBtn]}
                  onPress={() => {
                    void (async () => {
                      const result = await resolveProfileChangeRequest(req.id, "reject");
                      if (!result.ok) Alert.alert("Cannot reject", result.reason);
                    })();
                  }}
                >
                  <Text style={styles.outlineBtnDangerText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AdminOverviewScreen() {
  const { restaurants, orders } = useAppData();
  const pendingApprovals = restaurants.filter((r) => r.moderationStatus === "pending").length;
  const reportedRestaurants = restaurants.filter((r) => r.reportCount > 0).length;
  const frozenRestaurants = restaurants.filter((r) => r.moderationStatus === "frozen").length;
  const activeOrders = orders.filter((o) => o.status === "pending" || o.status === "accepted").length;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Admin overview</Text>
      <View style={styles.kpiRow}>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>{pendingApprovals}</Text>
          <Text style={styles.kpiLabel}>Pending approvals</Text>
        </View>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>{reportedRestaurants}</Text>
          <Text style={styles.kpiLabel}>Reported</Text>
        </View>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>{frozenRestaurants}</Text>
          <Text style={styles.kpiLabel}>Frozen</Text>
        </View>
      </View>
      <View style={styles.infoCard}>
        <Text style={typography.subtitle}>
          Active orders in system: {activeOrders}. Use the Profile requests tab for customer role changes; this tab
          summarizes restaurants and orders.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function AdminRestaurantsScreen() {
  const { restaurants, orders, acceptOrder, approveRestaurant, freezeRestaurant, deleteRestaurant } = useAppData();
  const pendingRestaurants = restaurants.filter((restaurant) => restaurant.moderationStatus === "pending");
  const reportedRestaurants = restaurants.filter((restaurant) => restaurant.reportCount > 0);
  const pendingOrders = orders.filter((order) => order.status === "pending");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Restaurant moderation</Text>
      <ScrollView contentContainerStyle={styles.listContent}>
        <Text style={styles.sectionLabel}>Pending restaurant approvals</Text>
        {pendingRestaurants.length === 0 ? (
          <View style={styles.infoCard}>
            <Text style={typography.subtitle}>No pending restaurant approvals.</Text>
          </View>
        ) : (
          pendingRestaurants.map((item) => (
            <View key={item.id} style={styles.infoCard}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>{item.cuisine} · {item.address}</Text>
              <View style={styles.rowActions}>
                <Pressable
                  style={[styles.checkoutBtn, styles.inlineBtn]}
                  onPress={() => {
                    void (async () => {
                      const result = await approveRestaurant(item.id);
                      if (!result.ok) Alert.alert("Cannot approve", result.reason);
                    })();
                  }}
                >
                  <Text style={styles.checkoutBtnText}>Approve restaurant</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Text style={styles.sectionLabel}>Reported restaurants</Text>
        {reportedRestaurants.length === 0 ? (
          <View style={styles.infoCard}>
            <Text style={typography.subtitle}>No reported restaurants.</Text>
          </View>
        ) : (
          reportedRestaurants.map((item) => (
            <View key={item.id} style={styles.infoCard}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>Reports: {item.reportCount}</Text>
              <Text style={styles.cardMeta}>Status: {item.moderationStatus}</Text>
              <View style={styles.rowActions}>
                <Pressable
                  style={[styles.outlineBtnDanger, styles.inlineBtn]}
                  onPress={() => {
                    void (async () => {
                      const result = await freezeRestaurant(item.id);
                      if (!result.ok) Alert.alert("Cannot freeze", result.reason);
                    })();
                  }}
                >
                  <Text style={styles.outlineBtnDangerText}>Freeze</Text>
                </Pressable>
                <Pressable
                  style={[styles.outlineBtnDanger, styles.inlineBtn]}
                  onPress={async () => {
                    const result = await deleteRestaurant(item.id);
                    if (!result.ok) Alert.alert("Cannot delete", result.reason);
                  }}
                >
                  <Text style={styles.outlineBtnDangerText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Text style={styles.sectionLabel}>Incoming order tickets</Text>
        {pendingOrders.length === 0 ? (
          <View style={styles.infoCard}>
            <Text style={typography.subtitle}>No pending tickets.</Text>
          </View>
        ) : (
          pendingOrders.map((order) => {
            const restaurant = restaurants.find((r) => r.id === order.restaurantId);
            return (
              <View key={order.id} style={styles.infoCard}>
                <Text style={styles.cardTitle}>{restaurant?.name ?? "Restaurant"}</Text>
                <Text style={styles.cardMeta}>Ticket: {order.id}</Text>
                <Text style={styles.cardMeta}>Total: ${order.total.toFixed(2)}</Text>
                <Pressable
                  style={[styles.checkoutBtn, styles.inlineBtn]}
                  onPress={() => {
                    void (async () => {
                      const result = await acceptOrder(order.id);
                      if (!result.ok) {
                        Alert.alert("Cannot accept order", result.reason);
                      }
                    })();
                  }}
                >
                  <Text style={styles.checkoutBtnText}>Approve & generate QR</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AdminTabs() {
  return (
    <AdminTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
            Overview: "analytics-outline",
            ProfileRequests: "people-outline",
            Restaurants: "restaurant-outline",
            Account: "person-circle-outline",
          };
          const name = map[route.name] ?? "ellipse-outline";
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <AdminTab.Screen name="Overview" component={AdminOverviewScreen} />
      <AdminTab.Screen
        name="ProfileRequests"
        component={AdminProfileRequestsScreen}
        options={{ tabBarLabel: "Profiles" }}
      />
      <AdminTab.Screen name="Restaurants" component={AdminRestaurantsScreen} />
      <AdminTab.Screen name="Account" component={AccountScreen} />
    </AdminTab.Navigator>
  );
}

function RestaurantOrdersScreen() {
  const { orders, restaurants, activeRestaurantId, acceptOrder } = useAppData();
  const scopedOrders = activeRestaurantId
    ? orders.filter((order) => order.restaurantId === activeRestaurantId)
    : [];
  const pendingOrders = scopedOrders.filter((order) => order.status === "pending");
  const acceptedOrders = scopedOrders.filter((order) => order.status === "accepted");
  const activeRestaurant = restaurants.find((restaurant) => restaurant.id === activeRestaurantId);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Restaurant orders</Text>
      <View style={styles.infoCard}>
        <Text style={typography.subtitle}>
          {activeRestaurant
            ? `Viewing orders for ${activeRestaurant.name}.`
            : "Choose a restaurant in Account to view scoped orders."}
        </Text>
      </View>
      <View style={styles.kpiRow}>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>{pendingOrders.length}</Text>
          <Text style={styles.kpiLabel}>Pending</Text>
        </View>
        <View style={styles.kpiCardLarge}>
          <Text style={styles.kpiValue}>{acceptedOrders.length}</Text>
          <Text style={styles.kpiLabel}>Accepted</Text>
        </View>
      </View>
      <FlatList
        data={pendingOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.infoCard}>
            <Text style={typography.subtitle}>No pending orders at the moment.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const restaurant = restaurants.find((r) => r.id === item.restaurantId);
          return (
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>{restaurant?.name ?? "Restaurant"}</Text>
              <Text style={styles.cardMeta}>Ticket: {item.id}</Text>
              <Text style={styles.cardMeta}>Total: ${item.total.toFixed(2)}</Text>
              <Pressable
                style={[styles.checkoutBtn, styles.inlineBtn]}
                onPress={() => {
                  void (async () => {
                    const result = await acceptOrder(item.id);
                    if (!result.ok) {
                      Alert.alert("Cannot accept order", result.reason);
                    }
                  })();
                }}
              >
                <Text style={styles.checkoutBtnText}>Accept order & generate QR</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function RestaurantMenuScreen() {
  const responsive = useResponsiveLayout();
  const { restaurants, menuItems, activeRestaurantId, addMenuItem, deleteMenuItem } = useAppData();
  const restaurant = restaurants.find((item) => item.id === activeRestaurantId);
  const scopedMenuItems = activeRestaurantId
    ? menuItems.filter((item) => item.restaurantId === activeRestaurantId)
    : [];
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [videoUrl, setVideoUrl] = React.useState("");
  const [videoFile, setVideoFile] = React.useState<{
    uri: string;
    name?: string;
    mimeType?: string;
    byteSize?: number;
    webFile?: Blob;
  } | null>(null);
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={[typography.hero, styles.screenTitle]}>Restaurant menu</Text>
      <ScrollView contentContainerStyle={responsive.contentContainerStyle}>
        {restaurant ? (
          <>
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>{restaurant.name}</Text>
              <Text style={styles.cardMeta}>{restaurant.cuisine} · {restaurant.address}</Text>
              <Text style={styles.cardMeta}>Menu items: {scopedMenuItems.length}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Add menu item</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
              />
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="Price"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                keyboardType="decimal-pad"
              />
              <TextInput
                value={videoUrl}
                onChangeText={setVideoUrl}
                placeholder="Video URL (optional if file selected)"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
              />
              <Pressable
                style={[styles.outlineBtn, styles.inlineBtn]}
                onPress={async () => {
                  const result = await DocumentPicker.getDocumentAsync({
                    type: "video/*",
                    copyToCacheDirectory: true,
                  });
                  if (result.canceled) return;
                  const file = result.assets[0];
                  const webFile =
                    Platform.OS === "web" &&
                    "file" in file &&
                    (file as { file?: Blob }).file instanceof Blob
                      ? (file as { file?: Blob }).file
                      : undefined;
                  setVideoFile({
                    uri: file.uri,
                    name: file.name,
                    mimeType: file.mimeType ?? undefined,
                    byteSize: typeof file.size === "number" ? file.size : undefined,
                    webFile,
                  });
                }}
              >
                <Text style={styles.outlineBtnText}>
                  {videoFile?.name ? `Selected: ${videoFile.name}` : "Select menu video"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.checkoutBtn, styles.inlineBtn]}
                onPress={async () => {
                  const parsedPrice = Number(price);
                  if (Number.isNaN(parsedPrice)) {
                    Alert.alert("Invalid price", "Enter a valid numeric price.");
                    return;
                  }
                  if (!videoFile && !videoUrl.trim()) {
                    Alert.alert("Video required", "Select a video file or provide a video URL.");
                    return;
                  }
                  if (videoFile && typeof videoFile.byteSize === "number" && videoFile.byteSize <= 0) {
                    Alert.alert("Invalid video", "This file is empty. Please choose a different video.");
                    return;
                  }
                  const result = await addMenuItem({
                    restaurantId: restaurant.id,
                    title,
                    description,
                    price: parsedPrice,
                    videoUrl,
                    videoFile: videoFile ?? undefined,
                  });
                  if (!result.ok) {
                    Alert.alert("Cannot add menu item", result.reason);
                    return;
                  }
                  setTitle("");
                  setDescription("");
                  setPrice("");
                  setVideoUrl("");
                  setVideoFile(null);
                }}
              >
                <Text style={styles.checkoutBtnText}>Add menu item</Text>
              </Pressable>
            </View>
            {scopedMenuItems.map((item) => (
              <View key={item.id} style={styles.infoCard}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardMeta}>{item.description}</Text>
                <Text style={styles.cardMeta}>${item.price.toFixed(2)}</Text>
                <Pressable
                  style={[styles.outlineBtnDanger, styles.inlineBtn]}
                  onPress={async () => {
                    const result = await deleteMenuItem(item.id);
                    if (!result.ok) {
                      Alert.alert("Cannot delete menu item", result.reason);
                    }
                  }}
                >
                  <Text style={styles.outlineBtnDangerText}>Delete from menu</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.infoCard}>
            <Text style={typography.subtitle}>Choose a restaurant in Account to view its menu.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RestaurantTabs() {
  return (
    <RestaurantTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
            Orders: "receipt-outline",
            Menu: "restaurant-outline",
            Account: "person-circle-outline",
          };
          const name = map[route.name] ?? "ellipse-outline";
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <RestaurantTab.Screen name="Orders" component={RestaurantOrdersScreen} />
      <RestaurantTab.Screen name="Menu" component={RestaurantMenuScreen} />
      <RestaurantTab.Screen name="Account" component={AccountScreen} />
    </RestaurantTab.Navigator>
  );
}

function RoleTabs() {
  const { role } = useAppData();
  if (role === "driver") return <DriverTabs />;
  if (role === "admin") return <AdminTabs />;
  if (role === "restaurant") return <RestaurantTabs />;
  return <CustomerTabs />;
}

export function RootNavigator() {
  const { hasSupabaseAuth, authStatus } = useAppData();

  if (hasSupabaseAuth && authStatus === "loading") {
    return (
      <SafeAreaView style={[styles.safe, styles.authLoading]} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[typography.subtitle, styles.authLoadingText]}>Restoring your session…</Text>
      </SafeAreaView>
    );
  }

  if (hasSupabaseAuth && authStatus === "guest") {
    return (
      <AuthStackNav.Navigator
        screenOptions={{
          contentStyle: { backgroundColor: colors.bg },
          headerStyle: { backgroundColor: colors.bgElevated },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
        }}
      >
        <AuthStackNav.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
        <AuthStackNav.Screen name="SignUp" component={SignUpScreen} options={{ title: "Create account" }} />
      </AuthStackNav.Navigator>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.bg },
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Tabs" component={RoleTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Restaurant"
        component={RestaurantScreen}
        options={{ title: "Menu" }}
      />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ title: "Checkout" }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl * 2 },
  homeHeader: { marginBottom: spacing.md },
  discoverTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cartTopBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cartTopBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  cartTopBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  tagline: { marginTop: spacing.xs, marginBottom: spacing.md },
  kpiRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  kpiRowStack: { flexDirection: "column" },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  kpiCardLarge: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  kpiValue: { color: colors.text, fontWeight: "800", fontSize: 20 },
  kpiLabel: { color: colors.textSubtle, fontSize: 12, marginTop: 2 },
  sectionLabel: {
    ...typography.label,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  restaurantCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardPressed: { opacity: 0.92, borderColor: colors.accentMuted },
  cardTop: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accentGlow,
    borderWidth: 1,
    borderColor: "rgba(255, 92, 61, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  avatarText: { color: colors.accent, fontSize: 20, fontWeight: "800" },
  cardTopText: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  cardMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  cardDistance: { color: colors.demo, fontSize: 12, marginTop: 4 },
  cardSocialRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  cardLikeStat: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardLikeStatText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  cardLikeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: colors.surface2,
  },
  cardLikeBtnDone: {
    borderColor: "rgba(255, 92, 61, 0.35)",
    backgroundColor: colors.accentGlow,
  },
  cardLikeBtnText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.warningMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(245, 165, 36, 0.35)",
  },
  pillText: { color: colors.warning, fontSize: 12, fontWeight: "700" },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cardCta: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  votes: { color: colors.textMuted, fontSize: 13 },
  votesNum: { color: colors.text, fontWeight: "800" },
  screenTitle: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  summaryBar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  locationBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: colors.surface2,
  },
  locationBtnSmallText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  restaurantHero: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  restaurantEngageBlock: { marginTop: spacing.md, gap: spacing.sm },
  restaurantEngageRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  engageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.surface2,
  },
  engageChipActive: {
    borderColor: "rgba(255, 92, 61, 0.35)",
    backgroundColor: colors.accentGlow,
  },
  engageChipText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  engageHint: { flex: 1, minWidth: 120, color: colors.textSubtle, fontSize: 12, lineHeight: 16 },
  reportMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reportMetaText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  reportCooldownNote: { color: colors.textSubtle, fontSize: 12, lineHeight: 16 },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  menuVideoCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    height: 280,
  },
  menuVideo: { ...StyleSheet.absoluteFillObject },
  menuVideoTapZone: { ...StyleSheet.absoluteFillObject },
  menuVideoDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  menuVideoOverlay: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: spacing.xs,
  },
  menuVideoTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  menuVideoMeta: { color: colors.text, fontSize: 15, fontWeight: "700" },
  menuVideoDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: spacing.xs },
  menuTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  menuDesc: { color: colors.textMuted, fontSize: 14, marginTop: 4, lineHeight: 20 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: 4,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  feedHeader: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  feedList: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  feedCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  video: { ...StyleSheet.absoluteFillObject },
  videoPlaceholder: {
    backgroundColor: colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  videoPlaceholderText: { textAlign: "center", paddingHorizontal: spacing.md, color: colors.textMuted },
  feedDim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  feedOverlay: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  feedTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  feedMeta: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  feedBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  feedBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  focusVideoBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  focusVideoCard: {
    width: "100%",
    maxWidth: 720,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    overflow: "hidden",
  },
  focusVideoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  focusVideoTitle: { flex: 1, color: colors.text, fontWeight: "700", fontSize: 14, marginRight: spacing.sm },
  focusVideoCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  focusVideoPlayer: {
    width: "100%",
    aspectRatio: 9 / 16,
    backgroundColor: "#000",
  },
  manualLocationCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyCart: { alignItems: "center", paddingVertical: spacing.xl * 2, gap: spacing.md },
  cartCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: "center",
  },
  cartCardMain: { flex: 1 },
  cartLine: { color: colors.textSubtle, fontSize: 13, marginTop: 2 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyBtnText: { color: colors.text, fontSize: 20, fontWeight: "600", marginTop: -2 },
  qtyLabel: { color: colors.text, fontWeight: "800", minWidth: 24, textAlign: "center" },
  cartFooter: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  totalLabel: { color: colors.textSubtle, fontSize: 13, fontWeight: "600" },
  totalValue: { color: colors.text, fontSize: 28, fontWeight: "800", marginVertical: spacing.sm },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  quickCheckoutBtn: { marginTop: spacing.sm, alignSelf: "flex-start", paddingVertical: spacing.sm },
  checkoutBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  orderMessage: { color: colors.textMuted, marginBottom: spacing.sm, fontSize: 13 },
  inlineBtn: { marginTop: spacing.sm, paddingVertical: spacing.sm },
  screenActionBtn: { marginHorizontal: spacing.md },
  pollIntro: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  pollCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  pollRank: {
    width: 56,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  pollRankText: { fontSize: 18, fontWeight: "800", color: colors.text },
  pollBody: { flex: 1, padding: spacing.md },
  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.accent,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  voteBtnDisabled: { backgroundColor: colors.borderLight, opacity: 0.85 },
  voteBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  roleRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  roleChip: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  roleChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  roleChipText: { color: colors.text, fontWeight: "600" },
  roleChipTextSelected: { color: "#fff" },
  qrWrap: {
    marginTop: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  qrLabel: { color: colors.textMuted, fontFamily: "monospace", fontSize: 12 },
  infoTitle: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: spacing.sm },
  mono: { fontFamily: "monospace", color: colors.accent },
  codeBlock: {
    marginTop: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeLine: { fontFamily: "monospace", color: colors.demo, fontSize: 12 },
  tabBar: {
    backgroundColor: colors.bgElevated,
    borderTopColor: colors.border,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: { fontSize: 11, fontWeight: "600" },
  locationBtn: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  locationBtnText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  locationHint: { marginTop: spacing.xs, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  searchWrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  scanMessage: {
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 13,
    fontWeight: "600",
  },
  scanSuccess: { color: colors.success },
  scanError: { color: colors.error },
  driverEmptyCard: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  driverEmptyText: { textAlign: "center" },
  driverTicketCard: { gap: spacing.sm },
  driverCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  driverStatusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: "rgba(245, 165, 36, 0.35)",
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  driverStatusText: { color: colors.warning, fontSize: 12, fontWeight: "700" },
  driverQrLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  driverWarningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.xs,
    backgroundColor: colors.errorMuted,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.35)",
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  driverWarningText: { color: colors.error, fontSize: 12, fontWeight: "700", flex: 1 },
  customerRuleText: { color: colors.success, fontSize: 12, fontWeight: "700", flex: 1 },
  customerEmptyCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  customerEmptyText: { textAlign: "center" },
  customerHintCard: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.demoMuted,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.demoMuted,
  },
  customerHintText: { color: colors.demo, fontSize: 12, fontWeight: "600" },
  customerOrderStatusRow: { marginBottom: spacing.sm, marginTop: spacing.xs },
  customerOrderBadge: { alignSelf: "flex-start", borderRadius: radius.sm, paddingVertical: 5, paddingHorizontal: 10 },
  customerOrderBadgePending: { backgroundColor: colors.warningMuted, borderWidth: 1, borderColor: "rgba(245, 165, 36, 0.35)" },
  customerOrderBadgeSuccess: { backgroundColor: colors.successMuted, borderWidth: 1, borderColor: "rgba(61, 214, 140, 0.35)" },
  customerOrderBadgeText: { fontSize: 12, fontWeight: "700" },
  customerOrderBadgeTextPending: { color: colors.warning },
  customerOrderBadgeTextSuccess: { color: colors.success },
  orderSelectRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  orderSelectRowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentGlow,
  },
  scanOrderSelected: { borderColor: colors.accent, backgroundColor: colors.accentGlow },
  formHint: { color: colors.textSubtle, marginBottom: spacing.sm, fontSize: 13 },
  scannerPanel: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scannerTitle: { color: colors.text, fontWeight: "700", marginBottom: spacing.sm },
  scannerSubtitle: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  cameraView: {
    width: "100%",
    height: 260,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  scannerCloseBtn: {
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  scannerCloseText: { color: colors.text, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  inputRow: { flexDirection: "row", gap: spacing.sm },
  inputHalf: { flex: 1 },
  rowActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  outlineBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "transparent",
    paddingVertical: spacing.sm,
  },
  outlineBtnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  outlineBtnDanger: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accentMuted,
    borderRadius: radius.md,
    backgroundColor: "transparent",
    paddingVertical: spacing.sm,
  },
  outlineBtnDangerText: { color: colors.accent, fontWeight: "700", fontSize: 14 },
  outlineBtnDangerTextMuted: { color: colors.textSubtle },
  outlineBtnDisabled: { opacity: 0.45 },
  authLoading: { flex: 1, justifyContent: "center", alignItems: "center" },
  authLoadingText: { marginTop: spacing.md, textAlign: "center", paddingHorizontal: spacing.lg },
});
