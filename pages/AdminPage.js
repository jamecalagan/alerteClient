import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '../supabaseClient';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';

export default function AdminPage() {
    const [productType, setProductType] = useState('');
    const [brand, setBrand] = useState('');
    const [model, setModel] = useState('');
    const [selectedProductType, setSelectedProductType] = useState(null);
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [productTypes, setProductTypes] = useState([]);
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    const [clients, setClients] = useState([]);
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
        const { data, error } = await supabase.from('marque').select('*').eq('article_id', productTypeId);
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
        if (!productType.trim()) {
            Alert.alert("Erreur", "Le type de produit ne peut pas être vide.");
            return;
        }

        const { data: existingProducts, error: checkError } = await supabase
            .from('article')
            .select('*')
            .eq('nom', productType);

        if (checkError) {
            console.log('Erreur vérification produit:', checkError);
            Alert.alert("Erreur", "Erreur lors de la vérification du produit.");
            return;
        }

        if (existingProducts && existingProducts.length > 0) {
            Alert.alert("Information", "Ce type de produit existe déjà.");
            return;
        }

        const { data, error } = await supabase
            .from('article')
            .insert([{ nom: productType }])
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

    const addBrand = async () => {
        if (!selectedProductType) {
            Alert.alert("Erreur", "Sélectionnez un type de produit avant d'ajouter une marque.");
            return;
        }
        if (!brand.trim()) {
            Alert.alert("Erreur", "Le nom de la marque ne peut pas être vide.");
            return;
        }

        const { data: existingBrands, error: checkError } = await supabase
            .from('marque')
            .select('*')
            .eq('nom', brand)
            .eq('article_id', selectedProductType);

        if (checkError) {
            console.log('Erreur vérification marque:', checkError);
            Alert.alert("Erreur", "Erreur lors de la vérification de la marque.");
            return;
        }

        if (existingBrands && existingBrands.length > 0) {
            Alert.alert("Information", "Cette marque existe déjà pour le type de produit sélectionné.");
            return;
        }

        const { data, error } = await supabase
            .from('marque')
            .insert([{ nom: brand, article_id: selectedProductType }])
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
	
		// Recherchez l'ID de l'article associé à la marque sélectionnée
		const selectedArticleId = productTypes.find(
			(product) => product.id === selectedProductType
		)?.id;
	
		if (!selectedArticleId) {
			Alert.alert("Erreur", "Impossible de trouver l'article associé.");
			return;
		}
	
		try {
			// Vérifiez si le modèle existe déjà
			const { data: existingModels, error: checkError } = await supabase
				.from('modele')
				.select('*')
				.eq('nom', model)
				.eq('marque_id', selectedBrand);
	
			if (checkError) {
				console.log('Erreur vérification modèle:', checkError);
				Alert.alert("Erreur", "Erreur lors de la vérification du modèle.");
				return;
			}
	
			if (existingModels && existingModels.length > 0) {
				Alert.alert("Information", "Ce modèle existe déjà pour la marque sélectionnée.");
				return;
			}
	
			// Insérez le modèle avec l'article associé
			const { data, error } = await supabase
				.from('modele')
				.insert([{ 
					nom: model, 
					marque_id: selectedBrand, 
					article_id: selectedArticleId 
				}])
				.select();
	
			if (error) {
				console.log('Erreur ajout modèle:', error.message);
				Alert.alert("Erreur", "Erreur lors de l'ajout du modèle.");
			} else {
				setModel('');
				Alert.alert("Succès", "Modèle ajouté avec succès.");
			}
		} catch (err) {
			console.error("Erreur inattendue :", err);
			Alert.alert("Erreur", "Une erreur inattendue est survenue.");
		}
	};
	

    return (
        <View style={styles.container}>
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
                            <Picker.Item key={type.id} label={type.nom} value={type.id} />
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
                        onValueChange={(value) => {
                            setSelectedBrand(value);
                            loadModels(value);
                        }}
                        style={styles.picker}
                    >
                        <Picker.Item label="Sélectionnez une marque" value={null} />
                        {brands.map((brand) => (
                            <Picker.Item key={brand.id} label={brand.nom} value={brand.id} />
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
