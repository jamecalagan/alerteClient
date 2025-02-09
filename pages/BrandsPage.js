import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';

export default function BrandsPage({ route, navigation }) {
    const { articleId } = route.params;
    const [brands, setBrands] = useState([]);
    const numColumns = 2; // Nombre de colonnes

    useEffect(() => {
        loadBrands();
    }, []);

    const loadBrands = async () => {
        const { data, error } = await supabase.from('marque').select('*').eq('article_id', articleId);
        if (error) {
            console.error('Erreur lors du chargement des marques:', error.message);
        } else {
            setBrands(data);
        }
    };

    const handleDeleteBrand = async (brandId) => {
        Alert.alert(
            'Confirmation',
            'Êtes-vous sûr de vouloir supprimer cette marque ?',
            [
                { text: 'Annuler', style: 'cancel' },
                { 
                    text: 'Supprimer', 
                    style: 'destructive', 
                    onPress: async () => {
                        const { error } = await supabase.from('marque').delete().eq('id', brandId);
                        if (error) {
                            console.error('Erreur lors de la suppression de la marque:', error.message);
                        } else {
                            setBrands(brands.filter(brand => brand.id !== brandId));
                        }
                    } 
                },
            ]
        );
    };

    const handleSelectBrand = (brandId) => {
        navigation.navigate('ModelsPage', { brandId });
    };

    const sortedBrands = [...brands].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

    return (
        <View style={styles.container}>
		<Text style={styles.title}>Liste des marques</Text>
            <FlatList
                data={sortedBrands}
                keyExtractor={(item) => item.id.toString()}
                numColumns={numColumns}
                key={numColumns} // Forcer le rafraîchissement lors du changement de colonnes
                renderItem={({ item }) => (
                    <View style={styles.itemContainer}>
                        <TouchableOpacity 
                            style={styles.brandButton} 
                            onPress={() => handleSelectBrand(item.id)}
                        >
                            <Text style={styles.itemText}>{item.nom}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.deleteButton} 
                            onPress={() => handleDeleteBrand(item.id)}
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
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        elevation: 2, // Ombre pour Android
        shadowColor: '#000', // Ombre pour iOS
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    brandButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#0c0f18', // Couleur de fond du bouton
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
