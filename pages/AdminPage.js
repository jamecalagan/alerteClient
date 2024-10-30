import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '../supabaseClient';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons'; // Import pour les icônes

export default function AdminPage() {
    const [productType, setProductType] = useState('');
    const [brand, setBrand] = useState('');
    const [model, setModel] = useState('');
    const [selectedProductType, setSelectedProductType] = useState(null);
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [productTypes, setProductTypes] = useState([]);
    const [brands, setBrands] = useState([]);
    const [clients, setClients] = useState([]);
    const [showAddFields, setShowAddFields] = useState(false);

    useEffect(() => {
        loadProductTypes();
        loadClients();
    }, []);

    const loadProductTypes = async () => {
        const { data, error } = await supabase.from('listProduit').select('*');
        if (error) {
            console.log('Erreur chargement produits:', error.message);
            Alert.alert("Erreur", "Erreur lors du chargement des produits.");
        } else {
            setProductTypes(data);
        }
    };

    const loadClients = async () => {
        const { data, error } = await supabase
            .from('clients')
            .select(`
                *,
                interventions (
                    id,
                    status
                )
            `);

        if (error) {
            console.log('Erreur chargement clients:', error.message);
            Alert.alert("Erreur", "Erreur lors du chargement des clients.");
        } else {
            setClients(data);
        }
    };

    const addProductType = async () => {
        if (!productType.trim()) {
            Alert.alert("Erreur", "Le type de produit ne peut pas être vide.");
            return;
        }

        const { data, error } = await supabase
            .from('listProduit')
            .insert([{ name: productType }])
            .select();

        if (error) {
            console.log('Erreur ajout produit:', error.message);
            Alert.alert("Erreur", "Erreur lors de l'ajout du produit.");
        } else {
            setProductTypes([...productTypes, data[0]]);
            setProductType('');
            Alert.alert("Succès", "Produit ajouté avec succès.");
        }
    };

    const loadBrands = async (productTypeId) => {
        const { data, error } = await supabase
            .from('listMarque')
            .select('*')
            .eq('produit_id', productTypeId);

        if (error) {
            console.log('Erreur chargement marques:', error.message);
            Alert.alert("Erreur", "Erreur lors du chargement des marques.");
        } else {
            setBrands(data);
        }
    };

    const addBrand = async () => {
        if (!selectedProductType) {
            Alert.alert("Erreur", "Sélectionnez un type de produit avant d'ajouter une marque.");
            return;
        }
        if (!brand.trim()) {
            Alert.alert("Erreur", "Le nom de la marque ne peut pas être vide.");
            return;
        }

        const { data, error } = await supabase
            .from('listMarque')
            .insert([{ name: brand, produit_id: selectedProductType }])
            .select();

        if (error) {
            console.log('Erreur ajout marque:', error.message);
            Alert.alert("Erreur", "Erreur lors de l'ajout de la marque.");
        } else {
            setBrands([...brands, data[0]]);
            setBrand('');
            Alert.alert("Succès", "Marque ajoutée avec succès.");
        }
    };

    const addModel = async () => {
        if (!selectedBrand) {
            Alert.alert("Erreur", "Sélectionnez une marque avant d'ajouter un modèle.");
            return;
        }
        if (!model.trim()) {
            Alert.alert("Erreur", "Le nom du modèle ne peut pas être vide.");
            return;
        }

        const { data, error } = await supabase
            .from('listModel')
            .insert([{ name: model, marque_id: selectedBrand }])
            .select();

        if (error) {
            console.log('Erreur ajout modèle:', error.message);
            Alert.alert("Erreur", "Erreur lors de l'ajout du modèle.");
        } else {
            setModel('');
            Alert.alert("Succès", "Modèle ajouté avec succès.");
        }
    };

    return (
        <View style={styles.container}>
            {/* Bouton pour afficher/masquer les champs d'ajout */}
            <TouchableOpacity
                style={styles.toggleButton}
                onPress={() => setShowAddFields(!showAddFields)}
            >
                <Text style={styles.buttonText}>
                    {showAddFields ? 'Fermer la création de produit' : 'Créer un produit'}
                </Text>
                <MaterialIcons
                    name={showAddFields ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                    size={24}
                    color="#fff"
                />
            </TouchableOpacity>

            {/* Section d'ajout de produit, marque, modèle */}
            {showAddFields && (
                <>
                    <Text style={styles.sectionTitle}>Ajouter un type de produit</Text>
                    <TextInput
                        value={productType}
                        onChangeText={setProductType}
                        placeholder="Type de produit"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addProductType}>
                        <Text style={styles.buttonText}>Ajouter Produit</Text>
                    </TouchableOpacity>

                    <Text style={styles.sectionTitle}>Ajouter une marque</Text>
                    <Picker
                        selectedValue={selectedProductType}
                        onValueChange={(value) => {
                            setSelectedProductType(value);
                            loadBrands(value);
                        }}
                        style={styles.picker}
                    >
                        <Picker.Item label="Sélectionnez un produit" value={null} />
                        {productTypes.map((type) => (
                            <Picker.Item key={type.id} label={type.name} value={type.id} />
                        ))}
                    </Picker>
                    <TextInput
                        value={brand}
                        onChangeText={setBrand}
                        placeholder="Nom de la marque"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addBrand}>
                        <Text style={styles.buttonText}>Ajouter Marque</Text>
                    </TouchableOpacity>

                    <Text style={styles.sectionTitle}>Ajouter un modèle</Text>
                    <Picker
                        selectedValue={selectedBrand}
                        onValueChange={setSelectedBrand}
                        style={styles.picker}
                    >
                        <Picker.Item label="Sélectionnez une marque" value={null} />
                        {brands.map((b) => (
                            <Picker.Item key={b.id} label={b.name} value={b.id} />
                        ))}
                    </Picker>
                    <TextInput
                        value={model}
                        onChangeText={setModel}
                        placeholder="Nom du modèle"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addModel}>
                        <Text style={styles.buttonText}>Ajouter Modèle</Text>
                    </TouchableOpacity>
                </>
            )}

            {/* Section d'affichage des clients */}
            <Text style={styles.sectionTitle}>Liste des Clients</Text>
            <FlatList
                data={clients}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.clientItem}>
                        <Text style={styles.clientText}>Nom : {item.name}</Text>
                        <Text style={styles.clientText}>Téléphone : {item.phone}</Text>
                        {item.interventions && item.interventions.length > 0 && (
                            <Text style={styles.clientText}>
                                Statut : {item.interventions[0].status}
                            </Text>
                        )}
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#fff',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        padding: 10,
        marginVertical: 10,
        borderRadius: 5,
    },
    picker: {
        marginVertical: 10,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginVertical: 10,
    },
    addButton: {
        backgroundColor: '#4CAF50',
        paddingVertical: 12,
        borderRadius: 5,
        alignItems: 'center',
        marginVertical: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    toggleButton: {
        flexDirection: 'row',
        backgroundColor: '#007BFF',
        paddingVertical: 12,
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 15,
    },
    clientItem: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        backgroundColor: '#f9f9f9',
        marginVertical: 5,
    },
    clientText: {
        fontSize: 16,
    },
});
