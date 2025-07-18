import React, { useState, useRef } from "react";
import SmartImage from "../components/SmartImage";
import {
  View,
  Text,
  Alert,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ImageBackground,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { supabase } from "../supabaseClient";
import Icon from "react-native-vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import * as Animatable from "react-native-animatable";
import BottomNavigation from "../components/BottomNavigation";
// Helper pour obtenir une URI exploitable par <Image>
// À placer une seule fois en haut du fichier
const resolveImageUri = (uri) => {
  if (!uri || typeof uri !== "string") return null;

  // Chemins déjà valides
  if (/^(https?:|file:|content:|data:)/i.test(uri)) return uri;

  // Chemin local absolu sans schéma  → on préfixe
  if (uri.startsWith("/")) return `file://${uri}`;

  // Sinon on considère un fichier Supabase public
  return `${supabase.supabaseUrl}/storage/v1/object/public/${uri}`;
};


export default function RecoveredClientsPage({ navigation, route }) {
  const flatListRef = useRef(null); 
  const [recoveredClients, setRecoveredClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleSignatures, setVisibleSignatures] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;
  const [expandedCards, setExpandedCards] = useState({});
  const loadRecoveredClients = async () => {
    try {
      
      const { data: interventions, error: interventionsError } = await supabase
        .from("interventions")
        .select(
          `
					*,
					clients (name, ficheNumber, phone)
				`
        )
        .eq("status", "Récupéré")
        .order("updatedAt", { ascending: false });

      if (interventionsError) throw interventionsError;

      
      const { data: images, error: imagesError } = await supabase
        .from("intervention_images")
        .select("intervention_id, image_data");

      if (imagesError) throw imagesError;

      
      const combinedData = interventions.map((intervention) => ({
        ...intervention,
        intervention_images: images
          .filter((img) => img.intervention_id === intervention.id)
          .map((img) => img.image_data), 
      }));

      setRecoveredClients(combinedData);
      setFilteredClients(combinedData);
    } catch (error) {
      console.error("Erreur lors du chargement des clients récupérés :", error);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadRecoveredClients();
    }, [])
  );

  const toggleSignatureVisibility = (id) => {
    setVisibleSignatures((prevState) => ({
      ...prevState,
      [id]: !prevState[id],
    }));
  };

  const handleSearch = (query) => {
    setSearchQuery(query);

    if (query.trim() === "") {
      setFilteredClients(recoveredClients);
    } else {
      const filtered = recoveredClients.filter((client) => {
        const clientName = client.clients?.name?.toLowerCase() || "";
        const clientPhone = client.clients?.phone
          ? client.clients.phone.toString()
          : "";

        return (
          clientName.includes(query.toLowerCase()) ||
          clientPhone.includes(query)
        );
      });

      setFilteredClients(filtered);
      setCurrentPage(1); 
    }
  };

  const getPaginatedClients = () => {
    const data = filteredClients;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  };

  const totalPages = Math.ceil(filteredClients.length / pageSize);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  const scrollToCard = (index) => {
    if (flatListRef.current && typeof index === "number") {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
      });
    } else {
      console.error("scrollToCard : index invalide ou FlatList non disponible");
    }
  };
  const getDeviceIcon = (deviceType) => {
    switch (deviceType) {
      case "PC portable":
        return require("../assets/icons/portable.png");
      case "MacBook":
        return require("../assets/icons/macbook_air.png");
      case "iMac":
        return require("../assets/icons/iMac.png");
      case "PC Fixe":
        return require("../assets/icons/ordinateur (1).png");
      case "PC tout en un":
        return require("../assets/icons/allInone.png");
      case "Tablette":
        return require("../assets/icons/tablette.png");
      case "Smartphone":
        return require("../assets/icons/smartphone.png");
      case "Console":
        return require("../assets/icons/console-de-jeu.png");
      case "Disque dur":
        return require("../assets/icons/disk.png");
      case "Disque dur externe":
        return require("../assets/icons/disque-dur.png");
      case "Carte SD":
        return require("../assets/icons/carte-memoire.png");
      case "Cle usb":
        return require("../assets/icons/cle-usb.png");
      case "Casque audio":
        return require("../assets/icons/playaudio.png");
      case "Video-projecteur":
        return require("../assets/icons/Projector.png");
      case "Clavier":
        return require("../assets/icons/keyboard.png");
      case "Ecran":
        return require("../assets/icons/screen.png");
      case "iPAD":
        return require("../assets/icons/iPad.png");
      case "Imprimante":
        return require("../assets/icons/printer.png");
      case "Joystick":
        return require("../assets/icons/joystick.png");
      case "Processeur":
        return require("../assets/icons/Vga_card.png");
      case "Carte graphique":
        return require("../assets/icons/cpu.png");
      case "Manette":
        return require("../assets/icons/controller.png");
      default:
        return require("../assets/icons/point-dinterrogation.png");
    }
  };

  const handleScrollError = (info) => {
    console.warn("Scroll error:", info);
  };
  const toggleCardExpansion = (id, index) => {
    if (typeof index !== "number") {
      console.error(`Index non valide : ${index}`);
      return;
    }

   
    setExpandedCards((prevState) => ({
      ...prevState,
      [id]: !prevState[id],
    }));

    
    if (!expandedCards[id]) {
      scrollToCard(index);
    }
  };
  
  const toggleDetails = (id) => {
    setExpandedCards((prev) => ({
      ...prev,
      [id]: !prev[id], 
    }));
  };
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage); 
    }
  };
  const handleLabelClick = (e, labelPhotoUri) => {
    e.stopPropagation(); 
    setSelectedImage(labelPhotoUri); 
  };
  const deleteIntervention = async (id) => {
    Alert.alert(
      "Confirmation",
      "Es-tu sûr de vouloir supprimer cette intervention ?",
      [
        {
          text: "Annuler",
          style: "cancel",
        },
        {
          text: "Supprimer",
          onPress: async () => {
            try {
              const { error: imageError } = await supabase
                .from("intervention_images")
                .delete()
                .eq("intervention_id", id);

              const { error } = await supabase
                .from("interventions")
                .delete()
                .eq("id", id);

              if (error || imageError) {
                console.error("Erreur suppression :", error || imageError);
              } else {
                setRecoveredClients((prev) =>
                  prev.filter((item) => item.id !== id)
                );
                setFilteredClients((prev) =>
                  prev.filter((item) => item.id !== id)
                );
              }
            } catch (err) {
              console.error("Erreur lors de la suppression :", err);
            }
          },
          style: "destructive",
        },
      ]
    );
  };
  return (
    <View style={{ flex: 1, backgroundColor: "#e0e0e0" }}>
      <View style={styles.overlay}>
        <Text style={styles.title}>Clients ayant récupéré le matériel</Text>

        <TextInput
          style={styles.searchBar}
          placeholder="Rechercher par nom ou téléphone"
          placeholderTextColor="#242424"
          value={searchQuery}
          onChangeText={handleSearch}
        />

        <FlatList
          ref={flatListRef}
          onScrollToIndexFailed={(info) => {
            console.warn("Échec du défilement :", info);
            
            if (flatListRef.current) {
              flatListRef.current.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              });
            }
          }}
          data={getPaginatedClients()}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item, index }) => (
            <Animatable.View
              animation="zoomIn" 
              duration={400} 
              delay={index * 150} 
              style={[
                styles.card,
                index % 2 === 0 ? styles.cardEven : styles.cardOdd,
              ]}
            >
              <View>
                
                <View style={styles.cardHeader}>
                  <TouchableOpacity
                    onPress={() => toggleCardExpansion(item.id, index)}
                    activeOpacity={0.9}
                    style={{ flex: 1 }}
                  >
                    <Text style={styles.clientInfo}>
                      Fiche Client N°: {item.clients.ficheNumber}
                    </Text>
                    <Text style={styles.clientInfo}>
                      Nom: {item.clients.name}
                    </Text>
                    <Text style={styles.clientInfo}>
                      Téléphone:{" "}
                      {item.clients.phone.replace(/(\d{2})(?=\d)/g, "$1 ")}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.imageStack}>
                    
                    <Image
                      source={getDeviceIcon(item.deviceType)}
                      style={styles.deviceIcon}
                    />

                    
                    {item.label_photo && (
                      <TouchableOpacity
                        onPress={() => setSelectedImage(item.label_photo)}
                      >
                        <SmartImage
                          uri={item.label_photo}
                          ficheNumber={item.clients?.ficheNumber} 
                          interventionId={item.id}
                          type="label"
                          size={50}
                          borderRadius={4}
                          borderWidth={2}
                          badge 
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                
                {expandedCards[item.id] && (
                  <>
                    <Text style={styles.interventionInfo}>
                      Type d'appareil: {item.deviceType}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Marque: {item.brand}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Modèle: {item.model}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Référence: {item.reference}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Description du problème: {item.description}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Coût: {item.cost} €
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Date de récupération:{" "}
                      {new Date(item.updatedAt).toLocaleDateString("fr-FR")}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Détail de l'intervention: {item.detailIntervention}
                    </Text>
                    {item.receiver_name && (
                      <Text style={styles.receiverText}>
                        Récupéré par : {item.receiver_name}
                      </Text>
                    )}
                    <Text style={styles.interventionInfo}>
                      Remarques: {item.remarks}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Statut du règlement: {item.paymentStatus}
                    </Text>

                   
                    <View style={styles.imageContainer}>
                      
{/* Anciennes photos (champ `photos`) */}
{item.photos
  ?.filter((p) => p !== item.label_photo)
  .map((photo, idx) => {
    const uri = resolveImageUri(photo);
    return (
      <SmartImage
        key={`photo-${idx}`}
        uri={uri}                        // ✅ miniature
        ficheNumber={item.clients?.ficheNumber}
        interventionId={item.id}
        index={idx}
        type="photo"
        size={80}
        borderRadius={5}
        borderWidth={1}
        badge
        onPress={() => setSelectedImage(uri)}   // ✅ plein-écran
      />
    );
  })}

{/* Nouvelles images (`intervention_images`) */}
{item.intervention_images?.map((img, idx) => {
  const uri = resolveImageUri(img);
  return (
    <SmartImage
      key={`new-${idx}`}
      uri={uri}
      ficheNumber={item.clients?.ficheNumber}
      interventionId={item.id}
      index={idx}
      type="extra"
      size={80}
      borderRadius={5}
      borderWidth={2}
      badge
      onPress={() => setSelectedImage(uri)}
    />
  );
})}

                    </View>
                  </>
                )}
              </View>
            </Animatable.View>
          )}
        />

        <View style={styles.paginationContainer}>
         
          <TouchableOpacity
            onPress={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            style={styles.chevronButton}
          >
            <Image
              source={require("../assets/icons/chevrong.png")} // Icône pour chevron gauche
              style={[
                styles.chevronIcon,
                {
                  tintColor: currentPage === 1 ? "gray" : "white",
                },
              ]}
            />
          </TouchableOpacity>

          
          <Text style={styles.paginationText}>
            Page {currentPage} sur {totalPages}
          </Text>

          
          <TouchableOpacity
            onPress={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={styles.chevronButton}
          >
            <Image
              source={require("../assets/icons/chevrond.png")} 
              style={[
                styles.chevronIcon,
                {
                  tintColor: currentPage === totalPages ? "gray" : "white",
                },
              ]}
            />
          </TouchableOpacity>
        </View>
      </View>
      <BottomNavigation navigation={navigation} currentRoute={route.name} />
<Modal
  visible={!!selectedImage}
  transparent
  onRequestClose={() => setSelectedImage(null)}
>
  <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
    <View style={styles.modalBackground}>
      {selectedImage ? (
        <Image
          source={{ uri: selectedImage }}
          style={styles.fullImage}
          onError={() => {
            Alert.alert("Erreur", "Impossible de charger l’image.");
            setSelectedImage(null);
          }}
        />
      ) : null}
    </View>
  </TouchableWithoutFeedback>
</Modal>


    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0)",
    padding: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "medium",
    marginBottom: 20,
    textAlign: "center",
    color: "#242424",
  },
  searchBar: {
    backgroundColor: "#eeeded",
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#888787",
    marginBottom: 20,
    fontSize: 16,
    color: "#242424",
  },
  card: {
    backgroundColor: "#f0f0f0",
    padding: 15,
    marginBottom: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#888787",
    elevation: 2,
  },
  deviceIcon: {
    position: "absolute",
    top: 15,
    width: 40,
    height: 40,
    resizeMode: "contain",
    tintColor: "#888787",
  },
  row: {
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    width: "100%", 
  },

  iconContainer: {
    justifyContent: "center", 
    alignItems: "flex-end", 
    flex: 0, 
    marginLeft: 10, 
  },

  clientInfo: {
    fontSize: 16,
    marginBottom: 5,
    color: "#242424",
  },
  interventionInfo: {
    fontSize: 14,
    color: "#242424",
    marginBottom: 5,
  },

  icon: {
    marginRight: 10,
  },
  signatureImage: {
    backgroundColor: "#fcfcfc",
    width: "95%",
    height: 300,
    marginTop: 10,
    marginLeft: 20,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#888787",
  },
  imageContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
  imageThumbnail: {
    width: 80,
    height: 80,
    margin: 5,
    borderRadius: 5,
    resizeMode: "cover",
  },
  newImageThumbnail: {
    borderWidth: 2, 
    borderColor: "blue", 
  },
  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  fullImage: {
    width: "90%",
    height: "90%",
    resizeMode: "contain",
  },
  receiverText: {
    fontSize: 18,
    color: "#ff9100",
    marginTop: 5,
  },
  labelImage: {
    borderWidth: 2,
    borderColor: "green",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 10, 
    marginBottom: 60,
  },
  chevronButton: {
    padding: 5, 
  },
  chevronIcon: {
    width: 22, 
    height: 22, 
  },
  paginationText: {
    marginHorizontal: 10, 
    color: "#242424",
    fontSize: 20, 
  },

  rightIconWrapper: {
    position: "absolute",
    right: 15,
    top: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  labelThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "green",
    resizeMode: "cover",
  },

  deviceIcon: {
    width: 40,
    height: 40,
    resizeMode: "contain",
    tintColor: "#888787",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  imageStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10, 
  },
  toggleButton: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    padding: 10,
    backgroundColor: "#191f2f",
    borderWidth: 1,
    borderColor: "#929090",
    borderRadius: 5,
    elevation: 5,
  },
  toggleButtonText: {
    color: "#888787",
    fontWeight: "bold",
    marginLeft: 10,
  },
  icon: {
    marginRight: 10,
  },
});
