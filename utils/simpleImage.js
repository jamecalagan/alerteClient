// simpleImage.ts
import * as FileSystem from "expo-file-system";
import { supabase } from "../supabaseClient";

/**
 * Retourne une URI affichable :
 * - si le fichier local existe -> "file://..."
 * - sinon -> URL signée Supabase (valide 1h)
 */
export async function getImageUri(pathInBucket, bucket = "images") {
  const localPath = FileSystem.documentDirectory + "cached_images/" + pathInBucket;

  // 1) Existe en local ?
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists && !info.isDirectory) return localPath;

  // 2) Sinon, URL signée (aucun téléchargement local)
  const { data, error } = await supabase
    .storage
    .from(bucket)
    .createSignedUrl(pathInBucket, 3600);

  if (error || !data?.signedUrl) {
    // En dernier recours (si bucket public)
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(pathInBucket);
    if (pub?.publicUrl) return pub.publicUrl;
    throw new Error("Image indisponible");
  }

  return data.signedUrl;
}
