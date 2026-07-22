// pages/CheckupPage.js
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import Signature from "react-native-signature-canvas";
import * as Print from "expo-print";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

/* ───────── Helpers ───────── */

const normalizeSignature = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith("data:image")) return s;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `data:image/png;base64,${s}`;
};

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const uriToDataUrl = async (uri) => {
  if (!uri) return null;
  try {
    if (String(uri).startsWith("data:image")) return uri;

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const lower = String(uri).toLowerCase();
    const mime =
      lower.includes(".jpg") || lower.includes(".jpeg")
        ? "image/jpeg"
        : "image/png";

    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.log("⚠️ uriToDataUrl error:", e);
    return null;
  }
};

const PRODUCT_COMPONENTS = {
  "PC portable": [
    "Écran",
    "Clavier",
    "Pavé tactile",
    "Alimentation",
    "Batterie",
    "Port USB",
    "Disque dur",
    "RAM",
    "Ventilation",
    "État général",
  ],
  "PC Fixe": [
    "Écran",
    "Clavier",
    "Souris",
    "Boîtier",
    "Alimentation",
    "Carte mère",
    "Carte graphique",
    "RAM",
    "Disque dur",
    "État général",
  ],
  Tablette: [
    "Écran",
    "Écran tactile",
    "Connecteur de charge",
    "Boutons volume",
    "Caméra",
    "WiFi",
    "Bluetooth",
    "Batterie",
    "État général",
  ],
  "Console de jeux": [
    "Écran/Sortie vidéo",
    "Manette",
    "Lecteur disque",
    "Port HDMI",
    "Alimentation",
    "Ventilation",
    "Connexion Internet",
    "État général",
  ],
  "PC tout en un": [
    "Écran",
    "Clavier",
    "Souris",
    "Boutons",
    "Ports USB",
    "Disque dur",
    "RAM",
    "Connexion Internet",
    "État général",
  ],
  iMac: [
    "Écran",
    "Clavier",
    "Souris",
    "Ports USB/Thunderbolt",
    "Disque dur",
    "RAM",
    "Connexion WiFi",
    "État général",
  ],
  iPad: [
    "Écran",
    "Tactile",
    "Connecteur de charge",
    "Boutons",
    "Caméra",
    "WiFi",
    "Bluetooth",
    "Batterie",
    "État général",
  ],
  MacBook: [
    "Écran",
    "Clavier",
    "Trackpad",
    "Ports",
    "Batterie",
    "Disque SSD",
    "RAM",
    "WiFi",
    "État général",
  ],
  Autre: [
    "Alimentation",
    "Connectique",
    "Fonctionnement général",
    "État visuel",
    "Accessoires",
    "Test de fonctionnement",
    "Connexion USB",
    "État général",
  ],
};

const ALL_TYPES = [
  "PC portable",
  "PC Fixe",
  "PC tout en un",
  "Tablette",
  "Console de jeux",
  "iMac",
  "iPad",
  "MacBook",
  "Autre",
];

const STATES = ["Bon", "Moyen", "Mauvais", "Absent", "Non testable"];

const colorMap = {
  Bon: "#16a34a",
  Moyen: "#d97706",
  Mauvais: "#b91c1c",
  Absent: "#4b5563",
  "Non testable": "#6b7280",
};

/* ───────── Composant principal ───────── */

export default function CheckupPage() {
  const route = useRoute();
  const navigation = useNavigation();
  const sigRef = useRef(null);

  const isEdit = route.params?.isEdit || false;
  const editData = route.params?.checkup || null;
  const [isSigning, setIsSigning] = useState(false);

  console.log("🔎 CheckupPage route.params =", route.params);

  const clientFromRoute = route.params?.client || null;

  const clientName =
    route.params?.clientName ||
    clientFromRoute?.name ||
    editData?.client_name ||
    "";
  const clientPhone =
    route.params?.clientPhone ||
    clientFromRoute?.phone ||
    editData?.client_phone ||
    "";
  const clientDate =
    route.params?.clientDate ||
    editData?.client_date ||
    new Date().toLocaleDateString("fr-FR");

  const initialDeviceType =
    route.params?.deviceType || editData?.product_type || "PC portable";

  const [selectedProduct, setSelectedProduct] = useState(() =>
    PRODUCT_COMPONENTS[initialDeviceType] ? initialDeviceType : "Autre"
  );

  const [components, setComponents] = useState(editData?.components || {});
  const [remarks, setRemarks] = useState(editData?.remarks || "");
  const [signature, setSignature] = useState(null);

  // ✅ Produit non fonctionnel / non testable
  const [isNonTestable, setIsNonTestable] = useState(
    !!editData?.is_non_testable
  );

  // ✅ Photos par composant si "Mauvais"
  const [componentPhotos, setComponentPhotos] = useState(
    editData?.component_photos || {}
  );

  // ✅ Prévisualisation plein écran
  const [previewUri, setPreviewUri] = useState(null);

  /* ───────── Signature existante ───────── */

  useEffect(() => {
    const loadSignature = async () => {
      try {
        const fromParamsCandidates = [
          route.params?.clientSignature,
          route.params?.signature,
          route.params?.signatureIntervention,
          route.params?.client?.signature,
          route.params?.client?.signatureIntervention,
          route.params?.intervention?.signatureIntervention,
          route.params?.intervention?.signature,
          editData?.signature,
        ];

        let raw =
          fromParamsCandidates.find(
            (v) => v !== null && v !== undefined && String(v).trim() !== ""
          ) || null;

        const interventionIdFromParams =
          route.params?.interventionId ||
          route.params?.intervention_id ||
          route.params?.intervention?.id ||
          clientFromRoute?.latestIntervention?.id ||
          editData?.intervention_id ||
          null;

        console.log("🔎 CheckupPage raw signature (from params) =", raw);
        console.log(
          "🔎 CheckupPage interventionIdFromParams =",
          interventionIdFromParams
        );

        if (!raw && interventionIdFromParams) {
          console.log(
            "🔎 Fetching signature from interventions for id =",
            interventionIdFromParams
          );
          const { data, error } = await supabase
            .from("interventions")
            .select("signatureIntervention, signature")
            .eq("id", interventionIdFromParams)
            .maybeSingle();

          if (error) {
            console.log("⚠️ Erreur fetch signature intervention:", error);
          } else if (data) {
            const rawSig =
              data.signatureIntervention ?? data.signature ?? null;
            console.log("🔎 Signature trouvée en BDD intervention =", rawSig);
            raw = rawSig;
          }
        }

        const normalized = normalizeSignature(raw);
        setSignature(normalized);
      } catch (e) {
        console.log("⚠️ loadSignature error:", e);
      }
    };

    loadSignature();
  }, [route.params, editData, clientFromRoute]);

  const getComponentList = () => {
    if (PRODUCT_COMPONENTS[selectedProduct]) return PRODUCT_COMPONENTS[selectedProduct];
    return PRODUCT_COMPONENTS["Autre"];
  };

  const ensureAllNonTestable = () => {
    const list = getComponentList();
    const next = {};
    list.forEach((c) => {
      next[c] = "Non testable";
    });
    setComponents(next);
    setComponentPhotos({});
  };

  useEffect(() => {
    if (isNonTestable) {
      ensureAllNonTestable();
    } else {
      const list = getComponentList();
      setComponentPhotos((prev) => {
        const next = {};
        list.forEach((c) => {
          if (prev?.[c]) next[c] = prev[c];
        });
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct]);

  const toggleComponentState = (name, state) => {
    setComponents((prev) => ({ ...prev, [name]: state }));

    // Si on quitte "Mauvais", on retire la photo (logique simple et propre)
    if (state !== "Mauvais") {
      setComponentPhotos((prev) => {
        if (!prev?.[name]) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSignature = (sig) => {
    const finalSig = sig.startsWith("data:image")
      ? sig
      : `data:image/png;base64,${sig}`;
    setSignature(finalSig);
  };

  const handleClearSig = () => {
    sigRef.current?.clearSignature();
    setSignature(null);
  };

  const validate = () => {
    const list = getComponentList();

    if (!isNonTestable) {
      const missing = list.some((c) => !components[c]);
      if (missing) {
        Alert.alert(
          "Attention",
          "Merci de renseigner l'état de tous les composants."
        );
        return false;
      }
    }

    if (!remarks.trim()) {
      Alert.alert("Remarques manquantes", "Ajoutez des remarques générales.");
      return false;
    }
    if (!signature) {
      Alert.alert(
        "Signature manquante",
        "Faites signer la fiche avant de sauvegarder ou d'imprimer."
      );
      return false;
    }
    return true;
  };

  const buildPayload = () => ({
    client_name: clientName,
    client_phone: clientPhone,
    client_date: clientDate,
    product_type: selectedProduct,
    components,
    remarks,
    signature,
    is_non_testable: isNonTestable,
    component_photos: componentPhotos,
  });

  const saveCheckup = async () => {
    if (!validate()) return;

    const payload = buildPayload();

    try {
      if (isEdit && editData?.id) {
        const { error } = await supabase
          .from("checkup_reports")
          .update(payload)
          .eq("id", editData.id);

        if (error) throw error;
        Alert.alert("Succès", "Fiche mise à jour.");
      } else {
        const { error } = await supabase.from("checkup_reports").insert(payload);
        if (error) throw error;
        Alert.alert("Succès", "Fiche sauvegardée.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert(
        "Erreur",
        "Impossible de sauvegarder la fiche.\n\n⚠️ Ajoute les colonnes SQL : is_non_testable (bool) et component_photos (jsonb)."
      );
    }
  };

  const deleteCheckup = async () => {
    if (!editData?.id) return;
    Alert.alert(
      "Confirmation",
      "Voulez-vous vraiment supprimer cette fiche de contrôle ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("checkup_reports")
              .delete()
              .eq("id", editData.id);
            if (error) {
              Alert.alert("Erreur", "La suppression a échoué.");
            } else {
              Alert.alert("Supprimée", "La fiche a bien été supprimée.", [
                { text: "OK", onPress: () => navigation.goBack() },
              ]);
            }
          },
        },
      ]
    );
  };

  const takePhotoForComponent = async (componentName) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission refusée",
          "Autorisez la caméra pour prendre une photo."
        );
        return;
      }

      const res = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
      });

      if (res.canceled) return;

      const uri = res.assets?.[0]?.uri || null;
      if (!uri) return;

      setComponentPhotos((prev) => ({
        ...(prev || {}),
        [componentName]: uri,
      }));
    } catch (e) {
      console.log("⚠️ takePhotoForComponent error:", e);
      Alert.alert("Erreur", "Impossible d’ouvrir la caméra.");
    }
  };

  const removePhotoForComponent = (componentName) => {
    setComponentPhotos((prev) => {
      const next = { ...(prev || {}) };
      delete next[componentName];
      return next;
    });
  };

  const toggleNonTestable = () => {
    setIsNonTestable((prev) => {
      const next = !prev;
      if (next) ensureAllNonTestable();
      return next;
    });
  };

  const printCheckup = async () => {
    if (!validate()) return;

    const list = getComponentList();

    // ✅ Force l'impression si soit la case est cochée, soit tout est "Non testable"
    const nonTestablePrint =
      isNonTestable || list.every((c) => components?.[c] === "Non testable");

    const rows = [];

    for (const c of list) {
      const state = components[c] || "";
      let photoHtml = "";

      if (state === "Mauvais" && componentPhotos?.[c]) {
        const dataUrl = await uriToDataUrl(componentPhotos[c]);
        if (dataUrl) {
          photoHtml = `<div style="margin-top:4px;"><img src="${dataUrl}" style="width:160px;height:90px;object-fit:cover;border:1px solid #000;" /></div>`;
        }
      }

      rows.push(`
        <tr>
          <td>${escapeHtml(c)}</td>
          <td>
            ${escapeHtml(state)}
            ${photoHtml}
          </td>
        </tr>
      `);
    }

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; padding: 16px; }
            h1 { text-align: center; font-size: 18px; margin-bottom: 16px; }
            .info { border: 1px solid #000; padding: 8px; margin-bottom: 16px; font-size: 11px; }
            .info-line { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .danger { color: #b91c1c; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #000; padding: 4px; text-align: left; font-size: 11px; vertical-align: top; }
            .remarks { margin-top: 16px; font-size: 11px; }
          </style>
        </head>
        <body>
          <h1>Fiche de contrôle – ${escapeHtml(selectedProduct)}</h1>
          <div class="info">
            <div class="info-line"><strong>Client :</strong><span>${escapeHtml(
              clientName
            )}</span></div>
            <div class="info-line"><strong>Téléphone :</strong><span>${escapeHtml(
              clientPhone
            )}</span></div>
            <div class="info-line"><strong>Date :</strong><span>${escapeHtml(
              clientDate
            )}</span></div>
            <div class="info-line"><strong>Produit :</strong><span>${escapeHtml(
              selectedProduct
            )}</span></div>
            ${
              nonTestablePrint
                ? `<div class="info-line danger"><strong>Produit :</strong><span>NON FONCTIONNEL / NON TESTABLE</span></div>`
                : ``
            }
          </div>
          <table>
            <tr><th>Composant</th><th>État</th></tr>
            ${rows.join("")}
          </table>
          <div class="remarks">
            <strong>Remarques :</strong>
            <p>${escapeHtml(remarks).replace(/\n/g, "<br/>")}</p>
          </div>
          <div style="margin-top: 16px;">
            <strong>Signature :</strong><br/>
            ${
              signature
                ? `<img src="${signature}" style="width:200px;height:80px;object-fit:contain;" />`
                : ""
            }
          </div>
        </body>
      </html>
    `;

    await Print.printAsync({ html });
  };

  /* ───────── UI ───────── */

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f3f4f6" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isSigning}
      >
        <View style={styles.page}>
          {/* Titre */}
          <Text style={styles.title}>Fiche de contrôle</Text>

          {/* Infos client */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nom</Text>
              <Text style={styles.infoValue}>{clientName || "—"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Téléphone</Text>
              <Text style={styles.infoValue}>{clientPhone || "—"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>{clientDate}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Produit</Text>
              <Text style={styles.infoValue}>{selectedProduct}</Text>
            </View>
          </View>

          {/* Produit non testable */}
          <TouchableOpacity
            onPress={toggleNonTestable}
            activeOpacity={0.9}
            style={[
              styles.nonTestableRow,
              isNonTestable && styles.nonTestableRowActive,
            ]}
          >
            <View style={[styles.checkbox, isNonTestable && styles.checkboxOn]}>
              {isNonTestable ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.nonTestableText}>
              Produit non fonctionnel / non testable (impossible de juger les
              composants)
            </Text>
          </TouchableOpacity>

          {/* Type de produit */}
          <Text style={styles.sectionTitle}>Type de produit</Text>
          <View style={styles.chipsRow}>
            {ALL_TYPES.map((type) => {
              const isSelected = selectedProduct === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() =>
                    setSelectedProduct(
                      PRODUCT_COMPONENTS[type] ? type : "Autre"
                    )
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      isSelected && styles.chipTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* État des composants */}
          <Text style={styles.sectionTitle}>État des composants</Text>
          <View style={styles.componentsCard}>
            {getComponentList().map((name, index) => {
              const isOdd = index % 2 === 1;
              const currentState = components[name];
              const isBad = currentState === "Mauvais";
              const photoUri = componentPhotos?.[name] || null;

              return (
                <View
                  key={name}
                  style={[
                    styles.componentRow,
                    isOdd && styles.componentRowAlt,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.componentLabel}>{name}</Text>

                    {/* Photo uniquement si "Mauvais" */}
                    {isBad && (
                      <View style={styles.photoRow}>
                        <TouchableOpacity
                          style={styles.photoBtn}
                          onPress={() => takePhotoForComponent(name)}
                        >
                          <Text style={styles.photoBtnText}>📷 Photo</Text>
                        </TouchableOpacity>

                        {photoUri ? (
                          <View style={styles.photoPreviewWrap}>
                            <TouchableOpacity
                              onPress={() => setPreviewUri(photoUri)}
                            >
                              <Image
                                source={{ uri: photoUri }}
                                style={styles.photoPreview}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => removePhotoForComponent(name)}
                              style={styles.photoRemoveBtn}
                            >
                              <Text style={styles.photoRemoveText}>Retirer</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Text style={styles.photoHint}>
                            (optionnel) Prendre une photo du défaut
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  <View style={styles.componentStatesRow}>
                    {STATES.map((state) => {
                      const disabled = isNonTestable; // tout bloqué si non testable
                      const isSelected = components[name] === state;

                      return (
                        <TouchableOpacity
                          key={state}
                          disabled={disabled}
                          style={[
                            styles.stateChip,
                            isSelected && {
                              backgroundColor: colorMap[state],
                              borderColor: "transparent",
                            },
                            disabled && styles.stateChipDisabled,
                          ]}
                          onPress={() => toggleComponentState(name, state)}
                        >
                          <Text
                            style={[
                              styles.stateText,
                              isSelected && { color: "#ffffff" },
                              disabled && { opacity: 0.6 },
                            ]}
                          >
                            {state}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Remarques */}
          <Text style={styles.sectionTitle}>Remarques générales</Text>
          <TextInput
            style={styles.remarkInput}
            placeholder="Notes, observations, tests effectués…"
            placeholderTextColor="#9ca3af"
            multiline
            value={remarks}
            onChangeText={setRemarks}
          />

          {/* Signature */}
          <Text style={styles.sectionTitle}>Signature du client</Text>

          {signature && (
            <View style={styles.signaturePreviewCard}>
              <View style={styles.signatureHeaderRow}>
                <Text style={styles.signatureInfoText}>Signature existante</Text>
                <TouchableOpacity onPress={handleClearSig}>
                  <Text style={styles.signatureClearText}>Effacer</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.signaturePreviewBox}>
                <Image
                  source={{ uri: signature }}
                  style={styles.signatureImage}
                  resizeMode="contain"
                />
              </View>
            </View>
          )}

          <View style={styles.signatureCard}>
            <View style={styles.signatureContainer}>
              <Signature
                ref={sigRef}
                onOK={handleSignature}
                descriptionText="Signez ici"
                clearText="Effacer"
                confirmText="Valider"
                webStyle={`
                  .m-signature-pad {
                    margin: 0;
                    box-shadow: none;
                    border: 0;
                    width: 100%;
                  }
                  .m-signature-pad--body {
                    margin: 0;
                    border: 0;
                  }
                  canvas {
                    width: 100% !important;
                    height: 100% !important;
                  }
                  .m-signature-pad--footer {
                    display: none;
                  }
                `}
                onEnd={() => {
                  sigRef.current?.readSignature();
                  setIsSigning(false);
                }}
                onBegin={() => setIsSigning(true)}
              />
            </View>
            <TouchableOpacity onPress={handleClearSig} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Effacer la signature</Text>
            </TouchableOpacity>
          </View>

          {/* Actions en bas */}
          <View style={styles.footerActionsRow}>
            <TouchableOpacity
              style={[styles.footerActionSlot, { borderRightWidth: 1 }]}
              onPress={saveCheckup}
            >
              <Text style={styles.footerActionText}>Sauvegarder</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.footerActionSlot, { borderRightWidth: 1 }]}
              onPress={printCheckup}
            >
              <Text style={styles.footerActionText}>Imprimer</Text>
            </TouchableOpacity>

            {isEdit ? (
              <TouchableOpacity
                style={styles.footerActionSlot}
                onPress={deleteCheckup}
              >
                <Text style={[styles.footerActionText, { color: "#b91c1c" }]}>
                  Supprimer
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.footerActionSlot}>
                <Text style={[styles.footerActionText, { color: "#9ca3af" }]}>
                  Supprimer
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ✅ Modal preview photo */}
      <Modal visible={!!previewUri} transparent animationType="fade">
        <Pressable
          style={styles.previewBackdrop}
          onPress={() => setPreviewUri(null)}
        >
          <Pressable style={styles.previewCard}>
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              onPress={() => setPreviewUri(null)}
              style={styles.previewCloseBtn}
            >
              <Text style={styles.previewCloseText}>Fermer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ───────── Styles ───────── */

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
  },
  page: {
    maxWidth: 780,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 16,
    textAlign: "center",
    color: "#111827",
  },

  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4b5563",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
  },
  chipSelected: {
    backgroundColor: "#6b4e16",
    borderColor: "#6b4e16",
  },
  chipText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "600",
  },
  chipTextSelected: {
    color: "#ffffff",
  },

  /* Non testable */
  nonTestableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    padding: 10,
    borderRadius: 12,
  },
  nonTestableRowActive: {
    borderColor: "#b91c1c",
    backgroundColor: "#ffe4e6",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#b91c1c",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxOn: {
    backgroundColor: "#b91c1c",
  },
  checkboxTick: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 14,
    marginTop: -1,
  },
  nonTestableText: {
    flex: 1,
    color: "#b91c1c",
    fontWeight: "800",
    fontSize: 13,
  },

  componentsCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  componentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#ffffff",
    gap: 10,
  },
  componentRowAlt: {
    backgroundColor: "#f9fafb",
  },
  componentLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  componentStatesRow: {
    flexDirection: "row",
    gap: 4,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    maxWidth: 260,
  },
  stateChip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#ffffff",
    marginBottom: 4,
  },
  stateChipDisabled: {
    opacity: 0.55,
  },
  stateText: {
    fontSize: 11,
    color: "#111827",
    fontWeight: "700",
  },

  /* Photo */
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  photoBtn: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#b91c1c",
    backgroundColor: "#fff1f2",
  },
  photoBtnText: {
    color: "#b91c1c",
    fontWeight: "900",
    fontSize: 12,
  },
  photoHint: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },
  photoPreviewWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  photoPreview: {
    width: 56,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  photoRemoveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  photoRemoveText: {
    color: "#b91c1c",
    fontWeight: "800",
    fontSize: 12,
  },

  remarkInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 70,
    textAlignVertical: "top",
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },

  signatureCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    padding: 10,
  },
  signatureContainer: {
    height: 180,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  clearButton: {
    marginTop: 8,
    alignSelf: "flex-end",
  },
  clearButtonText: {
    fontSize: 13,
    color: "#b91c1c",
    fontWeight: "700",
  },

  signaturePreviewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    padding: 10,
    marginBottom: 4,
  },
  signatureHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  signatureInfoText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  signatureClearText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#b91c1c",
  },
  signaturePreviewBox: {
    height: 160,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  signatureImage: {
    width: "100%",
    height: "100%",
  },

  footerActionsRow: {
    flexDirection: "row",
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  footerActionSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderColor: "#e5e7eb",
  },
  footerActionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },

  /* Modal preview */
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  previewCard: {
    width: "100%",
    maxWidth: 900,
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 10,
  },
  previewImage: {
    width: "100%",
    height: 420,
    borderRadius: 10,
    backgroundColor: "#000",
  },
  previewCloseBtn: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  previewCloseText: {
    color: "#ffffff",
    fontWeight: "800",
  },
});
