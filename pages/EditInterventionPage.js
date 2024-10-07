import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, Alert, TouchableOpacity, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../supabaseClient';

export default function EditInterventionPage({ route, navigation }) {
  const { interventionId, clientId } = route.params;
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [status, setStatus] = useState('default');  // Valeur par défaut
  const [deviceType, setDeviceType] = useState('default');  // Valeur par défaut
  const [password, setPassword] = useState('');
  const [commande, setCommande] = useState('');
  const [chargeur, setChargeur] = useState('Non');
  const [updatedAt, setUpdatedAt] = useState('');
  const [brand, setBrand] = useState('');  // Ajout de l'état pour la marque

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
          setBrand(data.brand || '');  // Charger la marque
          setUpdatedAt(data.updatedAt);
        }
      } catch (error) {
        console.error('Erreur lors du chargement de l\'intervention :', error);
      }
    };

    loadIntervention();
  }, [interventionId]);

  const handleSaveIntervention = async () => {
    // Vérification que tous les champs sont remplis correctement
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
          brand,  // Sauvegarder la marque
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
          <Picker.Item label="Disque dur" value="Disque dur" />
          <Picker.Item label="Carte SD" value="Carte SD" />
          <Picker.Item label="Cle usb" value="Cle usb" />
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

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveIntervention}>
          <Text style={styles.saveButtonText}>Sauvegarder l'intervention</Text>
        </TouchableOpacity>
      </ScrollView>
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
});
