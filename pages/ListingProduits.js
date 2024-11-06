import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../supabaseClient';
import { MaterialIcons } from '@expo/vector-icons';

export default function ProductManagementPage() {
    const [products, setProducts] = useState([]);
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    const [showProducts, setShowProducts] = useState(false);
    const [showBrands, setShowBrands] = useState(false);
    const [showModels, setShowModels] = useState(false);

    useEffect(() => {
        loadProducts();
        loadBrands();
        loadModels();
    }, []);

    const loadProducts = async () => {
        const { data, error } = await supabase.from('article').select('*');
        if (error) {
            Alert.alert('Erreur', 'Erreur lors du chargement des produits');
        } else {
            setProducts(data);
        }
    };

    const loadBrands = async () => {
        const { data, error } = await supabase.from('marque').select('*');
        if (error) {
            Alert.alert('Erreur', 'Erreur lors du chargement des marques');
        } else {
            setBrands(data);
        }
    };

    const loadModels = async () => {
        const { data, error } = await supabase.from('modele').select('*');
        if (error) {
            Alert.alert('Erreur', 'Erreur lors du chargement des modèles');
        } else {
            setModels(data);
        }
    };

    const deleteItem = async (table, id, loadFunction) => {
        Alert.alert(
            "Confirmation",
            "Êtes-vous sûr de vouloir supprimer cet élément ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    style: "destructive",
                    onPress: async () => {
                        const { error } = await supabase.from(table).delete().eq('id', id);
                        if (error) {
                            Alert.alert('Erreur', `Erreur lors de la suppression de l'élément dans ${table}`);
                        } else {
                            loadFunction(); // Recharge la liste après suppression
                        }
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            {/* Section Produits */}
            <TouchableOpacity style={styles.toggleButton} onPress={() => setShowProducts(!showProducts)}>
                <Text style={styles.toggleButtonText}>Produits</Text>
                <MaterialIcons name={showProducts ? 'expand-less' : 'expand-more'} size={24} color="#fff" />
            </TouchableOpacity>
            {showProducts && (
                <FlatList
                    data={products}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <View style={styles.itemContainer}>
                            <Text style={styles.itemText}>{item.nom}</Text>
                            <TouchableOpacity onPress={() => deleteItem('article', item.id, loadProducts)}>
                                <MaterialIcons name="delete" size={24} color="red" />
                            </TouchableOpacity>
                        </View>
                    )}
                />
            )}

            {/* Section Marques */}
            <TouchableOpacity style={styles.toggleButton} onPress={() => setShowBrands(!showBrands)}>
                <Text style={styles.toggleButtonText}>Marques</Text>
                <MaterialIcons name={showBrands ? 'expand-less' : 'expand-more'} size={24} color="#fff" />
            </TouchableOpacity>
            {showBrands && (
                <FlatList
                    data={brands}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <View style={styles.itemContainer}>
                            <Text style={styles.itemText}>{item.nom}</Text>
                            <TouchableOpacity onPress={() => deleteItem('marque', item.id, loadBrands)}>
                                <MaterialIcons name="delete" size={24} color="red" />
                            </TouchableOpacity>
                        </View>
                    )}
                />
            )}

            {/* Section Modèles */}
            <TouchableOpacity style={styles.toggleButton} onPress={() => setShowModels(!showModels)}>
                <Text style={styles.toggleButtonText}>Modèles</Text>
                <MaterialIcons name={showModels ? 'expand-less' : 'expand-more'} size={24} color="#fff" />
            </TouchableOpacity>
            {showModels && (
                <FlatList
                    data={models}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <View style={styles.itemContainer}>
                            <Text style={styles.itemText}>{item.nom}</Text>
                            <TouchableOpacity onPress={() => deleteItem('modele', item.id, loadModels)}>
                                <MaterialIcons name="delete" size={24} color="red" />
                            </TouchableOpacity>
                        </View>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#fff',
    },
    toggleButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#007BFF',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 5,
        marginBottom: 10,
    },
    toggleButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    itemContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f8f8f8',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
    },
    itemText: {
        fontSize: 16,
    },
});
