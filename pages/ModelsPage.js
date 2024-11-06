import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';

export default function ModelsPage({ route }) {
    const { brandId } = route.params;
    const [models, setModels] = useState([]);

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

    return (
        <View style={styles.container}>
            <FlatList
                data={models}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.itemContainer}>
                        <TouchableOpacity>
                            <Text style={styles.itemText}>{item.nom}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteModel(item.id)}>
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
    itemText: { fontSize: 16 },
});
