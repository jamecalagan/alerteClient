import React, { useState } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertBox from '../components/AlertBox'; // Import du composant AlertBox

export default function EditClientPage({ route, navigation }) {
  const { client, index } = route.params;

  // États pour gérer les informations du client
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone);
  const [reference, setReference] = useState(client.reference);
  const [description, setDescription] = useState(client.description);
  const [cost, setCost] = useState(client.cost);
  const [brand, setBrand] = useState(client.brand || '');  // Ajout de l'état pour la marque
  const [status, setStatus] = useState(client.status);
  const [interventions, setInterventions] = useState(client.interventions || []);

  // États pour gérer l'alerte
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const handleAddIntervention = () => {
    const newIntervention = {
      reference: 'Nouvelle intervention',
      description: 'Description de l\'intervention',
      cost: '100',
      date: new Date().toLocaleString(),
      brand,  // Inclure la marque dans les interventions
    };

    setInterventions([...interventions, newIntervention]);
  };

  const handleSaveClient = async () => {
    try {
      const storedClients = await AsyncStorage.getItem('clients');
      let clients = JSON.parse(storedClients) || [];

      clients[index] = {
        ...clients[index],
        name,
        phone,
        reference,
        description,
        cost,
        brand,  // Enregistrer la marque
        status,
        interventions,
      };

      await AsyncStorage.setItem('clients', JSON.stringify(clients));
      showAlert('Succès', 'Client modifié.'); // Utiliser AlertBox au lieu de Alert.alert
      navigation.goBack();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du client:', error);
      showAlert('Erreur', 'Erreur lors de la sauvegarde du client.'); // Alerte en cas d'erreur
    }
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.input} value={name} onChangeText={setName} />
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextInput style={styles.input} value={reference} onChangeText={setReference} />
      <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholder="Marque du produit" /> 
      <TextInput style={styles.input} value={description} onChangeText={setDescription} multiline />
      <TextInput style={styles.input} value={cost} onChangeText={setCost} keyboardType="numeric" />

      <FlatList
        data={interventions}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View>
            <Text>Référence: {item.reference}</Text>
            <Text>Description: {item.description}</Text>
            <Text>Coût: {item.cost} €</Text>
            <Text>Marque: {item.brand}</Text> 
            <Text>Date: {item.date}</Text>
          </View>
        )}
      />

      <Button title="Ajouter une intervention" onPress={handleAddIntervention} />
      <Button title="Sauvegarder" onPress={handleSaveClient} />

      {/* AlertBox pour les messages d'alerte */}
      <AlertBox
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
        confirmText="OK"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
});
