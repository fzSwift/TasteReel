import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../context/AppContext";
import { colors, radius, spacing, typography } from "../theme";
import type { AuthStackParamList } from "./SignInScreen";

type Props = NativeStackScreenProps<AuthStackParamList, "SignUp">;

export function SignUpScreen({ navigation }: Props) {
  const { signUp } = useAppData();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
            <Text style={styles.backText}>Back to sign in</Text>
          </Pressable>

          <Text style={styles.title}>Create account</Text>
          <Text style={styles.sub}>
            You start as a customer. An admin can change your role in Supabase for driver, restaurant, or admin
            access.
          </Text>

          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full name"
            placeholderTextColor={colors.textSubtle}
            autoComplete="name"
            style={styles.input}
          />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password (min 6 characters)"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            autoComplete="new-password"
            style={styles.input}
          />

          <Pressable
            disabled={busy}
            style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
            onPress={() => {
              void (async () => {
                setBusy(true);
                const res = await signUp(email, password, fullName);
                setBusy(false);
                if (!res.ok) {
                  Alert.alert("Sign up failed", res.reason);
                  return;
                }
                Alert.alert(
                  "Check your inbox",
                  res.needsEmailConfirmation
                    ? "Confirm your email if required by your project, then sign in."
                    : "You can sign in now.",
                  [{ text: "OK", onPress: () => navigation.navigate("SignIn") }],
                );
              })();
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Create account</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg },
  back: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.lg },
  backText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  title: { ...typography.title, marginBottom: spacing.sm },
  sub: { ...typography.subtitle, marginBottom: spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginBottom: spacing.sm,
    fontSize: 16,
  },
  primaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
