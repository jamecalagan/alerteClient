// Nouvelle version complète de ClientNotificationsPage.js
// Inclut :
// - Clients notifiés ET non notifiés
// - Possibilité d’envoyer notification depuis la fiche
// - Enregistrement dans Supabase du champ notifiedBy
// - Signature automatique
// - Modèles rapides (ajout/suppression dynamiques)
// - Pagination
// - Recherche et filtres

import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    Linking,
    Alert,
} from "react-native";
import { supabase } from "../supabaseClient";
import { useRoute, useNavigation } from "@react-navigation/native";
export default function ClientNotificationsPage() {
    const [lastNotified, setLastNotified] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [searchText, setSearchText] = useState("");
    const [filterType, setFilterType] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 3;
    const [messageMap, setMessageMap] = useState({});
    const [customTemplates, setCustomTemplates] = useState([]);
    const [newTemplate, setNewTemplate] = useState("");
    const route = useRoute();
    const [selectedClientId, setSelectedClientId] = useState(null);
const [filteredItems, setFilteredItems] = useState([]);

    const navigation = useNavigation();

const defaultTemplates = [
  "Bonjour, votre {type} est prêt(e).",
  "Merci de nous rappeler concernant votre {type}.",
  "Votre {type} est disponible en boutique.",
];


    const templates = [...defaultTemplates, ...customTemplates];
    useEffect(() => {
        if (selectedClientId) {
            setFiltered(notifications.filter((c) => c.id === selectedClientId));
        } else {
            applyFilters();
        }
    }, [notifications, selectedClientId]);

    useEffect(() => {
        fetchNotifications();
        fetchLastNotified();
    }, []);
    useEffect(() => {
        if (route.params?.clientId) {
            setSelectedClientId(route.params.clientId);
        }
    }, [route.params]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchText, filterType]);

    useEffect(() => {
        applyFilters();
    }, [notifications, searchText, filterType, currentPage]);

    const fetchNotifications = async () => {
        const { data, error } = await supabase
            .from("interventions")
            .select(
                "id, notifiedBy, notifiedat, client_id, deviceType, client:client_id(id, name, phone)"
            )
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Erreur fetch:", error);
        } else {
            const seen = new Set();
            const uniqueClients = [];

            data.forEach((intervention) => {
                if (!intervention.client) return;
                const key = `${intervention.client.id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueClients.push({
                        id: intervention.client.id,
                        name: intervention.client.name,
                        phone: intervention.client.phone,
                        notifiedBy: intervention.notifiedBy,
                        notifiedat: intervention.notifiedat, // ✅ ici !
                        intervention_id: intervention.id,
						deviceType: intervention.deviceType,
                    });
                }
            });

            const sorted = uniqueClients.sort((a, b) =>
                a.name?.localeCompare(b.name)
            );

            setNotifications(sorted);
        }
    };

const applyFilters = () => {
  let results = [...notifications];

  if (filterType !== "all") {
    results = results.filter((item) => {
      const n = item.notifiedBy || "";
      const normalized = n
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s/g, "");
      return normalized.includes(filterType);
    });
  }

  if (selectedClientId) {
    results = results.filter((c) => c.id === selectedClientId);
  } else if (searchText.trim() !== "") {
    const lower = searchText.toLowerCase();
    results = results.filter(
      (item) =>
        item.name?.toLowerCase().includes(lower) ||
        item.phone?.toLowerCase().includes(lower) ||
		item.deviceType?.toLowerCase().includes(lower) 
    );
  }

  // ✅ Tri par date de notification DESC (les plus récents d'abord)
  results.sort((a, b) => new Date(b.notifiedat) - new Date(a.notifiedat));

  // Stockage complet pour le calcul du nombre total de pages
  setFilteredItems(results);

  // Pagination réelle
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = results.slice(startIndex, startIndex + itemsPerPage);
  setFiltered(paginated);
};



const notifyClient = async (client, method) => {
  const newValue = method === "sms" ? "SMS" : "Téléphone";
  const timestamp = new Date().toISOString();

  const updateFields = {
    notifiedBy: newValue,
    notifiedat: timestamp,
  };

  const { error } = await supabase
    .from("interventions")
    .update(updateFields)
    .eq("id", client.intervention_id);

  if (!error) {
    const updatedClient = {
      ...client,
      ...updateFields,
      clientId: client.clientId || client.id,
    };

    setNotifications((prev) =>
      prev.map((n) =>
        n.intervention_id === client.intervention_id
          ? updatedClient
          : n
      )
    );

    setLastNotified((prev) => {
      const merged = [updatedClient, ...prev];
      const map = new Map();
      for (const c of merged) {
        map.set(c.clientId, c);
      }

      const uniqueSorted = Array.from(map.values()).sort(
        (a, b) => new Date(b.notifiedat) - new Date(a.notifiedat)
      );

      return uniqueSorted.slice(0, 3);
    });

    // ✅ Alerte : matériel non récupéré
    if (client.status !== "Récupéré") {
      Alert.alert(
        "📦 Matériel non récupéré",
        `${client.name} a été notifié mais n'a pas encore récupéré son matériel.`,
        [{ text: "OK" }]
      );
    }

    // ✅ Alerte : notifié depuis plus de 10 jours + date lisible
    if (
      (client.status === "Réparé" || client.status === "Non réparable") &&
      client.notifiedat
    ) {
      const dateNotif = new Date(client.notifiedat);
      const now = new Date();
      const diffJours = (now - dateNotif) / (1000 * 60 * 60 * 24);

      if (diffJours > 10) {
        const dateFr = dateNotif.toLocaleDateString("fr-FR");
        Alert.alert(
          "🔔 Client à relancer",
          `${client.name} a été notifié le ${dateFr} et n'a toujours pas récupéré son matériel.`,
          [{ text: "OK" }]
        );
      }
    }
  } else {
    console.log("Erreur Supabase : ", error.message);
    Alert.alert("Erreur", error.message);
  }
};


    const fetchLastNotified = async () => {
        const { data, error } = await supabase
            .from("interventions")
            .select(
                "id, notifiedBy, notifiedat, client:client_id (id, name, phone)"
            )
            .not("notifiedat", "is", null)
            .order("notifiedat", { ascending: false }) // 🔥 tri par date descendante
            .limit(20); // on en récupère assez pour filtrer

        if (!error && data) {
            const seen = new Set();
            const uniqueClients = [];

            for (const item of data) {
                const clientId = item.client?.id;
                if (!clientId || seen.has(clientId)) continue;

                seen.add(clientId);
                uniqueClients.push({
                    intervention_id: item.id,
                    notifiedBy: item.notifiedBy,
                    notifiedat: item.notifiedat,
                    name: item.client.name,
                    clientId: clientId,
                });

                if (uniqueClients.length >= 3) break;
            }

            setLastNotified(uniqueClients);
        } else {
            console.error("Erreur fetchLastNotified:", error);
        }
    };

    const renderItem = ({ item }) => {
		const raw = messageMap[item.id] || templates[0];
		const type = item.deviceType || "appareil";
		const message = `${raw.replace("{type}", type)}\n\nAVENIR INFORMATIQUE`;
		const isNotified = !!item.notifiedBy;

        return (
            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{item.name}</Text>
                        <Text style={styles.phone}>{item.phone}</Text>
						<Text style={styles.deviceType}>{item.deviceType}</Text>
                        {isNotified ? (
                            <View style={styles.methodRow}>
                                {item.notifiedBy
                                    ?.toLowerCase()
                                    .includes("sms") && (
                                    <Text
                                        style={[
                                            styles.badge,
                                            {
                                                backgroundColor: "#cce5ff",
                                                color: "#004085",
                                            },
                                        ]}
                                    >
                                        📩 SMS
                                    </Text>
                                )}
                                {item.notifiedBy
                                    ?.toLowerCase()
                                    .includes("téléphone") && (
                                    <Text
                                        style={[
                                            styles.badge,
                                            {
                                                backgroundColor: "#d4edda",
                                                color: "#155724",
                                            },
                                        ]}
                                    >
                                        📞 Téléphone
                                    </Text>
                                )}
                            </View>
                        ) : (
                            <Text
                                style={{
                                    marginTop: 6,
                                    fontStyle: "italic",
                                    color: "#888",
                                }}
                            >
                                Non notifié
                            </Text>
                        )}

                        {/* ✅ Affiche date/heure de notification si dispo */}
                        {item.notifiedat && (
                            <Text
                                style={{
                                    fontSize: 13,
                                    color: "#555",
                                    marginTop: 4,
                                }}
                            >
                                🕒 Notifié le{" "}
                                {new Date(item.notifiedat).toLocaleDateString(
                                    "fr-FR"
                                )}{" "}
                                à{" "}
								{new Date(item.notifiedat).toLocaleTimeString("fr-FR", {
								hour: "2-digit",
								minute: "2-digit",
								timeZone: "Europe/Paris", // ✅ Fuseau horaire forcé
								})}

                            </Text>
                        )}

                        <View style={styles.templateRow}>
                            {templates.map((tpl, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    onLongPress={() => {
                                        if (idx >= defaultTemplates.length) {
                                            const updated = [
                                                ...customTemplates,
                                            ];
                                            updated.splice(
                                                idx - defaultTemplates.length,
                                                1
                                            );
                                            setCustomTemplates(updated);
                                        }
                                    }}
                                    onPress={() =>
                                        setMessageMap((prev) => ({
                                            ...prev,
                                            [item.id]: tpl,
                                        }))
                                    }
                                    style={styles.templateButton}
                                >
                                    <Text style={styles.templateText}>
                                        📄{" "}
                                        {tpl.length > 35
                                            ? tpl.slice(0, 35) + "…"
                                            : tpl}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

							<TextInput
							style={styles.messageInput}
							placeholder="✏️ Message à envoyer par SMS"
							value={raw}
							onChangeText={(text) =>
								setMessageMap((prev) => ({
								...prev,
								[item.id]: text,
								}))
							}
							/>
                    </View>

                    <View style={styles.actionsColumn}>
                        <TouchableOpacity
                            style={[
                                styles.actionButton,
                                { backgroundColor: "#28a745" },
                            ]}
                            onPress={() => {
                                notifyClient(item, "téléphone");
                                Linking.openURL(`tel:${item.phone}`);
                            }}
                        >
                            <Text style={styles.actionText}>📞 Appeler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.actionButton,
                                { backgroundColor: "#007bff" },
                            ]}
                            onPress={() => {
                                notifyClient(item, "sms");
                                const encoded = encodeURIComponent(message);
                                Linking.openURL(
                                    `sms:${item.phone}?body=${encoded}`
                                );
                            }}
                        >
                            <Text style={styles.actionText}>📩 Envoyer</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Notifications Clients</Text>

            {lastNotified.length > 0 && (
                <View style={styles.bannerRow}>
                    {lastNotified.map((c, index) => (
                        <TouchableOpacity
                            key={c.clientId}
                            onPress={() =>
                                navigation.navigate("ClientNotificationsPage", {
                                    clientId: c.clientId,
                                })
                            }
                        >
                            <Text style={styles.bannerText}>
                                {c.notifiedBy === "SMS" ? "📩" : "📞"} {c.name}
                                {index < lastNotified.length - 1 ? "  |  " : ""}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
            <TextInput
                style={styles.searchInput}
                placeholder="🔍 Rechercher nom ou téléphone"
                value={searchText}
                onChangeText={setSearchText}
            />

            <View style={styles.filterRow}>
                {["all", "sms", "telephone", "relance"].map((type) => (
                    <TouchableOpacity
                        key={type}
                        style={[
                            styles.filterButton,
                            filterType === type && styles.activeFilter,
                        ]}
                        onPress={() => setFilterType(type)}
                    >
<Text style={styles.filterText}>
  {type === "all"
    ? "Tous"
    : type === "sms"
    ? "SMS"
    : type === "telephone"
    ? "Téléphone"
    : "📤 Relance"}
</Text>

                    </TouchableOpacity>
					
                ))}
{/* 				<TouchableOpacity
  style={[styles.filterButton, { backgroundColor: "#f39c12" }]}
  onPress={() => {
    const now = new Date();
    const clientsARelancer = notifications.filter((n) => {
      const d = new Date(n.notifiedat);
      const days = (now - d) / (1000 * 60 * 60 * 24);
      return (
        (n.status === "Réparé" || n.status === "Non réparable") &&
        days > 10
      );
    });

    if (clientsARelancer.length > 0) {
      Alert.alert(
        "📤 Clients à relancer",
        `${clientsARelancer.length} client(s) ont été notifiés il y a plus de 10 jours sans retrait.`,
        [{ text: "OK" }]
      );
    } else {
      Alert.alert(
        "👍 Aucun client à relancer",
        "Tous les clients ont été notifiés récemment ou ont récupéré leur matériel.",
        [{ text: "OK" }]
      );
    }
  }}
>
  <Text style={styles.filterText}>📤 Relance</Text>
</TouchableOpacity> */}

            </View>

            {selectedClientId && (
                <TouchableOpacity
                    onPress={() => setSelectedClientId(null)}
                    style={styles.clearButton}
                >
                    <Text style={styles.clearButtonText}>
                        ❌ Réinitialiser le filtre
                    </Text>
                </TouchableOpacity>
            )}

            <View style={styles.addTemplateRow}>
                <TextInput
                    placeholder="Ajouter un modèle de message..."
                    value={newTemplate}
                    onChangeText={setNewTemplate}
                    style={styles.newTemplateInput}
                />
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => {
                        if (newTemplate.trim()) {
                            setCustomTemplates([
                                ...customTemplates,
                                newTemplate.trim(),
                            ]);
                            setNewTemplate("");
                        }
                    }}
                >
                    <Text style={styles.addButtonText}>+ Ajouter</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: 20 }}
            />

            <View style={styles.paginationRow}>
                <TouchableOpacity
                    style={[
                        styles.pageButton,
                        currentPage === 1 && { backgroundColor: "#ccc" },
                    ]}
                    onPress={() => {
                        if (currentPage > 1) setCurrentPage(currentPage - 1);
                    }}
                >
                    <Text style={styles.pageButtonText}>⏮ Précédent</Text>
                </TouchableOpacity>
<Text style={styles.pageIndicator}>
  Page {currentPage} / {Math.max(1, Math.ceil(filteredItems.length / itemsPerPage))}
</Text>
                <TouchableOpacity
                    style={[
                        styles.pageButton,
                        filtered.length < itemsPerPage && {
                            backgroundColor: "#ccc",
                        },
                    ]}
                    onPress={() => {
                        if (filtered.length === itemsPerPage)
                            setCurrentPage(currentPage + 1);
                    }}
                >
                    <Text style={styles.pageButtonText}>Suivant ⏭</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: "#f0f0f0" },
    title: {
        fontSize: 22,
        fontWeight: "bold",
        marginBottom: 12,
        textAlign: "center",
    },
    searchInput: {
        backgroundColor: "#fff",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        marginBottom: 10,
        fontSize: 16,
    },
    filterRow: {
        flexDirection: "row",
        justifyContent: "center",
        marginBottom: 10,
        gap: 10,
    },
    filterButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: "#ccc",
        borderRadius: 20,
    },
    activeFilter: { backgroundColor: "#007bff" },
    filterText: { color: "#fff", fontWeight: "bold" },
    addTemplateRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    newTemplateInput: {
        flex: 1,
        backgroundColor: "#fff",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        fontSize: 14,
    },
    addButton: {
        backgroundColor: "#28a745",
        paddingHorizontal: 14,
        justifyContent: "center",
        borderRadius: 10,
    },
    addButtonText: { color: "white", fontWeight: "bold" },
    card: {
        backgroundColor: "#ffffff",
        padding: 16,
        marginBottom: 12,
        borderRadius: 10,
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
    },
    name: { fontSize: 18, fontWeight: "bold" },
    phone: { fontSize: 16, color: "#444" },
    methodRow: { flexDirection: "row", gap: 10, marginTop: 8 },
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        fontWeight: "bold",
        fontSize: 13,
    },
    headerRow: { flexDirection: "row", alignItems: "center" },
    actionsColumn: {
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
        marginLeft: 10,
    },
    actionButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 20,
    },
    actionText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
    paginationRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 10,
        paddingHorizontal: 10,
    },
    pageButton: {
        backgroundColor: "#007bff",
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    pageButtonText: { color: "#fff", fontWeight: "bold" },
    pageIndicator: { fontSize: 16, fontWeight: "bold", color: "#333" },
    messageInput: {
        backgroundColor: "#f6f6f6",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 8,
        marginTop: 10,
        fontSize: 14,
    },
    templateRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 8,
    },
    templateButton: {
        backgroundColor: "#eee",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
    },
    templateText: { fontSize: 12, color: "#333" },
    banner: {
        backgroundColor: "#fcf3e9",
        padding: 10,
        borderRadius: 10,
        marginBottom: 10,
    },
    bannerTitle: {
        fontWeight: "bold",
        marginBottom: 4,
        color: "#155724",
    },
    bannerText: {
        color: "#155724",
        fontSize: 14,
        marginTop: 2,
        textAlign: "center",
    },
    bannerRow: {
        flexDirection: "row",
        justifyContent: "center",
        flexWrap: "wrap",
        marginTop: 2,
        marginBottom: 10,
        gap: 6,
    },
    bannerText: {
        color: "#155724",
        fontSize: 13,
        textAlign: "center",
        textDecorationLine: "underline",
    },
    clearButton: {
        alignSelf: "center",
        marginTop: 6,
        marginBottom: 10,
        backgroundColor: "#ffc107",
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
    },
    clearButtonText: {
        color: "#000",
        fontWeight: "bold",
        fontSize: 14,
    },
});
