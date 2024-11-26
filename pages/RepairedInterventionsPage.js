import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Image, ImageBackground, Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, ScrollView } from 'react-native';
import { supabase } from '../supabaseClient';
import { useFocusEffect } from '@react-navigation/native';
import CustomAlert from '../components/CustomAlert';
import Ionicons from "react-native-vector-icons/Ionicons";
import FontAwesome5 from "react-native-vector-icons/FontAwesome5";
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Icon from "react-native-vector-icons/FontAwesome"; // Pour les icônes

// Import de l'image depuis le dossier assets
const backgroundImage = require('../assets/listing2.jpg');

export default function RepairedInterventionsPage({ navigation }) {
  const [repairedInterventions, setRepairedInterventions] = useState([]);
  const [editingDetail, setEditingDetail] = useState({});
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [isSaved, setIsSaved] = useState({});
  const [notifyModalVisible, setNotifyModalVisible] = useState(false);
  const [selectedInterventionId, setSelectedInterventionId] = useState(null);
  const [photoAlertVisible, setPhotoAlertVisible] = useState(false);
  const loadRepairedInterventions = async () => {
    try {
      const { data, error } = await supabase
        .from('interventions')
        .select(`
          *,
          clients (name, ficheNumber)
        `)
        .eq('status', 'Réparé');

      if (error) throw error;

      const { data: imagesData, error: imagesError } = await supabase
        .from('intervention_images')
        .select('*');

      if (imagesError) throw imagesError;

      const interventionsWithImages = data.map(intervention => {
        const images = imagesData.filter(image => image.intervention_id === intervention.id);
        return { ...intervention, intervention_images: images };
      });

      setRepairedInterventions(interventionsWithImages);

      const savedStatus = {};
      interventionsWithImages.forEach((intervention) => {
        savedStatus[intervention.id] = intervention.detailIntervention && intervention.detailIntervention.trim() !== '';
      });
      setIsSaved(savedStatus);
    } catch (error) {
      console.error('Erreur lors du chargement des interventions réparées :', error);
    }
  };

  const saveDetailIntervention = async (id) => {
    const detail = editingDetail[id];
    if (!detail || detail.trim() === '') {
      setAlertMessage('Le champ "Détails de l\'intervention" est vide.');
      setAlertVisible(true);
      return;
    }
    try {
      const { error } = await supabase
        .from('interventions')
        .update({ detailIntervention: detail })
        .eq('id', id);

      if (error) throw error;

      setAlertMessage('Détails sauvegardés avec succès.');
      setAlertVisible(true);
      setIsSaved((prevState) => ({ ...prevState, [id]: true }));

      await loadRepairedInterventions();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des détails :', error);
    }
  };

  const updateClientNotification = async (selectedInterventionId, method) => {
    try {
      const { error } = await supabase
        .from('interventions')
        .update({ notifiedBy: method })
        .eq('id', selectedInterventionId);

      if (error) {
        console.error('Erreur lors de la mise à jour de la notification :', error);
        return;
      }

      await loadRepairedInterventions();
      setNotifyModalVisible(false);
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la notification :', error);
    }
  };

  const takePhoto = async (interventionId) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alert('Nous avons besoin de votre permission pour accéder à la caméra.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],// Propriété correcte
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        const base64Image = await convertImageToBase64(imageUri);

        if (base64Image) {
          await saveImage(interventionId, base64Image);
          await loadRepairedInterventions();
        }
      } else {
        alert('La photo n\'a pas été prise correctement ou l\'opération a été annulée.');
      }
    } catch (error) {
      console.error('Erreur lors de la prise de photo :', error);
    }
  };

  const convertImageToBase64 = async (uri) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (error) {
      console.error('Erreur lors de la conversion de l\'image en base64 :', error);
      return null;
    }
  };

  const saveImage = async (interventionId, base64Image) => {
    try {
      const { error } = await supabase
        .from('intervention_images')
        .insert([{ intervention_id: interventionId, image_data: base64Image }]);

      if (error) throw error;

      setAlertMessage('Photo sauvegardée avec succès.');
      setAlertVisible(true);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'image :', error);
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
    if (!intervention.intervention_images || intervention.intervention_images.length === 0) {
      setPhotoAlertVisible(true); // Affiche l'alerte si aucune photo n'est trouvée
    } else {
      navigation.navigate('SignaturePage', {
        interventionId: intervention.id,
        clientId: intervention.client_id
      });
    }
  };
  const moveToTop = (interventionId) => {
	const selectedIntervention = repairedInterventions.find(
	  (intervention) => intervention.id === interventionId
	);
	const remainingInterventions = repairedInterventions.filter(
	  (intervention) => intervention.id !== interventionId
	);
	setRepairedInterventions([selectedIntervention, ...remainingInterventions]);
  };
  return (
    <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    style={{ flex: 1 }}
  >
  

    <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
      <View style={styles.overlay}>
        <Text style={styles.title}>Interventions terminées</Text>
        <FlatList
          data={repairedInterventions}
          keyExtractor={(item) => item.id.toString()}
		                      keyboardShouldPersistTaps="handled" // Empêche le clavier de se fermer
                    contentContainerStyle={{ paddingBottom: 20 }} // Espace sous la liste
          renderItem={({ item }) => (
            <View style={styles.interventionCard}>
              <View style={styles.notificationAndToolsContainer}>
                <TouchableOpacity style={styles.iconStyle}
                  onPress={() => {
                    setSelectedInterventionId(item.id);
                    setNotifyModalVisible(true);
                  }}
                >
                  <Ionicons
                    name={
                      item?.notifiedBy === 'SMS'
                        ? 'chatbubbles-outline'
                        : item?.notifiedBy === 'Téléphone'
                        ? 'call-outline'
                        : 'notifications-off-outline'
                    }
                    size={40}
                    color={item?.notifiedBy ? 'green' : 'gray'}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconStyle}
                  onPress={() => takePhoto(item.id)}
                >
                  <FontAwesome5 name="camera" size={40} color="black" />
                </TouchableOpacity>
              </View>
			  <TouchableOpacity
      style={styles.moveToTopButton}
      onPress={() => moveToTop(item.id)}
    >
      <Ionicons name="arrow-up-circle-outline" size={30} color="blue" />
    </TouchableOpacity>
              <View style={styles.infoContainer}>
                <Text style={styles.interventionText}>Fiche N° : {item.clients.ficheNumber}</Text>
                <Text style={styles.interventionText}>Client : {item.clients.name}</Text>
                <Text style={styles.interventionText}>Type d'appareil: {item.deviceType}</Text>
                <Text style={styles.interventionText}>Marque: {item.brand}</Text>
				<Text style={styles.interventionText}>Modèle: {item.model}</Text>
				<Text style={styles.interventionText}>Numéro de série: {item.serial_number}</Text>
                <Text style={styles.interventionText}>Référence: {item.reference}</Text>
                <Text style={styles.interventionText}>Description du problème: {item.description}</Text>
                <Text style={styles.interventionText}>Chargeur: {item.chargeur ? 'Oui' : 'Non'}</Text>
                <Text style={styles.interventionText}>Coût: {item.cost} €</Text>
				
  <Text
    style={[
      styles.interventionText,
      item.paymentStatus === 'solde' ? styles.interventionTextSolde : styles.interventionTextNon
    ]}
  >
    Etat du règlement: {item.paymentStatus}
  </Text>

                <Text style={styles.interventionText}>Statut: {item.status}</Text>
                <Text style={styles.interventionText}>Commande: {item.commande}</Text>
                <Text style={styles.interventionText}>Date: {new Date(item.createdAt).toLocaleDateString('fr-FR')}</Text>

                <TextInput
                  style={styles.detailInput}
                  value={editingDetail[item.id] || item.detailIntervention || ''}
                  placeholder="Entrez les détails ici..."
                  onChangeText={(text) => {
                    setEditingDetail({ ...editingDetail, [item.id]: text });
                    setIsSaved((prevState) => ({ ...prevState, [item.id]: false }));
                  }}
                />

                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={() => saveDetailIntervention(item.id)}
                  >
				    <Icon
                            name="save"
                            size={20}
                            color="#202020"
                            style={styles.buttonIcon}
                        />
                    <Text style={styles.buttonText}>Sauvegarder les détails</Text>
                  </TouchableOpacity>

				  <TouchableOpacity
  style={[
    styles.restitutionButton,
    (
      !isSaved[item.id] || 
      (!editingDetail[item.id] && !item.detailIntervention) || 
      item.paymentStatus === 'non_regle' // Désactiver si le paiement n'est pas réglé
    ) ? styles.disabledButton : null
  ]}
  onPress={() => handleRestitution(item)}
  disabled={
    !isSaved[item.id] || 
    (!editingDetail[item.id] && !item.detailIntervention) || 
    item.paymentStatus === 'non_regle' // Désactiver si le paiement n'est pas réglé
  }
>
  <Icon
    name="check-circle"
    size={20}
    color="#202020"
    style={styles.buttonIcon}
  />
  <Text style={styles.buttonText}>Restitution</Text>
</TouchableOpacity>

                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => navigation.navigate('EditIntervention', {
                      interventionId: item.id,
                      clientId: item.client_id
                    })}
                  >
				  				    <Icon
                            name="edit"
                            size={20}
                            color="#202020"
                            style={styles.buttonIcon}
                        />
                    <Text style={styles.buttonText}>Éditer la fiche</Text>
                  </TouchableOpacity>
                </View>

                {item.intervention_images && item.intervention_images.length > 0 && (
                  <View style={styles.imageContainer}>
                    {item.intervention_images.map((image, index) => (
                      <Image
                        key={index}
                        source={{ uri: `data:image/jpeg;base64,${image.image_data}` }}
                        style={styles.imageThumbnail}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}
        />
      </View>

	  
      <Modal
  transparent={true}
  visible={photoAlertVisible}
  animationType="fade"
  onRequestClose={() => setPhotoAlertVisible(false)}
>
  <View style={styles.modalOverlay}>
    <View style={styles.alertBox}>
      <Text style={styles.alertTitle}>Aucune photo prise</Text>
      <Text style={styles.alertMessage}>Veuillez prendre une photo avant de procéder à la restitution.</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setPhotoAlertVisible(false)}
      >
        <Text style={styles.buttonText}>OK</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
      <Modal
        transparent={true}
        visible={notifyModalVisible}
        animationType="fade"
        onRequestClose={() => setNotifyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>Notifier le client</Text>
            <View style={styles.modalButtonRow}>  
              <TouchableOpacity
                style={styles.button}
                onPress={() => updateClientNotification(selectedInterventionId, 'SMS')}
              >
                <Text style={styles.buttonText}>SMS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.button}
                onPress={() => updateClientNotification(selectedInterventionId, 'Téléphone')}
              >
                <Text style={styles.buttonText}>Téléphone</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.button}
                onPress={() => setNotifyModalVisible(false)}
              >
                <Text style={styles.buttonText}>Annuler</Text>
              </TouchableOpacity>
            </View>
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
    </ImageBackground>
	
	
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 39, 39, 0.8)',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#fff',
  },
  interventionCard: {
    padding: 15,
    marginBottom: 10,
    backgroundColor: 'rgba(243, 243, 243, 0.9)',
    borderRadius: 10,
  },
  notificationAndToolsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  iconStyle: {
    padding: 10,
    borderWidth: 2,
    borderRadius: 10,
    borderColor: '#000',
    backgroundColor: '#fff',
    marginHorizontal: 5,
  },
  infoContainer: {
    marginTop: 10,
  },
  interventionText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  interventionTextNon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f50202',
    marginBottom: 5,
  },
  detailInput: {
    borderColor: 'gray',
    borderWidth: 1,
    padding: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  saveButton: {
    backgroundColor: '#acf5bb',
    padding: 5,
	alignItems: 'center',
    borderRadius: 5,
    flexDirection: 'row',
    marginRight: 5,
	elevation: 5,
	width: '33%', 
  },
    restitutionButton: {
        flexDirection: 'row',        // Aligne l'icône et le texte horizontalement
        alignItems: 'center',        // Centre l'icône et le texte verticalement
        padding: 10,
        backgroundColor: '#f0f0f0',  // Couleur d'arrière-plan de l'exemple
        borderRadius: 5,
		elevation: 5,
		width: '33%', 
    },
  editButton: {
	flexDirection: 'row',        // Aligne l'icône et le texte horizontalement
	alignItems: 'center',        // Centre l'icône et le texte verticalement
	padding: 10,
	backgroundColor: '#f0f0f0',  // Couleur d'arrière-plan de l'exemple
	borderRadius: 5,
	width: '33%',
	elevation: 5, 
},
  buttonText: {
    color: '#202020',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  buttonIcon: {
	marginRight: 10, // Espace entre l'icône et le texte
},
  imageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  imageThumbnail: {
    width: 80,
    height: 80,
    margin: 5,
    borderRadius: 5,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  alertBox: {
    width: 300,
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    alignItems: 'center',
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 10,
    marginHorizontal: 10,
  },
  disabledButton: {
  backgroundColor: '#ccc',
},
alertMessage: {
  fontSize: 16,
  color: '#333333',
  marginBottom: 10,
  textAlign: 'center',
},
moveToTopButton: {
  position: 'absolute',
  top: 10,
  right: 10,
  zIndex: 1,
  backgroundColor: 'white',
  borderRadius: 50,
  padding: 5,
  elevation: 5,
},
interventionTextSolde: {
	fontSize: 18,
    fontWeight: 'bold',
    color: '#056109',
    marginBottom: 5,
  },
});
