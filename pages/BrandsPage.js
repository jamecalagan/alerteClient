import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';

export default function BrandsPage({ route, navigation }) {
    const { articleId } = route.params;
    const [brands, setBrands] = useState([]);

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
    <FlatList
        data={sortedBrands} // Liste triée par ordre alphabétique
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
            <View style={styles.itemContainer}>
                <TouchableOpacity onPress={() => handleSelectBrand(item.id)}>
                    <Text style={styles.itemText}>{item.nom}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteBrand(item.id)}>
                    <Icon name="trash" size={20} color="red" />
                </TouchableOpacity>
            </View>
        )}
    />
</View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    itemContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#ddd' },
    itemText: { fontSize: 16, flex: 1 },
});
