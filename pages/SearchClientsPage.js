import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ScrollView,
    Image,
    Modal,
    ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../supabaseClient";
import { Picker } from "@react-native-picker/picker";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";

let debounceTimeout = null;
const ITEMS_PER_PAGE = 2; // Nombre de fiches par page

const STATUS_COLORS = {
    "Réparé": { bg: "#dcfce7", text: "#15803d" },
    "Non réparable": { bg: "#fee2e2", text: "#dc2626" },
    "Intervention en cours": { bg: "#dbeafe", text: "#1d4ed8" },
    "En attente de pièces": { bg: "#fef3c7", text: "#b45309" },
    "Devis en cours": { bg: "#ede9fe", text: "#6d28d9" },
    "Devis accepté": { bg: "#e0f2fe", text: "#0369a1" },
};
const getStatusColors = (status) =>
    STATUS_COLORS[status] || { bg: "#e2e8f0", text: "#334155" };

const SearchClientsPage = ({ navigation }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [clients, setClients] = useState([]);
    const [paginatedClients, setPaginatedClients] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState("");
    const [alertMessage, setAlertMessage] = useState("");

    const showAlert = (title, message) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertVisible(true);
    };
    const [totalPages, setTotalPages] = useState(1);

    // --- Statuts
    const [selectedStatus, setSelectedStatus] = useState(null);
    const [statusOptions, setStatusOptions] = useState([]);
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);

    // --- Types d'appareils
    const [selectedDeviceType, setSelectedDeviceType] = useState("");
    const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
    const [deviceTypes, setDeviceTypes] = useState([]);

    // --- Marques
    const [brands, setBrands] = useState([]);
    const [selectedBrand, setSelectedBrand] = useState("");
    const [showBrandDropdown, setShowBrandDropdown] = useState(false);

    // --- Composant / référence produit
    const [componentSearch, setComponentSearch] = useState("");
    const [productRefSearch, setProductRefSearch] = useState("");
    const [componentPool, setComponentPool] = useState([]);
    const [productRefPool, setProductRefPool] = useState([]);
    const [componentSuggestions, setComponentSuggestions] = useState([]);
    const [showComponentSuggestions, setShowComponentSuggestions] = useState(false);
    const [productRefSuggestions, setProductRefSuggestions] = useState([]);
    const [showProductRefSuggestions, setShowProductRefSuggestions] = useState(false);

    const [loading, setLoading] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [selectedImageUri, setSelectedImageUri] = useState(null);

    // 🔄 Charger les types d'appareils depuis la BDD
    useEffect(() => {
        const fetchDeviceTypes = async () => {
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select("deviceType")
                    .neq("deviceType", null);

                if (error) {
                    console.error("❌ Erreur lors du chargement des types d'appareils :", error);
                    showAlert("Erreur", "Impossible de charger les types d'appareils.");
                    return;
                }

                const uniqueDeviceTypes = [...new Set(data.map((item) => item.deviceType))]
                    .filter(Boolean)
                    .sort();
                setDeviceTypes(uniqueDeviceTypes);
            } catch (error) {
                console.error("❌ Erreur inattendue :", error);
            }
        };

        fetchDeviceTypes();
    }, []);

    // 🔄 Charger les statuts
    useEffect(() => {
        const fetchStatuses = async () => {
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select("status")
                    .neq("status", null)
                    .neq("status", "");

                if (error) {
                    console.error("Erreur lors du chargement des statuts :", error);
                    return;
                }

                const uniqueStatuses = Array.from(new Set(data.map((item) => item.status))).filter(Boolean);
                setStatusOptions(uniqueStatuses);
            } catch (error) {
                console.error("Erreur inattendue :", error);
            }
        };

        fetchStatuses();
    }, []);

    // 🔄 Charger les marques (depuis interventions.brand)
    useEffect(() => {
        const fetchBrands = async () => {
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select("brand")
                    .neq("brand", null)
                    .neq("brand", "");

                if (error) {
                    console.error("❌ Erreur lors du chargement des marques :", error);
                    showAlert("Erreur", "Impossible de charger les marques.");
                    return;
                }

                const uniqueBrands = [...new Set(data.map((it) => String(it.brand).trim()))]
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
                setBrands(uniqueBrands);
            } catch (e) {
                console.error("❌ Erreur inattendue (marques) :", e);
            }
        };
        fetchBrands();
    }, []);

    // 🔄 Charger le pool de composants et de références produit (pour les suggestions)
    useEffect(() => {
        const fetchComponentAndReferencePools = async () => {
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select("reference, repair_components")
                    .order("updatedAt", { ascending: false })
                    .limit(1000);

                if (error) {
                    console.error("❌ Erreur lors du chargement des pools composants/références :", error);
                    return;
                }

                const refSet = new Set();
                const refs = [];
                const compSet = new Set();
                const comps = [];

                (data || []).forEach((row) => {
                    const ref = String(row.reference || "").trim();
                    if (ref && !refSet.has(ref.toLowerCase())) {
                        refSet.add(ref.toLowerCase());
                        refs.push(ref);
                    }

                    (Array.isArray(row.repair_components) ? row.repair_components : []).forEach(
                        (c) => {
                            const value = String(c || "").trim();
                            if (value && !compSet.has(value.toLowerCase())) {
                                compSet.add(value.toLowerCase());
                                comps.push(value);
                            }
                        }
                    );
                });

                setProductRefPool(refs);
                setComponentPool(comps);
            } catch (e) {
                console.error("❌ Erreur inattendue (pools composants/références) :", e);
            }
        };
        fetchComponentAndReferencePools();
    }, []);

    // Déclenchement de la recherche texte (nom/téléphone/fiche), si aucun statut sélectionné
    useEffect(() => {
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }

        debounceTimeout = setTimeout(() => {
            if (!selectedStatus && searchTerm.trim()) {
                searchClients();
            }
        }, 500);

        return () => clearTimeout(debounceTimeout);
    }, [searchTerm]);

    // Pagination
    useEffect(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        setPaginatedClients(clients.slice(startIndex, endIndex));
        setTotalPages(Math.ceil(clients.length / ITEMS_PER_PAGE));
    }, [clients, currentPage]);

    // 🔎 Recherche texte (nom / téléphone / n° fiche)
    const searchClients = async () => {
        if (!searchTerm.trim() && !selectedStatus) {
            setClients([]);
            return;
        }

        try {
            let query = supabase
                .from("clients")
                .select(
                    `*, interventions!inner(id, status, description, "deviceType", brand, model, cost, paymentStatus, solderestant, createdAt, updatedAt, commande, label_photo)`
                )
                .order("name", { ascending: true });

            if (searchTerm.trim()) {
                const isNumber = /^\d+$/.test(searchTerm);
                query = isNumber
                    ? query.or(`ficheNumber.eq.${searchTerm},phone.ilike.%${searchTerm}%`)
                    : query.or(`name.ilike.%${searchTerm}%`);
            }

            const { data, error } = await query;

            if (error) {
                console.error("Erreur lors de la recherche :", error);
                showAlert("Erreur", "Impossible de récupérer les résultats.");
            } else {
                setClients(data || []);
                setCurrentPage(1);
            }
        } catch (error) {
            console.error("Erreur inattendue :", error);
        }
    };

    // 🔎 Recherche par statut
    const searchByStatus = async (status) => {
        if (!status) {
            setClients([]);
            return;
        }

        try {
            const { data, error } = await supabase
                .from("clients")
                .select(
                    `*, interventions!inner(id, status, description, "deviceType", brand, model, cost, paymentStatus, solderestant, createdAt, updatedAt, commande, label_photo)`
                )
                .eq("interventions.status", status)
                .order("name", { ascending: true });

            if (error) {
                console.error("Erreur lors de la recherche par statut :", error);
                showAlert("Erreur", "Impossible de récupérer les résultats.");
            } else {
                setClients(data || []);
                setCurrentPage(1);
            }
        } catch (error) {
            console.error("Erreur inattendue :", error);
        }
    };

    // 🔎 Recherche par type d'appareil
    const searchByDeviceType = async (deviceType) => {
        if (!deviceType) {
            setClients([]);
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("clients")
                .select(
                    `
                    *,
                    interventions!inner(id, deviceType, status, description, brand, model, cost, paymentStatus, solderestant, createdAt, updatedAt, commande, label_photo)
                `
                )
                .eq("interventions.deviceType", deviceType)
                .order("name", { ascending: true });

            if (error) {
                console.error("❌ Erreur lors de la recherche par produit :", error);
                showAlert("Erreur", "Impossible de récupérer les résultats.");
            } else {
                setClients(data || []);
                setCurrentPage(1);
            }
        } catch (error) {
            console.error("❌ Erreur inattendue :", error);
        } finally {
            setLoading(false);
        }
    };

    // 🔎 Recherche par marque
    const searchByBrand = async (brand) => {
        if (!brand) {
            setClients([]);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("clients")
                .select(
                    `
                    *,
                    interventions!inner(id, deviceType, status, description, brand, model, cost, paymentStatus, solderestant, createdAt, updatedAt, commande, label_photo)
                `
                )
                .eq("interventions.brand", brand)
                .order("name", { ascending: true });

            if (error) {
                console.error("❌ Erreur lors de la recherche par marque :", error);
                showAlert("Erreur", "Impossible de récupérer les résultats.");
            } else {
                setClients(data || []);
                setCurrentPage(1);
            }
        } catch (e) {
            console.error("❌ Erreur inattendue (marque) :", e);
        } finally {
            setLoading(false);
        }
    };

    // 🔎 Suggestions pendant la saisie
    const onComponentSearchChange = (text) => {
        setComponentSearch(text);
        const query = text.trim().toLowerCase();
        if (!query) {
            setComponentSuggestions([]);
            setShowComponentSuggestions(false);
            return;
        }
        const matches = componentPool
            .filter((c) => c.toLowerCase().includes(query))
            .slice(0, 8);
        setComponentSuggestions(matches);
        setShowComponentSuggestions(matches.length > 0);
    };

    const onProductRefSearchChange = (text) => {
        setProductRefSearch(text);
        const query = text.trim().toLowerCase();
        if (!query) {
            setProductRefSuggestions([]);
            setShowProductRefSuggestions(false);
            return;
        }
        const matches = productRefPool
            .filter((r) => r.toLowerCase().includes(query))
            .slice(0, 8);
        setProductRefSuggestions(matches);
        setShowProductRefSuggestions(matches.length > 0);
    };

    // 🔎 Recherche par composant utilisé et/ou référence produit
    const searchByComponentOrReference = async (overrides = {}) => {
        const compQuery = (overrides.component ?? componentSearch).trim().toLowerCase();
        const refQuery = (overrides.productRef ?? productRefSearch).trim();

        if (!compQuery && !refQuery) {
            setClients([]);
            return;
        }

        setLoading(true);
        try {
            let query = supabase
                .from("clients")
                .select(
                    `*, interventions!inner(id, status, description, "deviceType", brand, model, cost, paymentStatus, solderestant, createdAt, updatedAt, commande, label_photo, reference, repair_components)`
                )
                .order("name", { ascending: true });

            if (refQuery) {
                query = query.ilike("interventions.reference", `%${refQuery}%`);
            }
            if (compQuery) {
                query = query.not("interventions.repair_components", "is", null);
            }

            const { data, error } = await query;

            if (error) {
                console.error("❌ Erreur lors de la recherche par composant/référence :", error);
                showAlert("Erreur", "Impossible de récupérer les résultats.");
                return;
            }

            let rows = data || [];

            if (compQuery) {
                rows = rows
                    .map((client) => ({
                        ...client,
                        interventions: (client.interventions || []).filter(
                            (iv) =>
                                Array.isArray(iv.repair_components) &&
                                iv.repair_components.some((ref) =>
                                    String(ref).toLowerCase().includes(compQuery)
                                )
                        ),
                    }))
                    .filter((client) => client.interventions.length > 0);
            }

            setClients(rows);
            setCurrentPage(1);
        } catch (error) {
            console.error("❌ Erreur inattendue (composant/référence) :", error);
        } finally {
            setLoading(false);
        }
    };

    // ♻️ Réinitialiser tous les filtres
    const resetFilters = () => {
        setSearchTerm("");
        setSelectedStatus(null);
        setSelectedDeviceType("");
        setSelectedBrand("");
        setComponentSearch("");
        setProductRefSearch("");
        setComponentSuggestions([]);
        setShowComponentSuggestions(false);
        setProductRefSuggestions([]);
        setShowProductRefSuggestions(false);
        setClients([]);
        setCurrentPage(1);
    };

    const goToNextPage = () => {
        if (currentPage < totalPages) setCurrentPage((p) => p + 1);
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) setCurrentPage((p) => p - 1);
    };

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentInner}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Recherche clients / interventions</Text>
                </View>

                {/* ───── Filtres principaux ───── */}
                <View style={styles.card}>
                    <Text style={styles.sectionLabel}>Nom, téléphone ou n° de fiche</Text>
                    <View style={styles.searchWrap}>
                        <Ionicons name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
                        <TextInput
                            style={styles.search}
                            placeholder="Rechercher..."
                            placeholderTextColor="#94a3b8"
                            value={searchTerm}
                            onChangeText={(text) => {
                                setSelectedStatus(null);
                                setSearchTerm(text);
                            }}
                        />
                    </View>

                    <Text style={styles.sectionLabel}>Statut</Text>
                    <TouchableOpacity
                        style={styles.dropdownButton}
                        onPress={() => setShowStatusDropdown((prev) => !prev)}
                        activeOpacity={0.85}
                    >
                        <Text
                            style={[
                                styles.dropdownButtonText,
                                !selectedStatus && styles.placeholderText,
                            ]}
                        >
                            {selectedStatus || "Tous les statuts"}
                        </Text>
                        <Ionicons
                            name={showStatusDropdown ? "chevron-up" : "chevron-down"}
                            size={18}
                            color="#64748b"
                        />
                    </TouchableOpacity>

                    {showStatusDropdown && (
                        <ScrollView style={styles.dropdown} nestedScrollEnabled>
                            {statusOptions.map((status, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.dropdownItemStatus}
                                    onPress={() => {
                                        setSearchTerm("");
                                        setSelectedStatus(status);
                                        setShowStatusDropdown(false);
                                        searchByStatus(status);
                                    }}
                                >
                                    <Text style={styles.dropdownItemText}>{status}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    <Text style={styles.sectionLabel}>Type d'appareil</Text>
                    <TouchableOpacity
                        style={styles.dropdownButton}
                        onPress={() => setShowDeviceDropdown((prev) => !prev)}
                        activeOpacity={0.85}
                    >
                        <Text
                            style={[
                                styles.dropdownButtonText,
                                !selectedDeviceType && styles.placeholderText,
                            ]}
                        >
                            {selectedDeviceType || "Tous les types"}
                        </Text>
                        <Ionicons
                            name={showDeviceDropdown ? "chevron-up" : "chevron-down"}
                            size={18}
                            color="#64748b"
                        />
                    </TouchableOpacity>

                    {showDeviceDropdown && (
                        <View style={styles.dropdownPanel}>
                            <FlatList
                                data={deviceTypes}
                                keyExtractor={(item, idx) => `${item}-${idx}`}
                                numColumns={2}
                                keyboardShouldPersistTaps="handled"
                                nestedScrollEnabled
                                columnWrapperStyle={styles.chipRow}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.chip}
                                        onPress={() => {
                                            setSelectedDeviceType(item);
                                            setShowDeviceDropdown(false);
                                            searchByDeviceType(item);
                                        }}
                                    >
                                        <Text style={styles.chipText}>{item}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    )}

                    <Text style={styles.sectionLabel}>Marque</Text>
                    <TouchableOpacity
                        style={styles.dropdownButton}
                        onPress={() => setShowBrandDropdown((prev) => !prev)}
                        activeOpacity={0.85}
                    >
                        <Text
                            style={[
                                styles.dropdownButtonText,
                                !selectedBrand && styles.placeholderText,
                            ]}
                        >
                            {selectedBrand || "Toutes les marques"}
                        </Text>
                        <Ionicons
                            name={showBrandDropdown ? "chevron-up" : "chevron-down"}
                            size={18}
                            color="#64748b"
                        />
                    </TouchableOpacity>

                    {showBrandDropdown && (
                        <View style={styles.dropdownPanel}>
                            <FlatList
                                data={brands}
                                keyExtractor={(item, idx) => `${item}-${idx}`}
                                numColumns={2}
                                keyboardShouldPersistTaps="handled"
                                nestedScrollEnabled
                                columnWrapperStyle={styles.chipRow}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.chip}
                                        onPress={() => {
                                            setSelectedBrand(item);
                                            setShowBrandDropdown(false);
                                            searchByBrand(item);
                                        }}
                                    >
                                        <Text style={styles.chipText}>{item}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    )}
                </View>

                {/* ───── Composant / référence produit ───── */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Composant / référence produit</Text>
                    <Text style={styles.cardHint}>
                        Vérifier si un composant a déjà été utilisé, notamment sur un même produit.
                    </Text>

                    <View style={styles.searchWrap}>
                        <Ionicons
                            name="hardware-chip-outline"
                            size={18}
                            color="#94a3b8"
                            style={styles.searchIcon}
                        />
                        <TextInput
                            style={styles.search}
                            placeholder="Composant utilisé (ex : SSD Kingston A400...)"
                            placeholderTextColor="#94a3b8"
                            value={componentSearch}
                            onChangeText={onComponentSearchChange}
                            onFocus={() =>
                                setShowComponentSuggestions(componentSuggestions.length > 0)
                            }
                        />
                    </View>

                    {showComponentSuggestions && (
                        <View style={styles.suggestBox}>
                            {componentSuggestions.map((suggestion, idx) => (
                                <TouchableOpacity
                                    key={`${suggestion}-${idx}`}
                                    onPress={() => {
                                        setComponentSearch(suggestion);
                                        setShowComponentSuggestions(false);
                                        searchByComponentOrReference({ component: suggestion });
                                    }}
                                >
                                    <Text style={styles.suggestItem}>{suggestion}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <View style={[styles.searchWrap, { marginTop: 10 }]}>
                        <Ionicons
                            name="barcode-outline"
                            size={18}
                            color="#94a3b8"
                            style={styles.searchIcon}
                        />
                        <TextInput
                            style={styles.search}
                            placeholder="Référence produit"
                            placeholderTextColor="#94a3b8"
                            value={productRefSearch}
                            onChangeText={onProductRefSearchChange}
                            onFocus={() =>
                                setShowProductRefSuggestions(productRefSuggestions.length > 0)
                            }
                        />
                    </View>

                    {showProductRefSuggestions && (
                        <View style={styles.suggestBox}>
                            {productRefSuggestions.map((suggestion, idx) => (
                                <TouchableOpacity
                                    key={`${suggestion}-${idx}`}
                                    onPress={() => {
                                        setProductRefSearch(suggestion);
                                        setShowProductRefSuggestions(false);
                                        searchByComponentOrReference({ productRef: suggestion });
                                    }}
                                >
                                    <Text style={styles.suggestItem}>{suggestion}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => searchByComponentOrReference()}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="search" size={16} color="#fff" />
                        <Text style={styles.primaryButtonText}>Rechercher</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.resetButton}
                    onPress={resetFilters}
                    activeOpacity={0.85}
                >
                    <Ionicons name="refresh" size={16} color="#dc2626" />
                    <Text style={styles.resetButtonText}>Réinitialiser les filtres</Text>
                </TouchableOpacity>

                {loading && (
                    <View style={{ paddingVertical: 12 }}>
                        <ActivityIndicator size="small" color="#4338ca" />
                    </View>
                )}

                {/* ───── Résultats ───── */}
                {clients.length === 0 ? (
                    <Text style={styles.noResult}>Aucun résultat pour l'instant.</Text>
                ) : (
                    paginatedClients.map((item) => (
                        <View key={item.id} style={styles.clientCard}>
                            <View style={styles.row}>
                                <View style={styles.clientDetails}>
                                    <View style={styles.ficheBadge}>
                                        <Text style={styles.ficheBadgeText}>
                                            N° {item.ficheNumber}
                                        </Text>
                                    </View>
                                    <Text style={styles.clientName}>{item.name}</Text>
                                    <Text style={styles.clientPhone}>{item.phone}</Text>
                                </View>

                                {item.interventions?.[0]?.label_photo && (
                                    <TouchableOpacity
                                        onPress={() => {
                                            const imageUri = item.interventions[0].label_photo.startsWith("http")
                                                ? item.interventions[0].label_photo
                                                : `data:image/png;base64,${item.interventions[0].label_photo}`;
                                            setSelectedImageUri(imageUri);
                                            setModalVisible(true);
                                        }}
                                    >
                                        <Image
                                            source={{
                                                uri: item.interventions[0].label_photo.startsWith("http")
                                                    ? item.interventions[0].label_photo
                                                    : `data:image/png;base64,${item.interventions[0].label_photo}`,
                                            }}
                                            style={styles.labelPhoto}
                                        />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {item.interventions?.map((intervention, index) => {
                                const statusColors = getStatusColors(intervention.status);
                                return (
                                    <View key={index} style={styles.interventionCard}>
                                        <View style={styles.interventionHeader}>
                                            <Text style={styles.interventionTitle}>
                                                Intervention {index + 1}
                                            </Text>
                                            <View
                                                style={[
                                                    styles.statusPill,
                                                    { backgroundColor: statusColors.bg },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.statusPillText,
                                                        { color: statusColors.text },
                                                    ]}
                                                >
                                                    {intervention.status || "Non renseigné"}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.infoRow}>
                                            <Ionicons name="hardware-chip-outline" size={14} color="#64748b" />
                                            <Text style={styles.infoText}>
                                                {intervention.deviceType || "N/A"} -{" "}
                                                {intervention.brand || "N/A"} {intervention.model || "N/A"}
                                            </Text>
                                        </View>

                                        <View style={styles.infoRow}>
                                            <Ionicons name="document-text-outline" size={14} color="#64748b" />
                                            <Text style={styles.infoText}>
                                                {intervention.description || "N/A"}
                                            </Text>
                                        </View>

                                        <View style={styles.infoRow}>
                                            <Ionicons name="barcode-outline" size={14} color="#64748b" />
                                            <Text style={styles.infoText}>
                                                Référence produit : {intervention.reference || "N/A"}
                                            </Text>
                                        </View>

                                        {Array.isArray(intervention.repair_components) &&
                                            intervention.repair_components.length > 0 && (
                                                <View style={styles.componentChipsRow}>
                                                    {intervention.repair_components.map((ref, i) => (
                                                        <View key={`${ref}-${i}`} style={styles.componentChip}>
                                                            <Text style={styles.componentChipText} numberOfLines={1}>
                                                                {ref}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}

                                        <View style={styles.divider} />

                                        <View style={styles.factsGrid}>
                                            <View style={styles.factCell}>
                                                <Text style={styles.factLabel}>Commande</Text>
                                                <Text style={styles.factValue}>
                                                    {intervention.commande || "Non renseigné"}
                                                </Text>
                                            </View>
                                            <View style={styles.factCell}>
                                                <Text style={styles.factLabel}>Coût</Text>
                                                <Text style={styles.factValue}>
                                                    {intervention.cost
                                                        ? `${intervention.cost.toFixed(2)} €`
                                                        : "Non spécifié"}
                                                </Text>
                                            </View>
                                            <View style={styles.factCell}>
                                                <Text style={styles.factLabel}>Paiement</Text>
                                                <Text style={styles.factValue}>
                                                    {intervention.paymentStatus || "Non précisé"}
                                                </Text>
                                            </View>
                                            <View style={styles.factCell}>
                                                <Text style={styles.factLabel}>Solde restant dû</Text>
                                                <Text style={styles.factValue}>
                                                    {intervention.solderestant
                                                        ? `${intervention.solderestant.toFixed(2)} €`
                                                        : "0,00 €"}
                                                </Text>
                                            </View>
                                            <View style={styles.factCell}>
                                                <Text style={styles.factLabel}>Créée le</Text>
                                                <Text style={styles.factValue}>
                                                    {intervention.createdAt
                                                        ? new Date(intervention.createdAt).toLocaleDateString("fr-FR")
                                                        : "Date inconnue"}
                                                </Text>
                                            </View>
                                            <View style={styles.factCell}>
                                                <Text style={styles.factLabel}>Dernière mise à jour</Text>
                                                <Text style={styles.factValue}>
                                                    {intervention.updatedAt
                                                        ? new Date(intervention.updatedAt).toLocaleDateString("fr-FR")
                                                        : "Non mise à jour"}
                                                </Text>
                                            </View>
                                            <View style={styles.factCell}>
                                                <Text style={styles.factLabel}>Date de récupération</Text>
                                                <Text style={styles.factValue}>
                                                    {intervention.updatedAt
                                                        ? new Date(intervention.updatedAt).toLocaleDateString("fr-FR")
                                                        : "Non renseignée"}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    ))
                )}

                {clients.length > ITEMS_PER_PAGE && (
                    <View style={styles.pager}>
                        <TouchableOpacity
                            style={[styles.pagerBtn, currentPage === 1 && styles.pagerBtnDisabled]}
                            onPress={goToPreviousPage}
                            disabled={currentPage === 1}
                        >
                            <Image
                                source={require("../assets/icons/chevrong.png")}
                                style={[
                                    styles.pagerIcon,
                                    { tintColor: currentPage === 1 ? "#cbd5e1" : "#4338ca" },
                                ]}
                            />
                        </TouchableOpacity>
                        <Text style={styles.pagerInfo}>
                            Page {currentPage} sur {totalPages}
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.pagerBtn,
                                currentPage === totalPages && styles.pagerBtnDisabled,
                            ]}
                            onPress={goToNextPage}
                            disabled={currentPage === totalPages}
                        >
                            <Image
                                source={require("../assets/icons/chevrond.png")}
                                style={[
                                    styles.pagerIcon,
                                    {
                                        tintColor:
                                            currentPage === totalPages ? "#cbd5e1" : "#4338ca",
                                    },
                                ]}
                            />
                        </TouchableOpacity>
                    </View>
                )}

                <BackButton onPress={() => navigation.goBack()} style={{ alignSelf: "center", marginTop: 8 }} />
            </ScrollView>

            {modalVisible && (
                <Modal transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
                    <View style={styles.modalContainer}>
                        <TouchableOpacity
                            style={styles.modalCloseArea}
                            onPress={() => setModalVisible(false)}
                        />
                        <Image
                            source={{ uri: selectedImageUri }}
                            style={styles.fullscreenImage}
                            resizeMode="contain"
                        />
                        <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
                            <Text style={styles.closeText}>✖</Text>
                        </TouchableOpacity>
                    </View>
                </Modal>
            )}

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
    container: { flex: 1, backgroundColor: "#f8fafc" },
    content: { flex: 1 },
    contentInner: { padding: 16, paddingBottom: 40 },

    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
    },
    headerTitle: {
        flex: 1,
        fontSize: 20,
        fontWeight: "800",
        color: "#0f172a",
    },

    card: {
        backgroundColor: "#ffffff",
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: "#0f172a",
        marginBottom: 4,
    },
    cardHint: {
        fontSize: 12,
        color: "#94a3b8",
        marginBottom: 12,
    },

    sectionLabel: {
        fontSize: 12,
        fontWeight: "700",
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        marginBottom: 6,
        marginTop: 12,
    },

    searchWrap: {
        position: "relative",
        justifyContent: "center",
    },
    searchIcon: {
        position: "absolute",
        left: 14,
        zIndex: 1,
    },
    search: {
        backgroundColor: "#f8fafc",
        paddingHorizontal: 40,
        paddingVertical: 11,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e2e8f0",
        fontSize: 15,
        color: "#0f172a",
    },
    suggestBox: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        borderRadius: 10,
        marginTop: 6,
        overflow: "hidden",
    },
    suggestItem: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9",
        fontSize: 14,
        color: "#334155",
    },

    dropdownButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#f8fafc",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: "#e2e8f0",
        borderRadius: 12,
    },
    dropdownButtonText: {
        fontSize: 15,
        color: "#0f172a",
        fontWeight: "600",
    },
    placeholderText: {
        color: "#94a3b8",
        fontWeight: "400",
    },
    dropdown: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        borderRadius: 12,
        maxHeight: 250,
        marginTop: 8,
    },
    dropdownItemStatus: {
        width: "100%",
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9",
    },
    dropdownItemText: {
        fontSize: 14,
        color: "#334155",
    },
    dropdownPanel: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        borderRadius: 12,
        padding: 8,
        marginTop: 8,
        maxHeight: 350,
        zIndex: 10,
        elevation: 2,
    },
    chipRow: {
        justifyContent: "space-between",
    },
    chip: {
        width: "48%",
        paddingVertical: 10,
        paddingHorizontal: 10,
        backgroundColor: "#eef2ff",
        borderRadius: 10,
        marginBottom: 8,
        alignItems: "center",
    },
    chipText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#4338ca",
        textAlign: "center",
    },

    primaryButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: "#4338ca",
        borderRadius: 12,
        paddingVertical: 13,
        marginTop: 14,
    },
    primaryButtonText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 15,
    },

    resetButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: "#fef2f2",
        borderWidth: 1,
        borderColor: "#fecaca",
        borderRadius: 12,
        paddingVertical: 12,
        marginBottom: 16,
    },
    resetButtonText: {
        color: "#dc2626",
        fontSize: 14,
        fontWeight: "700",
    },

    noResult: {
        textAlign: "center",
        marginTop: 10,
        marginBottom: 20,
        fontSize: 14,
        color: "#94a3b8",
    },

    clientCard: {
        backgroundColor: "#ffffff",
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    clientDetails: {
        flex: 1,
    },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
    },
    ficheBadge: {
        alignSelf: "flex-start",
        backgroundColor: "#eef2ff",
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 10,
        marginBottom: 6,
    },
    ficheBadgeText: {
        color: "#4338ca",
        fontWeight: "700",
        fontSize: 12,
    },
    clientName: {
        fontSize: 17,
        fontWeight: "800",
        color: "#0f172a",
    },
    clientPhone: {
        fontSize: 13,
        color: "#64748b",
        marginTop: 2,
    },
    labelPhoto: {
        width: 64,
        height: 64,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e2e8f0",
    },

    interventionCard: {
        backgroundColor: "#f8fafc",
        padding: 12,
        marginTop: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e2e8f0",
    },
    interventionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    interventionTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: "#334155",
    },
    statusPill: {
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 10,
    },
    statusPillText: {
        fontSize: 11,
        fontWeight: "700",
    },
    infoRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 6,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: "#334155",
    },
    componentChipsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 2,
        marginBottom: 6,
    },
    componentChip: {
        backgroundColor: "#e2e8f0",
        borderRadius: 14,
        paddingVertical: 4,
        paddingHorizontal: 10,
        maxWidth: "100%",
    },
    componentChipText: {
        fontSize: 12,
        color: "#1e293b",
        fontWeight: "600",
    },
    divider: {
        height: 1,
        backgroundColor: "#e2e8f0",
        marginVertical: 8,
    },
    factsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    factCell: {
        width: "47%",
    },
    factLabel: {
        fontSize: 10,
        color: "#94a3b8",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.3,
        marginBottom: 2,
    },
    factValue: {
        fontSize: 13,
        color: "#0f172a",
        fontWeight: "600",
    },

    pager: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        marginTop: 6,
        marginBottom: 10,
    },
    pagerBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#eef2ff",
        borderWidth: 1,
        borderColor: "#c7d2fe",
    },
    pagerBtnDisabled: {
        backgroundColor: "#f3f4f6",
        borderColor: "#e5e7eb",
    },
    pagerIcon: {
        width: 18,
        height: 18,
    },
    pagerInfo: {
        fontSize: 14,
        fontWeight: "700",
        color: "#374151",
    },

    modalContainer: {
        flex: 1,
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        justifyContent: "center",
        alignItems: "center",
    },
    fullscreenImage: {
        width: "90%",
        height: "80%",
        borderRadius: 16,
    },
    closeButton: {
        position: "absolute",
        top: 48,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(255, 255, 255, 0.15)",
        justifyContent: "center",
        alignItems: "center",
    },
    closeText: {
        fontSize: 18,
        fontWeight: "700",
        color: "#fff",
    },
    modalCloseArea: {
        position: "absolute",
        width: "100%",
        height: "100%",
    },
});

export default SearchClientsPage;
