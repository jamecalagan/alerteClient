import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    TextInput,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
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

        const rows = invoice.lines
            .map(
                (line) => `
  <tr>
    <td style="border: 1px solid #000; padding: 6px;">${line.designation}${
                    line.serial ? ` (SN: ${line.serial})` : ""
                }</td>
    <td style="border: 1px solid #000; padding: 6px; text-align: center;">${
        line.quantity
    }</td>
    <td style="border: 1px solid #000; padding: 6px; text-align: right;">${(
        parseFloat(line.price) / 1.2
    ).toFixed(2)} €</td>
    <td style="border: 1px solid #000; padding: 6px; text-align: right;">${(
        parseFloat(line.price) * parseFloat(line.quantity)
    ).toFixed(2)} €</td>
  </tr>
`
            )
            .join("");

        const ttc = invoice.totalttc || 0;
        const acompte = parseFloat(invoice.acompte || 0);
        const tva = invoice.totaltva || 0;

        const html = `
  <html>
    <body style="font-family: Arial, sans-serif; padding: 10px; margin: 0; background: #fff;">
      <div style="max-width: 480px; height: 100%; min-height: 720px; margin: auto; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="text-align: center; margin-bottom: 10px;">
            <img src="https://www.avenir-informatique.fr/logo.webp" style="height: 40px;" />
          </div>
          <h2 style="text-align:center; font-size: 16px; margin: 10px 0;">FACTURE</h2>

          <div style="font-size: 9px; margin-bottom: 8px;">
            <p><strong>Client :</strong> ${invoice.clientname}<br/>
            <strong>Téléphone :</strong> ${invoice.clientphone}<br/>
            <strong>Adresse :</strong> ${
                invoice.client_address || "Non renseignée"
            }</p>
          </div>

          <div style="font-size: 9px; margin-bottom: 10px;">
            <p><strong>Facture N° :</strong> ${invoice.invoicenumber}<br/>
            <strong>Date :</strong> ${invoice.invoicedate}</p>
          </div>

          <table width="100%" style="border-collapse: collapse; margin-top: 20px; font-size: 9px;">
            <thead style="background-color: #d3d3d3;">
              <tr>
                <th style="border: 1px solid #000; padding: 6px;">Désignation</th>
                <th style="border: 1px solid #000; padding: 6px;">Qté</th>
                <th style="border: 1px solid #000; padding: 6px;">P.U. HT</th>
                <th style="border: 1px solid #000; padding: 6px;">Montant TTC</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <div style="font-size: 9px; margin-top: 15px;">
            <p style="text-align: right;">TVA (20%) : ${tva.toFixed(2)} €</p>
            <p style="text-align: right;">Total TTC : ${ttc.toFixed(2)} €</p>
            <p style="text-align: right;">Acompte versé : ${acompte.toFixed(
                2
            )} €</p>
          </div>

          <div style="background: #e0f7fa; padding: 8px; border-radius: 6px; margin-top: 10px;">
            <h3 style="text-align: right; margin: 0; font-size: 10px; color: #00796b;">
              Net à payer : ${(ttc - acompte).toFixed(2)} €
            </h3>
          </div>

          <p style="text-align: right; margin-top: 8px; font-size: 9px;">
            <strong>Mode de paiement :</strong> ${
                invoice.paymentmethod || "....................................."
            }
          </p>
        </div>

        <div style="margin-top: 20px; background: #f0f0f0; padding: 8px; font-size: 8px; text-align: center; color: #555;">
          <p><strong>AVENIR INFORMATIQUE</strong> - 16, place de l'Hôtel de Ville, 93700 Drancy</p>
          <p>Tél : 01 41 60 18 18 - SIRET : 422 240 457 00016</p>
          <p>R.C.S : Bobigny B422 240 457 - N/Id CEE FR32422240457</p>
          <p style="margin-top: 6px;">
            Clause de réserve de propriété : les marchandises restent la propriété du vendeur jusqu'au paiement intégral.<br/>
            En cas de litige, le tribunal de Bobigny est seul compétent.
          </p>
        </div>
      </div>
    </body>
  </html>
`;

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
                    <Text style={styles.gridBtnText}>💾 Sauvegarder</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.gridBtn,
                        isSaved ? styles.gridBtnSuccess : styles.gridBtnDisabled,
                    ]}
                    disabled={!isSaved}
                    onPress={handlePrint}
                >
                    <Text style={styles.gridBtnText}>🖨️ Réimprimer</Text>
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
    screen: { flex: 1, backgroundColor: "#f8fafc" },
    fieldLabel: commonStyles.fieldLabel,
    cardTitle: commonStyles.cardTitle,
    card: commonStyles.card,

    cardSectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 4,
    },

    lineCard: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        backgroundColor: "#ffffff",
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
