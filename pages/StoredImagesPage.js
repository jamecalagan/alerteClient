import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  Linking
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const StoredImagesPage = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [sortBy, setSortBy] = useState("date");
  const navigation = useNavigation();

  useEffect(() => {
    fetchStoredImages();
  }, []);

  const fetchStoredImages = async () => {
    setLoading(true);
    const { data: files, error } = await supabase.storage.from("images").list("interventions", { limit: 100 });

    if (error) {
      console.error("Erreur récupération fichiers:", error);
      setLoading(false);
      return;
    }

    const enrichedImages = await Promise.all(
      files.map(async (file) => {
        const publicUrl = supabase.storage.from("images").getPublicUrl(`interventions/${file.name}`).data.publicUrl;
        const [interventionId] = file.name.split("_");

        const { data, error } = await supabase
          .from("interventions")
          .select("id, client_id, brand, model, clients(ficheNumber)")
          .eq("id", interventionId)
          .single();

        if (error) {
          console.warn("Intervention non trouvée pour:", interventionId);
          return null;
        }

        return {
          url: publicUrl,
          ficheNumber: data.clients?.ficheNumber || "Inconnu",
          filename: file.name,
          createdAt: file.created_at || null,
          brand: data.brand || "",
          model: data.model || "",
          interventionId,
        };
      })
    );

    setImages(enrichedImages.filter(Boolean));
    setLoading(false);
  };

  const deleteImage = async (filename) => {
    Alert.alert("Confirmation", "Voulez-vous vraiment supprimer cette image ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.storage.from("images").remove([`interventions/${filename}`]);
          if (error) {
            Alert.alert("Erreur", "Suppression impossible : " + error.message);
          } else {
            Alert.alert("Supprimée", "L'image a été supprimée du cloud");
            fetchStoredImages();
          }
        },
      },
    ]);
  };

  const showLink = (url) => {
    Alert.alert("Lien de l'image", url);
  };

  const openInBrowser = (url) => {
    Linking.openURL(url);
  };

  const filteredImages = images
    .filter((img) => img.ficheNumber.toString().toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "fiche") return a.ficheNumber - b.ficheNumber;
      if (sortBy === "marque") return a.brand.localeCompare(b.brand);
      if (sortBy === "modele") return a.model.localeCompare(b.model);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const formatDate = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("fr-FR");
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ backgroundColor: "#ccc", padding: 10, marginBottom: 16, borderRadius: 6 }}
      >
        <Text style={{ textAlign: "center", fontWeight: "bold" }}>⬅️ Retour</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
        📂 Images sauvegardées dans le cloud
      </Text>

      <TextInput
        placeholder="🔎 Rechercher par numéro de fiche"
        value={search}
        onChangeText={setSearch}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, marginBottom: 16 }}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 16 }}>
        {["date", "fiche", "marque", "modele"].map((type) => (
          <TouchableOpacity
            key={type}
            onPress={() => setSortBy(type)}
            style={{
              width: "48%",
              marginBottom: 8,
              backgroundColor: sortBy === type ? "#007bff" : "#e0e0e0",
              padding: 10,
              borderRadius: 8,
            }}
          >
            <Text style={{ textAlign: "center", color: sortBy === type ? "#fff" : "#000", fontWeight: "bold" }}>
              {type === "date" && "📅 Par date"}
              {type === "fiche" && "#️⃣ Par fiche"}
              {type === "marque" && "🏷️ Par marque"}
              {type === "modele" && "💡 Par modèle"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#000" />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {filteredImages.map((item, index) => (
            <View key={index} style={{ width: "48%", marginBottom: 16, backgroundColor: "#f9f9f9", padding: 8, borderRadius: 8 }}>
              <TouchableOpacity onPress={() => { setSelectedImage(item.url); setModalVisible(true); }}>
                <Image source={{ uri: item.url }} style={{ width: "100%", height: 150, borderRadius: 6 }} resizeMode="cover" />
              </TouchableOpacity>
              <Text style={{ fontWeight: "bold", marginTop: 6 }}>Fiche #{item.ficheNumber}</Text>
              <Text style={{ fontSize: 12 }}>{item.brand} {item.model}</Text>
              <Text style={{ fontSize: 12, color: "#888" }}>{item.filename}</Text>
              <Text style={{ fontSize: 11, color: "#aaa" }}>📅 {formatDate(item.createdAt)}</Text>
              <TouchableOpacity onPress={() => showLink(item.url)} style={{ backgroundColor: "#4caf50", padding: 6, marginTop: 6, borderRadius: 4 }}>
                <Text style={{ color: "white", textAlign: "center", fontSize: 12 }}>📋 Voir le lien</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openInBrowser(item.url)} style={{ backgroundColor: "#2196f3", padding: 6, marginTop: 6, borderRadius: 4 }}>
                <Text style={{ color: "white", textAlign: "center", fontSize: 12 }}>🌐 Ouvrir dans navigateur</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteImage(item.filename)} style={{ backgroundColor: "#e74c3c", padding: 6, marginTop: 6, borderRadius: 4 }}>
                <Text style={{ color: "white", textAlign: "center", fontSize: 12 }}>🗑 Supprimer</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center" }} onPress={() => setModalVisible(false)}>
          {selectedImage && (
            <Image source={{ uri: selectedImage }} style={{ width: "90%", height: "80%", borderRadius: 12 }} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
    </ScrollView>
  );
};

export default StoredImagesPage;
