import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, FlatList, ScrollView, StyleSheet } from "react-native";
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

    const StepBadge = ({ n }) => (
        <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>{n}</Text>
        </View>
    );

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.header}>Gestion des produits</Text>

            {showProducts && (
                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <StepBadge n="1" />
                        <Text style={styles.cardTitle}>Sélectionner ou ajouter un produit</Text>
                    </View>

                    <FlatList
                        data={[...productList].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }))}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={2}
                        scrollEnabled={false}
                        columnWrapperStyle={styles.gridRow}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.chip, selectedProduct === item.id && styles.chipSelected]}
                                onPress={() => loadBrands(item.id)}
                                activeOpacity={0.85}
                            >
                                <Text
                                    style={[
                                        styles.chipText,
                                        selectedProduct === item.id && styles.chipTextSelected,
                                    ]}
                                >
                                    {item.nom}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />

                    <TextInput
                        value={newProduct}
                        onChangeText={setNewProduct}
                        placeholder="Ajouter un produit"
                        placeholderTextColor="#94a3b8"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addProduct} activeOpacity={0.85}>
                        <Text style={styles.addButtonText}>+ Ajouter le produit</Text>
                    </TouchableOpacity>
                </View>
            )}

            {showBrands && (
                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <StepBadge n="2" />
                        <Text style={styles.cardTitle}>Sélectionner ou ajouter une marque</Text>
                    </View>

                    <FlatList
                        data={brandList}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={2}
                        scrollEnabled={false}
                        columnWrapperStyle={styles.gridRow}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.chip, selectedBrand === item.id && styles.chipSelected]}
                                onPress={() => loadModels(item.id)}
                                activeOpacity={0.85}
                            >
                                <Text
                                    style={[
                                        styles.chipText,
                                        selectedBrand === item.id && styles.chipTextSelected,
                                    ]}
                                >
                                    {item.nom}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />

                    <TextInput
                        value={newBrand}
                        onChangeText={setNewBrand}
                        placeholder="Ajouter une marque"
                        placeholderTextColor="#94a3b8"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addBrand} activeOpacity={0.85}>
                        <Text style={styles.addButtonText}>+ Ajouter la marque</Text>
                    </TouchableOpacity>
                </View>
            )}

            {showModels && (
                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <StepBadge n="3" />
                        <Text style={styles.cardTitle}>Sélectionner ou ajouter un modèle</Text>
                    </View>

                    <FlatList
                        data={modelList}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={2}
                        scrollEnabled={false}
                        columnWrapperStyle={styles.gridRow}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.chip, selectedModel === item.id && styles.chipSelected]}
                                onPress={() => setSelectedModel(item.id)}
                                activeOpacity={0.85}
                            >
                                <Text
                                    style={[
                                        styles.chipText,
                                        selectedModel === item.id && styles.chipTextSelected,
                                    ]}
                                >
                                    {item.nom}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />

                    <TextInput
                        value={newModel}
                        onChangeText={setNewModel}
                        placeholder="Ajouter un modèle"
                        placeholderTextColor="#94a3b8"
                        style={styles.input}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={addModel} activeOpacity={0.85}>
                        <Text style={styles.addButtonText}>+ Ajouter le modèle</Text>
                    </TouchableOpacity>
                </View>
            )}

            {recapProduct && recapProduct.produit && recapProduct.marque && recapProduct.modele && (
                <View style={styles.recapCard}>
                    <Text style={styles.recapTitle}>✅ Récapitulatif</Text>
                    <Text style={styles.recapLine}>🛠 Produit : {recapProduct.produit}</Text>
                    <Text style={styles.recapLine}>🏭 Marque : {recapProduct.marque}</Text>
                    <Text style={styles.recapLine}>📌 Modèle : {recapProduct.modele}</Text>
                </View>
            )}

            <BackButton onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />

            <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                onClose={() => setAlertVisible(false)}
            />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f8fafc" },
    contentContainer: { padding: 16, paddingBottom: 40 },
    header: {
        fontSize: 22,
        fontWeight: "800",
        color: "#0f172a",
        textAlign: "center",
        marginBottom: 16,
    },

    card: {
        backgroundColor: "#ffffff",
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    cardTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
    },
    cardTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: "700",
        color: "#1e293b",
    },
    stepBadge: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: "#2563eb",
        alignItems: "center",
        justifyContent: "center",
    },
    stepBadgeText: {
        color: "#ffffff",
        fontSize: 13,
        fontWeight: "700",
    },

    gridRow: {
        gap: 8,
        marginBottom: 8,
    },
    chip: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e2e8f0",
        backgroundColor: "#f8fafc",
        alignItems: "center",
        justifyContent: "center",
    },
    chipSelected: {
        backgroundColor: "#dbeafe",
        borderColor: "#2563eb",
    },
    chipText: {
        fontWeight: "600",
        color: "#334155",
        textAlign: "center",
    },
    chipTextSelected: {
        color: "#1d4ed8",
        fontWeight: "700",
    },

    input: {
        borderWidth: 1,
        borderColor: "#e2e8f0",
        backgroundColor: "#f8fafc",
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginTop: 10,
        marginBottom: 10,
        fontSize: 15,
        color: "#1e293b",
    },
    addButton: {
        backgroundColor: "#2563eb",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    addButtonText: {
        color: "#ffffff",
        fontWeight: "700",
        fontSize: 14,
    },

    recapCard: {
        backgroundColor: "#dcfce7",
        borderWidth: 1,
        borderColor: "#86efac",
        borderRadius: 16,
        padding: 16,
        marginBottom: 6,
    },
    recapTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: "#15803d",
        marginBottom: 6,
    },
    recapLine: {
        fontSize: 14,
        fontWeight: "600",
        color: "#166534",
        marginTop: 2,
    },
});

export default AddProductPage;
