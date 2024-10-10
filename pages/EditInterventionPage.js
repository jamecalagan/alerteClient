import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, ScrollView, KeyboardAvoidingView, Platform, Modal, Image, TouchableWithoutFeedback } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialIcons } from '@expo/vector-icons'; // Pour l'icône de coche

export default function EditInterventionPage({ route, navigation }) {
  const { interventionId } = route.params;
  const [reference, setReference] = useState('');
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [status, setStatus] = useState('default');
  const [deviceType, setDeviceType] = useState('default');
  const [password, setPassword] = useState('');
  const [commande, setCommande] = useState('');
  const [chargeur, setChargeur] = useState('Non');
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertTitle, setAlertTitle] = useState('');
  const [photos, setPhotos] = useState([]);
  const [labelPhoto, setLabelPhoto] = useState(null); // Pour la photo de l'étiquette
  const [selectedImage, setSelectedImage] = useState(null); // Pour afficher l'image sélectionnée en plein écran

  useEffect(() => {
    const loadIntervention = async () => {
      try {
        const { data, error } = await supabase
          .from('interventions')
          .select('reference, brand, description, cost, status, deviceType, password, commande, chargeur, photos, label_photo')
          .eq('id', interventionId)
          .single();
    
        if (error) throw error;
    
        setReference(data.reference);
        setBrand(data.brand);
        setDescription(data.description);
        setCost(data.cost);  // Récupérer et assigner le coût
        setStatus(data.status);
        setDeviceType(data.deviceType);
        setPassword(data.password);
        setCommande(data.commande);
        setChargeur(data.chargeur ? 'Oui' : 'Non');
        setPhotos(data.photos || []);
        setLabelPhoto(data.label_photo || null);
        console.log("Intervention chargée :", data);
    
      } catch (error) {
        console.error('Erreur lors du chargement de l\'intervention :', error);
      }
    };
    

    loadIntervention();
  }, [interventionId]);

  // Fonction pour prendre la photo de l'étiquette
  const pickLabelImage = async () => {
    try {
      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        const base64Image = await convertImageToBase64(imageUri);
        if (base64Image) {
          setPhotos([...photos, base64Image]);  // Ajouter l'image à la liste
          setLabelPhoto(base64Image); // Marquer cette photo comme l'étiquette
          console.log("Photo d'étiquette définie :", base64Image); // Log pour vérifier
          if (!reference) {
            setReference('Voir photo pour référence produit');
          }
        }
      } else {
        console.log('Aucune image capturée ou opération annulée.');
      }
    } catch (error) {
      console.error('Erreur lors de la capture d\'image :', error);
    }
  };

  const pickAdditionalImage = async () => {
    try {
      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        const base64Image = await convertImageToBase64(imageUri);
        if (base64Image) {
          setPhotos([...photos, base64Image]);  // Ajouter l'image à la liste
        }
      } else {
        console.log('Aucune image capturée ou opération annulée.');
      }
    } catch (error) {
      console.error('Erreur lors de la capture d\'image :', error);
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

  const handleSaveIntervention = async () => {
    if (!reference || !brand || !description || !cost || deviceType === 'default' || status === 'default') {
      setAlertTitle('Erreur');
      setAlertMessage('Tous les champs doivent être remplis et une option doit être sélectionnée.');
      setAlertVisible(true);
      return;
    }

    try {
      const updatedIntervention = {
        reference,
        brand,
        description,
        cost,
        status,
        deviceType,
        password,
        commande,
        chargeur: chargeur === 'Oui',
        photos,
        label_photo: labelPhoto,  // Mettre à jour la photo de l'étiquette
      };

      console.log("Label photo envoyé à la DB :", labelPhoto); // Log pour vérification

      const { error } = await supabase
        .from('interventions')
        .update(updatedIntervention)
        .eq('id', interventionId);

      if (error) throw error;

      setAlertTitle('Succès');
      setAlertMessage('Intervention mise à jour avec succès.');
      setAlertVisible(true);
    } catch (error) {
      setAlertTitle('Erreur');
      setAlertMessage("Erreur lors de la mise à jour de l'intervention.");
      setAlertVisible(true);
      console.error("Erreur lors de la mise à jour de l'intervention :", error);
    }
  };

  const closeAlert = () => {
    setAlertVisible(false);
    if (alertTitle === 'Succès') {
      navigation.goBack();
    }
  };
  const handleImagePress = (imageUri) => {
    setSelectedImage(imageUri);  // Sélectionner l'image pour l'afficher en plein écran
  };
  
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={80}
    >
      <ScrollView>
      <Text style={styles.label}>Type de produit</Text>
  <Picker
    selectedValue={deviceType}
    style={styles.input}
    onValueChange={(itemValue) => setDeviceType(itemValue)}
  >
    <Picker.Item label="Sélectionnez un type de produit..." value="default" />
    <Picker.Item label="PC portable" value="PC portable" />
    <Picker.Item label="PC Fixe" value="PC Fixe" />
    <Picker.Item label="Tablette" value="Tablette" />
    <Picker.Item label="Smartphone" value="Smartphone" />
    <Picker.Item label="Console" value="Console" />
  </Picker>

  <Text style={styles.label}>Marque du produit</Text>
  <TextInput
    style={styles.input}
    value={brand.toUpperCase()}  // Afficher en majuscules
    onChangeText={(text) => setBrand(text.toUpperCase())}  // Forcer la saisie en majuscules
    autoCapitalize="characters"  // Forcer la saisie en majuscules
  />

  <View style={styles.referenceContainer}>
    <TextInput
      style={styles.referenceInput}
      value={reference.toUpperCase()}  // Afficher en majuscules
      onChangeText={(text) => setReference(text.toUpperCase())}  // Forcer la saisie en majuscules
      autoCapitalize="characters"  // Forcer la saisie en majuscules
      placeholder="Référence du produit"
    />
    {labelPhoto && (
      <MaterialIcons name="check-circle" size={24} color="green" style={styles.checkIcon} />
    )}
  </View>

  <TouchableOpacity style={styles.button} onPress={pickLabelImage}>
    <Text style={styles.buttonText}>Prendre une photo de l'étiquette</Text>
  </TouchableOpacity>

  <Text style={styles.label}>Description de la panne</Text>
  <TextInput
    style={styles.input}
    value={description.toUpperCase()}  // Afficher en majuscules
    onChangeText={(text) => setDescription(text.toUpperCase())}  // Forcer la saisie en majuscules
    multiline
    autoCapitalize="characters"  // Forcer la saisie en majuscules
  />

<Text style={styles.label}>Mot de passe (si applicable)</Text>
<TextInput
  style={styles.input}
  value={password}  // Pas de transformation en majuscules
  onChangeText={setPassword}  // Pas de forçage en majuscules
/>

  <Text style={styles.label}>Coût de la réparation (€)</Text>
  <TextInput
    style={styles.input}
    value={cost ? cost.toString() : ''}  // Convertir en string pour affichage
    keyboardType="numeric"
  />

  <Text style={styles.label}>Statut</Text>
  <Picker
    selectedValue={status}
    style={styles.input}
    onValueChange={(itemValue) => setStatus(itemValue)}
  >
    <Picker.Item label="Sélectionnez un statut..." value="default" />
    <Picker.Item label="En attente de pièces" value="En attente de pièces" />
    <Picker.Item label="Devis accepté" value="Devis accepté" />
    <Picker.Item label="Réparation en cours" value="Réparation en cours" />
    <Picker.Item label="Réparé" value="Réparé" />
    <Picker.Item label="Non réparable" value="Non réparable" />
  </Picker>

  {status === 'En attente de pièces' && (
    <>
      <Text style={styles.label}>Commande</Text>
      <TextInput
        style={styles.input}
        value={commande.toUpperCase()}  // Afficher en majuscules
        onChangeText={(text) => setCommande(text.toUpperCase())}  // Forcer la saisie en majuscules
        autoCapitalize="characters"  // Forcer la saisie en majuscules
      />
    </>
  )}

        <Text style={styles.label}>Chargeur</Text>
        <Picker
          selectedValue={chargeur}
          style={styles.input}
          onValueChange={(itemValue) => setChargeur(itemValue)}
        >
          <Picker.Item label="Non" value="Non" />
          <Picker.Item label="Oui" value="Oui" />
        </Picker>



{/* Affichage des images capturées */}
{photos.length > 0 && (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
    {photos.map((photo, index) => (
      <TouchableOpacity key={index} onPress={() => handleImagePress(photo)}>
        <Image
          source={{ uri: `data:image/jpeg;base64,${photo}` }} // Afficher les images en base64
          style={[styles.thumbnail, labelPhoto === photo && styles.labelPhoto]} // Bordure verte si c'est l'étiquette
        />
      </TouchableOpacity>
    ))}
  </View>
)}
{selectedImage && (
  <Modal visible={true} transparent={true} onRequestClose={() => setSelectedImage(null)}>
    <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
      <View style={styles.modalBackground}>
        <Image
          source={{ uri: `data:image/jpeg;base64,${selectedImage}` }}  // Affichage en grand
          style={styles.fullImage}
        />
      </View>
    </TouchableWithoutFeedback>
  </Modal>
)}

        <TouchableOpacity style={styles.button} onPress={pickAdditionalImage}>
          <Text style={styles.buttonText}>Prendre une autre photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveIntervention}>
          <Text style={styles.saveButtonText}>Sauvegarder l'intervention</Text>
        </TouchableOpacity>


      </ScrollView>

      <Modal
        transparent={true}
        visible={alertVisible}
        animationType="fade"
        onRequestClose={closeAlert}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>{alertTitle}</Text>
            <Text style={styles.alertMessage}>{alertMessage}</Text>
            <TouchableOpacity style={styles.button} onPress={closeAlert}>
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f2',
    paddingHorizontal: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#fff',
    width: '90%',
    alignSelf: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#555',
    width: '90%',
    alignSelf: 'center',
  },
  referenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '90%',
    alignSelf: 'center',
  },
  referenceInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    width: '80%',
  },
  checkIcon: {
    marginLeft: 10,
  },
  thumbnail: {
    width: 100,
    height: 100,
    margin: 5,
    borderRadius: 10,
  },
  labelPhoto: {
    borderWidth: 3,
    borderColor: 'green',
  },
  button: {
    backgroundColor: '#007BFF',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    width: '40%',
    alignSelf: 'center',
    marginBottom: 20,
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#0d790a',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '40%',
    alignSelf: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
  alertMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',  // Fond transparent
  },
  fullImage: {
    width: '90%',
    height: '90%',
    resizeMode: 'contain',  // Adapter l'image à la taille de l'écran
  },
});
