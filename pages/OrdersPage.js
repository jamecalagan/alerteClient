import React, { useEffect, useState, useRef } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    Image,
    Modal,
    Pressable,
    ActivityIndicator,
    Linking,
    StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import * as ImagePicker from "expo-image-picker";
import { supabase } from "../supabaseClient";
import CustomAlert from "../components/CustomAlert";
import AlertBox from "../components/AlertBox";

// === Réglages bucket/chemin ===
const ORDER_PHOTOS_BUCKET = "images"; // bucket existant
const ORDER_PHOTOS_FOLDER = "orders"; // sous-dossier pour les commandes

export default function OrdersPage({ route, navigation, order }) {
    const {
        clientId,
        clientName,
        clientPhone,
        clientNumber,
        prefillProduct,     // 👈 texte venant de "commande"
        fromIntervention,   // (déjà envoyé, on le garde pour plus tard si besoin)
        autoReturnOnCreate, // (idem, dispo si tu veux l'utiliser)
    } = route?.params || {};


    const [orders, setOrders] = useState([]);
    const [expandedOrders, setExpandedOrders] = useState([]);
    const [uploadingOrderId, setUploadingOrderId] = useState(null);
    const [showForm, setShowForm] = useState(!!prefillProduct);

    const [imageModalVisible, setImageModalVisible] = useState(false);
    const [imageModalUrl, setImageModalUrl] = useState(null);

    // —— Alertes / confirmations modernisées ——
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState("");
    const [alertMessage, setAlertMessage] = useState("");

    const showAlert = (title, message) => {
        setAlertTitle(title);
        setAlertMessage(message || "");
        setAlertVisible(true);
    };

    const [confirmDialog, setConfirmDialog] = useState({
        visible: false,
        title: "",
        message: "",
        confirmText: "Confirmer",
        onConfirm: null,
    });

    const openConfirm = (title, message, onConfirm, confirmText = "Confirmer") => {
        setConfirmDialog({ visible: true, title, message, confirmText, onConfirm });
    };

    const closeConfirm = () => {
        setConfirmDialog((prev) => ({ ...prev, visible: false }));
    };

    // —— Choix de la source d'une photo de commande ——
    const [photoChoiceOrder, setPhotoChoiceOrder] = useState(null);

    // —— Rappel fournisseur manquant au moment de "Marquer passée" ——
    const [fournisseurReminder, setFournisseurReminder] = useState(null);

    // —— Proposition de facturation au moment de "Marquer récupérée" ——
    const [invoicePromptOrder, setInvoicePromptOrder] = useState(null);

const [newOrder, setNewOrder] = useState({
    product: prefillProduct || "",  // 👈 prérempli si tu viens d'une intervention
    brand: "",
    model: "",
    serial: "",
    fournisseur: "",
    purchasePrice: "",  // prix d'achat fournisseur (enregistré sur order_items.purchase_price)
    marginPercent: "",  // % de marge appliqué au prix d'achat (enregistré sur order_items.margin_percent)
    price: "",
    quantity: "1",
    deposit: "",
    paid: false,
    client_id: clientId || null,    // 👈 on met aussi le client direct
    include_in_intervention: false,
});

// Convertit une saisie texte en nombre valide, ou null si vide/non numérique
// (évite qu'un NaN silencieux ne parte en base au lieu d'un vrai null).
const parseNullableFloat = (str) => {
    const n = parseFloat(String(str ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
};

// Prix de vente estimé = prix d'achat + % de marge sur le prix de vente (aide au calcul)
const computeEstimatedSalePrice = (purchaseStr, marginStr) => {
    const purchase = parseFloat(
        String(purchaseStr || "").replace(",", ".")
    );
    const margin = parseFloat(
        String(marginStr || "").replace(",", ".")
    );
    if (!Number.isFinite(purchase) || purchase <= 0) return null;
    if (!Number.isFinite(margin) || margin >= 100) return null;
    return purchase / (1 - margin / 100);
};

// % de marge (sur le prix de vente) déduit du prix d'achat + prix unitaire
const computeMarginFromPrices = (purchaseStr, priceStr) => {
    const purchase = parseFloat(
        String(purchaseStr || "").replace(",", ".")
    );
    const price = parseFloat(
        String(priceStr || "").replace(",", ".")
    );
    if (!Number.isFinite(purchase) || purchase <= 0) return null;
    if (!Number.isFinite(price) || price <= 0) return null;
    return ((price - purchase) / price) * 100;
};

const estimatedSalePrice = computeEstimatedSalePrice(
    newOrder.purchasePrice,
    newOrder.marginPercent
);


// Produits composant la nouvelle commande
const [newOrderItems, setNewOrderItems] =
    useState([]);
const [editingOrderItem, setEditingOrderItem] = useState(null);
    // 🆕 Édition d'une commande existante
    const [editingIds, setEditingIds] = useState([]); // ids en édition
    const [editMap, setEditMap] = useState({}); // { [id]: { ...champs... } }

    // 🔎 pour scroller sur une commande créée (focusId)
    const listRef = useRef(null);

    const isEditing = (id) => editingIds.includes(id);

    const startEdit = (item) => {
        setEditMap((m) => ({
            ...m,
            [item.id]: {
                product: item.product ?? "",
                brand: item.brand ?? "",
                model: item.model ?? "",
                serial: item.serial ?? "",
                price: `${item.price ?? ""}`,
                quantity: `${item.quantity ?? 1}`,
                deposit: `${item.deposit ?? ""}`,
                include_in_intervention:
                    item.include_in_intervention === true ||
                    item.include_in_intervention === "true" ||
                    item.include_in_intervention === 1,
            },
        }));
        setEditingIds((ids) =>
            ids.includes(item.id) ? ids : [...ids, item.id]
        );
    };

    const cancelEdit = (id) => {
        setEditMap((m) => {
            const c = { ...m };
            delete c[id];
            return c;
        });
        setEditingIds((ids) => ids.filter((x) => x !== id));
    };

    const updateEditField = (id, field, value) => {
        setEditMap((m) => ({
            ...m,
            [id]: { ...m[id], [field]: value },
        }));
    };

    const changeQty = (id, delta) => {
        const current = parseInt(editMap[id]?.quantity || "1", 10) || 1;
        const next = Math.max(1, current + delta);
        updateEditField(id, "quantity", String(next));
    };

    const saveEdit = async (id) => {
        try {
            const v = editMap[id] || {};
            const included = !!v.include_in_intervention;

            const price = included
                ? 0
                : parseFloat(String(v.price || "0").replace(",", ".")) || 0;

            const qty = included
                ? 1
                : Math.max(1, parseInt(String(v.quantity || "1"), 10) || 1);

            const deposit =
                parseFloat(String(v.deposit || "0").replace(",", ".")) || 0;

            const total = included ? 0 : price * qty;

            if (!v.product) {
                showAlert(
                    "Champs manquants",
                    "Renseignez au minimum le produit."
                );
                return;
            }
            if (!included && price <= 0) {
                showAlert(
                    "Prix requis",
                    "Veuillez saisir un prix unitaire valide ou cochez “inclus dans l’intervention”."
                );
                return;
            }

            const { error } = await supabase
                .from("orders")
                .update({
                    product: v.product,
                    brand: v.brand || "",
                    model: v.model || "",
                    serial: v.serial || "",
                    price,
                    quantity: qty,
                    total,
                    deposit,
                    include_in_intervention: included, // 🆕
                })
                .eq("id", id);
            if (error) throw error;

            cancelEdit(id);
            await loadOrders();
            showAlert("Modifications enregistrées");
        } catch (e) {
            console.error("❌ Save edit:", e);
            showAlert("Erreur", "Impossible d'enregistrer la modification.");
        }
    };

    useEffect(() => {
        if (clientId) setNewOrder((p) => ({ ...p, client_id: clientId }));
    }, [clientId]);

    useEffect(() => {
        loadOrders();
    }, [clientId]);

    useEffect(() => {
        const unsub = navigation.addListener("focus", () => {
            loadOrders();
        });
        return unsub;
    }, [navigation, clientId]);

    useEffect(() => {
        if (route.params?.refreshAt) {
            loadOrders();
        }
    }, [route.params?.refreshAt]);

    const toBool = (v) => v === true || v === "true" || v === 1;

    // 🔁 Charge commandes
    const loadOrders = async () => {
        try {
            const focusId = route.params?.focusId
                ? String(route.params.focusId)
                : null;

            if (clientId) {
const { data, error } = await supabase
  .from("orders")
  .select(`
    *,
    billing(id),
    order_items(
    id,
	order_id,
    product,
    brand,
    model,
    serial,
    fournisseur,
    quantity,
    unit_price,
    purchase_price,
    margin_percent,
    ordered,
    ordered_at,
    received,
    received_at,
    installed,
    installed_at,
    position
    )
`)
  .eq("client_id", clientId)
  .or("deleted.eq.false,deleted.is.null")
  .order("createdat", { ascending: false });
                if (error) throw error;
                const rows = (data || []).map((o) => {
                    const qty = Number.isFinite(o.quantity)
                        ? o.quantity
                        : parseInt(o.quantity ?? 1, 10) || 1;
                    const unit =
                        typeof o.price === "number"
                            ? o.price
                            : parseFloat(
                                  (o.price ?? "0").toString().replace(",", ".")
                              ) || 0;
                    const total =
                        typeof o.total === "number" && !isNaN(o.total)
                            ? o.total
                            : unit * qty;

const orderItems = Array.isArray(o.order_items)
    ? o.order_items
    : [];

const allOrdered =
    orderItems.length > 0
        ? orderItems.every((i) => i.ordered)
        : toBool(o.ordered);

const allReceived =
    orderItems.length > 0
        ? orderItems.every((i) => i.received)
        : toBool(o.received);

const allInstalled =
    orderItems.length > 0
        ? orderItems.every((i) => i.installed)
        : toBool(o.installed);

return {
    ...o,
    quantity: qty,
    total,
order_items: Array.isArray(o.order_items)
    ? [...o.order_items].sort(
          (a, b) =>
              (a.position || 0) -
              (b.position || 0)
      )
    : [],

    include_in_intervention: toBool(
        o.include_in_intervention
    ),
    notified: toBool(o.notified),
    paid: toBool(o.paid),
    ordered: allOrdered,
received: allReceived,
installed: allInstalled,
    recovered: toBool(o.recovered),
    saved: toBool(o.saved),
};
                });
                setOrders(rows);
                return;
            }

            if (focusId) {
                const { data, error } = await supabase
  .from("orders")
  .select(`
    *,
    billing(id),
    order_items(
        id,
		order_id,
    product,
    brand,
    model,
    serial,
    fournisseur,
    quantity,
    unit_price,
    purchase_price,
    margin_percent,
    ordered,
    ordered_at,
    received,
    received_at,
    installed,
    installed_at,
    position
    )
`)
  .eq("id", focusId)
  .or("deleted.eq.false,deleted.is.null")
  .limit(1)
  .maybeSingle();
                if (error) throw error;

                if (data) {
                    const qty = Number.isFinite(data.quantity)
                        ? data.quantity
                        : parseInt(data.quantity ?? 1, 10) || 1;
                    const unit =
                        typeof data.price === "number"
                            ? data.price
                            : parseFloat(
                                  (data.price ?? "0")
                                      .toString()
                                      .replace(",", ".")
                              ) || 0;
                    const total =
                        typeof data.total === "number" && !isNaN(data.total)
                            ? data.total
                            : unit * qty;

                    setOrders([
                        {
                            ...data,
                            quantity: qty,
                            total,
                            include_in_intervention: toBool(
                                data.include_in_intervention
                            ),
                            notified: toBool(data.notified),
                            received: toBool(data.received),
                            paid: toBool(data.paid),
                            ordered: toBool(data.ordered),
                            recovered: toBool(data.recovered),
                            saved: toBool(data.saved),
                        },
                    ]);

                    if (!clientName || !clientPhone) {
                        const { data: cli } = await supabase
                            .from("clients")
                            .select("name, phone, ficheNumber")
                            .eq("id", data.client_id)
                            .maybeSingle();
                        if (cli) {
                            navigation.setParams({
                                clientId: data.client_id,
                                clientName: cli.name ?? "",
                                clientPhone: cli.phone ?? "",
                                clientNumber: cli.ficheNumber ?? null,
                            });
                        }
                    }
                } else {
                    setOrders([]);
                }
                return;
            }

            setOrders([]);
        } catch (e) {
            console.error("loadOrders error:", e);
            showAlert("Erreur", "Impossible de charger les commandes.");
            setOrders([]);
        }
    };
const resetNewOrderProduct = () => {
    setNewOrder((previous) => ({
        ...previous,
        product: "",
        brand: "",
        model: "",
        serial: "",
        fournisseur: "",
        purchasePrice: "",
        marginPercent: "",
        price: "",
        quantity: "1",
        include_in_intervention: false,
    }));
};

const handleAddProductToOrder = async () => {
    const included =
        !!newOrder.include_in_intervention;

    const product =
        String(newOrder.product || "").trim();

    if (!product) {
        showAlert(
            "Produit manquant",
            "Renseignez le produit."
        );
        return;
    }

    const unitPrice = included
        ? 0
        : parseFloat(
              String(newOrder.price || "0").replace(
                  ",",
                  "."
              )
          ) || 0;

    const quantity = included
        ? 1
        : Math.max(
              1,
              parseInt(
                  String(newOrder.quantity || "1"),
                  10
              ) || 1
          );

    if (!included && unitPrice <= 0) {
        showAlert(
            "Prix requis",
            "Saisissez un prix unitaire valide ou cochez « Coût inclus dans l’intervention »."
        );
        return;
    }

    // Modification d'un article déjà enregistré
    if (editingOrderItem?.id) {
        try {
            const { error } = await supabase
                .from("order_items")
                .update({
                    product,
                    brand: String(
                        newOrder.brand || ""
                    ).trim(),
                    model: String(
                        newOrder.model || ""
                    ).trim(),
                    serial: String(
                        newOrder.serial || ""
                    ).trim(),
                    fournisseur: String(
                        newOrder.fournisseur || ""
                    ).trim(),
                    purchase_price: parseNullableFloat(
                        newOrder.purchasePrice
                    ),
                    margin_percent: parseNullableFloat(
                        newOrder.marginPercent
                    ),
                    quantity,
                    unit_price: unitPrice,
                })
                .eq("id", editingOrderItem.id);

            if (error) throw error;
await recalculateOrderSummary(
    editingOrderItem.order_id
);
            setEditingOrderItem(null);
            resetNewOrderProduct();

            await loadOrders();

            showAlert(
                "Article modifié",
                "Les modifications ont été enregistrées."
            );
        } catch (error) {
            console.error(
                "❌ Modification article :",
                error
            );

            showAlert(
                "Erreur",
                "Impossible de modifier cet article. " +
                    (error?.message || "")
            );
        }

        return;
    }

    // Ajout d'un nouvel article au panier
    const item = {
        localId: `${Date.now()}-${Math.random()}`,
        product,
        brand: String(
            newOrder.brand || ""
        ).trim(),
        model: String(
            newOrder.model || ""
        ).trim(),
        serial: String(
            newOrder.serial || ""
        ).trim(),
        fournisseur: String(
            newOrder.fournisseur || ""
        ).trim(),
        purchasePrice: parseNullableFloat(newOrder.purchasePrice),
        marginPercent: parseNullableFloat(newOrder.marginPercent),
        quantity,
        unit_price: unitPrice,
        total: included
            ? 0
            : unitPrice * quantity,
        include_in_intervention: included,
        received: false,
    };

    setNewOrderItems((previous) => [
        ...previous,
        item,
    ]);

    resetNewOrderProduct();
};


const handleCreateOrder = async () => {
    try {
        if (newOrderItems.length === 0) {
            showAlert(
                "Commande vide",
                "Ajoutez au moins un produit."
            );
            return;
        }

        const totalCommande =
            newOrderItems.reduce(
                (sum, item) =>
                    sum + Number(item.total || 0),
                0
            );

        const acompte =
            parseFloat(
                String(newOrder.deposit || "0")
                    .replace(",", ".")
            ) || 0;

        if (acompte < 0) {
            showAlert(
                "Acompte invalide",
                "L’acompte ne peut pas être négatif."
            );
            return;
        }

        if (acompte > totalCommande) {
            showAlert(
                "Acompte invalide",
                "L’acompte ne peut pas dépasser le total de la commande."
            );
            return;
        }

        const premierProduit =
            newOrderItems[0];

        const payload = {
            client_id: clientId || null,

            order_name:
                newOrderItems.length === 1
                    ? premierProduit.product
                    : `${premierProduit.product} + ${
                          newOrderItems.length - 1
                      } autre${
                          newOrderItems.length > 2
                              ? "s"
                              : ""
                      }`,

            items_count:
                newOrderItems.length,

            // Compatibilité avec les anciennes pages
            product:
                premierProduit.product,
            brand:
                premierProduit.brand || "",
            model:
                premierProduit.model || "",
            serial:
                premierProduit.serial || "",

            quantity: 1,
            price: totalCommande,
            total: totalCommande,
            deposit: acompte,

            paid: false,
            deleted: false,
            ordered: false,
            received: false,
            recovered: false,
            saved: false,
            notified: false,

            include_in_intervention:
                newOrderItems.every(
                    (item) =>
                        item.include_in_intervention ===
                        true
                ),
        };

        const {
            data: createdOrder,
            error: orderError,
        } = await supabase
            .from("orders")
            .insert([payload])
            .select("id")
            .single();

        if (orderError) {
            throw orderError;
        }

        const lignes =
            newOrderItems.map(
                (item, index) => ({
                    order_id: createdOrder.id,

                    product:
                        item.product,
                    brand:
                        item.brand || "",
                    model:
                        item.model || "",
                    serial:
                        item.serial || "",
                    fournisseur:
                        item.fournisseur || "",

                    quantity:
                        item.quantity,
                    unit_price:
                        item.unit_price,
                    purchase_price:
                        item.purchasePrice ?? null,
                    margin_percent:
                        item.marginPercent ?? null,

                    received: false,

                    position:
                        index + 1,
                })
            );

        const { error: itemsError } =
            await supabase
                .from("order_items")
                .insert(lignes);

        if (itemsError) {
            // Évite de laisser une commande vide
            await supabase
                .from("orders")
                .delete()
                .eq("id", createdOrder.id);

            throw itemsError;
        }

        setNewOrderItems([]);

        setNewOrder({
            product: "",
            brand: "",
            model: "",
            serial: "",
            fournisseur: "",
            purchasePrice: "",
            marginPercent: "",
            price: "",
            quantity: "1",
            deposit: "",
            paid: false,
            client_id: clientId || null,
            include_in_intervention: false,
        });

        setShowForm(false);

        await loadOrders();

        showAlert(
            "Commande enregistrée",
            `${newOrderItems.length} produit${
                newOrderItems.length > 1
                    ? "s"
                    : ""
            } enregistré${
                newOrderItems.length > 1
                    ? "s"
                    : ""
            }.`
        );
    } catch (error) {
        console.error(
            "❌ Ajout commande multi-produits :",
            error
        );

        showAlert(
            "Erreur",
            error?.message ||
                "Impossible d’enregistrer la commande."
        );
    }
};
const handleCancelOrder = (ord) => {
  if (!ord?.id) return;

  if (ord.saved) {
    showAlert(
      "Commande sauvegardée",
      "Une commande déjà sauvegardée ne peut pas être annulée."
    );
    return;
  }

  if (ord.recovered) {
    showAlert(
      "Commande récupérée",
      "Cette commande a déjà été récupérée par le client."
    );
    return;
  }

  openConfirm(
    "Annuler la commande",
    `Voulez-vous vraiment annuler la commande « ${
      ord.product || "Sans désignation"
    } » ?\n\nElle disparaîtra des commandes en cours mais restera enregistrée dans l’historique.`,
    async () => {
      try {
        const { error } = await supabase
          .from("orders")
          .update({
            deleted: true,
          })
          .eq("id", ord.id);

        if (error) throw error;

        setOrders((currentOrders) =>
          currentOrders.filter((orderItem) => orderItem.id !== ord.id)
        );

        showAlert(
          "Commande annulée",
          "La commande a été retirée de la liste des commandes en cours."
        );
      } catch (error) {
        console.error("❌ Annulation commande :", error);

        showAlert(
          "Erreur",
          "Impossible d’annuler cette commande."
        );
      }
    },
    "Oui, annuler"
  );
};
    const handleDeleteOrder = async (ord) => {
        if (!ord.paid && !ord.saved) {
            showAlert(
                "Suppression impossible",
                "Impossible de supprimer une commande ni payée ni sauvegardée."
            );
            return;
        }
        openConfirm("Confirmation", "Supprimer cette commande ?", async () => {
            try {
                const { error } = await supabase
                    .from("orders")
                    .delete()
                    .eq("id", ord.id);
                if (error) throw error;
                loadOrders();
            } catch (e) {
                console.error("❌ Suppression:", e);
            }
        }, "Supprimer");
    };

    const handleMarkAsPaid = (ord) => {
        const isIncluded = !!ord.include_in_intervention;
        const total = isIncluded
            ? 0
            : ord.total ?? (ord.price || 0) * (ord.quantity || 1);
        const remaining = Math.max(0, total - (ord.deposit || 0));

        openConfirm(
            "Paiement complet",
            `Confirmez-vous le paiement de ${remaining.toFixed(2)} € ?`,
            async () => {
                try {
                    const { error } = await supabase
                        .from("orders")
                        .update({ paid: true })
                        .eq("id", ord.id);
                    if (error) throw error;
                    loadOrders();
                } catch (e) {
                    console.error("❌ Paiement:", e);
                }
            }
        );
    };

    const handleSaveOrder = async (ord) => {
        if (!ord.paid || !ord.recovered) {
            showAlert(
                "Erreur",
                "Marquez d'abord payée et récupérée avant de sauvegarder."
            );
            return;
        }
        openConfirm(
            "Sauvegarder",
            "Confirmez-vous la sauvegarde définitive ?",
            async () => {
                try {
                    const { error } = await supabase
                        .from("orders")
                        .update({
                            saved: true,
                            paid_at: new Date().toISOString(),
                        })
                        .eq("id", ord.id);
                    if (error) throw error;
                    loadOrders();
                } catch (e) {
                    console.error("❌ Sauvegarde:", e);
                }
            }
        );
    };

    const handleMarkAsRecovered = async (ord) => {
        openConfirm(
            "Commande récupérée",
            "Confirmez-vous la récupération par le client ?",
            async () => {
                try {
                    const { error } = await supabase
                        .from("orders")
                        .update({ recovered: true })
                        .eq("id", ord.id);
                    if (error) throw error;
                    loadOrders();

                    const alreadyInvoiced = (ord.billing?.length ?? 0) > 0;
                    if (!alreadyInvoiced && !ord.include_in_intervention) {
                        setInvoicePromptOrder(ord);
                    }
                } catch (e) {
                    console.error("❌ Récupération:", e);
                }
            }
        );
    };

    const confirmMarkAsOrdered = (ord) => {
        openConfirm(
            "Commande passée",
            "Confirmez-vous la commande fournisseur ?",
            async () => {
                try {
                    const { error } = await supabase
                        .from("orders")
                        .update({ ordered: true })
                        .eq("id", ord.id);
                    if (error) throw error;

                    if (Array.isArray(ord.order_items) && ord.order_items.length > 0) {
                        const { error: itemsError } = await supabase
                            .from("order_items")
                            .update({
                                ordered: true,
                                ordered_at: new Date().toISOString(),
                            })
                            .eq("order_id", ord.id);
                        if (itemsError) throw itemsError;
                    }

                    loadOrders();
                } catch (e) {
                    console.error("❌ Commande passée:", e);
                }
            }
        );
    };

    const handleMarkAsOrdered = (ord) => {
        const missingFournisseur = (
            Array.isArray(ord.order_items) ? ord.order_items : []
        ).filter((it) => !it.fournisseur || !it.fournisseur.trim());

        if (missingFournisseur.length > 0) {
            setFournisseurReminder({ ord, missingItems: missingFournisseur });
            return;
        }

        confirmMarkAsOrdered(ord);
    };

    const handleMarkAsReceived = async (ord) => {
        openConfirm("Commande reçue", "Confirmez-vous la réception ?", async () => {
            try {
                const { error } = await supabase
                    .from("orders")
                    .update({ received: true })
                    .eq("id", ord.id);
                if (error) throw error;

                if (Array.isArray(ord.order_items) && ord.order_items.length > 0) {
                    const { error: itemsError } = await supabase
                        .from("order_items")
                        .update({
                            received: true,
                            received_at: new Date().toISOString(),
                        })
                        .eq("order_id", ord.id);
                    if (itemsError) throw itemsError;
                }

                loadOrders();
            } catch (e) {
                console.error("❌ Réception:", e);
            }
        });
    };

    const notifyOrderBySMS = async (ord) => {
        if (!clientPhone) {
            showAlert("Erreur", "Numéro de téléphone manquant.");
            return;
        }
        const message = `Bonjour, votre commande ${ord.product} est prête. Merci et à bientôt.\n\nAVENIR INFORMATIQUE`;
        const encoded = encodeURIComponent(message);
        try {
            const { error } = await supabase
                .from("orders")
                .update({ notified: true })
                .eq("id", ord.id);
            if (error) throw error;
            Linking.openURL(`sms:${clientPhone}?body=${encoded}`);
            showAlert("Notification envoyée");
            loadOrders();
        } catch (e) {
            console.error("Erreur notification :", e);
            showAlert("Erreur", "Impossible d’enregistrer la notification.");
        }
    };

  // ====== PHOTOS (multi) ======

const ensureCameraPermission = async () => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();

  if (status !== "granted") {
    showAlert(
      "Permission requise",
      "Autorisez l'accès à la caméra pour prendre des photos."
    );
    return false;
  }

  return true;
};

const getPublicUrlFromPath = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const { data } = supabase.storage
    .from(ORDER_PHOTOS_BUCKET)
    .getPublicUrl(path);

  return data?.publicUrl || null;
};

const candidateMulti = ["order_photos", "photos", "images"];

const candidateSingle = [
  "order_photo",
  "photo_url",
  "photo",
  "image_url",
  "image",
  "picture",
];

const readPhotoPathsFromRow = (row) => {
  for (const col of candidateMulti) {
    if (
      Object.prototype.hasOwnProperty.call(row || {}, col) &&
      row[col] != null
    ) {
      const value = row[col];

      if (Array.isArray(value)) {
        return value.filter(Boolean);
      }

      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);

          if (Array.isArray(parsed)) {
            return parsed.filter(Boolean);
          }
        } catch (_) { /* pas du JSON valide, ignoré */ }

        if (value.includes(",")) {
          return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }

        return value ? [value] : [];
      }
    }
  }

  for (const col of candidateSingle) {
    if (
      Object.prototype.hasOwnProperty.call(row || {}, col) &&
      row[col]
    ) {
      return [row[col]];
    }
  }

  return [];
};

const writePhotoPathsToRow = async (orderId, paths) => {
  for (const col of candidateMulti) {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ [col]: paths })
        .eq("id", orderId);

      if (!error) return true;
    } catch (_) { /* colonne inexistante sur cette base, on essaie la suivante */ }
  }

  for (const col of candidateSingle) {
    try {
      const lastPhoto = paths[paths.length - 1] || null;

      const { error } = await supabase
        .from("orders")
        .update({ [col]: lastPhoto })
        .eq("id", orderId);

      if (!error) return true;
    } catch (_) { /* colonne inexistante sur cette base, on essaie la suivante */ }
  }

  showAlert(
    "Colonne photos introuvable",
    "Impossible d’enregistrer les photos de cette commande."
  );

  return false;
};

const uploadOrderPhotoAsset = async (ord, asset) => {
  if (!ord?.id || !asset?.uri) return;

  setUploadingOrderId(ord.id);

  try {
    const uriWithoutQuery = asset.uri.split("?")[0];
    const rawExtension =
      uriWithoutQuery.split(".").pop()?.toLowerCase() || "jpg";

    const allowedExtensions = ["jpg", "jpeg", "png", "webp"];
    const extension = allowedExtensions.includes(rawExtension)
      ? rawExtension
      : "jpg";

    const mimeType =
      asset.mimeType ||
      (extension === "png"
        ? "image/png"
        : extension === "webp"
        ? "image/webp"
        : "image/jpeg");

    const filePath = `${ORDER_PHOTOS_FOLDER}/${
      clientId || ord.client_id || "client"
    }/${ord.id}-${Date.now()}.${extension}`;

    const file = {
      uri: asset.uri,
      name: filePath.split("/").pop(),
      type: mimeType,
    };

    const { error: uploadError } = await supabase.storage
      .from(ORDER_PHOTOS_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: mimeType,
      });

    if (uploadError) throw uploadError;

    const currentPhotos = readPhotoPathsFromRow(ord);
    const nextPhotos = [...currentPhotos, filePath];

    const saved = await writePhotoPathsToRow(ord.id, nextPhotos);

    if (!saved) {
      await supabase.storage
        .from(ORDER_PHOTOS_BUCKET)
        .remove([filePath]);

      return;
    }

    showAlert(
      "Image enregistrée",
      "L’image a été ajoutée à la commande."
    );

    await loadOrders();
  } catch (error) {
    console.error("📷❌ Upload photo :", error);

    showAlert(
      "Erreur",
      error?.message || "Impossible d’ajouter l’image."
    );
  } finally {
    setUploadingOrderId(null);
  }
};

const takeAndUploadOrderPhoto = async (ord) => {
  try {
    const permissionGranted = await ensureCameraPermission();

    if (!permissionGranted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) return;

    const asset = result.assets?.[0];

    if (!asset?.uri) return;

    await uploadOrderPhotoAsset(ord, asset);
  } catch (error) {
    console.error("📷❌ Appareil photo :", error);

    showAlert(
      "Erreur",
      "Impossible de prendre ou d’envoyer la photo."
    );
  }
};

const pickAndUploadOrderPhoto = async (ord) => {
  try {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.status !== "granted") {
      showAlert(
        "Permission requise",
        "Autorisez l'accès aux photos pour choisir une image."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) return;

    const asset = result.assets?.[0];

    if (!asset?.uri) return;

    await uploadOrderPhotoAsset(ord, asset);
  } catch (error) {
    console.error("🖼️❌ Galerie :", error);

    showAlert(
      "Erreur",
      "Impossible de sélectionner ou d’envoyer l’image."
    );
  }
};

const openWebImageSearch = async (ord) => {
  try {
    const query = [ord?.product, ord?.brand, ord?.model]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!query) {
      showAlert(
        "Recherche impossible",
        "Aucun produit, marque ou modèle n’est renseigné."
      );
      return;
    }

    const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
      query
    )}`;

    const supported = await Linking.canOpenURL(url);

    if (!supported) {
      showAlert(
        "Erreur",
        "Aucun navigateur ne peut ouvrir cette recherche."
      );
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    console.error("🌐❌ Recherche image :", error);

    showAlert(
      "Erreur",
      "Impossible d’ouvrir la recherche d’images."
    );
  }
};

const showOrderPhotoChoices = (ord) => {
  setPhotoChoiceOrder(ord);
};

const deleteOnePhoto = async (ord, imgPath) => {
  try {
    const currentPhotos = readPhotoPathsFromRow(ord);
    const nextPhotos = currentPhotos.filter(
      (photoPath) => photoPath !== imgPath
    );

    const saved = await writePhotoPathsToRow(
      ord.id,
      nextPhotos
    );

    if (!saved) return;

    if (imgPath && !/^https?:\/\//i.test(imgPath)) {
      const { error: storageError } = await supabase.storage
        .from(ORDER_PHOTOS_BUCKET)
        .remove([imgPath]);

      if (storageError) {
        console.warn(
          "Suppression Storage non effectuée :",
          storageError
        );
      }
    }

    await loadOrders();
  } catch (error) {
    console.error("🗑️❌ Suppression photo :", error);

    showAlert(
      "Erreur",
      "Impossible de supprimer cette image."
    );
  }
};
const toggleOrderItemOrdered = async (orderItem) => {
    try {
        const nextValue = !orderItem.ordered;

        const { error } = await supabase
            .from("order_items")
            .update({
                ordered: nextValue,
                ordered_at: nextValue
                    ? new Date().toISOString()
                    : null,
            })
            .eq("id", orderItem.id);

        if (error) {
            throw error;
        }

        // Répercute l'état sur le bouton "Produit commandé ?" de la fiche
        // d'intervention correspondante (via client_id + nom du produit,
        // faute de lien direct en base entre order_items et interventions).
        if (clientId && orderItem.product) {
            const { error: syncError } = await supabase
                .from("interventions")
                .update({ commande_effectuee: nextValue })
                .eq("client_id", clientId)
                .eq("status", "En attente de pièces")
                .ilike("commande", orderItem.product);

            if (syncError) {
                console.warn(
                    "⚠️ Synchronisation commande_effectuee :",
                    syncError
                );
            }
        }

        await loadOrders();
    } catch (error) {
        console.error(
            "❌ Mise à jour article commandé :",
            error
        );

        showAlert(
            "Erreur",
            "Impossible de modifier l’état de cet article."
        );
    }
};
const toggleOrderItemReceived = async (orderItem) => {
    try {
        const nextValue = !orderItem.received;

        const { error } = await supabase
            .from("order_items")
            .update({
                received: nextValue,
                received_at: nextValue
                    ? new Date().toISOString()
                    : null,
            })
            .eq("id", orderItem.id);

        if (error) {
            throw error;
        }

        // Répercute la réception sur la fiche d'intervention correspondante,
        // comme le fait manuellement le bouton "Commande reçue ?" (passage à
        // "Intervention en cours"), via client_id + nom du produit faute de
        // lien direct en base entre order_items et interventions.
        // Si on décoche par erreur, on repasse la fiche à "En attente de
        // pièces" pour faire réapparaître le bouton — mais seulement si elle
        // n'a pas déjà avancé plus loin dans le workflow.
        if (clientId && orderItem.product) {
            const { error: syncError } = await supabase
                .from("interventions")
                .update({
                    status: nextValue
                        ? "Intervention en cours"
                        : "En attente de pièces",
                })
                .eq("client_id", clientId)
                .eq(
                    "status",
                    nextValue ? "En attente de pièces" : "Intervention en cours"
                )
                .ilike("commande", orderItem.product);

            if (syncError) {
                console.warn(
                    "⚠️ Synchronisation statut intervention :",
                    syncError
                );
            }
        }

        await loadOrders();
    } catch (error) {
        console.error(
            "❌ Mise à jour article reçu :",
            error
        );

        showAlert(
            "Erreur",
            "Impossible de modifier l'état de cet article."
        );
    }
};
const toggleOrderItemInstalled = async (orderItem) => {
    try {
        const nextValue = !orderItem.installed;

        const { error } = await supabase
            .from("order_items")
            .update({
                installed: nextValue,
                installed_at: nextValue
                    ? new Date().toISOString()
                    : null,
            })
            .eq("id", orderItem.id);

        if (error) {
            throw error;
        }

        await loadOrders();
    } catch (error) {
        console.error(
            "❌ Mise à jour article monté :",
            error
        );

        showAlert(
            "Erreur",
            "Impossible de modifier l'état de cet article."
        );
    }
};
const editOrderItem = (orderItem) => {
    setEditingOrderItem(orderItem);

    setNewOrder((previous) => ({
        ...previous,
        product: orderItem.product || "",
        brand: orderItem.brand || "",
        model: orderItem.model || "",
        serial: orderItem.serial || "",
        fournisseur: orderItem.fournisseur || "",
        purchasePrice:
            orderItem.purchase_price != null
                ? String(orderItem.purchase_price)
                : "",
        marginPercent:
            orderItem.margin_percent != null
                ? String(orderItem.margin_percent)
                : "",
        quantity: String(orderItem.quantity || 1),
        price: String(orderItem.unit_price || ""),
        include_in_intervention:
            !!orderItem.include_in_intervention,
    }));

    setShowForm(true);
};

const recalculateOrderSummary = async (orderId) => {
    try {
        const { data: items, error: itemsError } =
            await supabase
                .from("order_items")
                .select("quantity, unit_price")
                .eq("order_id", orderId);

        if (itemsError) throw itemsError;

        const safeItems = Array.isArray(items)
            ? items
            : [];

        const itemsCount =
            safeItems.reduce(
                (sum, item) =>
                    sum +
                    Math.max(
                        1,
                        Number(item.quantity || 1)
                    ),
                0
            );

        const total =
            safeItems.reduce(
                (sum, item) =>
                    sum +
                    Number(item.unit_price || 0) *
                        Math.max(
                            1,
                            Number(item.quantity || 1)
                        ),
                0
            );

        const { error: orderError } =
            await supabase
                .from("orders")
                .update({
                    total,
                    price: total,
                    items_count: itemsCount,
                })
                .eq("id", orderId);

        if (orderError) throw orderError;

        return true;
    } catch (error) {
        console.error(
            "❌ Recalcul commande :",
            error
        );

        showAlert(
            "Erreur",
            "Impossible de recalculer le total de la commande."
        );

        return false;
    }
};

const deleteOrderItem = async (orderItem) => {
    openConfirm(
        "Supprimer cet article",
        `Supprimer "${orderItem.product}" ?`,
        async () => {
            try {
                const { error } = await supabase
                    .from("order_items")
                    .delete()
                    .eq("id", orderItem.id);

                if (error) throw error;
                await recalculateOrderSummary(
                    orderItem.order_id
                );
                await loadOrders();

                showAlert("Article supprimé");
            } catch (err) {
                console.error(err);

                showAlert(
                    "Erreur",
                    "Impossible de supprimer cet article."
                );
            }
        },
        "Supprimer"
    );
};

    const toggleExpand = (id) => {
        setExpandedOrders((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const openImageModal = (url) => {
        setImageModalUrl(url);
        setImageModalVisible(true);
    };

    const fmtMoney = (v) => {
        const n = Number(String(v ?? "0").replace(",", "."));
        const safe = Number.isFinite(n) ? n : 0;
        return safe.toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const TableHeader = () => (
        <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colProduit]}>Produit</Text>
            <Text style={[styles.th, styles.colQty]}>Qté</Text>
            <Text style={[styles.th, styles.colUnit]}>PU</Text>
            <Text style={[styles.th, styles.colTotal]}>Total</Text>
            <Text style={[styles.th, styles.colDeposit]}>Acompte</Text>
            <Text style={[styles.th, styles.colRemaining]}>Reste</Text>
            <Text style={[styles.th, styles.colPaid]}>Payé</Text>
        </View>
    );

    const renderKV = (label, value, strong = false) => (
        <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>{label}</Text>
            <Text style={[styles.kvValue, strong && styles.kvStrong]}>
                {value}
            </Text>
        </View>
    );

    const tinyStatus = (item) => {
        const out = [];
        if (item.ordered) out.push("Passée");
        if (item.received) out.push("Reçue");
		if (item.installed) out.push("Montée");
        if (item.recovered) out.push("Récupérée");
        if (item.saved) out.push("Sauvegardée");
        return out.join(" • ");
    };

    return (
		  <SafeAreaView style={styles.safeArea}>
    <StatusBar barStyle="dark-content" backgroundColor="#e6e6e6" />

        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.header}>
                    {clientName
                        ? `Commandes pour : ${clientName}`
                        : `Commandes`}
                </Text>

                <View style={styles.headerActions}>
                    <Text style={styles.headerDivider}>|</Text>
                    <TouchableOpacity
                        onPress={() => setShowForm((prev) => !prev)}
                    >
                        <Text style={styles.headerActionText}>
                            {showForm ? "Fermer" : "Nouvelle commande"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Formulaire rapide */}
            {showForm && (
                <View style={styles.formContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Produit"
                        placeholderTextColor="#000"
                        value={newOrder.product}
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, product: t })
                        }
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Marque"
                        placeholderTextColor="#000"
                        value={newOrder.brand}
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, brand: t })
                        }
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Modèle"
                        placeholderTextColor="#000"
                        value={newOrder.model}
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, model: t })
                        }
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Fournisseur"
                        placeholderTextColor="#000"
                        value={newOrder.fournisseur}
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, fournisseur: t })
                        }
                    />

                    <View style={styles.qtyRow}>
                        <TextInput
                            style={[
                                styles.input,
                                { flex: 1.2, marginBottom: 0, marginRight: 6 },
                            ]}
                            placeholder="Prix d'achat (€)"
                            placeholderTextColor="#000"
                            keyboardType="numeric"
                            value={newOrder.purchasePrice}
                            onChangeText={(t) => {
                                const estimate = computeEstimatedSalePrice(
                                    t,
                                    newOrder.marginPercent
                                );
                                if (estimate != null) {
                                    setNewOrder({
                                        ...newOrder,
                                        purchasePrice: t,
                                        price: estimate.toFixed(2),
                                    });
                                    return;
                                }
                                // Pas de marge saisie : si un prix unitaire existe déjà,
                                // en déduire la marge correspondante.
                                const margin = computeMarginFromPrices(
                                    t,
                                    newOrder.price
                                );
                                setNewOrder({
                                    ...newOrder,
                                    purchasePrice: t,
                                    ...(margin != null
                                        ? { marginPercent: margin.toFixed(2) }
                                        : {}),
                                });
                            }}
                        />
                        <TextInput
                            style={[
                                styles.input,
                                { width: 70, marginBottom: 0, marginRight: 6 },
                            ]}
                            placeholder="% marge"
                            placeholderTextColor="#000"
                            keyboardType="numeric"
                            value={newOrder.marginPercent}
                            onChangeText={(t) => {
                                const estimate = computeEstimatedSalePrice(
                                    newOrder.purchasePrice,
                                    t
                                );
                                setNewOrder({
                                    ...newOrder,
                                    marginPercent: t,
                                    ...(estimate != null
                                        ? { price: estimate.toFixed(2) }
                                        : {}),
                                });
                            }}
                        />
                        <View
                            style={[
                                styles.input,
                                {
                                    flex: 1.2,
                                    marginBottom: 0,
                                    justifyContent: "center",
                                    backgroundColor: "#eef2ff",
                                },
                            ]}
                        >
                            <Text style={{ color: "#111", fontSize: 12 }}>
                                {estimatedSalePrice != null
                                    ? `≈ ${estimatedSalePrice.toFixed(2)} €`
                                    : "Prix estimé"}
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.checkboxRow}
                        onPress={() =>
                            setNewOrder((o) => ({
                                ...o,
                                include_in_intervention:
                                    !o.include_in_intervention,
                            }))
                        }
                    >
                        <View
                            style={[
                                styles.checkbox,
                                newOrder.include_in_intervention &&
                                    styles.checkboxChecked,
                            ]}
                        >
                            {newOrder.include_in_intervention && (
                                <Text style={styles.checkboxMark}>✓</Text>
                            )}
                        </View>
                        <Text style={styles.checkboxLabel}>
                            Coût inclus dans l’intervention
                        </Text>
                    </TouchableOpacity>

                    <TextInput
                        style={[
                            styles.input,
                            newOrder.include_in_intervention &&
                                styles.inputDisabled,
                        ]}
                        placeholder="Prix unitaire (€)"
                        placeholderTextColor="#000"
                        keyboardType="numeric"
                        value={
                            newOrder.include_in_intervention
                                ? ""
                                : newOrder.price
                        }
                        onChangeText={(t) => {
                            // Si un prix d'achat est déjà saisi, en déduire la marge
                            // correspondante (et donc le prix estimé, aligné dessus).
                            const margin = computeMarginFromPrices(
                                newOrder.purchasePrice,
                                t
                            );
                            setNewOrder({
                                ...newOrder,
                                price: t,
                                ...(margin != null
                                    ? { marginPercent: margin.toFixed(2) }
                                    : {}),
                            });
                        }}
                        editable={!newOrder.include_in_intervention}
                    />

                    <View style={styles.qtyRow}>
                        <TouchableOpacity
                            style={[
                                styles.qtyButton,
                                newOrder.include_in_intervention &&
                                    styles.buttonDisabled,
                            ]}
                            onPress={() => {
                                if (newOrder.include_in_intervention) return;
                                const n = Math.max(
                                    1,
                                    (parseInt(newOrder.quantity || "1", 10) ||
                                        1) - 1
                                );
                                setNewOrder({
                                    ...newOrder,
                                    quantity: String(n),
                                });
                            }}
                            disabled={newOrder.include_in_intervention}
                        >
                            <Text style={styles.qtyButtonText}>−</Text>
                        </TouchableOpacity>

                        <TextInput
                            style={[
                                styles.input,
                                { flex: 1, marginBottom: 0 },
                                newOrder.include_in_intervention &&
                                    styles.inputDisabled,
                            ]}
                            placeholder="Quantité"
                            placeholderTextColor="#000"
                            keyboardType="numeric"
                            inputMode="numeric"
                            value={
                                newOrder.include_in_intervention
                                    ? ""
                                    : newOrder.quantity
                            }
                            onChangeText={(t) => {
                                const clean = (t ?? "").replace(/[^0-9]/g, "");
                                setNewOrder({ ...newOrder, quantity: clean });
                            }}
                            editable={!newOrder.include_in_intervention}
                        />

                        <TouchableOpacity
                            style={[
                                styles.qtyButton,
                                newOrder.include_in_intervention &&
                                    styles.buttonDisabled,
                            ]}
                            onPress={() => {
                                if (newOrder.include_in_intervention) return;
                                const n = Math.max(
                                    1,
                                    (parseInt(newOrder.quantity || "1", 10) ||
                                        1) + 1
                                );
                                setNewOrder({
                                    ...newOrder,
                                    quantity: String(n),
                                });
                            }}
                            disabled={newOrder.include_in_intervention}
                        >
                            <Text style={styles.qtyButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.formHint}>
                        Total provisoire :{" "}
                        {(() => {
                            if (newOrder.include_in_intervention) return "0,00";
                            const u =
                                parseFloat(
                                    (newOrder.price || "0").replace(",", ".")
                                ) || 0;
                            const q = Math.max(
                                1,
                                parseInt(newOrder.quantity || "1", 10) || 1
                            );
                            return fmtMoney(u * q);
                        })()}{" "}
                        €
                    </Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Acompte (€)"
                        placeholderTextColor="#000"
                        keyboardType="numeric"
                        value={newOrder.deposit}
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, deposit: t })
                        }
                    />
{newOrderItems.length > 0 && (
    <View
        style={{
            marginTop: 15,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 8,
            backgroundColor: "#fafafa",
            padding: 10,
        }}
    >
        <Text
            style={{
                fontWeight: "bold",
                fontSize: 16,
                marginBottom: 10,
            }}
        >
            Produits de la commande
        </Text>

        {newOrderItems.map((item) => (
            <View
                key={item.localId}
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                }}
            >
                <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600" }}>
                        {item.product}
                    </Text>

                    <Text
                        style={{
                            color: "#666",
                            fontSize: 13,
                        }}
                    >
                        {item.quantity} × {fmtMoney(item.unit_price)} €
                    </Text>
                    {item.fournisseur ? (
                        <Text
                            style={{
                                color: "#888",
                                fontSize: 12,
                                fontStyle: "italic",
                            }}
                        >
                            Fournisseur : {item.fournisseur}
                        </Text>
                    ) : null}
                </View>

                <Text
                    style={{
                        width: 80,
                        textAlign: "right",
                        fontWeight: "bold",
                    }}
                >
                    {fmtMoney(item.total)} €
                </Text>

                <TouchableOpacity
                    onPress={() =>
                        setNewOrderItems((previous) =>
                            previous.filter(
                                (p) =>
                                    p.localId !==
                                    item.localId
                            )
                        )
                    }
                >
                    <Text
                        style={{
                            color: "red",
                            marginLeft: 12,
                            fontWeight: "bold",
                        }}
                    >
                        ✕
                    </Text>
                </TouchableOpacity>
            </View>
        ))}

        <View
            style={{
                borderTopWidth: 1,
                borderTopColor: "#ddd",
                marginTop: 10,
                paddingTop: 10,
            }}
        >
            <Text
                style={{
                    fontWeight: "bold",
                    textAlign: "right",
                }}
            >
                Total :
                {" "}
                {fmtMoney(
                    newOrderItems.reduce(
                        (sum, item) =>
                            sum + item.total,
                        0
                    )
                )} €
            </Text>
        </View>
    </View>
)}
                    <View style={{ alignItems: "center" }}>
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={handleAddProductToOrder}
                        >
<Text style={styles.addButtonText}>
    {editingOrderItem
        ? "Modifier le produit"
        : "Ajouter le produit"}
</Text>
                        </TouchableOpacity>
						<TouchableOpacity
    style={[
        styles.addButton,
        {
            marginTop: 10,
            backgroundColor: "#16a34a",
        },
    ]}
	activeOpacity={0.8}
    onPress={handleCreateOrder}
>
    <Text style={styles.addButtonText}>
        Valider la commande
    </Text>
</TouchableOpacity>
                    </View>
                </View>
            )}

            {/* ✅ Header tableau hors FlatList (plus stable) */}
            {orders.length > 0 && <TableHeader />}

            <FlatList
                ref={listRef}
                data={orders}
                extraData={{
                    expandedOrders,
                    editingIds,
                    editMap,
                    uploadingOrderId,
                }}
                keyExtractor={(item) => item.id.toString()}
                ListEmptyComponent={
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>Aucune commande</Text>
                    </View>
                }
                contentContainerStyle={{ paddingBottom: 50 }}
                renderItem={({ item, index }) => {
                    const isExpanded = expandedOrders.includes(item.id);
					const orderItems = item.order_items || [];
					const itemsQuantityCount = orderItems.reduce(
    (sum, orderItem) =>
        sum + Math.max(
            1,
            Number(orderItem.quantity || 1)
        ),
    0
);
                    const paths = readPhotoPathsFromRow(item);
                    const urls = paths
                        .map(getPublicUrlFromPath)
                        .filter(Boolean);

                    const qty = item.quantity || 1;
                    const unit = item.price || 0;
                    const total = item.total ?? unit * qty;
                    const isIncluded = !!item.include_in_intervention;

                    const remaining = isIncluded
                        ? 0
                        : Math.max(0, total - (item.deposit || 0));

                    const editing = isEditing(item.id);
                    const editVals = editMap[item.id] || {};

                    const rowBg =
                        index % 2 === 0 ? styles.rowEven : styles.rowOdd;

                    return (
                        <View style={styles.orderCard}>
                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => toggleExpand(item.id)}
                            >
                                <View style={[styles.tableRow, rowBg]}>
                                    <View style={styles.colProduit}>
                                        <Text
                                            style={styles.rowTitle}
                                            numberOfLines={1}
                                        >
                                            {itemsQuantityCount > 1
    ? `${itemsQuantityCount} produits`
    : (orderItems[0]?.product || item.product || "-")}
                                        </Text>
                                        <Text
    style={styles.rowSub}
    numberOfLines={1}
>
    {orderItems.length > 1
        ? item.order_name || "Commande multi-produits"
        : [
              orderItems[0]?.brand || item.brand,
              orderItems[0]?.model || item.model,
          ]
              .filter(Boolean)
              .join(" ") || " "}
</Text>
                                        {!!tinyStatus(item) && (
                                            <Text
                                                style={styles.rowStatus}
                                                numberOfLines={1}
                                            >
                                                {tinyStatus(item)}
                                            </Text>
                                        )}
                                    </View>

                                    <Text
                                        style={[styles.rowText, styles.colQty]}
                                    >
                                        {isIncluded ? "—" : qty}
                                    </Text>
                                    <Text
                                        style={[styles.rowText, styles.colUnit]}
                                    >
                                        {isIncluded
                                            ? "—"
                                            : `${fmtMoney(unit)} €`}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.rowText,
                                            styles.colTotal,
                                        ]}
                                    >
                                        {isIncluded
                                            ? "Inclus"
                                            : `${fmtMoney(total)} €`}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.rowText,
                                            styles.colDeposit,
                                        ]}
                                    >
                                        {fmtMoney(item.deposit)} €
                                    </Text>
                                    <Text
                                        style={[
                                            styles.rowText,
                                            styles.colRemaining,
                                            item.paid
                                                ? styles.greenText
                                                : styles.redText,
                                        ]}
                                    >
                                        {isIncluded
                                            ? "0,00 €"
                                            : `${fmtMoney(remaining)} €`}
                                    </Text>
                                    <Text
                                        style={[styles.rowText, styles.colPaid]}
                                    >
                                        {item.paid ? "Oui" : "Non"}
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            {(!item.saved || isExpanded) && (
                                <View style={styles.expandArea}>
                                    {!editing ? (
                                        <>
										{orderItems.length > 0 && (
    <View
        style={{
            marginBottom: 12,
            padding: 10,
            borderWidth: 1,
            borderColor: "#d1d5db",
            borderRadius: 8,
            backgroundColor: "#f8fafc",
        }}
    >
        <Text
            style={{
                marginBottom: 8,
                fontSize: 15,
                fontWeight: "bold",
                color: "#1f2937",
            }}
        >
            Produits de la commande
        </Text>

        {orderItems.map((orderItem) => (
            <View
                key={orderItem.id}
                style={{
                    marginBottom: 7,
                    paddingBottom: 7,
                    borderBottomWidth: 1,
                    borderBottomColor: "#e5e7eb",
                }}
            >
<View
    style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    }}
>
    <Text
        style={{
            fontSize: 14,
            fontWeight: "700",
            color: "#111827",
            flex: 1,
        }}
    >
        {orderItem.quantity || 1} ×{" "}
        {orderItem.product}
    </Text>

<View
    style={{
        flexDirection: "row",
        alignItems: "center",
    }}
>
    <TouchableOpacity
        onPress={() =>
            editOrderItem(orderItem)
        }
    >
        <Text
            style={{
                color: "#2563eb",
                fontSize: 18,
                marginRight: 12,
            }}
        >
            ✏️
        </Text>
    </TouchableOpacity>

    <TouchableOpacity
        onPress={() =>
            deleteOrderItem(orderItem)
        }
    >
        <Text
            style={{
                color: "#dc2626",
                fontSize: 18,
                fontWeight: "bold",
            }}
        >
            🗑️
        </Text>
    </TouchableOpacity>
</View>
</View>

                <Text
                    style={{
                        marginTop: 2,
                        fontSize: 12,
                        color: "#64748b",
                    }}
                >
                    {[
                        orderItem.brand,
                        orderItem.model,
                    ]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    {" · "}
                    {fmtMoney(
                        Number(
                            orderItem.unit_price || 0
                        ) *
                            Number(
                                orderItem.quantity || 1
                            )
                    )} €
                </Text>
                {orderItem.fournisseur ? (
                    <Text
                        style={{
                            marginTop: 2,
                            fontSize: 12,
                            color: "#8b5cf6",
                            fontStyle: "italic",
                        }}
                    >
                        Fournisseur : {orderItem.fournisseur}
                    </Text>
                ) : null}
				<View
				style={{
					flexDirection: "row",
					marginTop: 6,
					gap: 8,
					flexWrap: "wrap",
				}}
			>
				<TouchableOpacity
					activeOpacity={0.75}
					onPress={() =>
						toggleOrderItemOrdered(orderItem)
					}
				>
					<Text
						style={{
							color: orderItem.ordered
								? "#16a34a"
								: "#9ca3af",
							fontSize: 12,
							fontWeight: "600",
						}}
					>
						{orderItem.ordered ? "✅" : "⬜"} Commandée
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					activeOpacity={0.75}
					onPress={() =>
						toggleOrderItemReceived(orderItem)
					}
				>
					<Text
						style={{
							color: orderItem.received
								? "#16a34a"
								: "#9ca3af",
							fontSize: 12,
							fontWeight: "600",
						}}
					>
						{orderItem.received ? "✅" : "⬜"} Reçue
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					activeOpacity={0.75}
					onPress={() =>
						toggleOrderItemInstalled(orderItem)
					}
				>
					<Text
						style={{
							color: orderItem.installed
								? "#16a34a"
								: "#9ca3af",
							fontSize: 12,
							fontWeight: "600",
						}}
					>
						{orderItem.installed ? "✅" : "⬜"} Montée
					</Text>
				</TouchableOpacity>
			</View>
						</View>
					))}
				</View>
			)}
                                            <View style={styles.kvBlock}>

                                                {renderKV(
                                                    "N° de série",
                                                    item.serial || "-"
                                                )}
                                                {renderKV(
                                                    "Prix unitaire",
                                                    isIncluded
                                                        ? "—"
                                                        : `${fmtMoney(unit)} €`
                                                )}
                                                {renderKV(
                                                    "Quantité",
                                                    isIncluded
                                                        ? "—"
                                                        : String(qty)
                                                )}
                                                {renderKV(
                                                    "Total",
                                                    isIncluded
                                                        ? "0,00 € (inclus)"
                                                        : `${fmtMoney(
                                                              total
                                                          )} €`,
                                                    true
                                                )}
                                                {renderKV(
                                                    "Acompte",
                                                    `${fmtMoney(
                                                        item.deposit
                                                    )} €`
                                                )}
                                                {renderKV(
                                                    "Montant restant dû",
                                                    isIncluded
                                                        ? "0,00 € (inclus)"
                                                        : `${fmtMoney(
                                                              remaining
                                                          )} €`,
                                                    true
                                                )}

                                                {item.paid_at &&
                                                    renderKV(
                                                        "Payée le",
                                                        new Date(
                                                            item.paid_at
                                                        ).toLocaleDateString()
                                                    )}

                                                {renderKV(
                                                    "Créée le",
                                                    new Date(
                                                        item.createdat ||
                                                            item.created_at ||
                                                            Date.now()
                                                    ).toLocaleDateString()
                                                )}

                                                {renderKV(
                                                    "Commande passée",
                                                    item.ordered ? "Oui" : "Non"
                                                )}
                                                {renderKV(
                                                    "Commande reçue",
                                                    item.received
                                                        ? "Oui"
                                                        : "Non"
                                                )}
                                                {renderKV(
                                                    "Récupérée client",
                                                    item.recovered
                                                        ? "Oui"
                                                        : "Non"
                                                )}
                                                {renderKV(
                                                    "Notifiée",
                                                    item.notified
                                                        ? "Oui"
                                                        : "Non"
                                                )}
                                                {renderKV(
                                                    "Sauvegardée",
                                                    item.saved ? "Oui" : "Non"
                                                )}
                                            </View>

                                            {!item.saved && (
                                                <TouchableOpacity
                                                    style={styles.editButton}
                                                    onPress={() => {
                                                        // Ouvre le formulaire complet (produit, fournisseur,
                                                        // prix d'achat, marge...) sur le premier article de
                                                        // la commande — équivalent au crayon ✎, en plus
                                                        // simple à cliquer. Ancien formulaire conservé en
                                                        // repli pour les commandes sans article détaillé.
                                                        const firstItem =
                                                            item.order_items?.[0];
                                                        if (firstItem) {
                                                            editOrderItem(
                                                                firstItem
                                                            );
                                                        } else {
                                                            startEdit(item);
                                                        }
                                                    }}
                                                >
                                                    <Text
                                                        style={
                                                            styles.editButtonText
                                                        }
                                                    >
                                                        Modifier
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </>
                                    ) : (
                                        <View style={styles.editBlock}>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="Produit"
                                                placeholderTextColor="#000"
                                                value={editVals.product}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "product",
                                                        t
                                                    )
                                                }
                                            />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="Marque"
                                                placeholderTextColor="#000"
                                                value={editVals.brand}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "brand",
                                                        t
                                                    )
                                                }
                                            />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="Modèle"
                                                placeholderTextColor="#000"
                                                value={editVals.model}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "model",
                                                        t
                                                    )
                                                }
                                            />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="N° de série"
                                                placeholderTextColor="#000"
                                                value={editVals.serial}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "serial",
                                                        t
                                                    )
                                                }
                                            />

                                            <TouchableOpacity
                                                style={styles.checkboxRow}
                                                onPress={() =>
                                                    updateEditField(
                                                        item.id,
                                                        "include_in_intervention",
                                                        !editVals.include_in_intervention
                                                    )
                                                }
                                            >
                                                <View
                                                    style={[
                                                        styles.checkbox,
                                                        editVals.include_in_intervention &&
                                                            styles.checkboxChecked,
                                                    ]}
                                                >
                                                    {editVals.include_in_intervention && (
                                                        <Text
                                                            style={
                                                                styles.checkboxMark
                                                            }
                                                        >
                                                            ✓
                                                        </Text>
                                                    )}
                                                </View>
                                                <Text
                                                    style={styles.checkboxLabel}
                                                >
                                                    Coût inclus dans
                                                    l’intervention
                                                </Text>
                                            </TouchableOpacity>

                                            <TextInput
                                                style={[
                                                    styles.input,
                                                    editVals.include_in_intervention &&
                                                        styles.inputDisabled,
                                                ]}
                                                placeholder="Prix unitaire (€)"
                                                placeholderTextColor="#000"
                                                keyboardType="numeric"
                                                inputMode="decimal"
                                                value={
                                                    editVals.include_in_intervention
                                                        ? ""
                                                        : editVals.price
                                                }
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "price",
                                                        t.replace(
                                                            /[^0-9.,]/g,
                                                            ""
                                                        )
                                                    )
                                                }
                                                editable={
                                                    !editVals.include_in_intervention
                                                }
                                            />

                                            <View style={styles.qtyRow}>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.qtyButton,
                                                        editVals.include_in_intervention &&
                                                            styles.buttonDisabled,
                                                    ]}
                                                    onPress={() =>
                                                        changeQty(item.id, -1)
                                                    }
                                                    disabled={
                                                        editVals.include_in_intervention
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.qtyButtonText
                                                        }
                                                    >
                                                        −
                                                    </Text>
                                                </TouchableOpacity>
                                                <TextInput
                                                    style={[
                                                        styles.input,
                                                        {
                                                            flex: 1,
                                                            marginBottom: 0,
                                                        },
                                                        editVals.include_in_intervention &&
                                                            styles.inputDisabled,
                                                    ]}
                                                    placeholder="Quantité"
                                                    placeholderTextColor="#000"
                                                    keyboardType="numeric"
                                                    inputMode="numeric"
                                                    value={
                                                        editVals.include_in_intervention
                                                            ? ""
                                                            : editVals.quantity
                                                    }
                                                    onChangeText={(t) =>
                                                        updateEditField(
                                                            item.id,
                                                            "quantity",
                                                            (t ?? "").replace(
                                                                /[^0-9]/g,
                                                                ""
                                                            )
                                                        )
                                                    }
                                                    editable={
                                                        !editVals.include_in_intervention
                                                    }
                                                />
                                                <TouchableOpacity
                                                    style={[
                                                        styles.qtyButton,
                                                        editVals.include_in_intervention &&
                                                            styles.buttonDisabled,
                                                    ]}
                                                    onPress={() =>
                                                        changeQty(item.id, +1)
                                                    }
                                                    disabled={
                                                        editVals.include_in_intervention
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.qtyButtonText
                                                        }
                                                    >
                                                        +
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>

                                            <TextInput
                                                style={styles.input}
                                                placeholder="Acompte (€)"
                                                placeholderTextColor="#000"
                                                keyboardType="numeric"
                                                inputMode="decimal"
                                                value={editVals.deposit}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "deposit",
                                                        t.replace(
                                                            /[^0-9.,]/g,
                                                            ""
                                                        )
                                                    )
                                                }
                                            />

                                            <View
                                                style={{
                                                    flexDirection: "row",
                                                    justifyContent:
                                                        "space-between",
                                                }}
                                            >
                                                <TouchableOpacity
                                                    style={
                                                        styles.saveEditButton
                                                    }
                                                    onPress={() =>
                                                        saveEdit(item.id)
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.saveEditText
                                                        }
                                                    >
                                                        Enregistrer
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={
                                                        styles.cancelEditButton
                                                    }
                                                    onPress={() =>
                                                        cancelEdit(item.id)
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.cancelEditText
                                                        }
                                                    >
                                                        Annuler
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}

                                    {urls.length > 0 && (
                                        <View style={styles.thumbGrid}>
                                            {urls.map((u, idx) => (
                                                <Pressable
                                                    key={idx}
                                                    onPress={() =>
                                                        openImageModal(u)
                                                    }
                                                    onLongPress={() =>
                                                        openConfirm(
                                                            "Supprimer la photo",
                                                            "Voulez-vous supprimer cette photo ?",
                                                            () =>
                                                                deleteOnePhoto(
                                                                    item,
                                                                    paths[idx]
                                                                ),
                                                            "Supprimer"
                                                        )
                                                    }
                                                >
                                                    <Image
                                                        source={{ uri: u }}
                                                        style={styles.thumb}
                                                    />
                                                </Pressable>
                                            ))}
                                        </View>
                                    )}

                                    <View style={styles.actionsRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                uploadingOrderId ===
                                                    item.id && { opacity: 0.6 },
                                            ]}
                                            onPress={() => showOrderPhotoChoices(item)}
                                            disabled={
                                                uploadingOrderId === item.id
                                            }
                                        >
                                            {uploadingOrderId === item.id ? (
                                                <ActivityIndicator />
                                            ) : (
                                                <Text
                                                    style={
                                                        styles.squareButtonText
                                                    }
                                                >
                                                    Ajouter photo
                                                </Text>
                                            )}
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.squareButton}
                                            onPress={() => {
                                                navigation.navigate(
                                                    "CommandePreviewPage",
                                                    {
                                                        order: {
                                                            id: item.id,
                                                            client: {
                                                                id: clientId,
                                                                name: clientName,
                                                                ficheNumber:
                                                                    clientNumber,
                                                            },
                                                            deviceType:
                                                                item.product,
                                                            brand: item.brand,
                                                            model: item.model,
                                                            quantity:
                                                                item.quantity,
                                                            price: isIncluded
                                                                ? 0
                                                                : item.price,
                                                            total: isIncluded
                                                                ? 0
                                                                : item.total,
                                                            acompte:
                                                                item.deposit,
                                                            signatureclient:
                                                                item.signatureclient,
                                                            printed:
                                                                item.printed,
                                                        },
                                                    }
                                                );
                                            }}
                                        >
                                            <Text
                                                style={styles.squareButtonText}
                                            >
                                                Imprimer
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.ordered &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            onPress={() =>
                                                !item.ordered &&
                                                handleMarkAsOrdered(item)
                                            }
                                            disabled={item.ordered}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.ordered &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.ordered
                                                    ? "Commande passée"
                                                    : "Marquer passée"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.received &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            onPress={() =>
                                                !item.received &&
                                                handleMarkAsReceived(item)
                                            }
                                            disabled={item.received}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.received &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.received
                                                    ? "Commande reçue"
                                                    : "Marquer reçue"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.paid &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            onPress={() =>
                                                !item.paid &&
                                                handleMarkAsPaid(item)
                                            }
                                            disabled={item.paid}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.paid &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.paid
                                                    ? "Payée"
                                                    : "Marquer payée"}
                                            </Text>
                                        </TouchableOpacity>

                                        {(item.billing?.length ?? 0) === 0 ? (
                                            <TouchableOpacity
                                                style={[
                                                    styles.squareButton,
                                                    isIncluded &&
                                                        styles.squareButtonDisabled,
                                                ]}
                                                onPress={() =>
                                                    !isIncluded &&
                                                    navigation.navigate(
                                                        "BillingPage",
                                                        {
                                                            expressData: {
                                                                order_id:
                                                                    item.id,
                                                                clientname:
                                                                    clientName,
                                                                clientphone:
                                                                    clientPhone,
                                                                product:
                                                                    item.product,
                                                                brand: item.brand,
                                                                model: item.model,
                                                                price: String(
                                                                    item.total ??
                                                                        (item.price ||
                                                                            0) *
                                                                            (item.quantity ||
                                                                                1)
                                                                ),
                                                                quantity:
                                                                    String(
                                                                        item.quantity ||
                                                                            1
                                                                    ),
                                                                description: `${item.product} ${item.brand} ${item.model}`,
                                                                acompte:
                                                                    item.deposit?.toString() ||
                                                                    "0",
                                                                paymentmethod:
                                                                    item.paymentmethod ||
                                                                    "",
                                                                serial:
                                                                    item.serial ||
                                                                    "",
                                                                paid:
                                                                    item.paid ||
                                                                    false,
                                                            },
                                                        }
                                                    )
                                                }
                                                disabled={isIncluded}
                                            >
                                                <Text
                                                    style={[
                                                        styles.squareButtonText,
                                                        isIncluded &&
                                                            styles.squareButtonTextDisabled,
                                                    ]}
                                                >
                                                    {isIncluded
                                                        ? "Inclus (pas de facture)"
                                                        : "Créer facture"}
                                                </Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <View
                                                style={
                                                    styles.squareButtonDisabled
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.squareButtonText
                                                    }
                                                >
                                                    Facture créée
                                                </Text>
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.recovered &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            onPress={() =>
                                                !item.recovered &&
                                                handleMarkAsRecovered(item)
                                            }
                                            disabled={item.recovered}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.recovered &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.recovered
                                                    ? "Récupérée"
                                                    : "Marquer récupérée"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.saved &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            disabled={item.saved}
                                            onPress={() =>
                                                handleSaveOrder(item)
                                            }
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.saved &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.saved
                                                    ? "Sauvegardée"
                                                    : "Sauvegarder"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                !item.received &&
                                                    styles.squareButtonDisabled,
                                                item.notified &&
                                                    item.received && {
                                                        backgroundColor: "#16a34a",
                                                    },
                                            ]}
                                            disabled={!item.received}
                                            onPress={() =>
                                                openConfirm(
                                                    item.notified
                                                        ? "Renvoyer la notification"
                                                        : "Notifier le client",
                                                    item.notified
                                                        ? "Le client a déjà été notifié pour cette commande. Envoyer un nouveau SMS ?"
                                                        : "Envoyer un SMS pour prévenir le client que sa commande est prête ?",
                                                    () => notifyOrderBySMS(item),
                                                    "Envoyer"
                                                )
                                            }
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    !item.received &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.notified
                                                    ? "Renotifier"
                                                    : "Notifier"}
                                            </Text>
                                        </TouchableOpacity>
<TouchableOpacity
  style={[
    styles.squareButton,
    {
      backgroundColor: "#b91c1c",
      borderColor: "#7f1d1d",
    },
  ]}
  onPress={() => handleCancelOrder(item)}
  activeOpacity={0.8}
>
  <Text
    style={[
      styles.squareButtonText,
      { color: "#ffffff" },
    ]}
  >
    Annuler commande
  </Text>
</TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.squareButton}
                                            onPress={() =>
                                                handleDeleteOrder(item)
                                            }
                                        >
                                            <Text
                                                style={styles.squareButtonText}
                                            >
                                                Supprimer
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.squareButton}
                                            onPress={() => navigation.goBack()}
                                        >
                                            <Text
                                                style={styles.squareButtonText}
                                            >
                                                Retour
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {item.saved && !isExpanded && (
                                <TouchableOpacity
                                    style={styles.openRowButton}
                                    onPress={() => toggleExpand(item.id)}
                                >
                                    <Text style={styles.openRowButtonText}>
                                        Ouvrir
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                }}
            />

            {/* Modal zoom image plein écran */}
            <Modal
                visible={imageModalVisible}
                animationType="fade"
                transparent={false}
                presentationStyle="fullScreen"
                statusBarTranslucent={true}
                onRequestClose={() => setImageModalVisible(false)}
            >
                <Pressable
                    style={styles.fullscreenContainer}
                    onPress={() => setImageModalVisible(false)}
                >
                    {imageModalUrl && (
                        <Image
                            source={{ uri: imageModalUrl }}
                            style={styles.fullscreenImage}
                            resizeMode="contain"
                        />
                    )}
                    <View style={styles.fullscreenClose}>
                        <Text style={styles.fullscreenCloseText}>✕</Text>
                    </View>
                </Pressable>
            </Modal>

            <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                onClose={() => setAlertVisible(false)}
            />

            <AlertBox
                visible={confirmDialog.visible}
                title={confirmDialog.title}
                message={confirmDialog.message}
                cancelText="Annuler"
                confirmText={confirmDialog.confirmText || "Confirmer"}
                onClose={closeConfirm}
                onConfirm={() => {
                    closeConfirm();
                    if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                }}
            />

            {/* Choix de la source d'une photo de commande */}
            <Modal
                visible={!!photoChoiceOrder}
                transparent
                animationType="fade"
                onRequestClose={() => setPhotoChoiceOrder(null)}
            >
                <Pressable
                    style={styles.photoChoiceOverlay}
                    onPress={() => setPhotoChoiceOrder(null)}
                >
                    <Pressable style={styles.photoChoiceCard} onPress={() => {}}>
                        <Text style={styles.photoChoiceTitle}>Ajouter une image</Text>
                        <Text style={styles.photoChoiceSubtitle}>
                            Choisissez la source de l’image.
                        </Text>

                        {[
                            {
                                label: "📷 Appareil photo",
                                onPress: () => takeAndUploadOrderPhoto(photoChoiceOrder),
                            },
                            {
                                label: "🖼️ Galerie",
                                onPress: () => pickAndUploadOrderPhoto(photoChoiceOrder),
                            },
                            {
                                label: "🔍 Recherche web",
                                onPress: () => openWebImageSearch(photoChoiceOrder),
                            },
                        ].map((option) => (
                            <TouchableOpacity
                                key={option.label}
                                style={styles.photoChoiceOption}
                                activeOpacity={0.75}
                                onPress={() => {
                                    setPhotoChoiceOrder(null);
                                    option.onPress();
                                }}
                            >
                                <Text style={styles.photoChoiceOptionText}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                            style={styles.photoChoiceCancel}
                            activeOpacity={0.75}
                            onPress={() => setPhotoChoiceOrder(null)}
                        >
                            <Text style={styles.photoChoiceCancelText}>Annuler</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Rappel fournisseur manquant */}
            <Modal
                visible={!!fournisseurReminder}
                transparent
                animationType="fade"
                onRequestClose={() => setFournisseurReminder(null)}
            >
                <Pressable
                    style={styles.photoChoiceOverlay}
                    onPress={() => setFournisseurReminder(null)}
                >
                    <Pressable style={styles.photoChoiceCard} onPress={() => {}}>
                        <Text style={styles.photoChoiceTitle}>Fournisseur manquant</Text>
                        <Text style={styles.photoChoiceSubtitle}>
                            {`Non renseigné pour : ${(
                                fournisseurReminder?.missingItems || []
                            )
                                .map((it) => it.product)
                                .filter(Boolean)
                                .join(", ")}`}
                        </Text>

                        <TouchableOpacity
                            style={styles.photoChoiceOption}
                            activeOpacity={0.75}
                            onPress={() => {
                                const target =
                                    fournisseurReminder?.missingItems?.[0];
                                setFournisseurReminder(null);
                                if (target) editOrderItem(target);
                            }}
                        >
                            <Text style={styles.photoChoiceOptionText}>
                                ✏️ Renseigner le fournisseur
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.photoChoiceOption}
                            activeOpacity={0.75}
                            onPress={() => {
                                const target = fournisseurReminder?.ord;
                                setFournisseurReminder(null);
                                if (target) confirmMarkAsOrdered(target);
                            }}
                        >
                            <Text style={styles.photoChoiceOptionText}>
                                ✅ Confirmer quand même
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.photoChoiceCancel}
                            activeOpacity={0.75}
                            onPress={() => setFournisseurReminder(null)}
                        >
                            <Text style={styles.photoChoiceCancelText}>Annuler</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Proposition de facturation après récupération d'une commande */}
            <AlertBox
                visible={!!invoicePromptOrder}
                title="Facturer maintenant ?"
                message="La commande vient d’être marquée récupérée. Voulez-vous créer la facture pour ce client maintenant ?"
                cancelText="Plus tard"
                confirmText="Facturer"
                onClose={() => setInvoicePromptOrder(null)}
                onConfirm={() => {
                    const item = invoicePromptOrder;
                    setInvoicePromptOrder(null);
                    navigation.navigate("BillingPage", {
                        expressData: {
                            order_id: item.id,
                            clientname: clientName,
                            clientphone: clientPhone,
                            product: item.product,
                            brand: item.brand,
                            model: item.model,
                            price: String(
                                item.total ?? (item.price || 0) * (item.quantity || 1)
                            ),
                            quantity: String(item.quantity || 1),
                            description: `${item.product} ${item.brand} ${item.model}`,
                            acompte: item.deposit?.toString() || "0",
                            paymentmethod: item.paymentmethod || "",
                            serial: item.serial || "",
                            paid: item.paid || false,
                        },
                    });
                }}
            />
        </View>
		</SafeAreaView>
    );
}

const styles = StyleSheet.create({
	safeArea: {
  flex: 1,
  backgroundColor: "#e6e6e6",
  paddingTop: StatusBar.currentHeight || 0, // évite que le haut passe sous la barre Android
},

    photoChoiceOverlay: {
        flex: 1,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
    },
    photoChoiceCard: {
        width: 340,
        maxWidth: "100%",
        backgroundColor: "#fff",
        borderRadius: 24,
        padding: 22,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    photoChoiceTitle: {
        fontSize: 19,
        fontWeight: "700",
        color: "#111827",
        textAlign: "center",
        marginBottom: 4,
    },
    photoChoiceSubtitle: {
        fontSize: 13,
        color: "#6b7280",
        textAlign: "center",
        marginBottom: 16,
    },
    photoChoiceOption: {
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: "#F3F4F6",
        alignItems: "center",
        marginBottom: 10,
    },
    photoChoiceOptionText: {
        fontSize: 15,
        fontWeight: "700",
        color: "#111827",
    },
    photoChoiceCancel: {
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
        marginTop: 4,
    },
    photoChoiceCancelText: {
        fontSize: 15,
        fontWeight: "700",
        color: "#dc2626",
    },

    container: { flex: 1, padding: 12, backgroundColor: "#e6e6e6" },
    header: {
        fontSize: 16,
        fontWeight: "800",
        color: "#1f2937",
        marginBottom: 8,
    },

    formContainer: { marginBottom: 12 },
    input: {
        borderWidth: 1,
        borderColor: "#b6b6b6",
        padding: 10,
        marginBottom: 10,
        borderRadius: 8,
        backgroundColor: "#f7f7f7",
        width: "92%",
        alignSelf: "center",
        color: "#111",
    },
    inputDisabled: { opacity: 0.5 },

    qtyRow: {
        flexDirection: "row",
        alignItems: "center",
        width: "92%",
        alignSelf: "center",
        marginBottom: 8,
    },
    qtyButton: {
        width: 44,
        height: 44,
        backgroundColor: "#111827",
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        marginHorizontal: 4,
    },
    qtyButtonText: { color: "#fff", fontSize: 18, fontWeight: "900" },
    buttonDisabled: { backgroundColor: "#9ca3af" },

    formHint: {
        width: "92%",
        alignSelf: "center",
        fontSize: 12,
        color: "#374151",
        marginBottom: 6,
        fontWeight: "700",
    },

    addButton: {
        width: "70%",
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: "center",
        backgroundColor: "#111827",
    },
    addButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },

    checkboxRow: {
        width: "92%",
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "#111827",
        backgroundColor: "#f7f7f7",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
    },
    checkboxChecked: { backgroundColor: "#111827" },
    checkboxMark: { color: "#fff", fontWeight: "900" },
    checkboxLabel: { color: "#111", fontSize: 14, fontWeight: "700" },

    tableHeader: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#111827",
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: 8,
        marginBottom: 6,
    },
    th: {
        color: "#fff",
        fontWeight: "900",
        fontSize: 11,
        textTransform: "uppercase",
    },

    orderCard: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#c5c5c5",
        marginBottom: 8,
        overflow: "hidden",
        backgroundColor: "#f2f2f2",
    },
    tableRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 6,
    },
    rowEven: { backgroundColor: "#f5f5f5" },
    rowOdd: { backgroundColor: "#ededed" },

    colProduit: { flex: 3.2, paddingRight: 6 },
    colQty: { flex: 0.7, textAlign: "center" },
    colUnit: { flex: 1.1, textAlign: "right" },
    colTotal: { flex: 1.2, textAlign: "right" },
    colDeposit: { flex: 1.2, textAlign: "right" },
    colRemaining: { flex: 1.2, textAlign: "right" },
    colPaid: { flex: 0.8, textAlign: "center" },

    rowTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
    rowSub: { fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 2 },
    rowStatus: {
        fontSize: 11,
        fontWeight: "700",
        color: "#6b7280",
        marginTop: 2,
    },
    rowText: { fontSize: 12, fontWeight: "900", color: "#111" },

    greenText: { color: "#0a7a2e" },
    redText: { color: "#b91c1c" },

    expandArea: {
        backgroundColor: "#ffffff",
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: "#d9d9d9",
    },
    kvBlock: {
        backgroundColor: "#fff",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 8,
        marginBottom: 10,
    },
    kvRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    kvLabel: { fontSize: 13, color: "#374151", fontWeight: "800" },
    kvValue: { fontSize: 13, color: "#111", fontWeight: "800" },
    kvStrong: { fontWeight: "900" },

    editButton: {
        alignSelf: "flex-end",
        backgroundColor: "#111827",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 6,
    },
    editButtonText: { color: "#fff", fontWeight: "900" },
    editBlock: { marginTop: 6 },

    saveEditButton: {
        backgroundColor: "#111827",
        paddingVertical: 9,
        borderRadius: 8,
        flex: 1,
        marginRight: 6,
        alignItems: "center",
    },
    cancelEditButton: {
        backgroundColor: "#9ca3af",
        paddingVertical: 9,
        borderRadius: 8,
        flex: 1,
        marginLeft: 6,
        alignItems: "center",
    },
    saveEditText: { color: "#fff", fontWeight: "900" },
    cancelEditText: { color: "#fff", fontWeight: "900" },

    thumbGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
    thumb: {
        width: 90,
        height: 90,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#d1d1d1",
        marginRight: 8,
        marginBottom: 8,
    },

    actionsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        marginTop: 6,
    },
    squareButton: {
        width: "30%",
        paddingVertical: 10,
        backgroundColor: "#111827",
        borderRadius: 8,
        marginVertical: 6,
        alignItems: "center",
        justifyContent: "center",
    },
    squareButtonText: {
        color: "#fff",
        fontWeight: "900",
        textAlign: "center",
        fontSize: 12,
    },
    squareButtonDisabled: {
        width: "30%",
        backgroundColor: "#d1d5db",
        borderRadius: 8,
        marginVertical: 6,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
    },
    squareButtonTextDisabled: { color: "#6b7280" },

    openRowButton: {
        alignSelf: "flex-end",
        marginRight: 10,
        marginBottom: 10,
        backgroundColor: "#111827",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 6,
    },
    openRowButtonText: { color: "#fff", fontWeight: "900", fontSize: 12 },

    emptyBox: { padding: 20, alignItems: "center" },
    emptyText: { color: "#374151", fontWeight: "800" },

    fullscreenContainer: {
        flex: 1,
        backgroundColor: "#0f172a",
        justifyContent: "center",
        alignItems: "center",
    },
    fullscreenImage: { width: "100%", height: "100%" },
    fullscreenClose: {
        position: "absolute",
        top: 48,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(255, 255, 255, 0.15)",
        alignItems: "center",
        justifyContent: "center",
    },
    fullscreenCloseText: { color: "#fff", fontWeight: "700", fontSize: 18 },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
    },
    headerDivider: {
        marginHorizontal: 6,
        color: "#4b5563",
        fontWeight: "900",
        fontSize: 14,
    },
    headerActionText: {
        color: "#111827",
        fontWeight: "900",
        fontSize: 13,
    },
	
});
