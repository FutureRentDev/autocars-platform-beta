import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ApiClient,
  ApiError,
  profileDetails,
  provinces,
  type ProfileDetails,
  type User,
} from "@autocars/core";

export function ProfilePanel({
  api,
  user,
  onChange,
  notify,
}: {
  api: ApiClient;
  user: User;
  onChange: (user: User) => void;
  notify: (title: string, message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => profileDetails(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(profileDetails(user));
  }, [user, editing]);
  useEffect(() => setPhotoFailed(false), [user.avatarUrl]);
  const fail = (error: unknown) => {
    if (error instanceof ApiError) setErrors(error.fieldErrors);
    notify(
      "Please check your profile",
      (error as Error).message || "Please try again.",
    );
  };
  async function save() {
    Keyboard.dismiss();
    setBusy(true);
    setErrors({});
    try {
      const result = await api.patch<{ user: User }>("/me/profile", draft);
      onChange(result.user);
      setEditing(false);
      notify("Profile saved", "Your profile is updated across your devices.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function photo(remove = false) {
    setBusy(true);
    try {
      if (remove) {
        const result = await api.delete<{ user: User }>("/me/avatar");
        onChange(result.user);
        return;
      }
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Allow photo access in Settings to choose your profile picture.",
        );
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName || "profile.jpg",
        type: asset.mimeType || "image/jpeg",
      } as any);
      const response = await api.uploadForm<{ user: User }>("/me/avatar", form);
      onChange(response.user);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  const input = (key: keyof ProfileDetails, label: string) => (
    <View style={s.field} key={key}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={errors[key]}
        editable={!busy}
        value={draft[key]}
        maxLength={key === "phone" ? 30 : 100}
        onChangeText={(value) => {
          setDraft({ ...draft, [key]: value });
          setErrors({ ...errors, [key]: "" });
        }}
        keyboardType={key === "phone" ? "phone-pad" : "default"}
        autoCapitalize="words"
        style={[s.input, !!errors[key] && s.invalid]}
      />
      {!!errors[key] && (
        <Text accessibilityRole="alert" style={s.error}>
          {errors[key]}
        </Text>
      )}
    </View>
  );
  return (
    <View style={s.panel}>
      <View style={s.identity}>
        {user.avatarUrl && !photoFailed ? (
          <Image
            source={{ uri: api.image(user.avatarUrl) }}
            onError={() => setPhotoFailed(true)}
            style={s.avatar}
            accessibilityLabel="Your profile picture"
          />
        ) : (
          <View style={[s.avatar, s.initials]}>
            <Text style={s.initialsText}>
              {user.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{user.name}</Text>
          <Text style={s.meta}>{user.email}</Text>
        </View>
      </View>
      <View style={s.actions}>
        <Pressable
          disabled={busy}
          accessibilityRole="button"
          onPress={() => photo()}
          style={s.smallButton}
        >
          <Ionicons name="camera-outline" size={18} color="#f2f2ee" />
          <Text style={s.buttonText}>Change photo</Text>
        </Pressable>
        {!!user.avatarUrl && (
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            onPress={() => photo(true)}
            style={s.smallButton}
          >
            <Text style={s.buttonText}>Remove photo</Text>
          </Pressable>
        )}
      </View>
      {busy && (
        <ActivityIndicator
          color="#f2f2ee"
          accessibilityLabel="Saving profile"
        />
      )}
      {editing ? (
        <>
          {input("name", "Full name")}
          {input("phone", "Phone number (optional)")}
          {input("city", "City / town (optional)")}
          <Text style={s.label}>Province (optional)</Text>
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Choose profile province"
            onPress={() => setProvinceOpen(true)}
            style={s.input}
          >
            <Text style={s.buttonText}>
              {draft.province || "Choose province"}
            </Text>
          </Pressable>
          {!!errors.province && <Text style={s.error}>{errors.province}</Text>}
          <View style={s.actions}>
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              onPress={save}
              style={[s.smallButton, s.primary]}
            >
              <Text style={[s.buttonText, { color: "#111" }]}>
                {busy ? "Saving…" : "Save profile"}
              </Text>
            </Pressable>
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              onPress={() => {
                setEditing(false);
                setErrors({});
              }}
              style={s.smallButton}
            >
              <Text style={s.buttonText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {!!user.phone && <Text style={s.meta}>{user.phone}</Text>}
          {!!(user.city || user.province) && (
            <Text style={s.meta}>
              {[user.city, user.province].filter(Boolean).join(", ")}
            </Text>
          )}
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            style={s.smallButton}
          >
            <Text style={s.buttonText}>Edit profile</Text>
            <Ionicons name="create-outline" color="#f2f2ee" size={18} />
          </Pressable>
        </>
      )}
      <Modal
        visible={provinceOpen}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setProvinceOpen(false)}
      >
        <SafeAreaView style={s.screen}>
          <Text style={[s.title, { padding: 22 }]}>Choose province</Text>
          <ScrollView>
            {["", ...provinces].map((province) => (
              <Pressable
                key={province}
                accessibilityRole="button"
                onPress={() => {
                  setDraft({ ...draft, province });
                  setErrors({ ...errors, province: "" });
                  setProvinceOpen(false);
                }}
                style={s.option}
              >
                <Text style={s.buttonText}>
                  {province || "Not specified"}
                  {draft.province === province ? " ✓" : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => setProvinceOpen(false)} style={s.option}>
            <Text style={s.buttonText}>Cancel</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  panel: {
    backgroundColor: "#141414",
    borderColor: "#2a2a2a",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginVertical: 20,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#252525",
  },
  initials: { alignItems: "center", justifyContent: "center" },
  initialsText: { color: "#f2f2ee", fontSize: 24, fontWeight: "600" },
  title: { fontSize: 19, color: "#f2f2ee", fontWeight: "600" },
  meta: { color: "#aaa", fontSize: 13, lineHeight: 20, marginVertical: 3 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginVertical: 12,
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 9,
    marginTop: 6,
  },
  primary: { backgroundColor: "#f2f2ee" },
  buttonText: { color: "#f2f2ee", fontSize: 13, fontWeight: "600" },
  field: { marginVertical: 10 },
  label: { color: "#bbb", fontSize: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    padding: 14,
    color: "#f2f2ee",
    fontSize: 15,
    minHeight: 48,
  },
  invalid: { borderColor: "#f08a80" },
  error: { color: "#f08a80", fontSize: 12, marginTop: 6 },
  screen: { flex: 1, backgroundColor: "#0a0a0a" },
  option: { padding: 22, borderBottomWidth: 1, borderColor: "#333" },
});
