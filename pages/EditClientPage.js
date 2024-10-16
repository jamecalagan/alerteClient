import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, FlatList, Text } from 'react-native';
import { supabase } from '../supabaseClient'; // Import du client Supabase
import Icon from 'react-native-vector-icons/FontAwesome'; // Pour les icônes
import AlertBox from '../components/AlertBox'; // Import du composant AlertBox
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';

export default function EditClientPage({ route, navigation }) {
  const { client } = route.params;

  // États pour gérer les informations du client
  const [name, setName] = useState(client.name || '');
  const [phone, setPhone] = useState(client.phone || '');
  const [email, setEmail] = useState(client.email || ''); // Ajoute l'état pour l'email

  const [interventions, setInterventions] = useState(client.interventions || []);

  // États pour gérer l'affichage de l'alerte
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [onConfirmAction, setOnConfirmAction] = useState(null); // Ajout d'une fonction de confirmation

  // Fonction pour afficher l'alerte personnalisée
  const showAlert = (title, message, onConfirm = null) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setOnConfirmAction(() => onConfirm); // Stocke la fonction de confirmation
    setAlertVisible(true);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadClientData);
    return unsubscribe;
  }, [navigation]);

  const loadClientData = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*, interventions(*)')  // Sélectionne également les interventions liées
      .eq('id', client.id);

    if (error) {
      showAlert('Erreur', 'Erreur lors du chargement du client');
      return;
    }

    if (data && data.length > 0) {
      const updatedClient = data[0];

      // Filtrer les interventions pour exclure celles avec le statut 'Récupéré'
      const filteredInterventions = updatedClient.interventions.filter(
        (intervention) => intervention.status !== 'Récupéré'
      );

      setName(updatedClient.name);
      setPhone(updatedClient.phone);
      setInterventions(filteredInterventions || []);  // Mettre à jour avec les interventions filtrées
    }
  };

  const handleSaveClient = async () => {
    if (!name || !phone) {
      showAlert('Erreur', 'Le nom et le numéro de téléphone doivent être remplis.');
      return;
    }

    try {
      const { error } = await supabase
        .from('clients')
        .update({ name, phone, email: email || null, updatedAt: new Date().toISOString() }) // Inclure l'email
        .eq('id', client.id);

      if (error) throw error;

      showAlert('Succès', 'Client modifié avec succès.');
      navigation.goBack();
    } catch (error) {
      showAlert('Erreur', 'Erreur lors de la modification du client');
    }
  };

  const handleDeleteIntervention = (interventionId) => {
    // Afficher une alerte pour confirmer la suppression
    showAlert(
      'Confirmer la suppression',
      'Êtes-vous sûr de vouloir supprimer cette intervention ?',
      async () => {
        try {
          const { error } = await supabase
            .from('interventions')
            .delete()
            .eq('id', interventionId);
          
          if (error) throw error;
          
          loadClientData();  // Recharger les interventions après suppression
          showAlert('Succès', 'Intervention supprimée avec succès.');
        } catch (error) {
          showAlert('Erreur', 'Erreur lors de la suppression de l\'intervention');
        }
      }
    );
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'En attente de pièces':
        return { borderColor: '#270381', borderWidth: 4 }; // Violet
      case 'Devis accepté':
        return { borderColor: '#FFD700', borderWidth: 4 }; // Jaune
      case 'Réparation en cours':
        return { borderColor: '#528fe0', borderWidth: 4 }; // Orange
      case 'Réparé':
        return { borderColor: '#98fb98', borderWidth: 4 }; // Vert clair
      case 'Non réparable':
        return { borderColor: '#e9967a', borderWidth: 4 }; // Rouge clair
      default:
        return { borderColor: '#e0e0e0', borderWidth: 4 }; // Grise par défaut
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Interventions</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(text) => setName(text.toUpperCase())} // Convertit en majuscules à chaque changement
        autoCapitalize="characters"  // Force les majuscules lors de la saisie
      />

      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="Adresse e-mail (optionnel)"
      />

      {interventions.length > 0 ? (
        <FlatList
          data={interventions}
          keyExtractor={(item, idx) => idx.toString()}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.interventionCard, getStatusStyle(item.status)]}
              onPress={() =>
                navigation.navigate('EditIntervention', {
                  clientId: client.id,
                  interventionId: item.id,
                })
              }
            >
              <Text style={styles.interventionText}>Intervention N° {index + 1}</Text>
              <Text style={styles.interventionText}>Type d'appareil: {item.deviceType}</Text>
              <Text style={styles.interventionText}>Marque: {item.brand}</Text> 
              <Text style={styles.interventionText}>Référence: {item.reference}</Text> 
              <Text style={styles.interventionText}>Description de l'intervention,: {item.description}</Text>
              <Text style={styles.interventionText}>Coût total: {item.cost} €</Text>
              <Text style={styles.interventionText}>Statut: {item.status}</Text>

              <Text style={styles.interventionText}>Date: {new Date(item.createdAt).toLocaleDateString('fr-FR')}</Text>
              <Text style={styles.interventionText}>Chargeur: {item.chargeur ? 'Oui' : 'Non'}</Text>

              {/* Affichage du produit en commande si le statut est "En attente de pièces" */}
              {item.status === 'En attente de pièces' && (
  <>
    <Text style={styles.interventionText}>Produit en commande: {item.commande}</Text>
    <TouchableOpacity
  style={styles.commandeRecuButton}
  onPress={() => {
    // Afficher une alerte de confirmation avant de mettre à jour le statut
    showAlert(
      'Confirmer la réception de la commande',
      'Êtes-vous sûr de vouloir passer le statut à "Réparation en cours" ?',
      async () => {
        try {
          const { error } = await supabase
            .from('interventions')
            .update({ status: 'Réparation en cours' })
            .eq('id', item.id);

          if (error) {
            console.error('Erreur lors de la mise à jour du statut', error);
            return;
          }

          // Met à jour le statut localement pour qu'il change immédiatement dans l'UI
          const updatedInterventions = interventions.map((intervention) =>
            intervention.id === item.id
              ? { ...intervention, status: 'Réparation en cours' }
              : intervention
          );
          setInterventions(updatedInterventions);

          // Afficher une alerte de succès après confirmation
          showAlert('Succès', 'Statut mis à jour à "Réparation en cours".');
        } catch (error) {
          console.error('Erreur lors de la mise à jour du statut', error);
        }
      }
    );
  }}
>
  <Text style={styles.commandeRecuButtonText}>Commande reçue</Text>
</TouchableOpacity>

  </>
)}
              <TouchableOpacity style={styles.trashButton} onPress={() => handleDeleteIntervention(item.id)}>
                <Icon name="trash" size={20} color="#000" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      ) : (
        <Text>Aucune intervention trouvée.</Text>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.iconButton} onPress={handleSaveClient}>
          <Icon name="save" size={20} color="#fff" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Sauvegarder</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, styles.addButton]}
          onPress={() => navigation.navigate('AddIntervention', { clientId: client.id })}
        >
          <Icon name="plus" size={20} color="#fff" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Ajouter une intervention</Text>
        </TouchableOpacity>
      </View>

      {/* AlertBox pour les alertes */}
      <AlertBox
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        confirmText="Confirmer"
        cancelText="Annuler"
        onConfirm={() => {
          setAlertVisible(false);
          if (onConfirmAction) onConfirmAction();
        }}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f2f2f2',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333333',
    marginTop: 5, 
  },
  input: {
    borderWidth: 1,
    borderColor: '#cccccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  interventionCard: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: '#fff', // Fond blanc
    borderWidth: 2, // Épaisseur de la bordure
  },
  interventionInfo: {
    flex: 1,
  },
  interventionText: {
    fontSize: 16,
    color: '#333333',
    marginBottom: 5, // Ajoute un espacement entre les lignes
  },
  addButton: {
    backgroundColor: '#007BFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#4f4f4f',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  trashButton: {
    //backgroundColor: '#dc3545',
    width: 40,
    height: 40,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 10,
    right: 10,
    borderColor: '#000',  // Couleur de la bordure (noire)
    borderWidth: 2,       // Épaisseur de la bordure
  },
  buttonContainer: {
    flexDirection: 'row', // Positionne les boutons côte à côte
    justifyContent: 'space-between', // Espace entre les boutons
    marginTop: 20,
  },
  iconButton: {
    flexDirection: 'row', // Positionne l'icône et le texte côte à côte
    alignItems: 'center',
    backgroundColor: '#007BFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    justifyContent: 'center',
    flex: 1, // Prend 50% de la largeur (car il y a 2 boutons)
    marginHorizontal: 5, // Un petit espace entre les deux boutons
  },
  addButton: {
    backgroundColor: '#28a745', // Vert pour le bouton "Ajouter"
  },
  buttonIcon: {
    marginRight: 10, // Espace entre l'icône et le texte
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  commandeRecuButton: {
  backgroundColor: '#28a745',  // Vert pour indiquer que la commande est reçue
  padding: 10,
  borderRadius: 5,
  marginTop: 10,
},
commandeRecuButtonText: {
  color: '#fff',
  fontWeight: 'bold',
  textAlign: 'center',
},
editButton: {
  backgroundColor: '#17a2b8',  // Bleu pour l'icône d'édition
  padding: 10,
  borderRadius: 5,
  marginRight: 10,
},
});
