import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, ScrollView, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../supabaseClient';

export default function AddInterventionPage({ route, navigation }) {
  const { clientId } = route.params;
  const [reference, setReference] = useState('');
  const [brand, setBrand] = useState('');  // Nouvel état pour la marque
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [status, setStatus] = useState('default');  
  const [deviceType, setDeviceType] = useState('default');  
  const [password, setPassword] = useState('');
  const [commande, setCommande] = useState('');
  const [chargeur, setChargeur] = useState('Non');  
  const [alertVisible, setAlertVisible] = useState(false);  // Pour gérer l'affichage de l'alerte
  const [alertMessage, setAlertMessage] = useState('');  // Message d'alerte à afficher
  const [alertTitle, setAlertTitle] = useState('');  // Titre de l'alerte

  const handleSaveIntervention = async () => {
    if (!reference || !brand || !description || !cost || deviceType === 'default' || status === 'default') {
      setAlertTitle('Erreur');
      setAlertMessage('Tous les champs doivent être remplis et une option doit être sélectionnée.');
      setAlertVisible(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('interventions')
        .insert({
          reference,
          brand,  // Ajout de la marque
          description,
          cost,
          status,
          deviceType,
          password,
          commande,
          chargeur: chargeur === 'Oui',  
          createdAt: new Date().toISOString(),
          client_id: clientId,
        });

      if (error) throw error;

      setAlertTitle('Succès');
      setAlertMessage('Intervention ajoutée avec succès.');
      setAlertVisible(true);
    } catch (error) {
      setAlertTitle('Erreur');
      setAlertMessage("Erreur lors de l'ajout de l'intervention.");
      setAlertVisible(true);
      console.error("Erreur lors de l'ajout de l'intervention :", error);
    }
  };

  const closeAlert = () => {
    setAlertVisible(false);
    if (alertTitle === 'Succès') {
      navigation.goBack();  // Revenir à la page précédente seulement après un succès
    }
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
          value={brand}
          onChangeText={setBrand}
        />

        <Text style={styles.label}>Référence du produit</Text>
        <TextInput
          style={styles.input}
          value={reference}
          onChangeText={setReference}
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
              value={commande}
              onChangeText={setCommande}
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
  saveButton: {
    backgroundColor: '#4f4f4f',
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
  button: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
