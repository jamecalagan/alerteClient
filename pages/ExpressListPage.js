import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Linking,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import { printInvoice } from "../utils/printInvoice.js"; 

// ================= Helpers =================
const PER_PAGE = 3;


const USB_COST = 20;
const HDD_COST = 45;

// --- Helpers numériques
const n = (v) => {
    const x = parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(x) ? x : 0;
};

// "3 VHS, 15 VHS-C" -> 18
const parseCassetteCount = (val) => {
    if (val == null) return null;
    const m = String(val).match(/\d+(?:[.,]\d+)?/g);
    return m ? m.reduce((s, t) => s + n(t), 0) : null;
};

// true => le client fournit le support (donc PAS de facturation du support)
const clientFournitSupport = (v) => {
    if (typeof v === "boolean") return v === false ? true : false; 
    const s = String(v ?? "")
        .trim()
        .toLowerCase();
    if (["true", "1", "oui", "client"].includes(s)) return true;
    if (["false", "0", "non", "magasin"].includes(s)) return false; 
    return false;
};
const magasinFournitSupport = (v) => !clientFournitSupport(v);

const outputKinds = (val) => {
  const out = String(val || "").trim().toLowerCase();
  return {
    isUSB: out.includes("usb"),
    isHDD: out.includes("disque") || out.includes("hdd"),
    isCD: out.includes("cd"),
    isDVD: out.includes("dvd"),
  };
};


const computePreview = (item) => {
  const qty =
    n(item.quantity) ||
    n(item.qty) ||
    n(item.count) ||
    parseCassetteCount(item.cassettecount) ||
    1;

  const total =
    n(item.total) ||
    n(item.totalttc) ||
    n(item.totalTTC) ||
    n(item.amount) ||
    n(item.price) ||
    0;


  const { isUSB, isHDD, isCD, isDVD } = outputKinds(item.outputtype);


  const clientFournit = clientFournitSupport(item.support_fournis);
  const magasinFournit = !clientFournit;


  let storageCost = 0;
  if (magasinFournit) {
    if (isUSB) storageCost = USB_COST;
    if (isHDD) storageCost = HDD_COST;
  }


  const candUnit = n(item.unitPrice);
  const unitService =
    candUnit > 0
      ? candUnit
      : qty > 0
      ? Math.max(0, (total - storageCost) / qty)
      : 0;

  const supportLabel =
    storageCost > 0
      ? (isUSB
          ? "Clé USB fournie par le magasin"
          : isHDD
          ? "Disque dur fourni par le magasin"
          : "Support de stockage fourni par le magasin")
      : "";

 
  let clientSupportLabel = "";
  if (clientFournit && (isUSB || isHDD)) {
    clientSupportLabel = isUSB
      ? "Clé USB fournie par le client"
      : "Disque dur fourni par le client";
  }
  
  if (!clientSupportLabel && (isCD || isDVD)) {
    clientSupportLabel = isCD ? "CD (non facturé)" : "DVD (non facturé)";
  }

  const description = String(item.description || "")
    .split("<br/>")
    .join("\n");

  return {
    qty,
    total,
    unitService,
    storageCost,
    supportLabel,
    clientSupportLabel,
    description,
  };
};


// ================= Page =================
const ExpressListPage = () => {
    const navigation = useNavigation();

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState("");

   
    const [page, setPage] = useState(1);

   
    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("express")
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            setRows(data || []);
        } catch (e) {
            console.error(e);
            Alert.alert("Erreur", "Impossible de charger les interventions.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    // Filtrage local
    const filtered = rows.filter((it) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (
            String(it.name || it.clientname || "")
                .toLowerCase()
                .includes(s) ||
            String(it.phone || it.clientphone || "")
                .toLowerCase()
                .includes(s) ||
            String(it.description || "")
                .toLowerCase()
                .includes(s)
        );
    });

    // Reset page quand la recherche change ou quand la taille change
    useEffect(() => {
        setPage(1);
    }, [search, rows.length]);

    // Découpage pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const startIndex = (page - 1) * PER_PAGE;
    const pageData = filtered.slice(startIndex, startIndex + PER_PAGE);

    // ======== Actions ========

    // Facturer : prépare les lignes, puis navigate vers BillingPage
    const goToInvoice = useCallback(
        (item) => {
            if (!item) return;

            const {
                qty,
                total,
                unitService,
                storageCost,
                supportLabel,
                description,
            } = computePreview(item);

            const lines = [];

            // Ligne prestation (toujours)
            const puService = unitService != null ? unitService : 0; // sécurité
            lines.push({
                designation: description,
                quantity: String(qty),
                price: String(puService), // P.U. TTC PRESTATION (hors support)
                serial: item.serial || "",
            });

            if (storageCost > 0) {
                lines.push({
                    designation: supportLabel,
                    quantity: "1",
                    price: String(storageCost),
                    serial: "",
                });
            }

            navigation.navigate("BillingPage", {
                express_id: item.id,
                expressData: {
                    ...item,
                    quantity: qty,
                    total,
                    unitPrice: unitService, // peut être null si mixte
                    description,
                    lines,
                },
            });
        },
        [navigation]
    );

    // Modifier : route vers la bonne page selon le type
    const goToEdit = useCallback(
        (item) => {
            if (!item?.type) {
                Alert.alert("Erreur", "Type de fiche inconnu.");
                return;
            }
            switch (item.type) {
                case "video":
                    navigation.navigate("ExpressVideoPage", {
                        isEdit: true,
                        expressData: { ...item },
                    });
                    break;
                case "reparation":
                    navigation.navigate("ExpressRepairPage", {
                        isEdit: true,
                        expressData: { ...item },
                    });
                    break;
                case "logiciel":
                    navigation.navigate("ExpressSoftwarePage", {
                        isEdit: true,
                        expressData: { ...item },
                    });
                    break;
                default:
                    Alert.alert("Erreur", `Type non géré : ${item.type}`);
            }
        },
        [navigation]
    );

    // Supprimer
    const handleDelete = useCallback(
        (item) => {
            Alert.alert(
                "Confirmer la suppression",
                `Supprimer la fiche pour ${
                    item.name || item.clientname || "ce client"
                } ?`,
                [
                    { text: "Annuler", style: "cancel" },
                    {
                        text: "Supprimer",
                        style: "destructive",
                        onPress: async () => {
                            try {
                                const { error } = await supabase
                                    .from("express")
                                    .delete()
                                    .eq("id", item.id);
                                if (error) throw error;
                                Alert.alert(
                                    "Supprimé",
                                    "L'enregistrement a été supprimé."
                                );
                                fetchRows();
                            } catch (e) {
                                console.error(e);
                                Alert.alert(
                                    "Erreur",
                                    "Échec de la suppression."
                                );
                            }
                        },
                    },
                ]
            );
        },
        [fetchRows]
    );

    // Imprimer (Aperçu facture identique à BillingPage via printInvoice)
    const handlePrint = useCallback(async (item) => {
        if (!item) return;

        const { qty, unitService, storageCost, supportLabel, description } =
            computePreview(item);

        const invoiceLines = [
            {
                designation: description,
                quantity: String(qty),
                price: String(unitService ?? 0),
                serial: item.serial || "",
            },
        ];
        if (storageCost > 0) {
            invoiceLines.push({
                designation: supportLabel,
                quantity: "1",
                price: String(storageCost),
                serial: "",
            });
        }

        await printInvoice({
            customer: {
                name: item.name || item.clientname || "",
                phone: item.phone || item.clientphone || "",
                address: item.client_address || "",
            },
            meta: {
                number: item.invoicenumber || "",
                date: new Date(
                    item.created_at || Date.now()
                ).toLocaleDateString(),
                paymentMethod: item.paymentmethod || "",
            },
            lines: invoiceLines,
            acompte: item.acompte || 0,
            paid: !!item.paid,
            tvaRate: 0.2,
        });
    }, []);

    // Notifier (messages contextuels selon type)
    const handleNotify = useCallback(
        async (item) => {
            const phone = item?.phone || item?.clientphone || "";
            if (!phone) {
                Alert.alert("Erreur", "Numéro de téléphone manquant.");
                return;
            }

            let message = "";
            switch (String(item?.type || "").toLowerCase()) {
                case "video":
                    message =
                        "Bonjour, vos cassettes sont prêtes. AVENIR INFORMATIQUE";
                    break;
                case "reparation": {
                    const device =
                        item?.device ||
                        item?.material ||
                        item?.modele ||
                        "appareil";
                    message = `Bonjour, votre ${device} est prêt. AVENIR INFORMATIQUE`;
                    break;
                }
                case "logiciel":
                    message =
                        "Bonjour, votre système est prêt. AVENIR INFORMATIQUE";
                    break;
                default:
                    message =
                        "Bonjour, votre commande est prête. AVENIR INFORMATIQUE";
                    break;
            }

            const url = `sms:${phone}?body=${encodeURIComponent(message)}`;
            try {
                await Linking.openURL(url);
                await supabase
                    .from("express")
                    .update({
                        notified: true,
                        notified_at: new Date().toISOString(),
                    })
                    .eq("id", item.id);
                await fetchRows();
            } catch (err) {
                console.error("SMS error:", err);
                Alert.alert("Erreur", "Impossible d’ouvrir la messagerie.");
            }
        },
        [fetchRows]
    );

    // ================= Rendu =================
    const renderItem = ({ item }) => {
        const {
            qty,
            total,
            unitService,
            storageCost,
            supportLabel,
            clientSupportLabel,
            description,
        } = computePreview(item);

        const unitText =
            unitService != null ? `${unitService.toFixed(2)} €` : "—";

        return (
            <View style={styles.card}>
               
                <View style={styles.cardHeader}>
                    <View>
                        <Text style={styles.titleLine}>
                            {item.name || item.clientname || "Client inconnu"}
                        </Text>
                        <Text style={styles.subLine}>
                            {item.phone ||
                                item.clientphone ||
                                "Téléphone non renseigné"}
                        </Text>
                    </View>

                 
                    <View
                        style={[
                            styles.statusPill,
                            item.paid ? styles.statusPaid : styles.statusUnpaid,
                        ]}
                    >
                        <View
                            style={[
                                styles.dot,
                                item.paid ? styles.dotGreen : styles.dotRed,
                            ]}
                        />
                        <Text
                            style={
                                item.paid
                                    ? styles.statusTextPaid
                                    : styles.statusTextUnpaid
                            }
                        >
                            {item.paid ? "Soldée" : "Non soldée"}
                        </Text>
                    </View>
                </View>
                {item.description ? (
                    <Text style={styles.desc} numberOfLines={2}>
                        {String(item.description).replaceAll("<br/>", " · ")}
                    </Text>
                ) : null}
					<View style={styles.row}>
					<Text style={styles.tag}>Qté: {qty}</Text>
					<Text style={styles.tag}>P.U. TTC (service): {unitService != null ? unitService.toFixed(2) : "—"} €</Text>
					<Text style={[styles.tag, styles.tagStrong]}>Total: {total.toFixed(2)} €</Text>
					</View>

					
					{storageCost > 0 && (
					<View style={[styles.row, { marginTop: 6 }]}>
						<Text style={styles.tag}>Support: {supportLabel}</Text>
						<Text style={styles.tag}>Prix: {storageCost.toFixed(2)} €</Text>
					</View>
					)}

					
					{!!clientSupportLabel && (
					<View style={[styles.row, { marginTop: 6 }]}>
						<Text style={styles.tag}>{clientSupportLabel}</Text>
					</View>
					)}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: "#0d6efd" }]}
                        onPress={() => goToInvoice(item)}
                    >
                        <Text style={styles.btnText}>🧾 Facturer</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: "#6c757d" }]}
                        onPress={() => goToEdit(item)}
                    >
                        <Text style={styles.btnText}>✏️ Modifier</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: "#dc3545" }]}
                        onPress={() => handleDelete(item)}
                    >
                        <Text style={styles.btnText}>🗑️ Supprimer</Text>
                    </TouchableOpacity>
                </View>
                <View style={[styles.actions, { marginTop: 8 }]}>
                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: "#fd7e14" }]}
                        onPress={() => handleNotify(item)}
                    >
                        <Text style={styles.btnText}>🔔 Notifier</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={{ flex: 1 }}>
            
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Interventions express</Text>
                <TouchableOpacity onPress={fetchRows} style={styles.refreshBtn}>
                    <Text style={styles.refreshText}>↻</Text>
                </TouchableOpacity>
            </View>

          
            <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Rechercher (nom, téléphone, description)"
                    style={styles.search}
                />
            </View>

          
            {loading ? (
                <View
                    style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <ActivityIndicator size="large" />
                </View>
            ) : (
                <>
                    <FlatList
                        data={pageData}
                        keyExtractor={(it) => String(it.id)}
                        renderItem={renderItem}
                        contentContainerStyle={{
                            padding: 16,
                            paddingBottom: 24,
                        }}
                        ListEmptyComponent={
                            <Text
                                style={{
                                    textAlign: "center",
                                    color: "#666",
                                    marginTop: 40,
                                }}
                            >
                                Aucun enregistrement.
                            </Text>
                        }
                    />

                   
                    <View style={styles.pager}>
                        <TouchableOpacity
                            style={[
                                styles.pagerBtn,
                                page <= 1 && styles.pagerBtnDisabled,
                            ]}
                            disabled={page <= 1}
                            onPress={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            <Text style={styles.pagerBtnText}>◀ Précédent</Text>
                        </TouchableOpacity>

                        <Text style={styles.pagerInfo}>
                            Page {page} / {totalPages}
                        </Text>

                        <TouchableOpacity
                            style={[
                                styles.pagerBtn,
                                page >= totalPages && styles.pagerBtnDisabled,
                            ]}
                            disabled={page >= totalPages}
                            onPress={() =>
                                setPage((p) => Math.min(totalPages, p + 1))
                            }
                        >
                            <Text style={styles.pagerBtnText}>Suivant ▶</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
};

// ================= Styles =================
const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
        flexDirection: "row",
        alignItems: "center",
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "bold",
        flex: 1,
        textAlign: "center",
    },
    refreshBtn: {
        position: "absolute",
        right: 12,
        top: 10,
        backgroundColor: "#e9ecef",
        borderRadius: 16,
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    refreshText: { fontSize: 18, fontWeight: "bold" },

    search: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        borderRadius: 8,
        backgroundColor: "#fff",
    },

    card: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
    },
    titleLine: { fontWeight: "bold", fontSize: 16 },
    subLine: { color: "#666", marginTop: 2 },
    desc: { marginTop: 8, color: "#333" },

    row: { flexDirection: "row", gap: 10, marginTop: 8, flexWrap: "wrap" },
    tag: {
        backgroundColor: "#f8f9fa",
        borderColor: "#e9ecef",
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        fontSize: 12,
    },
    tagStrong: { fontWeight: "700" },

    actions: { flexDirection: "row", gap: 10, marginTop: 12 },
    btn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: "center",
    },
    btnText: { color: "#fff", fontWeight: "bold" },

    // Pagination
    pager: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    pagerBtn: {
        backgroundColor: "#0d6efd",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    pagerBtnDisabled: {
        backgroundColor: "#c7d7ff",
    },
    pagerBtnText: {
        color: "#fff",
        fontWeight: "bold",
    },
    pagerInfo: {
        minWidth: 100,
        textAlign: "center",
        fontWeight: "600",
        color: "#333",
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 6,
    },

    statusPill: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 999,
        borderWidth: 1,
    },

    statusPaid: {
        backgroundColor: "#eaf7ea",
        borderColor: "#28a745",
    },
    statusUnpaid: {
        backgroundColor: "#fdeaea",
        borderColor: "#dc3545",
    },

    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    dotGreen: { backgroundColor: "#28a745" },
    dotRed: { backgroundColor: "#dc3545" },

    statusTextPaid: {
        color: "#1f7a34",
        fontWeight: "700",
        fontSize: 12,
        textTransform: "uppercase",
    },
    statusTextUnpaid: {
        color: "#a12626",
        fontWeight: "700",
        fontSize: 12,
        textTransform: "uppercase",
    },
});

export default ExpressListPage;
