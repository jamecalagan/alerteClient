// pages/InterventionImagesPage.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  Image,
  TouchableOpacity,
  Modal,
  Dimensions,
  Alert,
  StyleSheet,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { supabase } from "../supabaseClient"; // ← adapte le chemin si besoin

const BUCKET = "images";
// Sous-dossiers fournis par toi
const SUBFOLDERS = [
  "etiquettes",
  "images",
  "intervention_images",
  "old_images",
  "signatures",
  "supplementaires",
];

// Extensions d'images autorisées
const IMG_RE = /\.(jpg|jpeg|png|webp|gif)$/i;

export default function InterventionImagesPage() {
  const route = useRoute();
  const { interventionId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [images, setImages] = useState([]); // [{id, uri, source, name}]
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const selectedUri = useMemo(
    () => (selectedIndex >= 0 && selectedIndex < images.length ? images[selectedIndex]?.uri : null),
    [selectedIndex, images]
  );

  useEffect(() => {
    (async () => {
      try {
        if (!interventionId) throw new Error("Identifiant d'intervention manquant.");
        setLoading(true);

        // 1) — BDD : interventions.photos / label_photo
        const { data: inter, error: interErr } = await supabase
          .from("interventions")
          .select(`id, photos, label_photo`)
          .eq("id", interventionId)
          .single();
        if (interErr) throw interErr;

        const fromPhotos = toArray(inter?.photos)
          .filter((p) => typeof p === "string" && p.length > 2)
          .map((p, i) => ({
            id: `ph_${i}`,
            name: baseName(p),
            uri: toPublicUrl(p),
            source: "interventions.photos",
          }));

        const fromLabel = typeof inter?.label_photo === "string" && inter.label_photo.length > 2
          ? [{
              id: `label_photo`,
              name: baseName(inter.label_photo),
              uri: toPublicUrl(inter.label_photo),
              source: "interventions.label_photo",
            }]
          : [];

        // 2) — BDD : table intervention_images (si existante)
        let fromTable = [];
        try {
          const { data: rows, error: rowsErr } = await supabase
            .from("intervention_images")
            .select("id, uri, key, created_at")
            .eq("intervention_id", interventionId)
            .order("created_at", { ascending: false });
          if (!rowsErr && Array.isArray(rows)) {
            fromTable = rows
              .map((r) => r?.uri || r?.key)
              .filter((u) => typeof u === "string" && u.length > 2)
              .map((u) => ({
                id: `tb_${u}`,
                name: baseName(u),
                uri: toPublicUrl(u),
                source: "intervention_images (table)",
              }));
          }
        } catch {
          // Si la table n'existe pas, on ignore
        }

        // 3) — STORAGE : lister chaque sous-dossier <folder>/<interventionId>/*
        const fromStorage = [];
        for (const folder of SUBFOLDERS) {
          const path = `${folder}/${interventionId}`;
          const files = await listFolder(path);
          for (const f of files) {
            const key = `${path}/${f.name}`;
            fromStorage.push({
              id: `st_${folder}_${f.name}`,
              name: f.name,
              uri: toPublicUrl(key),
              source: `storage:${folder}`,
            });
          }
        }

        // 4) — Dédupe par URI finale
        const uniq = new Map();
        [...fromLabel, ...fromPhotos, ...fromTable, ...fromStorage].forEach((it) => {
          if (!it?.uri) return;
          if (!uniq.has(it.uri)) uniq.set(it.uri, it);
        });

        // 5) — Trie : étiquettes + signatures d'abord, puis le reste
        const list = Array.from(uniq.values()).sort((a, b) => {
          const score = (s) => (/etiquette|label/i.test(s) ? 2 : /signature/i.test(s) ? 1 : 0);
          const sa = score(a.source);
          const sb = score(b.source);
          if (sa !== sb) return sb - sa;
          return a.name.localeCompare(b.name);
        });

        setImages(list);
      } catch (e) {
        setError(e?.message || "Erreur lors du chargement des images.");
      } finally {
        setLoading(false);
      }
    })();
  }, [interventionId]);

  // ——— Rendu ———

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Chargement des images…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (images.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Aucune image trouvée pour cette intervention.</Text>
      </View>
    );
  }

  const numColumns = 3;
  const gap = 6;
  const size = Math.floor((Dimensions.get("window").width - 24 - gap * (numColumns - 1)) / numColumns);

  return (
    <View style={{ flex: 1, backgroundColor: "#0c0f18", padding: 12 }}>
      <Text style={{ color: "#fff", fontWeight: "600", marginBottom: 8 }}>
        {images.length} image{images.length > 1 ? "s" : ""} trouvée{images.length > 1 ? "s" : ""}
      </Text>

      <FlatList
        data={images}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ gap }}
        renderItem={({ item, index }) => (
          <TouchableOpacity onPress={() => setSelectedIndex(index)} activeOpacity={0.85}>
            <Image
              source={{ uri: item.uri }}
              style={{
                width: size,
                height: size,
                borderRadius: 8,
                backgroundColor: "#111827",
              }}
              resizeMode="cover"
            />
          </TouchableOpacity>
        )}
      />

      {/* Viewer plein écran simple avec navigation précédente/suivante */}
      <Modal visible={selectedIndex >= 0} transparent animationType="fade" onRequestClose={() => setSelectedIndex(-1)}>
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setSelectedIndex(-1)}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>✕</Text>
          </TouchableOpacity>

          <View style={styles.viewerBody}>
            {selectedUri ? (
              <Image source={{ uri: selectedUri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
            ) : (
              <ActivityIndicator size="large" color="#fff" />
            )}
          </View>

          {images.length > 1 && (
            <View style={styles.viewerNav}>
              <TouchableOpacity
                onPress={() => setSelectedIndex((i) => (i > 0 ? i - 1 : images.length - 1))}
                style={styles.navBtn}
              >
                <Text style={styles.navTxt}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.navInfo}>
                {selectedIndex + 1} / {images.length}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedIndex((i) => (i < images.length - 1 ? i + 1 : 0))}
                style={styles.navBtn}
              >
                <Text style={styles.navTxt}>▶</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

/* ——— Utils ——— */

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  if (typeof val === "string") {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch {
      if (val.includes(",")) return val.split(",").map((s) => s.trim());
      return [val];
    }
  }
  return [];
}

function baseName(p) {
  if (typeof p !== "string") return "";
  const clean = p.split("?")[0];
  const idx = clean.lastIndexOf("/");
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

function toPublicUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  try {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(raw);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

// Liste un dossier storage "prefix": 'folder/<interventionId>'
async function listFolder(prefix) {
  try {
    // Supabase Storage list retourne fichiers et sous-dossiers du niveau
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 100, // suffisant dans 99% des cas
      offset: 0,
    });
    if (error || !Array.isArray(data)) return [];
    // On ne retient que les fichiers image
    return data.filter((it) => it && it.name && IMG_RE.test(it.name));
  } catch {
    return [];
  }
}

/* ——— Styles ——— */

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: "#0c0f18",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  muted: { color: "#9aa0a6", marginTop: 8 },
  error: { color: "#ffb4b4", fontWeight: "700" },

  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    paddingTop: 42,
  },
  viewerClose: {
    position: "absolute",
    right: 16,
    top: 16,
    zIndex: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewerBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  navBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
  },
  navTxt: { color: "#fff", fontSize: 18, fontWeight: "700" },
  navInfo: { color: "#fff", fontWeight: "600" },
});
