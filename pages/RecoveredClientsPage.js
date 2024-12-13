import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ImageBackground, TextInput, Modal, TouchableWithoutFeedback } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';

const backgroundImage = require('../assets/listing2.jpg');

export default function RecoveredClientsPage() {
    const [recoveredClients, setRecoveredClients] = useState([]);
    const [filteredClients, setFilteredClients] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [visibleSignatures, setVisibleSignatures] = useState({});
    const [selectedImage, setSelectedImage] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 2;

	const loadRecoveredClients = async () => {
		try {
			// Récupérez les interventions
			const { data: interventions, error: interventionsError } = await supabase
				.from('interventions')
				.select(`
					*,
					clients (name, ficheNumber, phone)
				`)
				.eq('status', 'Récupéré')
				.order('updatedAt', { ascending: false });
	
			if (interventionsError) throw interventionsError;
	
			// Récupérez les images depuis la table intervention_image
			const { data: images, error: imagesError } = await supabase
				.from('intervention_images')
				.select('intervention_id, image_data');
	
			if (imagesError) throw imagesError;
	
			// Associez les images aux interventions
			const combinedData = interventions.map((intervention) => ({
				...intervention,
				intervention_images: images
					.filter((img) => img.intervention_id === intervention.id)
					.map((img) => img.image_data), // Prenez uniquement les données d'image
			}));
	
			setRecoveredClients(combinedData);
			setFilteredClients(combinedData);
		} catch (error) {
			console.error('Erreur lors du chargement des clients récupérés :', error);
		}
	};
	

    useFocusEffect(
        React.useCallback(() => {
            loadRecoveredClients();
        }, [])
    );

    const toggleSignatureVisibility = (id) => {
        setVisibleSignatures(prevState => ({
            ...prevState,
            [id]: !prevState[id],
        }));
    };

    const handleSearch = (query) => {
        setSearchQuery(query);

        if (query.trim() === '') {
            setFilteredClients(recoveredClients);
        } else {
            const filtered = recoveredClients.filter(client => {
                const clientName = client.clients?.name?.toLowerCase() || '';
                const clientPhone = client.clients?.phone ? client.clients.phone.toString() : '';

                return (
                    clientName.includes(query.toLowerCase()) ||
                    clientPhone.includes(query)
                );
            });

            setFilteredClients(filtered);
            setCurrentPage(1); // Reset to first page on search
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

    return (
        <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
            <View style={styles.overlay}>
                <Text style={styles.title}>Clients ayant récupéré le matériel</Text>

                <TextInput
                    style={styles.searchBar}
                    placeholder="Rechercher par nom ou téléphone"
                    placeholderTextColor="#ccc"
                    value={searchQuery}
                    onChangeText={handleSearch}
                />

                <FlatList
                    data={getPaginatedClients()}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <Text style={styles.clientInfo}>Numéro de Client N°: {item.clients.ficheNumber}</Text>
                            <Text style={styles.clientInfo}>Nom: {item.clients.name}</Text>
                            <Text style={styles.clientInfo}>
                                Téléphone: {item.clients.phone.replace(/(\d{2})(?=\d)/g, '$1 ')}
                            </Text>
                            <Text style={styles.interventionInfo}>Type d'appareil: {item.deviceType}</Text>
                            <Text style={styles.interventionInfo}>Marque: {item.brand}</Text>
                            <Text style={styles.interventionInfo}>Modèle: {item.model}</Text>
                            <Text style={styles.interventionInfo}>Référence: {item.reference}</Text>
                            <Text style={styles.interventionInfo}>Description du problème: {item.description}</Text>
                            <Text style={styles.interventionInfo}>Coût: {item.cost} €</Text>
                            <Text style={styles.interventionInfo}>Date de récupération: {new Date(item.updatedAt).toLocaleDateString('fr-FR')}</Text>
                            <Text style={styles.interventionInfo}>Détail de l'intervention: {item.detailIntervention}</Text>
                            {item.receiver_name && (
                                <Text style={styles.receiverText}>Récupéré par : {item.receiver_name}</Text>
                            )}
                            <Text style={styles.interventionInfo}>Remarques: {item.remarks}</Text>
                            <Text style={styles.interventionInfo}>Statut du règlement: {item.paymentStatus}</Text>

							<View style={styles.imageContainer}>
    {/* Images existantes avec bordure verte si c'est une étiquette */}
    {item.photos && item.photos.map((photo, index) => (
        <TouchableOpacity
            key={`photo-${index}`}
            onPress={() => setSelectedImage(`data:image/jpeg;base64,${photo}`)}
        >
            <Image
                source={{ uri: `data:image/jpeg;base64,${photo}` }}
                style={[
                    styles.imageThumbnail,
                    item.label_photo === photo ? styles.labelImage : null, // Bordure verte pour l'image "label"
                ]}
            />
        </TouchableOpacity>
    ))}

    {/* Nouvelles images avec bordure bleue */}
    {item.intervention_images && item.intervention_images.map((image, index) => (
        <TouchableOpacity
            key={`intervention-image-${index}`}
            onPress={() => setSelectedImage(`data:image/jpeg;base64,${image}`)}
        >
            <Image
                source={{ uri: `data:image/jpeg;base64,${image}` }}
                style={[
                    styles.imageThumbnail,
                    styles.newImageThumbnail, // Bordure bleue pour les nouvelles images
                ]}
            />
        </TouchableOpacity>
    ))}
</View>

                            <TouchableOpacity
                                style={styles.toggleButton}
                                onPress={() => toggleSignatureVisibility(item.id)}
                            >
                                <Icon
                                    name={visibleSignatures[item.id] ? 'eye-slash' : 'eye'}
                                    size={20}
                                    color="#202020"
                                    style={styles.icon}
                                />
                                <Text style={styles.toggleButtonText}>
                                    {visibleSignatures[item.id] ? 'Masquer la signature' : 'Afficher la signature'}
                                </Text>
                            </TouchableOpacity>

                            {visibleSignatures[item.id] && item.signature ? (
                                <Image
                                    source={{ uri: item.signature }}
                                    style={styles.signatureImage}
                                />
                            ) : null}
                        </View>
                    )}
                />

                <View style={styles.paginationContainer}>
                    <TouchableOpacity
                        style={[styles.paginationButton, currentPage === 1 && styles.disabledButton]}
                        onPress={handlePreviousPage}
                        disabled={currentPage === 1}
                    >
                        <Text style={styles.paginationButtonText}>Précédent</Text>
                    </TouchableOpacity>
                    <Text style={styles.paginationInfo}>
                        Page {currentPage} sur {totalPages}
                    </Text>
                    <TouchableOpacity
                        style={[styles.paginationButton, currentPage === totalPages && styles.disabledButton]}
                        onPress={handleNextPage}
                        disabled={currentPage === totalPages}
                    >
                        <Text style={styles.paginationButtonText}>Suivant</Text>
                    </TouchableOpacity>
                </View>
            </View>
            <Modal
                visible={selectedImage !== null}
                transparent={true}
                onRequestClose={() => setSelectedImage(null)}
            >
                <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
                    <View style={styles.modalBackground}>
                        <Image
                            source={{ uri: selectedImage }}
                            style={styles.fullImage}
                        />
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </ImageBackground>
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
  searchBar: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
    marginBottom: 20,
    fontSize: 16,
    color: '#000',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
    elevation: 2,
  },
  clientInfo: {
    fontSize: 16,
    marginBottom: 5,
  },
  interventionInfo: {
    fontSize: 14,
    marginBottom: 5,
    color: '#555',
  },
  toggleButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f7f7f7',
	borderWidth: 1,
	borderColor: '#929090',
    borderRadius: 5,
	elevation: 5,
  },
  toggleButtonText: {
    color: '#202020',
    fontWeight: 'bold',
    marginLeft: 10,
  },
  icon: {
    marginRight: 10,
  },
  signatureImage: {
    width: '95%',
    height: 300,
    marginTop: 10,
	marginLeft: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
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
    resizeMode: 'cover',
  },
  newImageThumbnail: {
    borderWidth: 2, // Ajoute une bordure
    borderColor: 'blue', // Bordure bleue pour les nouvelles images
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
  receiverText: {
    fontSize: 18,
    color: "#571515",
    marginTop: 5,
  },
  labelImage: {
    borderWidth: 2,
    borderColor: 'green',
  },
paginationContainer: {
  flexDirection: 'row',
  justifyContent: 'space-evenly', // Espace équitablement les boutons et le texte
  alignItems: 'center',

  paddingHorizontal: 5, // Ajoute de l'espace sur les côtés
},
paginationButton: {
  backgroundColor: '#445a75',
  paddingVertical: 5, // Ajoute de l'espace en haut et en bas
  paddingHorizontal: 30, // Ajoute de l'espace sur les côtés
  borderRadius: 5,
  marginBottom: 2,
},
disabledButton: {
  backgroundColor: '#ccc',
},
paginationButtonText: {
  color: '#fff',
  fontWeight: 'bold',
},
paginationInfo: {
  fontSize: 18,
  fontWeight: 'bold',
  color: '#fff',
},


});
