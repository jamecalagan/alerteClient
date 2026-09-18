import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    TextInput,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import * as Print from "expo-print";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";
import { commonStyles } from "../themes/modernTheme";

const BillingEditPage = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { id } = route.params || {};
    const [designationHeights, setDesignationHeights] = useState({});

    const [invoice, setInvoice] = useState(null);
    const [isSaved, setIsSaved] = useState(false);

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState("");
    const [alertMessage, setAlertMessage] = useState("");
    const [alertOnClose, setAlertOnClose] = useState(null);
    const showAlert = (title, message, onCloseAction = null) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertOnClose(() => onCloseAction);
        setAlertVisible(true);
    };
    useEffect(() => {
        if (id) fetchInvoice();
    }, [id]);

const fetchInvoice = async () => {
    const { data, error } = await supabase
        .from("billing")
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
        showAlert("Erreur", "Erreur de chargement");
    } else {
        // 🔐 Sécurité sur les lignes
        const safeLines = Array.isArray(data.lines)
            ? data.lines.map((line) => ({
                  designation: line?.designation || "",
                  quantity: line?.quantity?.toString() || "1",
                  // ⚠️ certaines anciennes factures (commandes) stockent le
                  // prix sous la clé "unit_price" au lieu de "price"
                  price:
                      line?.price?.toString() ||
                      line?.unit_price?.toString() ||
                      "",
                  serial: line?.serial || "",
              }))
            : [
                  {
                      designation: "",
                      quantity: "1",
                      price: "",
                      serial: "",
                  },
              ];

        setInvoice({ ...data, lines: safeLines });
        setIsSaved(true);
    }
};


    const recalculateTotals = (updatedLines) => {
        const totalttc = updatedLines.reduce(
            (total, line) =>
                total +
                parseFloat(line.quantity || 0) * parseFloat(line.price || 0),
            0
        );
        const tvaRate = 0.2;
        const totalht = totalttc / (1 + tvaRate);
        const totaltva = totalttc - totalht;
        return { totalttc, totalht, totaltva };
    };

    const updateInvoice = async () => {
        const { error } = await supabase
            .from("billing")
            .update(invoice)
            .eq("id", id);

        if (error) {
            showAlert("Erreur", "Erreur de sauvegarde");
        } else {
            // Garde le statut "Soldée/Non soldée" de la fiche express aligné
            // sur le statut payé de la facture liée.
            if (invoice.express_id) {
                const { error: expressPaidError } = await supabase
                    .from("express")
                    .update({ paid: invoice.paid })
                    .eq("id", invoice.express_id);
                if (expressPaidError) {
                    console.warn(
                        "⚠️ Erreur synchronisation statut payé express :",
                        expressPaidError
                    );
                }
            }

            setIsSaved(true);
            showAlert("Succès", "Facture mise à jour.", () => {
                navigation.navigate("BillingListPage");
            });

            // 🔁 Mettre à jour l'acompte dans la commande liée si serial et client_id sont connus
            const serial = invoice.lines?.[0]?.serial;
            const clientname = invoice.clientname;

            if (serial && clientname) {
                const { data: clientData, error: clientError } = await supabase
                    .from("clients")
                    .select("id")
                    .eq("name", clientname)
                    .maybeSingle();

                if (clientData?.id) {
                    const { error: orderUpdateError } = await supabase
                        .from("orders")
                        .update({ deposit: parseFloat(invoice.acompte || 0) })
                        .eq("client_id", clientData.id)
                        .eq("serial", serial);

                    if (orderUpdateError) {
                        console.warn(
                            "⚠️ Erreur mise à jour acompte commande :",
                            orderUpdateError
                        );
                    } else {
                        console.log("🔄 Acompte mis à jour dans orders");
                    }
                }
            }
        }
    };

    const handlePrint = async () => {
        if (!invoice) return;

        const n2p = (x) => (Number.isFinite(x) ? x.toFixed(2) : "0.00");

        const totalhtLocal = invoice.totalht || 0;
        const totaltvaLocal = invoice.totaltva || 0;
        const totalttcLocal = invoice.totalttc || 0;
        const acompteN = parseFloat(invoice.acompte || 0) || 0;
        const netToPay = Math.max(0, totalttcLocal - acompteN);
        const stamp = invoice.paid
            ? `<div class="stamp paid">FACTURE RÉGLÉE</div>`
            : `<div class="stamp unpaid">FACTURE NON RÉGLÉE</div>`;

        let rows = invoice.lines
            .map((line) => {
                const q = parseFloat(String(line.quantity).replace(",", ".")) || 0;
                const unitTTC = parseFloat(String(line.price).replace(",", ".")) || 0;
                const unitHT = unitTTC / 1.2;
                const lineTTC = q * unitTTC;
                return `
            <tr>
              <td class="td desc">
                ${String(line.designation || "").replace(/</g, "&lt;")}
                ${
                    line.serial
                        ? `<div class="serial">SN : ${String(line.serial).replace(
                              /</g,
                              "&lt;"
                          )}</div>`
                        : ""
                }
              </td>
              <td class="td num c">${n2p(q)}</td>
              <td class="td num r">${n2p(unitHT)} €</td>
              <td class="td num r">${n2p(lineTTC)} €</td>
            </tr>
          `;
            })
            .join("");

        // Lignes vides pour combler l'espace en bas de page (esthétique)
        const MIN_ROWS = 12;
        const fillerCount = Math.max(0, MIN_ROWS - invoice.lines.length);
        if (fillerCount > 0) {
            rows += `<tr>${Array(4)
                .fill('<td class="td">&nbsp;</td>')
                .join("")}</tr>`.repeat(fillerCount);
        }

        const html = `
  <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: Arial, Helvetica, sans-serif; color:#000; font-size: 12px; }
        .wrap { max-width: 780px; margin: 0 auto; }

        .header { text-align: center; margin-bottom: 12px; }
        .header img { height: 56px; }
        .title { font-size: 20px; font-weight: 700; margin: 6px 0 12px 0; letter-spacing: 1px; }

        .meta { display:flex; gap: 12px; margin: 0 0 16px 0; }
        .card { border:1px solid #000; border-radius:6px; padding:10px 12px; flex:1; }
        .card h3 { margin:0 0 8px 0; font-size:13px; }
        .card p { margin:2px 0; }

        table { width:100%; border-collapse: collapse; }
        .th, .td { border:1px solid #000; padding:8px; }
        thead .th { background:#e5e5e5; font-weight:bold; }
        .desc { width:100%; }
        .serial { font-size:10px; color:#555; margin-top:4px; }
        .num { white-space: nowrap; }
        .c { text-align:center; }
        .r { text-align:right; }

        .totals { margin-top: 12px; display:flex; justify-content:flex-end; }
        .totals table { width: 360px; border-collapse: collapse; font-size: 12px; }
        .totals td { border:1px solid #000; padding:8px; }
        .totals .label { background:#f7f7f7; }

        .net { margin-top: 8px; text-align: right; font-size: 14px; font-weight: bold; padding: 10px 0; }

        .stamp { display:inline-block; padding:6px 10px; border:2px solid; font-weight:700; letter-spacing:1px; margin-left:10px; }
        .paid { color:#2e7d32; border-color:#2e7d32; }
        .unpaid { color:#c62828; border-color:#c62828; }

        .footer {
          position: fixed;
          left: 0; right: 0; bottom: 10mm;
          text-align: center;
          font-size: 10px; color:#444; line-height: 1.4;
        }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="header">
          <img src="https://www.avenir-informatique.fr/logo.webp" alt="Avenir Informatique" />
          <div class="title">FACTURE</div>
        </div>

        <div class="meta">
          <div class="card">
            <h3>Client</h3>
            <p><strong>${invoice.clientname}</strong></p>
            <p>Téléphone : ${invoice.clientphone}</p>
            <p>Adresse : ${invoice.client_address || "—"}</p>
          </div>
          <div class="card">
            <h3>Détails</h3>
            <p>Numéro : <strong>${invoice.invoicenumber}</strong></p>
            <p>Date : ${invoice.invoicedate}</p>
            <p>Mode de paiement : ${invoice.paymentmethod || "—"}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="th desc">Désignation</th>
              <th class="th c" style="width:90px;">Qté</th>
              <th class="th r" style="width:120px;">P.U. HT</th>
              <th class="th r" style="width:140px;">Montant TTC</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="totals">
          <table>
            <tr>
              <td class="label">Total HT</td>
              <td class="r"><strong>${n2p(totalhtLocal)} €</strong></td>
            </tr>
            <tr>
              <td class="label">TVA (20%)</td>
              <td class="r">${n2p(totaltvaLocal)} €</td>
            </tr>
            <tr>
              <td class="label">Total TTC</td>
              <td class="r"><strong>${n2p(totalttcLocal)} €</strong></td>
            </tr>
            ${
                acompteN > 0
                    ? `
            <tr>
              <td class="label">Acompte versé</td>
              <td class="r">-${n2p(acompteN)} €</td>
            </tr>`
                    : ""
            }
          </table>
        </div>

        <div class="net">
          Net à payer : ${n2p(netToPay)} €
          ${stamp}
        </div>
      </div>

      <div class="footer">
        <strong>AVENIR INFORMATIQUE</strong> — 16, place de l'Hôtel de Ville, 93700 Drancy — Tél : 01 41 60 18 18 — SIRET : 422 240 457 00016<br/>
        RCS Bobigny B422 240 457 — N° TVA intracommunautaire : FR32422240457<br/>
        Clause de réserve de propriété : les marchandises restent la propriété du vendeur jusqu'au paiement intégral.<br/>
        En cas de litige, le tribunal de Bobigny est seul compétent.
      </div>
    </body>
  </html>`;

        await Print.printAsync({ html });
    };

    if (!invoice) {
        return (
            <>
                <Text style={{ padding: 20 }}>Chargement...</Text>
                <CustomAlert
                    visible={alertVisible}
                    title={alertTitle}
                    message={alertMessage}
                    onClose={() => {
                        setAlertVisible(false);
                        if (alertOnClose) alertOnClose();
                    }}
                />
            </>
        );
    }

    return (
        <>
        <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
            <Text style={styles.title}>🧾 Modifier la facture</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Client</Text>

                <Text style={styles.fieldLabel}>Nom du client</Text>
                <TextInput
                    style={styles.input}
                    value={invoice.clientname}
                    onChangeText={(text) => {
                        setInvoice({ ...invoice, clientname: text });
                        setIsSaved(false);
                    }}
                />

                <View style={styles.cardRow}>
                    <View style={styles.cardField}>
                        <Text style={styles.fieldLabel}>Téléphone</Text>
                        <TextInput
                            style={styles.input}
                            value={invoice.clientphone}
                            onChangeText={(text) => {
                                setInvoice({ ...invoice, clientphone: text });
                                setIsSaved(false);
                            }}
                        />
                    </View>

                    <View style={styles.cardField}>
                        <Text style={styles.fieldLabel}>Adresse</Text>
                        <TextInput
                            style={styles.input}
                            value={invoice.client_address}
                            onChangeText={(text) => {
                                setInvoice({ ...invoice, client_address: text });
                                setIsSaved(false);
                            }}
                        />
                    </View>
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Règlement</Text>

                <View style={styles.cardRow}>
                    <View style={styles.cardField}>
                        <Text style={styles.fieldLabel}>Acompte (€)</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            value={invoice.acompte?.toString() || ""}
                            onChangeText={(text) => {
                                setInvoice({ ...invoice, acompte: text });
                                setIsSaved(false);
                            }}
                        />
                    </View>

                    <View style={styles.cardField}>
                        <Text style={styles.fieldLabel}>Mode de paiement</Text>
                        <TextInput
                            style={styles.input}
                            value={invoice.paymentmethod}
                            onChangeText={(text) => {
                                setInvoice({ ...invoice, paymentmethod: text });
                                setIsSaved(false);
                            }}
                        />
                    </View>
                </View>

                <View style={styles.paidRow}>
                    <Text style={styles.paidLabel}>État du règlement</Text>
                    <TouchableOpacity
                        onPress={() => {
                            setInvoice({ ...invoice, paid: !invoice.paid });
                            setIsSaved(false);
                        }}
                        style={[
                            styles.paidPill,
                            invoice.paid ? styles.paidPillOn : styles.paidPillOff,
                        ]}
                    >
                        <Text
                            style={[
                                styles.paidPillText,
                                invoice.paid
                                    ? styles.paidPillTextOn
                                    : styles.paidPillTextOff,
                            ]}
                        >
                            {invoice.paid ? "Payée" : "Non payée"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.card}>
                <View style={styles.cardSectionHeaderRow}>
                    <Text style={styles.cardTitle}>Prestations</Text>
                    <TouchableOpacity
                        style={styles.addMiniButton}
                        onPress={() => {
                            setInvoice({
                                ...invoice,
                                lines: [
                                    ...invoice.lines,
                                    {
                                        designation: "",
                                        quantity: "1",
                                        price: "",
                                        serial: "",
                                    },
                                ],
                            });
                            setIsSaved(false);
                        }}
                    >
                        <Text style={styles.addMiniButtonText}>➕ Ligne</Text>
                    </TouchableOpacity>
                </View>

                {invoice?.lines?.map((line, index) => {
                    if (!line) return null;

                    return (
                        <View key={index} style={styles.lineCard}>
                            <Text style={styles.smallLabel}>Désignation</Text>
                            <TextInput
                                multiline
                                value={line.designation}
                                onContentSizeChange={(e) => {
                                    const height = e.nativeEvent.contentSize.height;
                                    setDesignationHeights((prev) => ({ ...prev, [index]: height }));
                                }}
                                style={[
                                    styles.input,
                                    {
                                        textAlignVertical: "top",
                                        minHeight: 44,
                                        height: designationHeights[index] || 44,
                                    },
                                ]}
                                onChangeText={(text) => {
                                    const newLines = [...invoice.lines];
                                    newLines[index].designation = text;
                                    const { totalttc, totalht, totaltva } = recalculateTotals(newLines);
                                    setInvoice({ ...invoice, lines: newLines, totalttc, totalht, totaltva });
                                    setIsSaved(false);
                                }}
                            />

                            <View style={styles.lineInputsRow}>
                                <View style={styles.lineInputBlock}>
                                    <Text style={styles.smallLabel}>Qté</Text>
                                    <TextInput
                                        style={[styles.input, { textAlign: "center" }]}
                                        keyboardType="numeric"
                                        value={line.quantity}
                                        onChangeText={(text) => {
                                            const newLines = [...invoice.lines];
                                            newLines[index].quantity = text;
                                            const { totalttc, totalht, totaltva } = recalculateTotals(newLines);
                                            setInvoice({ ...invoice, lines: newLines, totalttc, totalht, totaltva });
                                            setIsSaved(false);
                                        }}
                                    />
                                </View>

                                <View style={styles.lineInputBlock}>
                                    <Text style={styles.smallLabel}>P.U. TTC</Text>
                                    <TextInput
                                        style={[styles.input, { textAlign: "center" }]}
                                        keyboardType="numeric"
                                        value={line.price}
                                        onChangeText={(text) => {
                                            const newLines = [...invoice.lines];
                                            newLines[index].price = text;
                                            const { totalttc, totalht, totaltva } = recalculateTotals(newLines);
                                            setInvoice({ ...invoice, lines: newLines, totalttc, totalht, totaltva });
                                            setIsSaved(false);
                                        }}
                                    />
                                </View>

                                <View style={[styles.lineInputBlock, { flex: 2 }]}>
                                    <Text style={styles.smallLabel}>N° de série</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={line.serial || ""}
                                        onChangeText={(text) => {
                                            const newLines = [...invoice.lines];
                                            newLines[index].serial = text;
                                            setInvoice({ ...invoice, lines: newLines });
                                            setIsSaved(false);
                                        }}
                                    />
                                </View>
                            </View>
                        </View>
                    );
                })}
            </View>

            <View style={styles.actionsGrid}>
                <TouchableOpacity
                    style={[styles.gridBtn, styles.gridBtnPrimary]}
                    onPress={() => {
                        updateInvoice();
                        setIsSaved(true);
                    }}
                >
                    <Text style={[styles.gridBtnText, styles.gridBtnTextPrimary]}>
                        💾 Sauvegarder
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.gridBtn,
                        isSaved ? styles.gridBtnSuccess : styles.gridBtnDisabled,
                    ]}
                    disabled={!isSaved}
                    onPress={handlePrint}
                >
                    <Text
                        style={[
                            styles.gridBtnText,
                            isSaved
                                ? styles.gridBtnTextSuccess
                                : styles.gridBtnTextDisabled,
                        ]}
                    >
                        🖨️ Réimprimer
                    </Text>
                </TouchableOpacity>

                <BackButton onPress={() => navigation.goBack()} />
            </View>
        </ScrollView>

        <CustomAlert
            visible={alertVisible}
            title={alertTitle}
            message={alertMessage}
            onClose={() => {
                setAlertVisible(false);
                if (alertOnClose) alertOnClose();
            }}
        />
        </>
    );
};

const styles = StyleSheet.create({
    ...commonStyles,

    // Surcharges "pastel indigo" propres à cette page (le thème partagé
    // commonStyles reste inchangé pour ne pas impacter les autres pages qui
    // l'utilisent : BillingPage, QuoteEditPage, SearchClientsPage...).
    screen: { flex: 1, backgroundColor: "#eef2ff" },
    container: {
        padding: 14,
        paddingTop: 14 + (StatusBar.currentHeight || 0),
        backgroundColor: "#eef2ff",
    },

    card: {
        backgroundColor: "#ffffff",
        borderRadius: 16,
        padding: 12,
        marginTop: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: "#e0e7ff",
        shadowColor: "#312e81",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: "#312e81",
        marginBottom: 4,
    },

    input: {
        borderWidth: 1.5,
        borderColor: "#c7d2fe",
        paddingVertical: 8,
        paddingHorizontal: 10,
        marginBottom: 6,
        borderRadius: 12,
        backgroundColor: "#ffffff",
        fontSize: 15,
        color: "#0f172a",
    },
    inputFocused: { borderColor: "#4f46e5", backgroundColor: "#ffffff" },

    addMiniButton: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "#e0e7ff",
        borderWidth: 1,
        borderColor: "#c7d2fe",
    },
    addMiniButtonText: {
        fontSize: 12,
        fontWeight: "700",
        color: "#3730a3",
    },

    gridBtnPrimary: { backgroundColor: "#e0e7ff", borderColor: "#c7d2fe" },
    gridBtnSuccess: { backgroundColor: "#d1fae5", borderColor: "#6ee7b7" },
    gridBtnDisabled: { backgroundColor: "#f1f5f9", borderColor: "#e2e8f0" },
    gridBtn: {
        width: "48%",
        minHeight: 34,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 6,
        marginBottom: 6,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1.5,
        backgroundColor: "#f1f5f9",
        borderColor: "#e2e8f0",
    },
    gridBtnText: {
        color: "#3730a3",
        fontSize: 12,
        fontWeight: "700",
        textAlign: "center",
    },
    gridBtnTextDisabled: { color: "#94a3b8" },
    gridBtnTextPrimary: { color: "#3730a3" },
    gridBtnTextSuccess: { color: "#065f46" },

    cardSectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 4,
    },

    lineCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e0e7ff",
        backgroundColor: "#eef2ff",
        padding: 8,
        marginBottom: 8,
    },
    smallLabel: {
        fontSize: 11,
        color: "#6b7280",
        marginBottom: 2,
        marginTop: 4,
    },
    lineInputsRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
    },
    lineInputBlock: { flex: 1 },

    paidRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 8,
    },
    paidLabel: {
        fontWeight: "700",
        fontSize: 13,
        color: "#4b5563",
    },
    paidPill: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
    },
    paidPillOn: {
        backgroundColor: "#dcfce7",
        borderColor: "#16a34a",
    },
    paidPillOff: {
        backgroundColor: "#fee2e2",
        borderColor: "#dc2626",
    },
    paidPillText: {
        fontWeight: "700",
        fontSize: 12,
    },
    paidPillTextOn: {
        color: "#15803d",
    },
    paidPillTextOff: {
        color: "#b91c1c",
    },
});

export default BillingEditPage;
