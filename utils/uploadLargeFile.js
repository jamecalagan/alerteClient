import * as tus from "tus-js-client";
import { supabase } from "../supabaseClient";

const SUPABASE_PROJECT_ID = "fncgffajwabqrnhumgzd";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuY2dmZmFqd2FicXJuaHVtZ3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc0MjgwMjEsImV4cCI6MjA0MzAwNDAyMX0.5j5NmKVcAjvHjglrzThqToA52nZqgHV_U3zuWb-7Aes";

// Upload d'un gros fichier (vidéo) vers Supabase Storage via le protocole
// resumable TUS. L'endpoint d'upload standard (REST classique) de Supabase
// n'est fiable que pour de petits fichiers (quelques Mo) : au-delà, il
// rejette la requête ("413 EntityTooLarge") quel que soit le réglage de
// taille max configuré côté projet/bucket — c'est une limite de l'endpoint
// lui-même, pas un réglage. Le protocole TUS (upload par blocs, avec
// reprise en cas de coupure) est la méthode recommandée par Supabase pour
// tout fichier de plus de quelques Mo, comme des vidéos de plusieurs
// centaines de Mo.
export async function uploadLargeFileToStorage(bucket, filePath, localUri, mimeType) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;

  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(
      { uri: localUri, name: filePath.split("/").pop(), type: mimeType },
      {
        endpoint: `https://${SUPABASE_PROJECT_ID}.storage.supabase.co/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: bucket,
          objectName: filePath,
          contentType: mimeType,
          cacheControl: "3600",
        },
        chunkSize: 6 * 1024 * 1024, // imposé par l'implémentation TUS de Supabase
        onError: (error) => reject(error),
        onSuccess: () => resolve(),
      }
    );

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
