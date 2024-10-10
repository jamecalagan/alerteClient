import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, ImageBackground } from 'react-native';
import { supabase } from '../supabaseClient';  
import { useFocusEffect, useNavigation } from '@react-navigation/native';  
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import Icon from 'react-native-vector-icons/FontAwesome';   
import RoundedButton from '../components/RoundedButton';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Import de l'image depuis le dossier assets
const backgroundImage = require('../assets/listing.jpg');
export default function HomePage({ navigation }) {
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('createdAt'); 
  const [orderAsc, setOrderAsc] = useState(true); 
  const [modalVisible, setModalVisible] = useState(false); 
  const [selectedClientId, setSelectedClientId] = useState(null); 
  const [alertVisible, setAlertVisible] = useState(false);
  const [transportModalVisible, setTransportModalVisible] = useState(false);
  const [selectedCommande, setSelectedCommande] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;

  // Fonction pour naviguer vers la page de visualisation des images
  const goToImageGallery = (clientId) => {
    navigation.navigate('ImageGallery', { clientId });
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Erreur lors de la déconnexion :', error);
        return;
      }
      navigation.replace('Login');  
    } catch (error) {
      console.error('Erreur lors de la déconnexion :', error);
    }
  };
  const loadClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*, interventions(id, status, deviceType, cost, createdAt, updatedAt, commande, photos)');
  
      if (error) throw error;
  
      if (data) {
        const filteredData = data.map(client => {
          const relevantInterventions = client.interventions?.filter(
            intervention => intervention.status !== 'Réparé' && intervention.status !== 'Récupéré'
          );
  
          if (relevantInterventions.length > 0) {
            client.latestIntervention = relevantInterventions[relevantInterventions.length - 1];
            client.latestIntervention.photos = client.latestIntervention.photos || [];
          } else {
            client.latestIntervention = null;
          }
  
          return client;
        });
  
        // Séparer les clients en 3 groupes : clients avec intervention en cours, nouveaux clients, et les autres
        const newClients = filteredData.filter(client => client.interventions.length === 0);
        const clientsWithOngoingIntervention = filteredData.filter(client => client.latestIntervention !== null);
        const otherClients = filteredData.filter(client => client.latestIntervention === null && client.interventions.length > 0);
  
        let sortedClients = [...newClients, ...clientsWithOngoingIntervention, ...otherClients];
  
        // *** Gestion du tri ***
        sortedClients = sortedClients.sort((a, b) => {
          const fieldA = a[sortBy];
          const fieldB = b[sortBy];
  
          if (orderAsc) {
            return new Date(fieldA) - new Date(fieldB);
          } else {
            return new Date(fieldB) - new Date(fieldA);
          }
        });
  
        setClients(sortedClients);
        setFilteredClients(sortedClients);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des clients :', error);
    }
  };
  
  
  useFocusEffect(
    React.useCallback(() => {
      loadClients();
    }, [sortBy, orderAsc])
  );
  const confirmDeleteClient = (clientId) => {
    setSelectedClientId(clientId);  
    setModalVisible(true);  
  };
  const handleDeleteClient = async () => {
    try {
      const { data: interventions, error: interventionsError } = await supabase
        .from('interventions')
        .select('*')
        .eq('client_id', selectedClientId);
  
      if (interventionsError) throw interventionsError;
  
      if (interventions && interventions.length > 0) {
        setAlertVisible(true);
        return;
      }
  
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', selectedClientId);
  
      if (error) throw error;
  
      loadClients();
      setModalVisible(false);
    } catch (error) {
      console.error('Erreur lors de la suppression du client :', error);
    }
  };
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const offsetHours = 2;  
    date.setHours(date.getHours() + offsetHours);
    return date.toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Europe/Paris',
    });
  };
const filterClients = (text) => {
  setSearchText(text);

  if (text.trim() === '') {
    setFilteredClients(clients); // Si aucun texte de recherche n'est entré, montrer tous les clients
  } else {
    const filtered = clients.filter(client => {
      // Recherche par nom (sans distinction de majuscules/minuscules)
      const nameMatch = client.name && client.name.toLowerCase().includes(text.toLowerCase());

      // Vérifie si le texte est un nombre
      const isNumber = !isNaN(text);

      // Recherche par numéro de téléphone (si le texte fait plus de 4 chiffres)
      const phoneMatch = isNumber && client.phone && client.phone.includes(text) && text.length >= 4;

      // Recherche par numéro de fiche : exact match uniquement si c'est un nombre
      const ficheNumberMatch = isNumber && client.ficheNumber && client.ficheNumber.toString() === text;

      // Recherche par statut (si le texte correspond à un statut d'intervention)
      const statusMatch = client.interventions.some(intervention =>
        intervention.status && intervention.status.toLowerCase().includes(text.toLowerCase())
      );

      // Retourne vrai si au moins un des champs correspond
      return nameMatch || phoneMatch || ficheNumberMatch || statusMatch;
    });

    setFilteredClients(filtered); // Met à jour la liste des clients filtrés
  }
};

  
  
  
  const getStatusStyle = (status) => {
    switch (status) {
      case 'En attente de pièces':
        return { borderColor: '#270381', borderWidth: 2 };
      case 'Devis accepté':
        return { borderColor: '#FFD700', borderWidth: 2 };
      case 'Réparation en cours':
        return { borderColor: '#528fe0', borderWidth: 2 };
      case 'Réparé':
        return { borderColor: '#98fb98', borderWidth: 2 };
      case 'Non réparable':
        return { borderColor: '#e9967a', borderWidth: 2 };
      default:
        return { borderColor: '#e0e0e0', borderWidth: 2 };
    }
  };
  const getDeviceIcon = (deviceType) => {
    switch (deviceType) {
      case 'PC portable':
        return <FontAwesome5 name="laptop" size={30} color="#000" />;
      case 'PC Fixe':
        return <FontAwesome5 name="desktop" size={30} color="#000" />;
      case 'Tablette':
        return <FontAwesome5 name="tablet-alt" size={30} color="#000" />;
      case 'Smartphone':
        return <FontAwesome5 name="mobile" size={30} color="#000" />;
      case 'Console':
        return <FontAwesome5 name="gamepad" size={30} color="#000" />;
        case 'Disque dur':
          return <FontAwesome5 name="hdd" size={30} color="#000" />;
          case 'Carte SD':
            return <FontAwesome5 name="sd-card" size={30} color="#000" />;
          case 'Cle usb':
            return <FontAwesome5 name="usb-drive" size={30} color="#000" />;   
      default:
        return <FontAwesome5 name="question" size={30} color="#000" />;
    }
  };
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const currentClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const goToNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };
  const goToPreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };
  // Légende des statuts
  const Legend = () => (
    <View style={styles.legendContainer}>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: '#270381' }]} />
        <Text style={styles.legendText}>En attente de pièces</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: '#FFD700' }]} />
        <Text style={styles.legendText}>Devis accepté</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: '#528fe0' }]} />
        <Text style={styles.legendText}>Réparation en cours</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: '#98fb98' }]} />
        <Text style={styles.legendText}>Réparé</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: '#e9967a' }]} />
        <Text style={styles.legendText}>Non réparable</Text>
      </View>
    </View>
  );
  return (
    <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
      <View style={styles.overlay}> 
      <View style={styles.headerContainer}>
  <Text style={styles.title}>Fiches clients</Text>
  <Text style={styles.pageNumberText}>Page {currentPage} / {totalPages}</Text>
</View>
    <View style={styles.searchContainer}>
      <TextInput
        style={styles.searchInput}
        placeholder="Rechercher par nom, téléphone, ou statut"
        placeholderTextColor="#999"
        value={searchText}
        onChangeText={filterClients}
      />
      <Ionicons name="search" size={24} color="#999" style={styles.searchIcon} />
    </View>

<View style={styles.sortButtonContainer}>
  <RoundedButton 
    title={`Trier par ${sortBy === 'createdAt' ? 'date de modification' : 'date de création'}`} 
    onPress={() => setSortBy(sortBy === 'createdAt' ? 'updatedAt' : 'createdAt')} 
  />
  <RoundedButton 
    title={`Ordre ${orderAsc ? 'Ascendant' : 'Descendant'}`} 
    onPress={() => setOrderAsc(!orderAsc)}
  />
</View>
        {currentClients.length === 0 ? (
          <Text style={styles.noClientsText}>Aucun client trouvé</Text>
        ) : (
          <>
          <FlatList
        data={currentClients} 
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
        const noInterventions = !item.interventions || item.interventions.length === 0;
        const allRepairedOrRecovered = item.interventions.every(intervention => 
          intervention.status === 'Réparé' || intervention.status === 'Récupéré'
    );
    const totalInterventions = item.interventions ? item.interventions.length : 0; // Compte le nombre total d'interventions
    const latestIntervention = item.latestIntervention;
    const status = latestIntervention ? latestIntervention.status : 'Aucun statut';
    const deviceType = latestIntervention?.deviceType; // Récupère le type d'appareil
    const commande = latestIntervention?.commande; // Récupérer le nom de la commande


    // Calculer le nombre de photos pour la dernière intervention
    const totalImages = latestIntervention?.photos?.length || 0;
    // *** Si le client n'a pas d'interventions en cours, afficher seulement les informations basiques ***
    if (!latestIntervention) {
      return (
        <TouchableOpacity 
          style={styles.clientCard} 
          onPress={() => navigation.navigate('AddIntervention', { clientId: item.id })}  // Vous pouvez modifier la navigation ici si nécessaire
        >
          <View style={styles.clientInfo}>
            <Text style={styles.ficheNumber}>Numéro de client N° {item.ficheNumber}</Text>
            <Text style={styles.clientText}>Nom : {item.name.toUpperCase()}</Text>
            <View style={styles.phoneContainer}>
              <Text style={styles.clientText}>Téléphone : </Text>
              <Text style={styles.phoneNumber}>{item.phone}</Text>
            </View>
            {/* Affichage du nombre total d'interventions passées, s'il y en a */}
            {totalInterventions > 0 && (
              <Text style={styles.totalInterventionsText}>Interventions passées : {totalInterventions}</Text>
            )}
          </View>
          <View style={styles.topRightButtons}>
            <TouchableOpacity style={styles.trashButton} onPress={() => confirmDeleteClient(item.id)}>
              <Ionicons name="trash" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    }
    const getProgressStatus = (status) => {
  switch (status) {
    case 'En attente de pièces':
      return { percentage: 25, color: '#270381' }; // Orange pour "En attente de pièces"
    case 'Devis accepté':
      return { percentage: 50, color: '#FFD700' }; // Jaune pour "Devis accepté"
    case 'Réparation en cours':
      return { percentage: 75, color: '#1E90FF' }; // Bleu pour "Réparation en cours"
    case 'Réparé':
      return { percentage: 100, color: '#32CD32' }; // Vert pour "Réparé"
    case 'Non réparable':
      return { percentage: 0, color: '#ff0000' }; // Rouge pour "Non réparable"
    default:
      return { percentage: 0, color: '#e0e0e0' }; // Gris pour le statut par défaut
  }
};

    // *** Si le client a une intervention en cours, afficher les informations complètes ***
    return (
      <View style={[styles.clientCard, getStatusStyle(status)]}>
        <TouchableOpacity style={styles.clientInfo} onPress={() => navigation.navigate('EditClient', { client: item })}>
          <Text style={styles.ficheNumber}>Numéro de client N° {item.ficheNumber}</Text>
          <Text style={styles.clientText}>Nom : {item.name.toUpperCase()}</Text>
          <View style={styles.phoneContainer}>
            <Text style={styles.clientText}>Téléphone : </Text>
            <Text style={styles.phoneNumber}>{item.phone}</Text>
          </View>
          <Text style={styles.clientText}>Date de création : {formatDateTime(item.createdAt)}</Text>
          {item.updatedAt && (
            <Text style={styles.clientText}>Dernière modification : {formatDateTime(item.updatedAt)}</Text>
          )}
          <Text style={styles.statusText}>Statut : {status}</Text>
          <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { 
          width: `${getProgressStatus(status).percentage}%`, 
          backgroundColor: getProgressStatus(status).color 
        }]} />
      </View>
          {status === 'En attente de pièces' && commande && (
            <Text style={styles.commandeText}>En commande : {commande}</Text>
          )}
          <Text style={styles.clientText}>Montant : {latestIntervention?.cost?.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</Text>
          <Text style={styles.clientText}>Nombre d'images : {totalImages}</Text>
        </TouchableOpacity>
       
        <View style={styles.deviceIconContainer}>
          {getDeviceIcon(deviceType)} 
        </View>

        
        <View style={styles.rightSection}>
          <Text style={styles.totalInterventionsText}>Interventions : {totalInterventions}</Text>
        </View>
        <View style={styles.topRightButtons}>
        {commande && (
        <TouchableOpacity style={styles.transportButton} onPress={() => {
          setSelectedCommande(commande);
          setTransportModalVisible(true);
        }}>
          <FontAwesome5 name="shipping-fast" size={20} color="#000000" /> 
        </TouchableOpacity>
      )}
        <TouchableOpacity style={styles.editButton} onPress={() => navigation.navigate('EditClient', { client: item })}>
        <Ionicons name="create-outline" size={20} color="#000" />
      </TouchableOpacity>
        <TouchableOpacity style={styles.printButton} onPress={() => navigation.navigate('ClientPreviewPage', { clientId: item.id })}>
          <Ionicons name="print" size={20} color="#000000" /> 
        </TouchableOpacity>
        {totalImages > 0 && (
          <TouchableOpacity style={styles.photoButton} onPress={() => goToImageGallery(item.id)}>
            <FontAwesome5 name="image" size={20} color="#000000" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.trashButton} onPress={() => confirmDeleteClient(item.id)}>
          <Ionicons name="trash" size={20} color="#000" /> 
        </TouchableOpacity>
</View>
      </View>
    );
  }}
  showsVerticalScrollIndicator={false}
/>            
            <View style={styles.paginationContainer}>
              <TouchableOpacity onPress={goToPreviousPage} disabled={currentPage === 1}>
                <Text style={currentPage === 1 ? styles.disabledPaginationText : styles.paginationText}>Précédent</Text>
              </TouchableOpacity>
              <Text style={styles.paginationText}>Page {currentPage} sur {totalPages}</Text>
              <TouchableOpacity onPress={goToNextPage} disabled={currentPage === totalPages}>
                <Text style={currentPage === totalPages ? styles.disabledPaginationText : styles.paginationText}>Suivant</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        <Modal
  transparent={true}
  visible={transportModalVisible}
  animationType="fade"
  onRequestClose={() => setTransportModalVisible(false)}
>
  <View style={styles.modalOverlay}>
    <View style={styles.alertBox}>
      <Text style={styles.alertTitle}>Commande en cours</Text>
      {selectedCommande ? (
        <>
          {/* <Text style={styles.alertMessage}>Élément en commande :</Text> */}
          <Text style={[styles.alertMessage, { fontWeight: 'bold', fontSize: 25 }]}>{selectedCommande}</Text>
        </>
      ) : (
        <Text style={styles.alertMessage}>Aucune commande en cours</Text>
      )}
      <TouchableOpacity style={styles.button} onPress={() => setTransportModalVisible(false)}>
        <Text style={styles.buttonText}>Fermer</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>


        <Modal
          transparent={true}
          visible={modalVisible}
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>Confirmer la suppression</Text>
              <Text style={styles.alertMessage}>Êtes-vous sûr de vouloir supprimer cette fiche client ?</Text>
              <View style={styles.alertButtons}>
                <TouchableOpacity style={styles.button} onPress={() => setModalVisible(false)}>
                  <Text style={styles.buttonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button} onPress={handleDeleteClient}>
                  <Text style={styles.buttonText}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          transparent={true}
          visible={alertVisible}
          animationType="fade"
          onRequestClose={() => setAlertVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>Suppression impossible</Text>
              <Text style={styles.alertMessage}>
                Ce client ne peut pas être supprimé car il a des interventions associées.
              </Text>
              <TouchableOpacity style={styles.button} onPress={() => setAlertVisible(false)}>
                <Text style={styles.buttonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        {/* Affichage de la légende en bas de page */}
        <Legend />
      </View>
    </ImageBackground>
  );
}
const styles = StyleSheet.create({
  searchContainer: {
  position: 'relative',  // Pour permettre le positionnement absolu de l'icône
  height: 80,            // Hauteur du champ de recherche
  borderWidth: 1,
  borderColor: '#cccccc',
  borderRadius: 8,
  backgroundColor: '#e0e0e0',
  justifyContent: 'center', // Centre verticalement
},
searchIcon: {
  position: 'absolute',
  right: 10,             // Positionné à droite à 10px du bord
  zIndex: 1,             // Place l'icône au-dessus du TextInput
},
searchInput: {
  paddingRight: 50,      // Ajoute un espace à droite pour l'icône
  height: '100%',        // Prend toute la hauteur du conteneur
  color: '#333333',
  fontSize: 20,
  paddingLeft: 10,       // Un petit padding à gauche pour l'esthétique
},

  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',  // L'image couvre toute la page
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',  // Voile sombre pour améliorer la lisibilité
    padding: 20,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',  // Aligner le titre à gauche et la page à droite
    alignItems: 'center',
    marginBottom: 20,  // Vous pouvez ajuster la marge en fonction de l'espace que vous souhaitez
  },
  pageNumberText: {
    fontSize: 20,
    color: '#fff',  // Assurez-vous que la couleur correspond à votre thème
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#fff',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#cccccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    color: '#333333',
    fontSize: 16,
  },
  clientCard: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 15,
    borderWidth: 2, 
    backgroundColor: 'rgba(255, 255, 255, 0.9)', 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative', 
  },
  progressBarContainer: {
    height: 3,
    width: '100%',
    backgroundColor: '#e0e0e0',  // Couleur de fond de la barre (pour le reste non rempli)
    borderRadius: 5,
    marginTop: 10,
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    borderRadius: 5,
  },
  deviceIconContainer: {
    position: 'absolute',  
    bottom: 10,  
    right: 10,  
  },
  clientInfo: {
    flex: 1,
  },
  ficheNumber: {
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 5,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
  },
  newIconContainer: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
  },
  clientText: {
    fontSize: 16,
    color: '#000',
  },
  statusText: {
    fontSize: 18,
    fontStyle: 'italic',
    fontWeight: 'bold',
    color: '#801919',
  },
  commandeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff4500', // Couleur pour rendre le texte de la commande plus visible
  },
  stateText: {
    fontSize: 18,
    marginBottom: 5,
    color: '#4c09f6',
  },
  topRightButtons: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
  },
  photoButton: {
    padding: 10,
    borderRadius: 5,
    borderColor: '#000',
    borderWidth: 2,
    marginRight: 10,
  },
  editButton: {
    //backgroundColor: '#17a2b8',  // Bleu pour l'icône d'édition
    padding: 10,
    borderRadius: 5,
    marginRight: 10,
    borderColor: '#000',  // Couleur de la bordure (noire)
    borderWidth: 2,       // Épaisseur de la bordure
  },
  printButton: {
    //backgroundColor: '#28a745',  // Vert pour l'icône d'impression
    padding: 10,
    borderRadius: 5,
    marginRight: 10,
    borderColor: '#000',  // Couleur de la bordure (noire)
    borderWidth: 2,       // Épaisseur de la bordure
  },
  trashButton: {
    //backgroundColor: '#dc3545',  // Rouge pour l'icône de poubelle
    padding: 10,
    borderRadius: 5,
    borderColor: '#000',  // Couleur de la bordure (noire)
    borderWidth: 2,       // Épaisseur de la bordure
  },
  transportButton: {
  padding: 10,
  borderRadius: 5,
  marginRight: 10,
  borderColor: '#000',  // Couleur de la bordure (noire)
  borderWidth: 2,       // Épaisseur de la bordure
},
  rightSection: {
    flexDirection: 'column',
    alignItems: 'flex-end', 
  },
  totalInterventionsText: {
    fontSize: 16,
    fontWeight: 'light',
    fontStyle:'italic',
    color: '#5e5e5e',
  },
  commandeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8a20f3',
  },
  sortButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
    marginTop: 15,
  },
  noClientsText: {
    textAlign: 'center',
    fontSize: 18,
    marginTop: 20,
    color: '#fff',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  paginationText: {
    fontSize: 16,
    marginHorizontal: 10,
    color: '#fff',
  },
  disabledPaginationText: {
    fontSize: 16,
    marginHorizontal: 10,
    color: '#ccc',
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
  alertButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    marginHorizontal: 10,
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  legendContainer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    marginRight: 10,
  },
  legendText: {
    fontSize: 14,
    color: '#fff',
  },
});