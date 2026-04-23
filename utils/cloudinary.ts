import { Platform } from "react-native";

const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim();
const folder = process.env.EXPO_PUBLIC_CLOUDINARY_FOLDER?.trim();

export type CloudinaryUploadInput = {
  uri: string;
  name?: string;
  mimeType?: string;
  webFile?: Blob;
};

export function isCloudinaryConfigured(): boolean {
  return Boolean(cloudName && uploadPreset);
}

export async function uploadVideoToCloudinary(input: CloudinaryUploadInput): Promise<string> {
  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Cloudinary is not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET.",
    );
  }

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
  const form = new FormData();
  form.append("upload_preset", uploadPreset);
  if (folder) form.append("folder", folder);

  const normalizedType = (input.mimeType ?? "").startsWith("video/") ? input.mimeType : "video/mp4";
  const safeName = (input.name ?? "menu-video.mp4").replace(/\s+/g, "-");

  if (Platform.OS === "web" && input.webFile) {
    form.append("file", input.webFile, safeName);
  } else {
    form.append("file", {
      uri: input.uri,
      name: safeName,
      type: normalizedType,
    } as any);
  }

  const response = await fetch(url, { method: "POST", body: form });
  const json = (await response.json()) as { secure_url?: string; error?: { message?: string } };
  if (!response.ok || !json?.secure_url) {
    throw new Error(json?.error?.message ?? "Cloudinary upload failed.");
  }
  return json.secure_url;
}

