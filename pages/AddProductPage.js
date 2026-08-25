import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet } from "react-native";
import { supabase } from "../supabaseClient";
import { useNavigation } from "@react-navigation/native";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";

const AddProductPage = () => {
    const navigation = useNavigation();

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState("");
    const [alertMessage, setAlertMessage] = useState("");

    const showAlert = (title, message) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertVisible(true);
    };

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
		if (!newProduct.trim()) return showAlert("Erreur", "Nom du produit requis !");
		
		const { data, error } = await supabase.from("article").insert([{ nom: newProduct }]).select().single();
	
		if (error) {
			console.error("Erreur ajout produit :", error);
			showAlert("Erreur", "Impossible d'ajouter le produit.");
		} else {
			setSelectedProduct(data.id); // Sélectionner automatiquement le nouveau produit
			setRecapProduct({ produit: data.nom, marque: null, modele: null }); // Initialisation recap
			setNewProduct("");
			showAlert("Succès", "Produit ajouté !");
			loadProducts(); // Recharger les produits
		}
	};
	

	const addBrand = async () => {
		if (!selectedProduct) return showAlert("Erreur", "Sélectionnez un produit.");
		if (!newBrand.trim()) return showAlert("Erreur", "Nom de la marque requis !");
	
		const { data, error } = await supabase.from("marque").insert([{ nom: newBrand, article_id: selectedProduct }]).select().single();
	
		if (error) {
			console.error("Erreur ajout marque :", error);
			showAlert("Erreur", "Impossible d'ajouter la marque.");
		} else {
			setSelectedBrand(data.id);
			setRecapProduct((prev) => ({ ...prev, marque: data.nom })); // Mise à jour recap
			setNewBrand("");
			showAlert("Succès", "Marque ajoutée !");
			loadBrands(selectedProduct);
		}
	};
	

	const addModel = async () => {
		if (!selectedProduct) return showAlert("Erreur", "Sélectionnez un produit.");
		if (!selectedBrand) return showAlert("Erreur", "Sélectionnez une marque.");
		if (!newModel.trim()) return showAlert("Erreur", "Nom du modèle requis !");
	
		const { data, error } = await supabase.from("modele").insert([{ nom: newModel, marque_id: selectedBrand, article_id: selectedProduct }]).select().single();
	
		if (error) {
			console.error("Erreur ajout modèle :", error);
			showAlert("Erreur", "Impossible d'ajouter le modèle.");
		} else {
			setRecapProduct((prev) => ({ ...prev, modele: data.nom })); // Mise à jour recap
			setNewModel("");
			showAlert("Succès", "Modèle ajouté !");
			loadModels(selectedBrand);
		}
	};
	
	

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Gestion des Produits</Text>


{showProducts && (
    <>
        <Text style={styles.sectionTitle}>1. Sélectionner ou Ajouter un Produit</Text>
        <FlatList
            data={[...productList].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }))} 
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
			placeholderTextColor="#888787"
            style={styles.input}
        />
        <TouchableOpacity style={styles.addButton} onPress={addProduct}>
            <Text style={styles.buttonText}>Ajouter Produit</Text>
        </TouchableOpacity>
    </>
)}


      
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
						placeholderTextColor="#888787"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addBrand}>
                        <Text style={styles.buttonText}>Ajouter Marque</Text>
                    </TouchableOpacity>
                </>
            )}

      
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
						placeholderTextColor="#888787"
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

            <BackButton onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />

            <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                onClose={() => setAlertVisible(false)}
            />
        </View>

    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#e0e0e0" },
    header: { fontSize: 20, fontWeight: "medium", color: "#242424", textAlign: "center", marginBottom: 15 },
    sectionTitle: { fontSize: 16, fontWeight: "medium",color: "#242424", marginTop: 15, marginBottom: 10 },
    input: { borderWidth: 1, padding: 10, borderRadius: 2, borderColor:"#cacaca", marginBottom: 10, color: "#888787", fontWeight: "bold" },
    addButton: { backgroundColor: "#191f2f", padding: 10, borderRadius: 5, alignItems: "center", marginBottom: 10 },
    buttonText: { color: "#888787", fontWeight: "bold" },
    box: { flex: 1, padding: 15, margin: 5, borderWidth: 1, borderRadius: 2, borderColor:"#888787", alignItems: "center", justifyContent: "center", backgroundColor: "#cacaca" },
    selectedBox: { backgroundColor: "#28a745", borderColor: "#28a745" },
    boxText: { fontWeight: "medium", color: "#242424", },
});

export default AddProductPage;
