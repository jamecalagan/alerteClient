import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, FlatList, Alert, StyleSheet } from "react-native";
import { supabase } from "../supabaseClient";
import { useNavigation } from "@react-navigation/native";

const AddProductPage = () => {
    const navigation = useNavigation();
    
    const [productList, setProductList] = useState([]);
    const [brandList, setBrandList] = useState([]);
    const [modelList, setModelList] = useState([]);

    const [selectedProduct, setSelectedProduct] = useState(null);
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [selectedModel, setSelectedModel] = useState(null);

    const [showProducts, setShowProducts] = useState(true);
    const [showBrands, setShowBrands] = useState(false);
    const [showModels, setShowModels] = useState(false);

    const [newProduct, setNewProduct] = useState("");
    const [newBrand, setNewBrand] = useState("");
    const [newModel, setNewModel] = useState("");
	const [recapProduct, setRecapProduct] = useState(null);

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        const { data, error } = await supabase.from("article").select("id, nom");
        if (error) {
            console.error("Erreur chargement produits :", error);
        } else {
            setProductList(data);
        }
    };

    const loadBrands = async (productId) => {
        setSelectedProduct(productId);
        setSelectedBrand(null);
        setModelList([]);
        setShowProducts(false);
        setShowBrands(true);

        const { data, error } = await supabase.from("marque").select("id, nom").eq("article_id", productId);
        if (error) {
            console.error("Erreur chargement marques :", error);
        } else {
            setBrandList(data);
        }
    };

    const loadModels = async (brandId) => {
        setSelectedBrand(brandId);
        setSelectedModel(null);
        setShowBrands(false);
        setShowModels(true);

        const { data, error } = await supabase.from("modele").select("id, nom").eq("marque_id", brandId);
        if (error) {
            console.error("Erreur chargement modèles :", error);
        } else {
            setModelList(data);
        }
    };

	const addProduct = async () => {
		if (!newProduct.trim()) return Alert.alert("Erreur", "Nom du produit requis !");
		
		const { data, error } = await supabase.from("article").insert([{ nom: newProduct }]).select().single();
	
		if (error) {
			console.error("Erreur ajout produit :", error);
			Alert.alert("Erreur", "Impossible d'ajouter le produit.");
		} else {
			setSelectedProduct(data.id); // Sélectionner automatiquement le nouveau produit
			setRecapProduct({ produit: data.nom, marque: null, modele: null }); // Initialisation recap
			setNewProduct("");
			Alert.alert("Succès", "Produit ajouté !");
			loadProducts(); // Recharger les produits
		}
	};
	

	const addBrand = async () => {
		if (!selectedProduct) return Alert.alert("Erreur", "Sélectionnez un produit.");
		if (!newBrand.trim()) return Alert.alert("Erreur", "Nom de la marque requis !");
	
		const { data, error } = await supabase.from("marque").insert([{ nom: newBrand, article_id: selectedProduct }]).select().single();
	
		if (error) {
			console.error("Erreur ajout marque :", error);
			Alert.alert("Erreur", "Impossible d'ajouter la marque.");
		} else {
			setSelectedBrand(data.id);
			setRecapProduct((prev) => ({ ...prev, marque: data.nom })); // Mise à jour recap
			setNewBrand("");
			Alert.alert("Succès", "Marque ajoutée !");
			loadBrands(selectedProduct);
		}
	};
	

	const addModel = async () => {
		if (!selectedProduct) return Alert.alert("Erreur", "Sélectionnez un produit.");
		if (!selectedBrand) return Alert.alert("Erreur", "Sélectionnez une marque.");
		if (!newModel.trim()) return Alert.alert("Erreur", "Nom du modèle requis !");
	
		const { data, error } = await supabase.from("modele").insert([{ nom: newModel, marque_id: selectedBrand, article_id: selectedProduct }]).select().single();
	
		if (error) {
			console.error("Erreur ajout modèle :", error);
			Alert.alert("Erreur", "Impossible d'ajouter le modèle.");
		} else {
			setRecapProduct((prev) => ({ ...prev, modele: data.nom })); // Mise à jour recap
			setNewModel("");
			Alert.alert("Succès", "Modèle ajouté !");
			loadModels(selectedBrand);
		}
	};
	
	

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Gestion des Produits</Text>

            {/* Sélection d'un produit */}
            {showProducts && (
                <>
                    <Text style={styles.sectionTitle}>1. Sélectionner ou Ajouter un Produit</Text>
                    <FlatList
                        data={productList}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={2}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.box, selectedProduct === item.id && styles.selectedBox]}
                                onPress={() => loadBrands(item.id)}
                            >
                                <Text style={styles.boxText}>{item.nom}</Text>
                            </TouchableOpacity>
                        )}
                    />
                    <TextInput
                        value={newProduct}
                        onChangeText={setNewProduct}
                        placeholder="Ajouter un produit"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addProduct}>
                        <Text style={styles.buttonText}>Ajouter Produit</Text>
                    </TouchableOpacity>
                </>
            )}

            {/* Sélection d'une marque */}
            {showBrands && (
                <>
                    <Text style={styles.sectionTitle}>2. Sélectionner ou Ajouter une Marque</Text>
                    <FlatList
                        data={brandList}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={2}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.box, selectedBrand === item.id && styles.selectedBox]}
                                onPress={() => loadModels(item.id)}
                            >
                                <Text style={styles.boxText}>{item.nom}</Text>
                            </TouchableOpacity>
                        )}
                    />
                    <TextInput
                        value={newBrand}
                        onChangeText={setNewBrand}
                        placeholder="Ajouter une marque"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addBrand}>
                        <Text style={styles.buttonText}>Ajouter Marque</Text>
                    </TouchableOpacity>
                </>
            )}

            {/* Sélection d'un modèle */}
            {showModels && (
                <>
                    <Text style={styles.sectionTitle}>3. Sélectionner ou Ajouter un Modèle</Text>
                    <FlatList
                        data={modelList}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={2}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.box, selectedModel === item.id && styles.selectedBox]}
                                onPress={() => setSelectedModel(item.id)}
                            >
                                <Text style={styles.boxText}>{item.nom}</Text>
                            </TouchableOpacity>
                        )}
                    />
                    <TextInput
                        value={newModel}
                        onChangeText={setNewModel}
                        placeholder="Ajouter un modèle"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addModel}>
                        <Text style={styles.buttonText}>Ajouter Modèle</Text>
                    </TouchableOpacity>
                </>
            )}
			{recapProduct && recapProduct.produit && recapProduct.marque && recapProduct.modele && (
    <View style={{ marginTop: 20, padding: 10, backgroundColor: "#dff0d8", borderRadius: 5 }}>
        <Text style={{ fontSize: 20, fontWeight: "bold", color: "#3c763d" }}>✅ Récapitulatif :</Text>
        <Text style={{ fontSize: 20, color: "#3c763d" }}>🛠 Produit : {recapProduct.produit}</Text>
        <Text style={{ fontSize: 20, color: "#3c763d" }}>🏭 Marque : {recapProduct.marque}</Text>
        <Text style={{ fontSize: 20, color: "#3c763d" }}>📌 Modèle : {recapProduct.modele}</Text>
    </View>
)}
        </View>
		
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#fff" },
    header: { fontSize: 20, fontWeight: "bold", textAlign: "center", marginBottom: 15 },
    sectionTitle: { fontSize: 16, fontWeight: "bold", marginTop: 15, marginBottom: 10 },
    input: { borderWidth: 1, padding: 10, borderRadius: 5, marginBottom: 10 },
    addButton: { backgroundColor: "#007bff", padding: 10, borderRadius: 5, alignItems: "center", marginBottom: 10 },
    buttonText: { color: "#fff", fontWeight: "bold" },
    box: { flex: 1, padding: 15, margin: 5, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    selectedBox: { backgroundColor: "#28a745", borderColor: "#28a745" },
    boxText: { fontWeight: "bold" },
});

export default AddProductPage;
