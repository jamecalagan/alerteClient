import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
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
      <TouchableOpacity
        onPress={() =>
			navigation.navigate("ProductFormScreen", { product: item })
        }
        style={{ flex: 1 }}
      >
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.sub}>Prix : {item.price} €</Text>
        <Text style={styles.sub}>
          {item.brand} – {item.model}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => confirmDelete(item.id)}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteText}>🗑️</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>📁 Affiches enregistrées</Text>

      <FlatList
        data={flyers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadFlyers} />
        }
        ListEmptyComponent={
          !loading && (
            <Text style={styles.empty}>Aucune affiche enregistrée.</Text>
          )
        }
      />
	  <View style={{ marginBottom: 16 }}>

</View>

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

});
