import React, { useState, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, SafeAreaView, Switch } from "react-native";
import { WebView } from "react-native-webview";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";

export default function CommandePreviewPage({ route }) {
  const navigation = useNavigation();
  const { order } = route.params || {};
  const client = order?.client || {};
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  // Détail par article (commande issue d'un devis, ou commande multi-articles)
  const [orderItems, setOrderItems] = useState([]);

  useEffect(() => {
    const loadOrderItems = async () => {
      if (!order?.id) return;
      const { data, error } = await supabase
        .from("order_items")
        .select("product, brand, model, quantity, unit_price, position")
        .eq("order_id", order.id)
        .order("position", { ascending: true });

      if (!error && Array.isArray(data)) {
        setOrderItems(data);
      }
    };
    loadOrderItems();
  }, [order?.id]);

  // ===== Utilitaires =====
  const sanitizeNumber = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    const s = String(v).replace(/[^0-9.,-]/g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };
  const formatMontant = (valeur) => {
    const n = Number(valeur || 0);
    const fixed = n.toFixed(2);
    const [int, dec] = fixed.split(".");
    const intSpaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${intSpaced},${dec} €`;
  };

  // ===== Quantité / Prix unitaire / Total (robustes) =====
  const qty = useMemo(() => {
    const q = parseInt(order?.quantity ?? order?.qty ?? 1, 10);
    return Number.isFinite(q) && q > 0 ? q : 1;
  }, [order?.quantity, order?.qty]);

  const unitFromProps = useMemo(() => sanitizeNumber(order?.price ?? order?.unitPrice), [order?.price, order?.unitPrice]);
  const totalFromProps = useMemo(() => sanitizeNumber(order?.total ?? order?.cost), [order?.total, order?.cost]);

  // Règle:
  // 1) si prix unitaire fourni → total = unit * qty
  // 2) sinon si total fourni → unit = total / qty
  const unit = useMemo(() => {
    if (unitFromProps > 0) return unitFromProps;
    if (totalFromProps > 0) return totalFromProps / qty;
    return 0;
  }, [unitFromProps, totalFromProps, qty]);

  const total = useMemo(() => {
    if (unitFromProps > 0) return unitFromProps * qty;
    if (totalFromProps > 0) return totalFromProps;
    return 0;
  }, [unitFromProps, totalFromProps, qty]);

  const acompte = useMemo(() => sanitizeNumber(order?.acompte ?? order?.deposit), [order?.acompte, order?.deposit]);
  const reste = useMemo(() => Math.max(0, total - acompte), [total, acompte]);

  // Client professionnel : affiche le détail HT/TVA (prix stockés en TTC, TVA 20%)
  const [isCompanyClient, setIsCompanyClient] = useState(false);
  const TVA_RATE = 0.2;
  const totalHT = useMemo(() => total / (1 + TVA_RATE), [total]);
  const totalTVA = useMemo(() => total - totalHT, [total, totalHT]);

  const [isPrinted, setIsPrinted] = useState(order?.printed || false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const buildReceiptHtml = () => {
    const dateDuJour = new Date().toLocaleDateString("fr-FR");

    const itemsRowsHtml =
      orderItems.length > 0
        ? orderItems
            .map((it) => {
              const itQty = Number(it.quantity) || 1;
              const itUnit = sanitizeNumber(it.unit_price);
              const designation =
                [it.product, it.brand, it.model].filter(Boolean).join(" ") ||
                "—";
              return `<tr>
                    <td>${designation}</td>
                    <td class="right">${itQty}</td>
                    <td class="right">${formatMontant(itUnit)}</td>
                    <td class="right">${formatMontant(itUnit * itQty)}</td>
                  </tr>`;
            })
            .join("")
        : `<tr>
                    <td>${[order?.deviceType, order?.brand, order?.model].filter(Boolean).join(" ")}</td>
                    <td class="right">${qty}</td>
                    <td class="right">${formatMontant(unit)}</td>
                    <td class="right">${formatMontant(total)}</td>
                  </tr>`;

    const htmlContent = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            @page { size: A5; margin: 12mm; }
            body { font-family: Arial, sans-serif; font-size: 12px; color: #333; }
            .container { padding: 4px; }
            h1 { text-align: center; color: #222; font-size: 18px; margin: 6px 0 10px; }
            .header { text-align: center; margin-bottom: 8px; }
            .company-name { font-size: 14px; font-weight: bold; color: #252525; }
            .company-details { font-size: 10px; color: #555; line-height: 1.3; }
            .row { display: flex; gap: 10px; }
            .col { flex: 1; }
            .section { margin-bottom: 8px; border: 1px solid #ccc; padding: 8px; border-radius: 6px; }
            .section-title { font-size: 13px; font-weight: bold; margin-bottom: 6px; }
            .field { margin-bottom: 4px; display: flex; }
            .label { font-weight: bold; width: 100px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
            th { background: #f2f2f2; }
            .right { text-align: right; }
            .signature { margin-top: 8px; }
            .signature img { margin-top: 6px; max-width: 180px; height: auto; border: 1px solid #ddd; border-radius: 4px; }
            .footer-note { text-align: center; font-size: 10px; margin-top: 8px; color: #777; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="company-name">AVENIR INFORMATIQUE</div>
              <div class="company-details">
                16 place de l'Hôtel de Ville – 93700 Drancy<br/>
                Tél. : 01 41 60 18 18
              </div>
            </div>

            <h1>Bon de Commande</h1>

            <div class="section">
              <div class="section-title">Client</div>
              <div class="field"><div class="label">Nom :</div><div>${client.name || ""}</div></div>
              <div class="field"><div class="label">Fiche n° :</div><div>${client.ficheNumber || ""}</div></div>
              <div class="field"><div class="label">Date :</div><div>${dateDuJour}</div></div>
            </div>

            <div class="section">
              <table>
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th class="right">Qté</th>
                    <th class="right">Prix unit.</th>
                    <th class="right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRowsHtml}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="row">
                <div class="col">
                  ${
                    isCompanyClient
                      ? `<div class="field"><div class="label">Total HT :</div><div>${formatMontant(totalHT)}</div></div>
                  <div class="field"><div class="label">TVA (20%) :</div><div>${formatMontant(totalTVA)}</div></div>
                  <div class="field"><div class="label">Total TTC :</div><div>${formatMontant(total)}</div></div>`
                      : ""
                  }
                  <div class="field"><div class="label">Acompte :</div><div>${formatMontant(acompte)}</div></div>
                  <div class="field"><div class="label">Reste à payer :</div><div><strong>${formatMontant(reste)}</strong></div></div>
                </div>
                <div class="col signature">
                  <div><strong>Signature du client :</strong></div>
                  <p style="margin-top:20px;">___________________________</p>
                </div>
              </div>
            </div>

            <div class="footer-note">Merci de votre confiance.</div>
          </div>
        </body>
      </html>
    `;

    return htmlContent;
  };

  const handlePreview = () => {
    setPreviewVisible(true);
  };

  const handlePrint = async () => {
    try {
      await Print.printAsync({ html: buildReceiptHtml() });
      const { error } = await supabase.from("orders").update({ printed: true }).eq("id", order.id);
      if (!error) setIsPrinted(true);
    } catch (e) {
      console.error("❌ Impression:", e);
      showAlert("Erreur", "Impossible d'imprimer ce document.");
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconBubble}>
          <Ionicons name="receipt-outline" size={22} color="#ffffff" />
        </View>
        <View>
          <Text style={styles.title}>Aperçu de la commande</Text>
          {!!client.ficheNumber && (
            <Text style={styles.headerSubtitle}>Fiche N° {client.ficheNumber}</Text>
          )}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Client</Text>
        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={16} color="#4f46e5" />
          <Text style={styles.infoText}>{client.name || "—"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="pricetag-outline" size={16} color="#4f46e5" />
          <Text style={styles.infoText}>Fiche N° {client.ficheNumber || "—"}</Text>
        </View>
        <View style={styles.companyToggleRow}>
          <Text style={styles.companyToggleLabel}>
            Client professionnel (afficher le prix HT)
          </Text>
          <Switch
            value={isCompanyClient}
            onValueChange={setIsCompanyClient}
            trackColor={{ false: "#e2e8f0", true: "#c7d2fe" }}
            thumbColor={isCompanyClient ? "#4f46e5" : "#f4f3f4"}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Articles</Text>
        {orderItems.length > 0 ? (
          orderItems.map((it, index) => {
            const itQty = Number(it.quantity) || 1;
            const itUnit = sanitizeNumber(it.unit_price);
            const designation =
              [it.product, it.brand, it.model].filter(Boolean).join(" ") || "—";
            return (
              <View
                key={`${it.product}-${index}`}
                style={[styles.itemRow, index > 0 && styles.itemRowDivider]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{designation}</Text>
                  <Text style={styles.itemMeta}>
                    Qté {itQty} × {formatMontant(itUnit)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>{formatMontant(itUnit * itQty)}</Text>
              </View>
            );
          })
        ) : (
          <View style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>
                {[order?.deviceType, order?.brand, order?.model]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </Text>
              <Text style={styles.itemMeta}>
                Qté {qty} × {formatMontant(unit)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{formatMontant(total)}</Text>
          </View>
        )}
      </View>

      <View style={styles.summaryCard}>
        {isCompanyClient && (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total HT</Text>
              <Text style={styles.summaryValue}>{formatMontant(totalHT)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>TVA (20%)</Text>
              <Text style={styles.summaryValue}>{formatMontant(totalTVA)}</Text>
            </View>
          </>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>
            {isCompanyClient ? "Total TTC" : "Total"}
          </Text>
          <Text style={styles.summaryValue}>{formatMontant(total)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Acompte versé</Text>
          <Text style={styles.summaryValue}>{formatMontant(acompte)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabelStrong}>Reste à payer</Text>
          <Text style={styles.summaryValueStrong}>{formatMontant(reste)}</Text>
        </View>
      </View>

      {isPrinted && (
        <View style={styles.printedBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
          <Text style={styles.printedBadgeText}>Commande imprimée</Text>
        </View>
      )}

      <TouchableOpacity style={styles.previewButton} onPress={handlePreview} activeOpacity={0.85}>
        <Ionicons name="eye-outline" size={18} color="#4f46e5" />
        <Text style={styles.previewButtonText}>Prévisualiser</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.printButton} onPress={handlePrint} activeOpacity={0.85}>
        <Ionicons name="print-outline" size={18} color="#ffffff" />
        <Text style={styles.printButtonText}>Imprimer la commande</Text>
      </TouchableOpacity>

      <BackButton onPress={() => navigation.goBack()} style={{ marginTop: 16, marginBottom: 24 }} />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />

      <Modal
        visible={previewVisible}
        animationType="slide"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <SafeAreaView style={styles.previewModal}>
          <View style={styles.previewModalHeader}>
            <Text style={styles.previewModalTitle}>Aperçu du bon de commande</Text>
            <TouchableOpacity
              style={styles.previewCloseButton}
              onPress={() => setPreviewVisible(false)}
            >
              <Ionicons name="close" size={22} color="#1e1b4b" />
            </TouchableOpacity>
          </View>
          <WebView
            originWhitelist={["*"]}
            source={{ html: buildReceiptHtml() }}
            style={{ flex: 1 }}
          />
          <TouchableOpacity
            style={[styles.printButton, styles.previewModalPrintButton]}
            onPress={() => {
              setPreviewVisible(false);
              handlePrint();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="print-outline" size={18} color="#ffffff" />
            <Text style={styles.printButtonText}>Imprimer la commande</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#eef2ff",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  headerIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#4f46e5",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1e1b4b",
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6366f1",
    marginTop: 2,
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#312e81",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4f46e5",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 15,
    color: "#1e293b",
    fontWeight: "600",
  },

  companyToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#eef2ff",
  },
  companyToggleLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginRight: 10,
  },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  itemRowDivider: {
    borderTopWidth: 1,
    borderTopColor: "#eef2ff",
  },
  itemName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e293b",
  },
  itemMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: "800",
    color: "#4f46e5",
  },

  summaryCard: {
    backgroundColor: "#312e81",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#c7d2fe",
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "700",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginVertical: 8,
  },
  summaryLabelStrong: {
    fontSize: 16,
    color: "#ffffff",
    fontWeight: "800",
  },
  summaryValueStrong: {
    fontSize: 18,
    color: "#4ade80",
    fontWeight: "800",
  },

  printedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#16a34a",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  printedBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },

  printButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#4f46e5",
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 8,
  },
  printButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },

  previewButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#eef2ff",
    borderWidth: 1.5,
    borderColor: "#c7d2fe",
    paddingVertical: 13,
    borderRadius: 16,
    marginTop: 8,
  },
  previewButtonText: {
    color: "#4f46e5",
    fontSize: 16,
    fontWeight: "800",
  },

  previewModal: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  previewModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e7ff",
  },
  previewModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1e1b4b",
  },
  previewCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eef2ff",
    justifyContent: "center",
    alignItems: "center",
  },
  previewModalPrintButton: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
});