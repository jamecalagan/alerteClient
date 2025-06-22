import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Alert,
    RefreshControl,
    Image,
} from "react-native";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

export default function FlyerListPage() {
    const [flyers, setFlyers] = useState([]);
    const [loading, setLoading] = useState(false);
    const navigation = useNavigation();
    const isFocused = useIsFocused();

    const loadFlyers = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("flyers")
            .select("*")
            .order("created_at", { ascending: false });

        if (!error) {
            setFlyers(data);
        } else {
            console.error("❌ Erreur chargement flyers :", error.message);
        }

        setLoading(false);
    };

    useEffect(() => {
        if (isFocused) {
            loadFlyers();
        }
    }, [isFocused]);

    const confirmDelete = (id) => {
        Alert.alert(
            "Supprimer l'affiche",
            "Souhaites-tu vraiment supprimer cette affiche ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    style: "destructive",
                    onPress: () => deleteFlyer(id),
                },
            ]
        );
    };

    const deleteFlyer = async (id) => {
        const { error } = await supabase.from("flyers").delete().eq("id", id);
        if (error) {
            Alert.alert("❌ Erreur", "Impossible de supprimer l'affiche.");
        } else {
            setFlyers((prev) => prev.filter((flyer) => flyer.id !== id));
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.item}>
            {/* 🖼️ Image du produit */}
            {item.imageUrl ? (
                <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                />
            ) : (
                <View
                    style={[
                        styles.thumbnail,
                        {
                            backgroundColor: "#ddd",
                            justifyContent: "center",
                            alignItems: "center",
                        },
                    ]}
                >
                    <Text style={{ color: "#999" }}>—</Text>
                </View>
            )}

            {/* 📝 Infos produit */}
            <TouchableOpacity
                onPress={() =>
                    navigation.navigate("ProductFormScreen", { product: item })
                }
                style={{ flex: 1, marginLeft: 12 }}
            >
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.sub}>Prix : {item.price} €</Text>
                <Text style={styles.sub}>
                    {item.brand} – {item.model}
                </Text>
            </TouchableOpacity>

            {/* 🧹 Bouton Supprimer */}
            <TouchableOpacity
                onPress={() => confirmDelete(item.id)}
                style={styles.deleteButtonBox}
            >
                <Text style={styles.deleteButtonText}>Supprimer</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.header}>📁 Affiches enregistrées</Text>

            <FlatList
                data={flyers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <>
                        {renderItem({ item })}
                        <View style={styles.separator} />
                    </>
                )}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={loadFlyers}
                    />
                }
                ListEmptyComponent={
                    !loading && (
                        <Text style={styles.empty}>
                            Aucune affiche enregistrée.
                        </Text>
                    )
                }
            />
            <View style={{ marginBottom: 16 }}></View>
						<TouchableOpacity
							style={styles.returnButtonFixed}
							onPress={() => navigation.goBack()}
						>
							<Text style={styles.buttonText}>⬅ Retour</Text>
						</TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
        flex: 1,
    },
    header: {
        fontSize: 22,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
    },
    item: {
        backgroundColor: "#f1f1f1",
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
    },
    title: {
        fontSize: 18,
        fontWeight: "bold",
    },
    sub: {
        fontSize: 14,
        color: "#555",
    },
    deleteButton: {
        marginLeft: 10,
        padding: 8,
    },
    deleteText: {
        fontSize: 18,
        color: "#c40000",
    },
    empty: {
        textAlign: "center",
        marginTop: 40,
        fontSize: 16,
        color: "#777",
    },
    button: {
        backgroundColor: "#4caf50",
        padding: 14,
        borderRadius: 8,
        alignItems: "center",
    },
    buttonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },
    thumbnail: {
        width: 60,
        height: 60,
        borderRadius: 6,
        backgroundColor: "#eee",
    },
    deleteButtonBox: {
        backgroundColor: "#c40000",
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        marginLeft: 10,
    },

    deleteButtonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 12,
    },
    separator: {
        height: 1,
        backgroundColor: "#ccc",
        marginVertical: 6,
    },
	    returnButtonFixed: {
        position: "absolute",
        bottom: 16,
        left: 16,
        right: 16,
        backgroundColor: "#6c757d",
        padding: 14,
        borderRadius: 8,
        alignItems: "center",
        zIndex: 100,
    },
});
