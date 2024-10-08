import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, Alert, TouchableOpacity, Text, ScrollView, KeyboardAvoidingView, Platform, Image, Modal, TouchableWithoutFeedback } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

export default function EditInterventionPage({ route, navigation }) {
  const { interventionId, clientId } = route.params;
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [status, setStatus] = useState('default');
  const [deviceType, setDeviceType] = useState('default');
  const [password, setPassword] = useState('');
  const [commande, setCommande] = useState('');
  const [chargeur, setChargeur] = useState('Non');
  const [updatedAt, setUpdatedAt] = useState('');
  const [brand, setBrand] = useState('');
  const [photos, setPhotos] = useState([]); // Stockage des photos
  const [selectedImage, setSelectedImage] = useState(null); // Pour agrandir les images

  useEffect(() => {
    const loadIntervention = async () => {
      try {
        const { data, error } = await supabase
          .from('interventions')
          .select('*')
          .eq('id', interventionId)
          .single();

        if (error) throw error;

        if (data) {
          setReference(data.reference);
          setDescription(data.description);
          setCost(data.cost ? data.cost.toString() : '');
          setStatus(data.status);
          setDeviceType(data.deviceType);
          setPassword(data.password);
          setCommande(data.commande);
          setChargeur(data.chargeur ? 'Oui' : 'Non');
          setBrand(data.brand || '');
          setUpdatedAt(data.updatedAt);
          setPhotos(data.photos || []);  // Charger les photos si elles existent
        }
      } catch (error) {
        console.error('Erreur lors du chargement de l\'intervention :', error);
      }
    };

    loadIntervention();
  }, [interventionId]);

  const handleSaveIntervention = async () => {
    if (!reference || !description || !cost || deviceType === 'default' || status === 'default') {
      Alert.alert('Erreur', 'Tous les champs doivent être remplis et une option doit être sélectionnée.');
      return;
    }

    try {
      const { error: interventionError } = await supabase
        .from('interventions')
        .update({
          reference,
          description,
          cost: parseFloat(cost),
          status,
          deviceType,
          password,
          commande,
          chargeur: chargeur === 'Oui',
          brand,
          photos,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', interventionId);

      if (interventionError) throw interventionError;

      const { error: clientError } = await supabase
        .from('clients')
        .update({
          updatedAt: new Date().toISOString(),
        })
        .eq('id', clientId);

      if (clientError) throw clientError;

      Alert.alert('Succès', 'Intervention modifiée avec succès.');
      navigation.goBack();
    } catch (error) {
      console.error('Erreur lors de la modification de l\'intervention :', error);
    }
  };

  const takePhoto = async () => {
    try {
      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;

        // Convertir l'image en base64
        const base64Image = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Ajouter la nouvelle image au tableau des photos
        setPhotos([...photos, base64Image]);
      } else {
        console.log('Aucune image capturée ou opération annulée.');
      }
    } catch (error) {
      console.error('Erreur lors de la capture d\'image :', error);
    }
  };

  const handleImagePress = (photo) => {
    setSelectedImage(photo);  // Sélectionner l'image pour l'afficher en plein écran
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
          style={styles.picker}
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
          value={brand}
          onChangeText={setBrand}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Référence du produit</Text>
        <TextInput
          style={styles.input}
          value={reference}
          onChangeText={setReference}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Description de la panne</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Mot de passe (si applicable)</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

        <Text style={styles.label}>Coût de la réparation (€)</Text>
        <TextInput
          style={styles.input}
          value={cost}
          onChangeText={setCost}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Statut</Text>
        <Picker
          selectedValue={status}
          style={styles.picker}
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
              value={commande}
              onChangeText={setCommande}
            />
          </>
        )}

        <Text style={styles.label}>Chargeur</Text>
        <Picker
          selectedValue={chargeur}
          style={styles.picker}
          onValueChange={(itemValue) => setChargeur(itemValue)}
        >
          <Picker.Item label="Non" value="Non" />
          <Picker.Item label="Oui" value="Oui" />
        </Picker>

        {updatedAt && (
          <Text style={styles.dateText}>
            Dernière modification : {new Date(updatedAt).toLocaleString('fr-FR')}
          </Text>
        )}

        {/* Affichage des photos en bas de la page */}
        {photos.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 }}>
            {photos.map((photo, index) => (
              <TouchableWithoutFeedback key={index} onPress={() => handleImagePress(photo)}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${photo}` }}
                  style={{ width: 100, height: 100, margin: 5 }}
                />
              </TouchableWithoutFeedback>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.addButton} onPress={takePhoto}>
          <Text style={styles.buttonText}>Prendre une photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveIntervention}>
          <Text style={styles.saveButtonText}>Sauvegarder l'intervention</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal pour afficher l'image en taille réelle */}
      {selectedImage && (
        <Modal visible={true} transparent={true} onRequestClose={() => setSelectedImage(null)}>
          <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
            <View style={styles.modalBackground}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${selectedImage}` }}
                style={styles.fullImage}
              />
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
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
  dateText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 20,
    alignSelf: 'center',
  },
  picker: {
    width: '90%',
    alignSelf: 'center',
    marginBottom: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#007BFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '60%',
    alignSelf: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  fullImage: {
    width: '90%',
    height: '90%',
    resizeMode: 'contain',
  },
});
