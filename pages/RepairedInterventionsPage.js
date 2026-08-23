import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  ImageBackground,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  Linking,
} from "react-native";
import { supabase } from "../supabaseClient";
import { useFocusEffect } from "@react-navigation/native";
import CustomAlert from "../components/CustomAlert";
import AlertBox from "../components/AlertBox";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useRoute } from "@react-navigation/native"; // Importer useRoute
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from 'expo-file-system/legacy';

import BottomNavigation from "../components/BottomNavigation";
import * as ImageManipulator from "expo-image-manipulator";
import * as Animatable from "react-native-animatable";
const backgroundImage = require("../assets/listing2.jpg");
ScrollView.defaultProps = { showsVerticalScrollIndicator: false };
FlatList.defaultProps = { showsVerticalScrollIndicator: false };
export default function RepairedInterventionsPage({ navigation }) {
  const route = useRoute(); // Utilise useRoute() sans le passer en paramètre

  const repairedInterventionsRef = useRef(null); // Créez une référence
  const [repairedInterventions, setRepairedInterventions] = useState([]);
  const [editingDetail, setEditingDetail] = useState({});
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [isSaved, setIsSaved] = useState({});
  const [notifyModalVisible, setNotifyModalVisible] = useState(false);

  const [photoAlertVisible, setPhotoAlertVisible] = useState(false);
  const [noPhotoRequired, setNoPhotoRequired] = useState({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteImageConfirmVisible, setDeleteImageConfirmVisible] = useState(false);
  const [pinnedInterventionId, setPinnedInterventionId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedInterventionId, setSelectedInterventionId] = useState(
    route.params?.selectedInterventionId || null
  );
  const [selectedInterventionPhone, setSelectedInterventionPhone] = useState(null);
  const [selectedInterventionDeviceType, setSelectedInterventionDeviceType] = useState("appareil");

  const [repairedTotal, setRepairedTotal] = useState(0); // Montant total des interventions "Réparé"
  const [currentPage, setCurrentPage] = useState(1); // Page actuelle
  const itemsPerPage = 4; // Nombre d'éléments par page
  const sortedInterventions = repairedInterventions.sort((a, b) => {
    if (a.id === pinnedInterventionId) return -1; // La fiche épinglée est toujours en haut
    if (b.id === pinnedInterventionId) return 1;
    return 0; // Conserve l'ordre des autres fiches
  });
  const resolveImageUrl = (s) => {
    if (!s || typeof s !== "string") return null;
    const clean = s.trim();
    if (/^https?:\/\//i.test(clean)) return clean; // déjà une URL
    // sinon, c'est un chemin relatif du bucket "images"
    const { data } = supabase.storage.from("images").getPublicUrl(clean);
    return data?.publicUrl || null;
  };

  /* 
    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage); // Met à jour la page actuelle
        }
    }; */

  // Calculer le nombre total de pages
  /* const totalPages = Math.ceil(repairedInterventions.length / itemsPerPage); */
  const loadRepairedInterventions = async () => {
    try {
      const { data, error } = await supabase
        .from("interventions")
        .select(
          `
					*,
					clients (phone, name, ficheNumber)
					`
        )
        .in("status", ["Réparé", "Non réparable"]); // Inclure les deux statuts

      if (error) throw error;

      const { data: imagesData, error: imagesError } = await supabase
        .from("intervention_images")
        .select("*");

      if (imagesError) throw imagesError;

 const interventionsWithImages = data.map((intervention) => {
   const images = imagesData.filter(
     (image) => String(image.intervention_id) === String(intervention.id)
   );
   return { ...intervention, intervention_images: images };
 });

      // Calcul du montant total des interventions "Réparé"
      const total = interventionsWithImages.reduce(
        (sum, intervention) => sum + (intervention.cost || 0),
        0
      );
      setRepairedTotal(total); // Met à jour le montant total

      setRepairedInterventions(interventionsWithImages);

      const savedStatus = {};
      interventionsWithImages.forEach((intervention) => {
        savedStatus[intervention.id] =
          intervention.detailIntervention &&
          intervention.detailIntervention.trim() !== "";
      });
      setIsSaved(savedStatus);
    } catch (error) {
      console.error(
        "Erreur lors du chargement des interventions réparées :",
        error
      );
    }
  };

  const deleteImage = async (imageId, interventionId, imageUrl) => {
    try {
      console.log("📦 Suppression INITIÉE pour :");
      console.log("🆔 ID:", imageId);
      console.log("🔧 Intervention ID:", interventionId);
      console.log("🌐 URL:", imageUrl);

      // 1. Supprimer de la base
      const { error: dbError } = await supabase
        .from("intervention_images")
        .delete()
        .eq("id", imageId);

      if (dbError) {
        console.error("❌ Erreur suppression BDD :", dbError);
        return;
      } else {
        console.log("✅ Supprimée de la table intervention_images");
      }

      // 2. Supprimer du bucket
      if (imageUrl && imageUrl.includes("/storage/v1/object/public/")) {
        const pathToDelete = imageUrl.replace(
          "https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/",
          ""
        );
        setRepairedInterventions((prevState) =>
          prevState.map((intervention) => {
            if (intervention.id === interventionId) {
              return {
                ...intervention,
                intervention_images: intervention.intervention_images.filter(
                  (img) => img.id !== imageId
                ),
              };
            }
            return intervention;
          })
        );

        console.log("📂 Chemin à supprimer :", pathToDelete);

        const { data, error: storageError } = await supabase.storage
          .from("images")
          .remove([pathToDelete]);

        if (storageError) {
          console.error("❌ Erreur suppression BUCKET :", storageError);
        } else {
          console.log(
            "✅ Tentative de suppression effectuée. Résultat :",
            data
          );
          console.log("➡️ Chemin tenté :", pathToDelete);
        }
      } else {
        console.warn("⚠️ URL non reconnue pour suppression dans le bucket.");
      }
    } catch (err) {
      console.error("❌ Exception dans deleteImage :", err);
    }
  };

  const saveDetailIntervention = async (id) => {
    const detail = editingDetail[id];
    if (!detail || detail.trim() === "") {
      setAlertMessage('Le champ "Détails de l\'intervention" est vide.');
      setAlertVisible(true);
      return;
    }
    try {
      const { error } = await supabase
        .from("interventions")
        .update({ detailIntervention: detail }) // ✅ Sauvegarde en base
        .eq("id", id);

      if (error) throw error;

      // ✅ Recharge uniquement la fiche concernée au lieu de tout recharger
      const { data: updatedIntervention, error: fetchError } = await supabase
        .from("interventions")
        .select("id, detailIntervention")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      // ✅ Mettre à jour l'état localement pour afficher le bon détail
      setEditingDetail((prevState) => ({
        ...prevState,
        [id]: updatedIntervention.detailIntervention, // Assure-toi que la valeur sauvegardée s'affiche
      }));

      setAlertMessage("Détails sauvegardés avec succès.");
      setAlertVisible(true);
      setIsSaved((prevState) => ({ ...prevState, [id]: true }));
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des détails :", error);
    }
  };

  const updateClientNotification = async (selectedInterventionId, method) => {
    try {
      const { error } = await supabase
        .from("interventions")
        .update({ notifiedBy: method })
        .eq("id", selectedInterventionId);

      if (error) {
        console.error(
          "Erreur lors de la mise à jour de la notification :",
          error
        );
        return;
      }

      await loadRepairedInterventions();
      setNotifyModalVisible(false);
    } catch (error) {
      console.error(
        "Erreur lors de la mise à jour de la notification :",
        error
      );
    }
  };

  const takePhoto = async (interventionId) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        alert(
          "Nous avons besoin de votre permission pour accéder à la caméra."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7, // Qualité initiale
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;

        // Compression de l'image
        const compressedImage = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 800 } }], // Redimensionne à une largeur maximale de 800px
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG } // Compression à 70% en JPEG
        );

        const base64Image = await convertImageToBase64(compressedImage.uri);

        if (base64Image) {
          await saveImage(interventionId, base64Image);
          await loadRepairedInterventions(); // Recharge les données après l'envoi
        }
      } else {
        alert(
          "La photo n'a pas été prise correctement ou l'opération a été annulée."
        );
      }
    } catch (error) {
      console.error("Erreur lors de la prise de photo :", error);
    }
  };

  const convertImageToBase64 = async (uri) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (error) {
      console.error(
        "Erreur lors de la conversion de l'image en base64 :",
        error
      );
      return null;
    }
  };

  const saveImage = async (interventionId, base64Image) => {
    try {
      const fileName = `${Date.now()}.jpg`;
      const filePath = `intervention_images/${interventionId}/${fileName}`;
      const fileUri = FileSystem.cacheDirectory + fileName;

      // Écrire le fichier temporairement
      await FileSystem.writeAsStringAsync(fileUri, base64Image, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const file = {
        uri: fileUri,
        name: fileName,
        type: "image/jpeg",
      };

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filePath, file, {
          upsert: true,
          contentType: "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("images").getPublicUrl(filePath);
      const imageUrl = data.publicUrl;

      const { error: insertError } = await supabase
        .from("intervention_images")
        .insert([{ intervention_id: interventionId, image_data: imageUrl }]);

      if (insertError) throw insertError;

      setAlertMessage("Photo sauvegardée avec succès.");
      setAlertVisible(true);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'image :", error);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadRepairedInterventions();
    }, [])
  );

  const closeAlert = () => {
    setAlertVisible(false);
  };
  const handleRestitution = (intervention) => {
    if (
      (!intervention.intervention_images ||
        intervention.intervention_images.length === 0) &&
      !noPhotoRequired[intervention.id] // Vérifie si l'option est activée
    ) {
      setSelectedInterventionId(intervention.id);
      setPhotoAlertVisible(true); // Ouvre la modale car la photo est requise
    } else {
      // Redirection immédiate vers SignaturePage
      navigation.navigate("SignaturePage", {
        interventionId: intervention.id,
        clientId: intervention.client_id,
      });
    }
  };

  const openImageModal = (imageUri, imageId, interventionId) => {
    console.log("🧩 Données reçues pour le modal :", {
      uri: imageUri,
      id: imageId,
      interventionId: interventionId,
    });

    setSelectedImage({
      uri: imageUri,
      id: imageId,
      interventionId: interventionId,
    });
    setIsModalVisible(true);
  };

  const closeImageModal = () => {
    setSelectedImage(null);
    setIsModalVisible(false);
  };

  setTimeout(() => {
    if (repairedInterventions.length > 0) {
      repairedInterventionsRef.current?.scrollToIndex({
        index: 0,
        animated: true,
      });
    }
  }, 0);

  const flatListRef = useRef(null);
  const updatePayment = async (id, newPartialPayment, cost) => {
    const { data, error } = await supabase
      .from("interventions")
      .update({
        partialPayment: newPartialPayment,
        solderestant: cost - newPartialPayment, // Calcul du montant restant
      })
      .eq("id", id);

    if (error) {
      console.error("Erreur lors de la mise à jour du paiement :", error);
    } else {
      console.log("Mise à jour réussie :", data);
    }
  };
  // Retourne l'image d'étiquette si on la trouve, sinon undefined
  const getLabelImage = (images = []) =>
    images.find(
      (img) =>
        // 3 pistes possibles : adapte selon ta structure de table
        img.type === "label" || // 1) un champ "type"
        (img.file_name || "").toLowerCase().includes("label") || // 2) nom du fichier
        (img.image_data || "").toLowerCase().includes("label") // 3) URL
    );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Interventions terminées</Text>
        <View style={styles.totalContainer}>
          <Ionicons name="cash-outline" size={16} color="#15803d" />
          <Text style={styles.totalText}>
            {repairedTotal.toFixed(2)} € au total
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={repairedInterventions.filter(
          (item) => item.id === selectedInterventionId
        )}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isNonReparable = item.status === "Non réparable";
          const isRestitutionDisabled =
            !isSaved[item.id] ||
            (!editingDetail[item.id] && !item.detailIntervention) ||
            item.paymentStatus === "non_regle";
          const hasDetailDraft =
            editingDetail[item.id] && editingDetail[item.id].trim() !== "";

          return (
            <View style={[styles.card, isNonReparable && styles.cardDanger]}>
              <View style={styles.cardTopRow}>
                <View style={styles.ficheBadge}>
                  <Text style={styles.ficheBadgeText}>
                    N° {item.clients?.ficheNumber || "—"}
                  </Text>
                </View>
                {isNonReparable && (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>Non réparable</Text>
                  </View>
                )}
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => {
                      setSelectedInterventionId(item.id);
                      setSelectedInterventionPhone(item.clients?.phone || null);
                      setSelectedInterventionDeviceType(
                        item.deviceType || "appareil"
                      );
                      setNotifyModalVisible(true);
                    }}
                  >
                    <Image
                      source={
                        item?.notifiedBy === "SMS"
                          ? require("../assets/icons/sms.png")
                          : item?.notifiedBy === "Téléphone"
                          ? require("../assets/icons/call.png")
                          : require("../assets/icons/notifications_off.png")
                      }
                      style={[
                        styles.iconBtnImage,
                        { tintColor: item?.notifiedBy ? "#00c853" : "#94a3b8" },
                      ]}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => takePhoto(item.id)}
                  >
                    <Image
                      source={
                        item?.intervention_images?.length > 0
                          ? require("../assets/icons/photo_ok.png")
                          : require("../assets/icons/photo.png")
                      }
                      style={[
                        styles.iconBtnImage,
                        {
                          tintColor:
                            item?.intervention_images?.length > 0
                              ? "#2563eb"
                              : "#475569",
                        },
                      ]}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.clientName}>
                {item.clients?.name || "Client inconnu"}
              </Text>
              <Text style={styles.clientPhone}>
                {item.clients?.phone
                  ? item.clients.phone.replace(/(\d{2})(?=\d)/g, "$1 ")
                  : "Téléphone non disponible"}
              </Text>

              <View style={styles.infoGrid}>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>Type</Text>
                  <Text style={styles.infoValue}>{item.deviceType || "—"}</Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>Marque</Text>
                  <Text style={styles.infoValue}>{item.brand || "—"}</Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>Modèle</Text>
                  <Text style={styles.infoValue}>{item.model || "—"}</Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>N° série</Text>
                  <Text style={styles.infoValue}>
                    {item.serial_number || "—"}
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Référence</Text>
                {item.reference?.toLowerCase().includes("voir photo") &&
                item.label_photo ? (
                  <TouchableOpacity
                    onPress={() =>
                      openImageModal(item.label_photo, null, item.id)
                    }
                  >
                    <Text style={styles.referenceLink}>{item.reference}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.sectionValue}>
                    {item.reference || "—"}
                  </Text>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Description du problème</Text>
                <Text style={styles.sectionValue}>
                  {item.description || "—"}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>
                  Chargeur : {item.chargeur ? "Oui" : "Non"}
                </Text>
                <Text style={styles.metaText}>
                  Commande : {item.commande || "—"}
                </Text>
                <Text style={styles.metaText}>
                  {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                </Text>
              </View>

              <View style={styles.paymentBox}>
                <View style={styles.paymentTopRow}>
                  <Text style={styles.paymentCost}>{item.cost} €</Text>
                  <View
                    style={[
                      styles.paymentPill,
                      item.paymentStatus === "solde"
                        ? styles.paymentPillOk
                        : styles.paymentPillWarn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.paymentPillText,
                        item.paymentStatus === "solde"
                          ? styles.paymentPillTextOk
                          : styles.paymentPillTextWarn,
                      ]}
                    >
                      {item.paymentStatus}
                    </Text>
                  </View>
                </View>
                {item.paymentStatus === "reglement_partiel" &&
                  item.partialPayment && (
                    <Text style={styles.paymentSub}>
                      Acompte de {item.partialPayment} €
                    </Text>
                  )}
                <Text style={styles.paymentDue}>
                  Reste dû :{" "}
                  {item.solderestant !== null
                    ? `${item.solderestant} €`
                    : `${item.cost - (item.partialPayment || 0)} €`}
                </Text>
                <Text style={styles.paymentStatusLine}>
                  Statut intervention : {item.status}
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Détails de l'intervention</Text>
              <TextInput
                style={styles.detailInput}
                placeholderTextColor="#94a3b8"
                placeholder="Entrez les détails ici..."
                multiline
                value={editingDetail[item.id] ?? item.detailIntervention ?? ""}
                onChangeText={(text) =>
                  setEditingDetail({
                    ...editingDetail,
                    [item.id]: text,
                  })
                }
              />

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    hasDetailDraft && styles.actionBtnReady,
                  ]}
                  onPress={() => saveDetailIntervention(item.id)}
                >
                  <Ionicons name="save-outline" size={18} color="#475569" />
                  <Text style={styles.actionBtnText}>Sauvegarder</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    isRestitutionDisabled && styles.actionBtnDisabled,
                  ]}
                  onPress={() => handleRestitution(item)}
                  disabled={isRestitutionDisabled}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={isRestitutionDisabled ? "#94a3b8" : "#15803d"}
                  />
                  <Text
                    style={[
                      styles.actionBtnText,
                      !isRestitutionDisabled && { color: "#15803d" },
                    ]}
                  >
                    Restitution
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() =>
                    navigation.navigate("EditIntervention", {
                      interventionId: item.id,
                      clientId: item.client_id,
                    })
                  }
                >
                  <Ionicons name="create-outline" size={18} color="#475569" />
                  <Text style={styles.actionBtnText}>Éditer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() =>
                    navigation.navigate("BillingPage", {
                      expressData: {
                        name: item.clients?.name || "",
                        phone: item.clients?.phone || "",
                        client_address: "",
                        description: `${
                          item.detailIntervention?.trim() ||
                          item.description ||
                          ""
                        }\n${item.deviceType || "Appareil"} — ${
                          item.brand || "Marque inconnue"
                        } — ${item.model || "Modèle inconnu"}`,
                        quantity: "1",
                        price: item.cost?.toString() || "0",
                        serial: item.serial_number || "",
                        paymentmethod: "",
                        acompte: item.partialPayment?.toString() || "",
                        paid: item.paymentStatus === "solde",
                        intervention_id: item.id,
                      },
                    })
                  }
                >
                  <Ionicons name="receipt-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnPrimaryText}>Facture</Text>
                </TouchableOpacity>
              </View>

              {item.intervention_images &&
                item.intervention_images.length > 0 && (
                  <View style={styles.imageContainer}>
                    {item.intervention_images.map((img) => {
                      const uri = resolveImageUrl(
                        img.image_data || img.image_url
                      );
                      if (!uri) return null;
                      return (
                        <TouchableOpacity
                          key={`intervention-image-${img.id}`}
                          onPress={() => openImageModal(uri, img.id, item.id)}
                        >
                          <Image source={{ uri }} style={styles.imageThumbnail} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

              <TouchableOpacity
                style={styles.backButton}
                onPress={() =>
                  navigation.navigate("RepairedInterventionsListPage")
                }
              >
                <Ionicons name="arrow-back" size={18} color="#fff" />
                <Text style={styles.backButtonText}>Retour</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <BottomNavigation navigation={navigation} currentRoute={route.name} />
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={closeImageModal}
          >
            <Ionicons name="close-circle" size={40} color="white" />
          </TouchableOpacity>

          {selectedImage?.uri && (
            <View
              style={{
                justifyContent: "center",
                alignItems: "center",
                width: "100%",
                height: "100%",
              }}
            >
              <Image
                source={{ uri: selectedImage.uri }}
                style={{ width: "90%", height: "70%", resizeMode: "contain" }}
                onError={() => alert("Image introuvable.")}
              />

              {selectedImage.id && (
                <TouchableOpacity
                  style={[
                    styles.deleteButton,
                    { position: "absolute", bottom: 40 },
                  ]}
                  onPress={() => setDeleteImageConfirmVisible(true)}
                >
                  <Ionicons name="trash" size={22} color="white" />
                  <Text style={styles.deleteButtonText}>
                    {isDeleting ? "Suppression..." : "Supprimer"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </Modal>

      <AlertBox
        visible={deleteImageConfirmVisible}
        title="Confirmer la suppression"
        message="Es-tu sûr de vouloir supprimer cette image ?"
        cancelText="Annuler"
        confirmText="Supprimer"
        onClose={() => setDeleteImageConfirmVisible(false)}
        onConfirm={async () => {
          setDeleteImageConfirmVisible(false);
          setIsDeleting(true);
          await deleteImage(
            selectedImage.id,
            selectedImage.interventionId,
            selectedImage.uri
          );
          setIsDeleting(false);
          closeImageModal();
          await loadRepairedInterventions();
        }}
      />

      <AlertBox
        visible={photoAlertVisible}
        title="Aucune photo prise"
        message="Veuillez prendre une photo avant de procéder à la restitution."
        cancelText="OK"
        confirmText="Pas de photo nécessaire"
        onClose={() => setPhotoAlertVisible(false)}
        onConfirm={() => {
          if (selectedInterventionId) {
            setNoPhotoRequired((prev) => ({
              ...prev,
              [selectedInterventionId]: true,
            }));

            setPhotoAlertVisible(false);

            const intervention = repairedInterventions.find(
              (item) => item.id === selectedInterventionId
            );

            if (intervention) {
              setTimeout(() => {
                navigation.navigate("SignaturePage", {
                  interventionId: intervention.id,
                  clientId: intervention.client_id,
                });
              }, 300);
            }
          }
        }}
      />

      <Modal
        transparent={true}
        visible={notifyModalVisible}
        animationType="fade"
        onRequestClose={() => setNotifyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.notifyCard}>
            <Text style={styles.notifyTitle}>Notifier le client</Text>
            <Text style={styles.notifySubtitle}>
              Comment souhaitez-vous prévenir le client ?
            </Text>

            <TouchableOpacity
              style={[styles.notifyOption, styles.notifyOptionSms]}
              onPress={() => {
                if (selectedInterventionPhone) {
                  const message = `Bonjour, votre ${selectedInterventionDeviceType} est prêt(e). N'oubliez pas le bon de restitution, merci\n\nAVENIR INFORMATIQUE`;
                  Linking.openURL(
                    `sms:${selectedInterventionPhone}?body=${encodeURIComponent(
                      message
                    )}`
                  );
                }
                updateClientNotification(selectedInterventionId, "SMS");
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#077907" />
              <Text style={[styles.notifyOptionText, { color: "#077907" }]}>
                SMS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.notifyOption, styles.notifyOptionCall]}
              onPress={() => {
                if (selectedInterventionPhone) {
                  Linking.openURL(`tel:${selectedInterventionPhone}`);
                }
                updateClientNotification(selectedInterventionId, "Téléphone");
              }}
            >
              <Ionicons name="call-outline" size={18} color="#3579ff" />
              <Text style={[styles.notifyOptionText, { color: "#3579ff" }]}>
                Téléphone
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notifyCancel}
              onPress={() => setNotifyModalVisible(false)}
            >
              <Text style={styles.notifyCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {alertVisible && (
        <CustomAlert
          title="Alerte"
          message={alertMessage}
          onClose={closeAlert}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },

  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
  },
  totalContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dcfce7",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  totalText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#15803d",
  },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardDanger: {
    borderLeftWidth: 4,
    borderLeftColor: "#dc2626",
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  ficheBadge: {
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  ficheBadgeText: {
    color: "#4338ca",
    fontWeight: "700",
    fontSize: 12,
  },
  statusBadge: {
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  statusBadgeText: {
    color: "#b91c1c",
    fontWeight: "700",
    fontSize: 11,
  },
  headerActions: {
    flexDirection: "row",
    marginLeft: "auto",
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnImage: {
    width: 20,
    height: 20,
  },

  clientName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  clientPhone: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
    marginBottom: 12,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  infoCell: {
    width: "50%",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "600",
    marginTop: 2,
  },

  section: { marginBottom: 10 },
  sectionLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  sectionValue: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
  },
  referenceLink: {
    fontSize: 14,
    color: "#2563eb",
    textDecorationLine: "underline",
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
  },
  metaText: {
    fontSize: 12,
    color: "#64748b",
  },

  paymentBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  paymentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  paymentCost: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  paymentPill: {
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  paymentPillOk: { backgroundColor: "#dcfce7" },
  paymentPillWarn: { backgroundColor: "#fef3c7" },
  paymentPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  paymentPillTextOk: { color: "#15803d" },
  paymentPillTextWarn: { color: "#b45309" },
  paymentSub: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 6,
  },
  paymentDue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 6,
  },
  paymentStatusLine: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
  },

  detailInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    marginBottom: 14,
    color: "#0f172a",
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
  },

  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    gap: 4,
  },
  actionBtnReady: {
    backgroundColor: "#f0fdf4",
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    gap: 4,
  },
  actionBtnPrimaryText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  imageContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    marginBottom: 14,
  },
  imageThumbnail: {
    width: 76,
    height: 76,
    borderRadius: 10,
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#334155",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    top: 40,
    right: 24,
    zIndex: 1,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dc2626",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  deleteButtonText: {
    color: "white",
    fontWeight: "700",
  },

  notifyCard: {
    width: 300,
    padding: 22,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  notifyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 4,
  },
  notifySubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 16,
  },
  notifyOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    marginBottom: 10,
  },
  notifyOptionSms: { backgroundColor: "#dcfce7" },
  notifyOptionCall: { backgroundColor: "#dbeafe" },
  notifyOptionText: {
    fontSize: 15,
    fontWeight: "700",
  },
  notifyCancel: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 2,
  },
  notifyCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },
});
