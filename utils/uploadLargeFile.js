import * as FileSystem from "expo-file-system/legacy";
import { encode as base64Encode } from "js-base64";
import { supabase } from "../supabaseClient";

const SUPABASE_PROJECT_ID = "fncgffajwabqrnhumgzd";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuY2dmZmFqd2FicXJuaHVtZ3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc0MjgwMjEsImV4cCI6MjA0MzAwNDAyMX0.5j5NmKVcAjvHjglrzThqToA52nZqgHV_U3zuWb-7Aes";
const TUS_ENDPOINT = `https://${SUPABASE_PROJECT_ID}.storage.supabase.co/storage/v1/upload/resumable`;
const CHUNK_SIZE = 6 * 1024 * 1024; // imposé par l'implémentation TUS de Supabase

// Upload d'un gros fichier (vidéo) vers Supabase Storage via le protocole
// resumable TUS, implémenté ici "à la main" avec des lectures/écritures
// natives par blocs (expo-file-system) — sans jamais charger le fichier
// entier en mémoire JS.
//
// Pourquoi pas simplement le SDK standard ou tus-js-client :
// - L'endpoint d'upload standard de Supabase rejette (413 EntityTooLarge)
//   tout fichier au-delà de quelques Mo, quel que soit le réglage de
//   taille max configuré (confirmé : bucket et projet à 500 Mo, échec
//   persistant sur une vidéo de 254 Mo).
// - tus-js-client (la lib "officielle" pour TUS) lit le fichier via une
//   requête XHR avec responseType "blob" pour le convertir en Blob avant
//   de le découper en morceaux — cette lecture échoue ("cannot fetch
//   file.uri as Blob") pour un fichier de cette taille sur cette tablette,
//   qu'il s'agisse d'une uri content:// ou d'une copie locale file://.
//
// Cette implémentation lit directement des tranches de 6 Mo du fichier
// source (readAsStringAsync avec position/length, nativement, sans passer
// par un Blob JS) et les envoie une par une avec l'upload natif
// (FileSystem.uploadAsync), qui transmet chaque petit fichier temporaire
// directement depuis le disque.
export async function uploadLargeFileToStorage(bucket, filePath, localUri, mimeType) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;

  const info = await FileSystem.getInfoAsync(localUri, { size: true });
  if (!info.exists) throw new Error("Fichier source introuvable.");
  const fileSize = info.size;

  const metadataPairs = {
    bucketName: bucket,
    objectName: filePath,
    contentType: mimeType,
    cacheControl: "3600",
  };
  const uploadMetadata = Object.entries(metadataPairs)
    .map(([key, value]) => `${key} ${base64Encode(String(value))}`)
    .join(",");

  // 1) Création de la session d'upload TUS (petite requête, sans corps).
  const createResponse = await fetch(TUS_ENDPOINT, {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(fileSize),
      "Upload-Metadata": uploadMetadata,
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      "x-upsert": "true",
    },
  });

  if (!createResponse.ok) {
    const body = await createResponse.text().catch(() => "");
    throw new Error(
      `Échec de la création de l'upload (statut ${createResponse.status}) : ${body.slice(0, 200)}`
    );
  }

  const location = createResponse.headers.get("Location");
  if (!location) {
    throw new Error("Réponse du serveur invalide : URL d'upload manquante.");
  }
  const uploadUrl = location.startsWith("http")
    ? location
    : `https://${SUPABASE_PROJECT_ID}.storage.supabase.co${location}`;

  // 2) Envoi du fichier par blocs de 6 Mo, chacun matérialisé dans un petit
  // fichier temporaire puis envoyé via l'upload natif.
  const tempChunkUri = `${FileSystem.cacheDirectory}chunk-${Date.now()}.tmp`;
  let offset = 0;

  try {
    while (offset < fileSize) {
      const length = Math.min(CHUNK_SIZE, fileSize - offset);

      const base64Chunk = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
        position: offset,
        length,
      });

      await FileSystem.writeAsStringAsync(tempChunkUri, base64Chunk, {
        encoding: FileSystem.EncodingType.Base64,
      });

      let lastError = null;
      let succeeded = false;

      for (let attempt = 0; attempt < 3 && !succeeded; attempt++) {
        try {
          const result = await FileSystem.uploadAsync(uploadUrl, tempChunkUri, {
            httpMethod: "PATCH",
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: {
              "Tus-Resumable": "1.0.0",
              "Upload-Offset": String(offset),
              "Content-Type": "application/offset+octet-stream",
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
            },
          });

          if (result.status < 200 || result.status >= 300) {
            throw new Error(
              `Échec de l'envoi du bloc (statut ${result.status}) : ${result.body?.slice(0, 200)}`
            );
          }
          succeeded = true;
        } catch (error) {
          lastError = error;
        }
      }

      if (!succeeded) {
        throw lastError || new Error("Échec de l'envoi d'un bloc de la vidéo.");
      }

      offset += length;
    }
  } finally {
    FileSystem.deleteAsync(tempChunkUri, { idempotent: true }).catch(() => {});
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
