import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../supabaseClient";

const SUPABASE_URL = "https://fncgffajwabqrnhumgzd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuY2dmZmFqd2FicXJuaHVtZ3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc0MjgwMjEsImV4cCI6MjA0MzAwNDAyMX0.5j5NmKVcAjvHjglrzThqToA52nZqgHV_U3zuWb-7Aes";

// Upload d'un gros fichier (vidéo) vers Supabase Storage via l'upload natif
// d'expo-file-system, qui envoie le fichier directement depuis le disque sans
// le charger en mémoire JS — indispensable pour des fichiers de plusieurs
// centaines de Mo (le SDK supabase-js standard charge tout en mémoire avant
// l'envoi, ce qui échoue silencieusement sur ce genre de volumétrie).
export async function uploadLargeFileToStorage(bucket, filePath, localUri, mimeType) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token || SUPABASE_ANON_KEY;
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;

  const result = await FileSystem.uploadAsync(url, localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
      "x-upsert": "true",
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `Échec de l'upload (statut ${result.status}) : ${result.body?.slice(0, 200)}`
    );
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
