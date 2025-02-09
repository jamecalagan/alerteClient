import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';

export default function ModelsPage({ route }) {
    const { brandId } = route.params;
    const [models, setModels] = useState([]);
    const numColumns = 2; // Nombre de colonnes

    useEffect(() => {
        loadModels();
    }, []);

    const loadModels = async () => {
        const { data, error } = await supabase.from('modele').select('*').eq('marque_id', brandId);
        if (error) {
            console.error('Erreur lors du chargement des modèles:', error.message);
        } else {
            setModels(data);
        }
    };

    const handleDeleteModel = async (modelId) => {
        Alert.alert(
            'Confirmation',
            'Êtes-vous sûr de vouloir supprimer ce modèle ?',
            [
                { text: 'Annuler', style: 'cancel' },
                { 
                    text: 'Supprimer', 
                    style: 'destructive', 
                    onPress: async () => {
                        const { error } = await supabase.from('modele').delete().eq('id', modelId);
                        if (error) {
                            console.error('Erreur lors de la suppression du modèle:', error.message);
                        } else {
                            setModels(models.filter(model => model.id !== modelId));
                        }
                    } 
                },
            ]
        );
    };

    const sortedModels = [...models].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

    return (
        <View style={styles.container}>
		<Text style={styles.title}>Liste des models</Text>
            <FlatList
                data={sortedModels}
                keyExtractor={(item) => item.id.toString()}
                numColumns={numColumns}
                key={numColumns} // Forcer le rafraîchissement lors du changement de colonnes
                renderItem={({ item }) => (
                    <View style={styles.itemContainer}>
                        <TouchableOpacity 
                            style={styles.modelButton} 
                            onPress={() => console.log(`Modèle sélectionné : ${item.nom}`)}
                        >
                            <Text style={styles.itemText}>{item.nom}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.deleteButton} 
                            onPress={() => handleDeleteModel(item.id)}
                        >
                            <Icon name="trash" size={16} color="white" />
                        </TouchableOpacity>
                    </View>
                )}
                contentContainerStyle={styles.listContainer}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        padding: 10, 
        backgroundColor: '#191f2f' 
    },
    listContainer: {
        justifyContent: 'space-between',
    },
	title: {
        fontSize: 24,
        color: "#888787",
        fontWeight: "bold",
        marginBottom: 10,
        textAlign: "center",
    },
    itemContainer: {
        flex: 1,
        backgroundColor: '#8e95a89c',
        margin: 5,
        padding: 15,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'space-between',
        elevation: 2, // Ombre pour Android
        shadowColor: '#000', // Ombre pour iOS
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    modelButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#0c0f18', // Couleur de fond du bouton (vert)
        borderRadius: 4,
        width: '100%', // Prendre toute la largeur du conteneur
    },
    itemText: {
        fontSize: 16,
        fontWeight: 'medium',
        color: '#888787', // Texte en blanc pour plus de contraste
        textAlign: 'center',
    },
    deleteButton: {
        marginTop: 10,
        backgroundColor: 'red',
        padding: 8,
        borderRadius: 5,
        width: '100%',
        alignItems: 'center',
    }
});