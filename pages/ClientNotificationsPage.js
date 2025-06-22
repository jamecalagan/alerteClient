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
        "Bonjour, votre {type} est prêt(e). N'oubliez pas le bon de restitution, merci",
        "Merci de nous rappeler concernant votre {type}.",
        "Votre {type} est disponible en boutique.",
        "⚠️ Bonjour, votre matériel est prêt depuis plus de 30 jours. Sans récupération rapide, des frais de stockage seront appliqués. Passé ce délai, il sera considéré comme abandonné et pourra faire l’objet d’une destruction.",
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
        fetchNotifications().then(() => {
            setTimeout(() => {
                const now = new Date();
                const urgents = notifications.filter((item) => {
                    if (!item.notifiedat) return false;
                    const d = new Date(item.notifiedat);
                    const days = (now - d) / (1000 * 60 * 60 * 24);
                    return (
                        (item.status === "Réparé" ||
                            item.status === "Non réparable") &&
                        days > 30
                    );
                });
                if (urgents.length > 0) {
                    Alert.alert(
                        "⛔️ Urgences détectées",
                        `${urgents.length} client(s) ont été notifiés depuis plus de 30 jours sans récupération.`,
                        [
                            {
                                text: "Voir",
                                onPress: () => setFilterType("urgence"),
                            },
                            { text: "OK" },
                        ]
                    );
                }
            }, 1000);
        });
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
        const { data: interventions, error: error1 } = await supabase
            .from("interventions")
            .select("id, notifiedBy, notifiedat, review_requested, client_id, deviceType, status, client:client_id(id, name, phone)")

            .order("created_at", { ascending: false });

        const { data: orders, error: error2 } = await supabase
            .from("orders")
            .select(
                "id, client_id, notified, client:client_id(id, name, phone)"
            )
            .order("createdat", { ascending: false });

        if (error1 || error2) {
            console.error("Erreur fetch:", error1 || error2);
            return;
        }

        const seen = new Set();
        const combined = [];

        // Ajout des clients depuis interventions
        interventions.forEach((inter) => {
            if (!inter.client) return;
            const key = `${inter.client.id}`;
            if (!seen.has(key)) {
                seen.add(key);
                combined.push({
                    id: inter.client.id,
                    name: inter.client.name,
                    phone: inter.client.phone,
                    notifiedBy: inter.notifiedBy,
                    notifiedat: inter.notifiedat,
					review_requested: inter.review_requested,
                    intervention_id: inter.id,
                    deviceType: inter.deviceType,
                    status: inter.status || "Intervention",
                });
            }
        });

        // Ajout des clients avec commandes uniquement
        orders.forEach((order) => {
            if (!order.client) return;
            const key = `${order.client.id}`;
            if (!seen.has(key)) {
                seen.add(key);
                combined.push({
                    id: order.client.id,
                    name: order.client.name,
                    phone: order.client.phone,
                    notifiedBy: order.notified ? "SMS" : null,
                    notifiedat: null,
                    intervention_id: null,
                    deviceType: "Commande",
                    status: "Commande",
                });
            }
        });

        const sorted = combined.sort((a, b) => a.name?.localeCompare(b.name));
        setNotifications(sorted);
    };

    const applyFilters = () => {
        let results = [...notifications];
        const now = new Date();

        if (filterType === "urgence") {
            results = results.filter((item) => {
                if (!item.notifiedat) return false;
                const d = new Date(item.notifiedat);
                const days = (now - d) / (1000 * 60 * 60 * 24);
                return (
                    (item.status === "Réparé" ||
                        item.status === "Non réparable") &&
                    days > 30
                );
            });
        } else if (filterType === "avis") {
            results = results.filter((item) => {
               
                return item.review_requested;
            });
        } else if (filterType !== "all") {
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

        results.sort((a, b) => new Date(b.notifiedat) - new Date(a.notifiedat));
        setFilteredItems(results);

        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginated = results.slice(startIndex, startIndex + itemsPerPage);
        setFiltered(paginated);
    };

    const notifyClient = async (client, method) => {
        const timestamp = new Date().toISOString();
        const updateFields = {
            notifiedBy: method === "sms" ? "SMS" : "Téléphone",
            notifiedat: timestamp,
        };

        let updateResult;

        if (client.intervention_id) {
            // ✅ Si intervention → mise à jour dans interventions
            updateResult = await supabase
                .from("interventions")
                .update(updateFields)
                .eq("id", client.intervention_id);
        } else {
            // ✅ Si commande uniquement → mise à jour dans orders (colonne "notified" booléenne)
            updateResult = await supabase
                .from("orders")
                .update({ notified: true }) // uniquement ça
                .eq("client_id", client.id);
        }

        const { error } = updateResult;

        if (!error) {
            const updatedClient = {
                ...client,
                ...updateFields,
                clientId: client.clientId || client.id,
            };

            setNotifications((prev) =>
                prev.map((n) => (n.id === client.id ? updatedClient : n))
            );

            setLastNotified((prev) => {
                const merged = [updatedClient, ...prev];
                const map = new Map();
                for (const c of merged) {
                    map.set(c.clientId, c);
                }
                return Array.from(map.values()).slice(0, 3);
            });

            Alert.alert(
                "✅ Notification envoyée",
                `${client.name} a été notifié.`,
                [{ text: "OK" }]
            );
        } else {
            console.error("Erreur Supabase :", error.message);
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
                        {item.notifiedat &&
                            (item.status === "Réparé" ||
                                item.status === "Non réparable") &&
                            (new Date() - new Date(item.notifiedat)) /
                                (1000 * 60 * 60 * 24) >
                                30 && (
                                <Text style={styles.urgentBadge}>
                                    ⚠️ URGENT
                                </Text>
                            )}
                        {isNotified ? (
                            <View style={styles.methodRow}>
                                {item.review_requested && (
                                    <Text
                                        style={[
                                            styles.badge,
                                            {
                                                backgroundColor: "#fff3cd",
                                                color: "#856404",
                                            },
                                        ]}
                                    >
                                        ⭐ Avis
                                    </Text>
                                )}
{item.review_requested && (
  <TouchableOpacity
    onPress={() => {
      if (!item.review_responded) {
        Alert.alert(
          "Avis reçu et répondu ?",
          "Confirme que tu as bien reçu un avis et que tu y as répondu.",
          [
            { text: "Annuler", style: "cancel" },
            {
              text: "Oui, confirmé",
              onPress: async () => {
                await supabase
                  .from("interventions")
                  .update({ review_responded: true })
                  .eq("id", item.intervention_id);

                const updatedClient = {
                  ...item,
                  review_responded: true,
                };
                setNotifications((prev) =>
                  prev.map((n) => (n.id === item.id ? updatedClient : n))
                );
              },
            },
          ]
        );
      }
    }}
  >
    <Text
      style={[
        styles.badge,
        item.review_responded
          ? { backgroundColor: "#d4edda", color: "#155724" } // vert
          : { backgroundColor: "#eeeeee", color: "#888" }, // gris
      ]}
    >
      🌟
    </Text>
  </TouchableOpacity>
)}


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
                                {new Date(item.notifiedat).toLocaleTimeString(
                                    "fr-FR",
                                    {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        timeZone: "Europe/Paris", // ✅ Fuseau horaire forcé
                                    }
                                )}
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
                        <TouchableOpacity
                            style={[
                                styles.actionButton,
                                { backgroundColor: "#ff9900" },
                            ]}
                            onPress={async () => {
                                const avisMessage =
                                    "Bonjour, merci pour votre passage en boutique ! 😊\n" +
                                    "Votre avis nous est précieux. Si vous avez un moment, vous pouvez le partager ici :\n" +
                                    "👉 https://g.page/r/CW8DQ11bfVKeEAE/review\nMerci beaucoup et à bientôt !";

                                const encoded = encodeURIComponent(avisMessage);

                                await supabase
                                    .from("interventions")
                                    .update({
                                        review_requested: true,
                                        notifiedat: new Date().toISOString(),
                                    })
                                    .eq("id", item.intervention_id);

                                const updatedClient = {
                                    ...item,
                                    review_requested: true,
                                    notifiedat: new Date().toISOString(),
                                };

                                setNotifications((prev) =>
                                    prev.map((n) =>
                                        n.id === item.id ? updatedClient : n
                                    )
                                );

                                Linking.openURL(
                                    `sms:${item.phone}?body=${encoded}`
                                );
                            }}
                        >
                            <Text style={styles.actionText}>
                                ⭐ Avis Google
                            </Text>
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
                {["all", "sms", "telephone", "relance", "urgence", "avis"].map(
                    (type) => (
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
                                    : type === "relance"
                                    ? "📤 Relance"
                                    : type === "avis"
                                    ? "⭐ Avis"
                                    : "⛔ Urgence"}
                            </Text>
                        </TouchableOpacity>
                    )
                )}
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
                    Page {currentPage} /{" "}
                    {Math.max(
                        1,
                        Math.ceil(filteredItems.length / itemsPerPage)
                    )}
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
    urgentBadge: {
        backgroundColor: "#dc3545",
        color: "#fff",
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        fontWeight: "bold",
        marginTop: 6,
        fontSize: 13,
    },
    actionButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 20,
        marginBottom: 6,
    },
});
