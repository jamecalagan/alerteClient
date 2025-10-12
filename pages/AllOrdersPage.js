import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Modal,
  ScrollView,
  Dimensions,
} from "react-native";
import { supabase } from "../supabaseClient";

const ITEMS_PER_PAGE = 2;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const safeLower = (v) => (v ?? "").toString().toLowerCase();

const getClientName = (o) =>
  o?.clients?.name ?? o?.client?.name ?? o?.client_name ?? "Client";

const getClientFiche = (o) =>
  o?.clients?.ficheNumber ?? o?.client?.ficheNumber ?? o?.ficheNumber ?? "";

// ---- Helpers -------------------------------------------------
const toNumber = (v, def = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return isFinite(n) ? n : def;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const euro = (n) => `${round2(toNumber(n)).toFixed(2)} €`;
const computeTotals = ({ price, quantity, deposit }) => {
  const p = toNumber(price);
  const q = Math.max(1, Math.floor(toNumber(quantity, 1)));
  const d = toNumber(deposit);
  const total = round2(p * q);
  const totalToPay = Math.max(0, round2(total - d));
  return { total, totalToPay, p, q, d };
};

// ---- Helpers photos ------------------------------------------
const normalizeOrderPhotos = (order) => {
  let arr = [];
  const p = order?.order_photos;
  if (Array.isArray(p)) arr = p;
  else if (typeof p === "string") {
    try {
      const j = JSON.parse(p);
      if (Array.isArray(j)) arr = j;
      else if (j) arr = [j];
    } catch {
      if (p.trim()) arr = [p.trim()];
    }
  }
  if ((!arr || arr.length === 0) && order?.order_photo) {
    arr = [order.order_photo];
  }
  return (arr || []).filter(Boolean);
};

const resolveImageUrl = async (path) => {
  const { data: pub } = supabase.storage.from("images").getPublicUrl(path);
  if (pub?.publicUrl) return pub.publicUrl;

  const { data: signed, error } = await supabase
    .from("images")
    .storage.createSignedUrl(path, 60 * 60);
  if (error) {
    console.warn("⚠️ createSignedUrl error:", error);
    const { data: signed2, error: e2 } = await supabase.storage
      .from("images")
      .createSignedUrl(path, 60 * 60);
    if (e2) console.warn("⚠️ createSignedUrl (fallback) error:", e2);
    return signed2?.signedUrl || null;
  }
  return signed?.signedUrl || null;
};

export default function AllOrdersPage({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editedOrder, setEditedOrder] = useState({});
  const [filterStatus, setFilterStatus] = useState("all");
  const [suggestions, setSuggestions] = useState([]);
  const [focusedField, setFocusedField] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);

  // Cache URLs photos
  const [photoUrlCache, setPhotoUrlCache] = useState({}); // { path: url }

  // Viewer plein écran
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const getStatusIcon = (order) => {
    if (order.recovered && order.paid) return "🟢";
    if (order.received || order.paid) return "🟡";
    return "🔴";
  };
  const getStatusText = (order) => {
    if (order.recovered && order.paid) return "Terminée";
    if (order.received || order.paid) return "En cours";
    return "En attente";
  };

  useEffect(() => {
    fetchOrders();
  }, []);

const handleSearchChange = (text) => {
  setSearch(text);
  const lower = safeLower(text);

  const matches = orders.filter((order) =>
    safeLower(order.product).includes(lower) ||
    safeLower(order.brand).includes(lower) ||
    safeLower(order.model).includes(lower) ||
    safeLower(getClientName(order)).includes(lower) ||
    String(getClientFiche(order)).includes(lower)
  );

  setSuggestions(text.length > 0 ? matches.slice(0, 5) : []);
};


  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, clients(name, ficheNumber), billing(id)")
      .order("createdat", { ascending: false });

    if (error) {
      console.error("Erreur chargement commandes :", error);
      return;
    }

    const sorted = (data || []).sort((a, b) => {
      const priority = (order) => {
        const received = !!order.received;
        const paid = !!order.paid;
        const recovered = !!order.recovered;
        if (!received && !paid && !recovered) return 0;
        if ((received || paid) && !recovered) return 1;
        if (recovered) return 2;
        return 3;
      };
      return priority(a) - priority(b);
    });

    setOrders(sorted);
    setActiveCount((data || []).filter((o) => !o.deleted).length);
    setDeletedCount((data || []).filter((o) => o.deleted).length);

    // Pré-chargement des URLs photos
    try {
      const allPaths = new Set();
      (data || []).forEach((o) => {
        normalizeOrderPhotos(o).forEach((p) => allPaths.add(p));
      });
      const entries = [...allPaths].filter((p) => !photoUrlCache[p]);
      if (entries.length) {
        const pairs = await Promise.all(
          entries.map(async (p) => [p, await resolveImageUrl(p)])
        );
        const incremental = {};
        pairs.forEach(([p, url]) => {
          if (url) incremental[p] = url;
        });
        if (Object.keys(incremental).length) {
          setPhotoUrlCache((prev) => ({ ...prev, ...incremental }));
        }
      }
    } catch (e) {
      console.warn("Préchargement URLs photos:", e);
    }
  };

  const handleEditOrder = (item) => {
    setEditingOrderId(item.id);
    setEditedOrder({
      product: item.product,
      brand: item.brand,
      model: item.model,
      price: item.price?.toString() || "",      // Prix unitaire
      quantity: item.quantity?.toString() || "1",
      deposit: item.deposit?.toString() || "",
    });
  };

  const handleSaveEditedOrder = async (orderId) => {
    try {
      const price = toNumber(editedOrder.price);
      const qParsed = parseInt(editedOrder.quantity, 10);
const quantity = Math.max(1, isNaN(qParsed) ? 1 : qParsed);
      const deposit = toNumber(editedOrder.deposit);
      const total = round2(price * quantity);

      const { error: orderError } = await supabase
        .from("orders")
        .update({
          product: editedOrder.product,
          brand: editedOrder.brand,
          model: editedOrder.model,
          price,              // prix unitaire
          quantity,           // quantité
          total,              // total article (p*u)
          deposit: deposit,   // acompte
        })
        .eq("id", orderId);

      if (orderError) {
        console.error("❌ Erreur mise à jour commande:", orderError);
        alert("Erreur lors de la mise à jour de la commande.");
        return;
      }

      // Si facture liée : on aligne le total et l'acompte
      const { data: facture, error: factureFetchError } = await supabase
        .from("billing")
        .select("id")
        .eq("order_id", orderId)
        .single();

      if (!factureFetchError && facture) {
        const { error: factureUpdateError } = await supabase
          .from("billing")
          .update({
            totalttc: total,       // on considère TTC = total article
            acompte: deposit,
          })
          .eq("id", facture.id);

        if (factureUpdateError) {
          console.error("⚠️ Erreur mise à jour facture :", factureUpdateError);
        }
      }

      alert("✅ Commande mise à jour avec succès");
      setEditingOrderId(null);
      setEditedOrder({});
      fetchOrders();
    } catch (err) {
      console.error("❌ Erreur générale :", err);
      alert("Erreur inattendue.");
    }
  };

  const handleCancelEdit = () => {
    setEditingOrderId(null);
    setEditedOrder({});
  };

  const filteredOrders = orders
    .filter((order) => {
      if (showDeleted) return order.deleted === true;
      return order.deleted !== true;
    })
    .filter((order) => {
      const searchLower = search.toLowerCase();
const matchesSearch =
  safeLower(order.product).includes(searchLower) ||
  safeLower(order.brand).includes(searchLower) ||
  safeLower(order.model).includes(searchLower) ||
  safeLower(getClientName(order)).includes(searchLower) ||
  String(getClientFiche(order)).includes(searchLower);


      const isPending = !order.received && !order.paid && !order.recovered;
      const isInProgress = order.received && !order.recovered;
      const isCompleted = order.recovered;

      if (filterStatus === "pending" && !isPending) return false;
      if (filterStatus === "inprogress" && !isInProgress) return false;
      if (filterStatus === "completed" && !isCompleted) return false;

      return matchesSearch;
    });

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const displayedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleDeleteOrder = async (orderId) => {
    const { data: billings, error: billingError } = await supabase
      .from("billing")
      .select("id")
      .eq("order_id", orderId);

    if (billingError) {
      console.error("Erreur vérification facture :", billingError);
      Alert.alert("Erreur", "Impossible de vérifier la présence d'une facture.");
      return;
    }

    if (billings && billings.length > 0) {
      Alert.alert("❌ Suppression interdite", "Une facture est liée à cette commande.");
      return;
    }

    Alert.alert(
      "Confirmation de suppression",
      "Êtes-vous sûr de vouloir supprimer cette commande ? Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("orders")
              .update({ deleted: true })
              .eq("id", orderId);
            if (!error) fetchOrders();
          },
        },
      ]
    );
  };

  // Ouvre le viewer plein écran
  const openViewer = async (paths, start = 0) => {
    const urls = await Promise.all(
      paths.map(async (p) => {
        if (photoUrlCache[p]) return photoUrlCache[p];
        const u = await resolveImageUrl(p);
        if (u) {
          setPhotoUrlCache((prev) => ({ ...prev, [p]: u }));
        }
        return u;
      })
    );
    const filtered = urls.filter(Boolean);
    if (filtered.length > 0) {
      setViewerImages(filtered);
      setViewerIndex(Math.min(start, filtered.length - 1));
      setViewerOpen(true);
    }
  };

  const OrderCard = ({ item }) => {
    const photoPaths = useMemo(() => normalizeOrderPhotos(item), [item]);
    const hasPhotos = photoPaths.length > 0;

    const { total, totalToPay } = computeTotals({
      price: item.price,
      quantity: item.quantity ?? 1,
      deposit: item.deposit,
    });

    return (
      <View style={styles.card}>
        {/* En-tête */}
        <View style={styles.headerRow}>
<Text style={styles.client}>
  👤 {getClientName(item)} (#{getClientFiche(item)})
</Text>

          <Text style={styles.statusIndicator}>
            {getStatusIcon(item)} {getStatusText(item)}
          </Text>
        </View>

        <Text style={styles.date}>📅 {new Date(item.createdat).toLocaleDateString()}</Text>

        {/* Corps : Infos à gauche, Photos à droite */}
        <View style={styles.row}>
          <View style={[styles.infoBlock, { flex: 1, paddingRight: hasPhotos ? 12 : 0 }]}>
            {editingOrderId === item.id ? (
              <>
                {/* Produit / Marque / Modèle */}
                {["product", "brand", "model"].map((field) => (
                  <View key={field}>
                    <Text style={styles.label}>
                      {field === "product"
                        ? "Produit"
                        : field === "brand"
                        ? "Marque"
                        : "Modèle"}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={editedOrder[field]}
                      onChangeText={(text) =>
                        setEditedOrder({ ...editedOrder, [field]: text })
                      }
                      placeholder={field}
                      placeholderTextColor="#999"
                    />
                  </View>
                ))}

                {/* Prix unitaire / Quantité / Acompte */}
                <View>
                  <Text style={styles.label}>Prix unitaire (€)</Text>
                  <TextInput
                    style={styles.input}
                    value={editedOrder.price}
                    onChangeText={(text) =>
                      setEditedOrder({ ...editedOrder, price: text })
                    }
                    keyboardType="decimal-pad"
                    placeholder="Prix unitaire"
                    placeholderTextColor="#999"
                  />
                </View>

<View>
  <Text style={styles.label}>Quantité</Text>
  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
    <TouchableOpacity
      style={styles.qtyBtn}
      onPress={() => {
        const n = parseInt(editedOrder.quantity || "1", 10);
        const next = Math.max(1, (isNaN(n) ? 1 : n) - 1);
        setEditedOrder({ ...editedOrder, quantity: String(next) });
      }}
    >
      <Text style={styles.qtyBtnText}>−</Text>
    </TouchableOpacity>

    <TextInput
      style={[styles.input, { flex: 1, textAlign: "center" }]}
      value={editedOrder.quantity}
      onChangeText={(text) => {
        // on garde uniquement les chiffres, mais on n'impose PAS "1" si vide
        const digits = text.replace(/[^\d]/g, "");
        setEditedOrder({ ...editedOrder, quantity: digits });
      }}
      keyboardType="number-pad"
      placeholder="1"
      placeholderTextColor="#999"
    />

    <TouchableOpacity
      style={styles.qtyBtn}
      onPress={() => {
        const n = parseInt(editedOrder.quantity || "1", 10);
        const next = (isNaN(n) ? 1 : n) + 1;
        setEditedOrder({ ...editedOrder, quantity: String(next) });
      }}
    >
      <Text style={styles.qtyBtnText}>＋</Text>
    </TouchableOpacity>
  </View>
</View>


                <View>
                  <Text style={styles.label}>Acompte (€)</Text>
                  <TextInput
                    style={styles.input}
                    value={editedOrder.deposit}
                    onChangeText={(text) =>
                      setEditedOrder({ ...editedOrder, deposit: text })
                    }
                    keyboardType="decimal-pad"
                    placeholder="Acompte"
                    placeholderTextColor="#999"
                  />
                </View>

                {/* Aperçu dyn. des totaux en édition */}
                <TotalsPreview
                  price={editedOrder.price}
                  quantity={editedOrder.quantity}
                  deposit={editedOrder.deposit}
                />

                <View style={styles.editButtons}>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={() => handleSaveEditedOrder(item.id)}
                  >
                    <Text style={styles.buttonText}>✅ Sauvegarder</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit}>
                    <Text style={styles.buttonText}>❌ Annuler</Text>
                  </TouchableOpacity>
                  {(!item.billing || item.billing.length === 0) && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteOrder(item.id)}
                    >
                      <Text style={styles.buttonText}>🗑️ Supprimer</Text>
                    </TouchableOpacity>
                  )}
<TouchableOpacity
  style={[styles.editButton, { backgroundColor: "#28a745" }]}
  onPress={() =>
    navigation.navigate("CommandePreviewPage", {
      order: {
        id: item.id,
        client: {
          name: getClientName(item),
          ficheNumber: getClientFiche(item),
        },
        deviceType: item.product,
        brand: item.brand,
        model: item.model,
        cost: item.price,
        acompte: item.deposit,
        createdat: item.createdat,
        signatureclient: item.signatureclient,
        printed: item.printed,
        quantity: item.quantity ?? 1,
        total: item.total ?? total,
      },
      readOnly: true,
    })
  }
                  >
                    <Text style={styles.buttonText}>📄 Voir fiche imprimée</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>
                  🔹 Produit : <Text style={styles.value}>{item.product}</Text>
                </Text>
                <Text style={styles.label}>
                  🔹 Marque : <Text style={styles.value}>{item.brand}</Text>
                </Text>
                <Text style={styles.label}>
                  🔹 Modèle : <Text style={styles.value}>{item.model}</Text>
                </Text>

                <View style={{ height: 6 }} />

                <Text style={styles.label}>
                  💶 Prix unitaire : <Text style={styles.value}>{euro(item.price)}</Text>
                </Text>
                <Text style={styles.label}>
                  📦 Quantité : <Text style={styles.value}>{item.quantity ?? 1}</Text>
                </Text>
                <Text style={styles.label}>
                  🧮 Total article : <Text style={styles.value}>{euro(item.total ?? total)}</Text>
                </Text>
                <Text style={styles.label}>
                  💵 Acompte : <Text style={styles.value}>{euro(item.deposit)}</Text>
                </Text>
                <Text style={[styles.label, { marginTop: 4 }]}>
                  ✅ Total à régler :{" "}
                  <Text style={[styles.value, { color: "#0a7" }]}>
                    {euro(totalToPay)}
                  </Text>
                </Text>

                <View style={{ height: 8 }} />

                <Text style={styles.text}>
                  💳 Statut :{" "}
                  <Text style={{ color: item.paid ? "#4caf50" : "#f44336" }}>
                    {item.paid ? "✅ Payée" : "❌ Non payée"}
                  </Text>
                  {item.saved && " 💾 Sauvegardée"}
                </Text>

                {item.recovered && (
                  <View style={styles.recoveredBox}>
                    <Text style={styles.recoveredText}>
                      📦 Commande récupérée par le client
                    </Text>
                  </View>
                )}

                {editingOrderId !== item.id && (
                  <TouchableOpacity style={styles.editButton} onPress={() => handleEditOrder(item)}>
                    <Text style={styles.buttonText}>✏️ Modifier</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {showDeleted && (
              <TouchableOpacity
                style={[styles.editButton, { backgroundColor: "#17a2b8" }]}
                onPress={async () => {
                  const { error } = await supabase
                    .from("orders")
                    .update({ deleted: false })
                    .eq("id", item.id);
                  if (!error) fetchOrders();
                }}
              >
                <Text style={styles.buttonText}>♻ Restaurer</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Colonne photos à droite */}
          {hasPhotos && (
            <View style={styles.photosColumn}>
              <ScrollView contentContainerStyle={{ gap: 8 }}>
                {photoPaths.slice(0, 3).map((path, idx) => {
                  const url = photoUrlCache[path];
                  return (
                    <TouchableOpacity
                      key={`${path}-${idx}`}
                      activeOpacity={0.8}
                      onPress={() => openViewer(photoPaths, idx)}
                    >
                      <Image
                        source={
                          url
                            ? { uri: url }
                            : { uri: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }
                        }
                        style={styles.photoThumb}
                        resizeMode="cover"
                        onLoadEnd={async () => {
                          if (!url) {
                            const u = await resolveImageUrl(path);
                            if (u) setPhotoUrlCache((prev) => ({ ...prev, [path]: u }));
                          }
                        }}
                      />
                    </TouchableOpacity>
                  );
                })}

                {photoPaths.length > 3 && (
                  <TouchableOpacity
                    style={styles.moreBadge}
                    onPress={() => openViewer(photoPaths, 3)}
                  >
                    <Text style={styles.moreBadgeText}>+{photoPaths.length - 3}</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Toutes les commandes</Text>

      {/* Recherche */}
      <View style={{ marginBottom: 20 }}>
        <Text
          style={[
            styles.floatingLabel,
            (focusedField === "search" || search) && styles.floatingLabelFocused,
          ]}
        >
          Recherche client
        </Text>
        <TextInput
          value={search}
          onChangeText={handleSearchChange}
          style={[
            styles.input,
            (focusedField === "search" || search) && { paddingTop: 18 },
            focusedField === "search" && styles.inputFocused,
          ]}
          onFocus={() => setFocusedField("search")}
          onBlur={() => setFocusedField(null)}
        />
{suggestions.length > 0 && (
  <View style={styles.suggestionContainer}>
    {suggestions.map((it) => (
      <TouchableOpacity
        key={it.id}
        onPress={() => {
          setSearch(getClientName(it));
          setSuggestions([]);
        }}
        style={styles.suggestionItem}
      >
        <Text style={styles.suggestionText}>
          {getClientName(it)} - {getClientFiche(it)}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
)}

      </View>

      {/* Filtres */}
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 10 }}>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === "all" && styles.filterActive]}
          onPress={() => {
            setFilterStatus("all");
            setCurrentPage(1);
          }}
        >
          <Text style={styles.filterText}>Toutes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, filterStatus === "pending" && styles.filterActive]}
          onPress={() => {
            setFilterStatus("pending");
            setCurrentPage(1);
          }}
        >
          <Text style={styles.filterText}>🔴 En attente</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === "inprogress" && styles.filterActive]}
          onPress={() => {
            setFilterStatus("inprogress");
            setCurrentPage(1);
          }}
        >
          <Text style={styles.filterText}>🟡 En cours</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, filterStatus === "completed" && styles.filterActive]}
          onPress={() => {
            setFilterStatus("completed");
            setCurrentPage(1);
          }}
        >
          <Text style={styles.filterText}>✅ Terminées</Text>
        </TouchableOpacity>
      </View>

      {/* Actives / Supprimées */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          onPress={() => {
            setShowDeleted(false);
            setCurrentPage(1);
          }}
          style={[styles.toggleButton, !showDeleted && styles.toggleButtonActive]}
        >
          <Text style={styles.toggleButtonText}>✅ Actives ({activeCount})</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setShowDeleted(true);
            setCurrentPage(1);
          }}
          style={[styles.toggleButton, showDeleted && styles.toggleButtonActive]}
        >
          <Text style={styles.toggleButtonText}>🗑️ Supprimées ({deletedCount})</Text>
        </TouchableOpacity>
      </View>

      {/* Liste */}
      <FlatList
        data={displayedOrders}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <OrderCard item={item} />}
      />

      {/* Pagination */}
      <View style={styles.pagination}>
        <TouchableOpacity
          style={[styles.pageButton, currentPage === 1 && styles.disabledButton]}
          onPress={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <Text style={styles.pageButtonText}>⬅️ Précédent</Text>
        </TouchableOpacity>

        <Text style={styles.pageIndicator}>Page {currentPage}/{totalPages || 1}</Text>

        <TouchableOpacity
          style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]}
          onPress={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <Text style={styles.pageButtonText}>Suivant ➡️</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.returnButton} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>⬅ Retour</Text>
      </TouchableOpacity>

      {/* Viewer plein écran */}
      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity style={styles.viewerBackButton} onPress={() => setViewerOpen(false)}>
            <Text style={styles.viewerBackText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: viewerIndex * SCREEN_W, y: 0 }}
          >
            {viewerImages.map((u, i) => (
              <View key={`${u}-${i}`} style={{ width: SCREEN_W, height: SCREEN_H }}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setViewerOpen(false)}>
                  <Image source={{ uri: u }} style={styles.viewerImage} resizeMode="contain" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// Petit composant d’aperçu des totaux en cours d’édition
function TotalsPreview({ price, quantity, deposit }) {
  const { total, totalToPay } = computeTotals({ price, quantity, deposit });
  return (
    <View style={styles.totalPreview}>
      <Text style={styles.totalLine}>
        🧮 Total article : <Text style={styles.totalValue}>{euro(total)}</Text>
      </Text>
      <Text style={styles.totalLine}>
        ✅ Total à régler : <Text style={[styles.totalValue, { color: "#0a7" }]}>{euro(totalToPay)}</Text>
      </Text>
    </View>
  );
}

const THUMB_W = 96;
const THUMB_H = 72;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f4f4f4" },
  header: { fontSize: 22, fontWeight: "600", color: "#2e2e2e", marginBottom: 20, textAlign: "center" },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 16,
    borderRadius: 10,
    borderColor: "#ddd",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  client: { fontSize: 17, fontWeight: "600", color: "#222", marginBottom: 5 },
  date: { fontSize: 14, color: "#666", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "stretch" },
  infoBlock: {},
  // Colonne photos
  photosColumn: { width: THUMB_W, alignSelf: "stretch" },
  photoThumb: { width: THUMB_W, height: THUMB_H, borderRadius: 8, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fafafa" },
  moreBadge: {
    width: THUMB_W, height: THUMB_H, borderRadius: 8, borderWidth: 1, borderColor: "#ddd",
    alignItems: "center", justifyContent: "center", backgroundColor: "#f1f3f5",
  },
  moreBadgeText: { fontWeight: "700", color: "#333" },

  text: { fontSize: 15, color: "#444", marginBottom: 5 },
  label: { color: "#4a4a4a", fontWeight: "500", fontSize: 15, marginBottom: 3 },
  value: { color: "#1a1a1a", fontWeight: "500", fontSize: 15 },
  input: {
    backgroundColor: "#fafafa",
    padding: 10,
    marginBottom: 10,
    borderRadius: 6,
    borderColor: "#ccc",
    borderWidth: 1,
    color: "#000",
    fontSize: 15,
  },
  buttonText: { fontSize: 15, color: "#fff", fontWeight: "500" },
  editButton: { backgroundColor: "#505050", padding: 10, borderRadius: 8, marginTop: 10, alignItems: "center" },
  saveButton: { flex: 1, backgroundColor: "#5cb85c", paddingVertical: 10, borderRadius: 6, alignItems: "center" },
  cancelButton: { flex: 1, backgroundColor: "#f0ad4e", paddingVertical: 10, borderRadius: 6, alignItems: "center" },
  deleteButton: { flex: 1, backgroundColor: "#d9534f", paddingVertical: 10, borderRadius: 6, alignItems: "center" },
  editButtons: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 8, flexWrap: "wrap" },

  pagination: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
  pageButton: { backgroundColor: "#6c757d", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  disabledButton: { backgroundColor: "#ccc" },
  pageButtonText: { color: "#fff", fontSize: 15 },
  pageIndicator: { color: "#555", fontSize: 15 },

  returnButton: { backgroundColor: "#6c757d", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 20 },

  recoveredBox: { backgroundColor: "#e9ecef", padding: 8, borderRadius: 5, marginTop: 8 },
  recoveredText: { color: "#343a40", fontWeight: "500", textAlign: "center", fontSize: 14 },

  filterButton: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#ced4da", borderRadius: 6 },
  filterActive: { backgroundColor: "#495057" },
  filterText: { color: "#fff", fontWeight: "500", fontSize: 14 },

  suggestionContainer: { backgroundColor: "#ffffff", borderColor: "#ccc", borderWidth: 1, borderTopWidth: 0, maxHeight: 130 },
  suggestionItem: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#efefef" },
  suggestionText: { fontSize: 14 },
  floatingLabel: { position: "absolute", top: 10, left: 12, fontSize: 13, color: "#999", zIndex: 1 },
  floatingLabelFocused: { top: -10, fontSize: 12, color: "#555" },
  inputFocused: { borderColor: "#888", backgroundColor: "#f5f5f5" },

  toggleContainer: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginVertical: 24 },
  toggleButton: { flex: 1, backgroundColor: "#adb5bd", paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  toggleButtonText: { color: "#fff", fontWeight: "500", fontSize: 14 },
  toggleButtonActive: { backgroundColor: "#343a40" },

  statusIndicator: { fontSize: 16, color: "#444", fontWeight: "600" },

  // Aperçu totaux
  totalPreview: {
    backgroundColor: "#f6f8fa",
    borderWidth: 1,
    borderColor: "#e2e6ea",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  totalLine: { fontSize: 15, color: "#333", marginBottom: 2 },
  totalValue: { fontWeight: "700" },

  // Viewer
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)" },
  viewerBackButton: {
    position: "absolute",
    top: 20,
    right: 16,
    zIndex: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerBackText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  viewerImage: { width: SCREEN_W, height: SCREEN_H },
  // dans styles
qtyBtn: {
  backgroundColor: "#505050",
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
},
qtyBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },

});
