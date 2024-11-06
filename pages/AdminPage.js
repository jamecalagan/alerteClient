import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, FlatList, StyleSheet, TouchableOpacity, Button } from 'react-native';
import { supabase } from '../supabaseClient';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function AdminPage() {
	const navigation = useNavigation();
    const [productType, setProductType] = useState('');
    const [brand, setBrand] = useState('');
    const [model, setModel] = useState('');
    const [selectedProductType, setSelectedProductType] = useState(null);
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [productTypes, setProductTypes] = useState([]);
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    const [clients, setClients] = useState([]);
	const [newProductType, setNewProductType] = useState(''); // Nouveau champ pour un type de produit
    const [newBrand, setNewBrand] = useState(''); // Nouveau champ pour une marque
    const [showAddFields, setShowAddFields] = useState(false);

    useEffect(() => {
        loadProductTypes();
        loadClients();
    }, []);

    const loadProductTypes = async () => {
        const { data, error } = await supabase.from('article').select('*');
        if (error) {
            console.log('Erreur chargement produits:', error.message);
            Alert.alert("Erreur", "Erreur lors du chargement des produits.");
        } else {
            setProductTypes(data);
        }
    };

    const loadBrands = async (productTypeId) => {
        const { data, error } = await supabase
            .from('marque')
            .select('*')
            .eq('article_id', productTypeId);

        if (error) {
            console.log('Erreur chargement marques:', error.message);
            Alert.alert("Erreur", "Erreur lors du chargement des marques.");
        } else {
            setBrands(data);
        }
    };

    const loadModels = async (brandId) => {
        const { data, error } = await supabase.from('modele').select('*').eq('marque_id', brandId);
        if (error) {
            console.log('Erreur chargement modèles:', error.message);
            Alert.alert("Erreur", "Erreur lors du chargement des modèles.");
        } else {
            setModels(data);
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
        if (!newProductType.trim()) {
            Alert.alert("Erreur", "Le nom du produit ne peut pas être vide.");
            return;
        }
        
        try {
            const { data, error } = await supabase
                .from('article')
                .insert([{ nom: newProductType }])
                .select();
            
            if (error) throw error;

            setProductTypes([...productTypes, data[0]]);
            setNewProductType('');
            Alert.alert("Succès", "Produit ajouté avec succès.");
        } catch (error) {
            console.error("Erreur lors de l'ajout du produit :", error);
            Alert.alert("Erreur", "Erreur lors de l'ajout du produit.");
        }
    };


    const addBrand = async () => {
        if (!selectedProductType) {
            Alert.alert("Erreur", "Sélectionnez un type de produit avant d'ajouter une marque.");
            return;
        }
        if (!newBrand.trim()) {
            Alert.alert("Erreur", "Le nom de la marque ne peut pas être vide.");
            return;
        }

        try {
            const { data, error } = await supabase
                .from('marque')
                .insert([{ nom: newBrand, article_id: selectedProductType }])
                .select();
            
            if (error) throw error;

            setBrands([...brands, data[0]]);
            setNewBrand('');
            Alert.alert("Succès", "Marque ajoutée avec succès.");
        } catch (error) {
            console.error("Erreur lors de l'ajout de la marque :", error);
            Alert.alert("Erreur", "Erreur lors de l'ajout de la marque.");
        }
    };

    const addModel = async () => {
        if (!selectedProductType) {
            Alert.alert("Erreur", "Sélectionnez un type de produit avant d'ajouter un modèle.");
            return;
        }
        if (!selectedBrand) {
            Alert.alert("Erreur", "Sélectionnez une marque avant d'ajouter un modèle.");
            return;
        }
        if (!model.trim()) {
            Alert.alert("Erreur", "Le nom du modèle ne peut pas être vide.");
            return;
        }

        try {
            const { data, error } = await supabase
                .from('modele')
                .insert([{ nom: model, marque_id: selectedBrand, article_id: selectedProductType }])
                .select();
            
            if (error) throw error;

            setModel('');
            Alert.alert("Succès", "Modèle ajouté avec succès.");
        } catch (error) {
            console.error("Erreur lors de l'ajout du modèle :", error);
            Alert.alert("Erreur", "Erreur lors de l'ajout du modèle.");
        }
    };
    return (
        <View style={styles.container}>

		        <TouchableOpacity
                style={styles.navigateButton}
                onPress={() => navigation.navigate("ArticlesPage")}
            >
                <MaterialIcons name="list" size={24} color="#fff" style={styles.icon} />
                <Text style={styles.buttonText}>Gérer Produits, Marques et Modèles</Text>
            </TouchableOpacity>
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
                    {/* Sélection ou ajout d'un produit */}
                    <Text style={styles.sectionTitle}>Sélectionner ou ajouter un produit</Text>
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
                            <Picker.Item key={type.id} label={type.nom} value={type.id} />
                        ))}
                    </Picker>
                    <TextInput
                        value={newProductType}
                        onChangeText={setNewProductType}
                        placeholder="Ajouter un nouveau produit"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addProductType}>
                        <Text style={styles.buttonText}>Ajouter Produit</Text>
                    </TouchableOpacity>

                    {/* Sélection ou ajout d'une marque */}
                    <Text style={styles.sectionTitle}>Sélectionner ou ajouter une marque</Text>
                    <Picker
                        selectedValue={selectedBrand}
                        onValueChange={setSelectedBrand}
                        style={styles.picker}
                    >
                        <Picker.Item label="Sélectionnez une marque" value={null} />
                        {brands.map((brand) => (
                            <Picker.Item key={brand.id} label={brand.nom} value={brand.id} />
                        ))}
                    </Picker>
                    <TextInput
                        value={newBrand}
                        onChangeText={setNewBrand}
                        placeholder="Ajouter une nouvelle marque"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addBrand}>
                        <Text style={styles.buttonText}>Ajouter Marque</Text>
                    </TouchableOpacity>

                    {/* Ajout d'un modèle */}
                    <Text style={styles.sectionTitle}>Ajouter un modèle</Text>
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
	navigateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#007BFF',
        padding: 15,
        borderRadius: 5,
        marginBottom: 20,
    },
    icon: {
        marginRight: 10,
    },
});
