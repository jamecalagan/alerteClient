import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    TextInput,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Alert,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";
const USB_COST = 20; // conforme à ExpressVideoPage
const HDD_COST = 45;

// -- Helpers nombre (prend aussi "12,5")
const n = (v) => {
    const x = parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(x) ? x : 0;
};

// "3 VHS, 15 VHS-C" -> 18
const parseCassetteCount = (val) => {
    if (val == null) return null;
    const s = String(val);
    const matches = s.match(/\d+(?:[.,]\d+)?/g);
    if (!matches) return null;
    return matches.reduce((sum, t) => sum + n(t), 0);
};

const BillingPage = () => {
    const navigation = useNavigation();
    const route = useRoute();

    const expressData = route.params?.expressData || {};
    const order_id = expressData.order_id || null;
    const express_id =
        route.params?.express_id ?? expressData.express_id ?? null;

    const [quoteNumber, setQuoteNumber] = useState(null);
    const [clientSuggestions, setClientSuggestions] = useState([]);
    const [focusedField, setFocusedField] = useState(null);

    const [clientname, setClientName] = useState("");
    const [clientphone, setClientPhone] = useState("");
    const [client_address, setClientAddress] = useState("");
    const [invoicenumber, setInvoiceNumber] = useState("");
    const [invoicedate, setInvoiceDate] = useState(
        new Date().toLocaleDateString()
    );
    const [paymentmethod, setPaymentMethod] = useState("");
    const [acompte, setAcompte] = useState("");
    const [paid, setPaid] = useState(false);

    const [lines, setLines] = useState([
        { designation: "", quantity: "1", price: "", serial: "" },
    ]);
    const [isSaved, setIsSaved] = useState(false);

    // Numéro de facture auto
    const generateInvoiceNumber = async () => {
        const { data, error } = await supabase
            .from("billing")
            .select("invoicenumber")
            .order("created_at", { ascending: false })
            .limit(1);
        if (error) {
            console.error("Erreur de récupération du dernier numéro:", error);
            setInvoiceNumber("FAC-AI20252604");
            return;
        }
        if (data && data.length > 0) {
            const lastNumber = data[0].invoicenumber;
            const match = lastNumber?.match(/\d+$/);
            if (match) {
                const newNumber = (parseInt(match[0]) + 1)
                    .toString()
                    .padStart(match[0].length, "0");
                setInvoiceNumber(`FAC-AI${newNumber}`);
            } else {
                setInvoiceNumber("FAC-AI20252604");
            }
        } else {
            setInvoiceNumber("FAC-AI20252604");
        }
    };

    useEffect(() => {
        const fromQuote = route.params?.fromQuote;
        const ed = route.params?.expressData || {};

        // --- En-tête / client
        if (ed.invoicenumber) setInvoiceNumber(String(ed.invoicenumber));
        else generateInvoiceNumber();

        setClientName(ed.name || ed.clientname || "");
        setClientPhone(ed.phone || ed.clientphone || "");
        setClientAddress(ed.client_address || "");
        setPaymentMethod(ed.paymentmethod || "");
        setAcompte(
            ed.acompte != null && !isNaN(ed.acompte) ? String(ed.acompte) : ""
        );
        setPaid(!!ed.paid);

        if (fromQuote) {
            // ==============================
            //       CAS : depuis devis
            // ==============================
            setQuoteNumber(route.params.quoteNumber || null);
            const items = route.params.items || [];

            const built = items.map((item) => {
                const qty =
                    n(item.quantity) ||
                    n(item.qty) ||
                    parseCassetteCount(item.cassettecount) ||
                    1;

                // priorité au P.U., sinon on le déduit depuis total
                const unit =
                    n(item.unitPrice) ||
                    n(item.unit_price) ||
                    (qty > 0
                        ? n(item.total || item.totalttc || item.price) / qty
                        : 0);

                const designation = item.label
                    ? `${item.label} — ${item.description || ""}`
                    : item.description || "";

                return {
                    designation,
                    quantity: String(qty || 1),
                    price: String(unit || 0), // P.U. TTC
                    serial: "",
                };
            });

            setLines(
                built.length
                    ? built
                    : [
                          {
                              designation: "",
                              quantity: "1",
                              price: "",
                              serial: "",
                          },
                      ]
            );
        } else {
            // === Depuis ExpressListPage ===
            const ed = route.params?.expressData || {};
            const formattedDesignation = String(ed.description || "")
                .split("<br/>")
                .join("\n");

            // 1) Quantité (gère "3 VHS, 15 VHS-C")
            // 1) quantité
            const qty =
                n(ed.quantity) ||
                n(ed.qty) ||
                parseCassetteCount(ed.cassettecount) ||
                n(ed.count) ||
                1;

            // 2) total TTC global
            const total =
                n(ed.total) ||
                n(ed.totalttc) ||
                n(ed.totalTTC) ||
                n(ed.amount) ||
                n(ed.price) ||
                0;

            // 3) QUI fournit ?  (BDD: false = client fournit, true = magasin fournit)
            const magasinFournit = (() => {
                const v = ed.support_fournis;

                // === IMPORTANT : règle issue de ton debug ===
                // false  -> client fournit  -> NE PAS facturer
                // true   -> magasin fournit -> facturer
                if (typeof v === "boolean") return v === true;

                const s = String(v ?? "")
                    .trim()
                    .toLowerCase();
                // valeurs "magasin fournit"
                if (
                    ["true", "1", "oui", "magasin", "store", "shop"].includes(s)
                )
                    return true;
                // valeurs "client fournit"
                if (
                    [
                        "false",
                        "0",
                        "non",
                        "client",
                        "fourni par le client",
                        "client fourni",
                        "fourni client",
                    ].includes(s)
                )
                    return false;

                // par défaut: prudence -> ne pas facturer
                return false;
            })();

            // 4) type de support
            const out = String(ed.outputtype || "")
                .trim()
                .toLowerCase();
            const isUSB = out.includes("usb");
            const isHDD = out.includes("disque");

            // 5) coût support UNIQUEMENT si le MAGASIN fournit
            let storageCost = 0;
            if (magasinFournit) {
                if (isUSB) storageCost = USB_COST; // 20 €
                if (isHDD) storageCost = HDD_COST; // 45 €
            }

            // 6) P.U. TTC PRESTATION (hors support)
            const unitService =
                qty > 0 ? Math.max(0, (total - storageCost) / qty) : 0;

            // 7) lignes
            const newLines = [
                {
                    designation: String(ed.description || "")
                        .split("<br/>")
                        .join("\n"),
                    quantity: String(qty),
                    price: String(unitService), // P.U. TTC hors support
                    serial: ed.serial || "",
                },
            ];

            if (storageCost > 0) {
                newLines.push({
                    designation: isUSB
                        ? "Clé USB fournie par le magasin"
                        : isHDD
                        ? "Disque dur fourni par le magasin"
                        : "Support de stockage fourni par le magasin",
                    quantity: "1",
                    price: String(storageCost),
                    serial: "",
                });
            }

            setLines(newLines);
        }
    }, [route.params]);

    const removeLine = (indexToRemove) => {
        setLines(lines.filter((_, i) => i !== indexToRemove));
    };

    // Totaux
    const totalttc = lines.reduce(
        (sum, l) => sum + n(l.quantity) * n(l.price),
        0
    );
    const tvaRate = 0.2;
    const totalht = totalttc / (1 + tvaRate);
    const totaltva = totalttc - totalht;

const handlePrint = async () => {
  if (!clientname.trim()) return alert("❌ Merci d'entrer le nom du client.");
  if (!clientphone.trim()) return alert("❌ Merci d'entrer le numéro de téléphone.");
  if (!paymentmethod.trim()) return alert("❌ Merci de sélectionner un mode de paiement.");
  if (
    lines.length === 0 ||
    lines.some((l) => !String(l.designation).trim() || !String(l.quantity).trim() || !String(l.price).trim())
  ) {
    return alert("❌ Merci de remplir toutes les lignes (désignation, quantité et P.U.).");
  }

  const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "0,00").replace(".", ",");
  const n2p = (x) => (Number.isFinite(x) ? x.toFixed(2) : "0.00");

  const tvaRate = 0.2;
  const totalttcLocal = lines.reduce((s, l) => s + parseFloat(String(l.quantity).replace(",", ".")) * parseFloat(String(l.price).replace(",", ".")), 0);
  const totalhtLocal = totalttcLocal / (1 + tvaRate);
  const totaltvaLocal = totalttcLocal - totalhtLocal;
  const acompteN = parseFloat(String(acompte || 0).replace(",", "."));
  const netToPay = Math.max(0, totalttcLocal - (Number.isFinite(acompteN) ? acompteN : 0));
  const stamp = paid
    ? `<div class="stamp paid">FACTURE RÉGLÉE</div>`
    : `<div class="stamp unpaid">FACTURE NON RÉGLÉE</div>`;

  const rows = lines.map((line) => {
    const q = parseFloat(String(line.quantity).replace(",", ".")) || 0;
    const unitTTC = parseFloat(String(line.price).replace(",", ".")) || 0;
    const unitHT = unitTTC / 1.2;
    const lineTTC = q * unitTTC;
    return `
      <tr>
        <td class="td desc">
          ${String(line.designation || "").replace(/</g, "&lt;")}
          ${line.serial ? `<div class="serial">SN : ${String(line.serial).replace(/</g, "&lt;")}</div>` : ""}
        </td>
        <td class="td num c">${n2p(q)}</td>
        <td class="td num r">${n2p(unitHT)} €</td>
        <td class="td num r">${n2p(lineTTC)} €</td>
      </tr>
    `;
  }).join("");

  const html = `
  <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: Arial, Helvetica, sans-serif; color:#000; font-size: 12px; }
        .wrap { max-width: 780px; margin: 0 auto; }

        /* En-tête centré */
        .header {
          text-align: center;
          margin-bottom: 12px;
        }
        .header img { height: 56px; }
        .title { font-size: 20px; font-weight: 700; margin: 6px 0 12px 0; letter-spacing: 1px; }

        /* Meta (client / facture) */
        .meta { display:flex; gap: 12px; margin: 0 0 16px 0; }
        .card { border:1px solid #000; border-radius:6px; padding:10px 12px; flex:1; }
        .card h3 { margin:0 0 8px 0; font-size:13px; }
        .card p { margin:2px 0; }

        /* Tableau */
        table { width:100%; border-collapse: collapse; }
        .th, .td { border:1px solid #000; padding:8px; }
        thead .th { background:#e5e5e5; font-weight:bold; }
        .desc { width:100%; }
        .serial { font-size:10px; color:#555; margin-top:4px; }
        .num { white-space: nowrap; }
        .c { text-align:center; }
        .r { text-align:right; }

        /* Totaux */
        .totals { margin-top: 12px; display:flex; justify-content:flex-end; }
        .totals table { width: 360px; border-collapse: collapse; font-size: 12px; }
        .totals td { border:1px solid #000; padding:8px; }
        .totals .label { background:#f7f7f7; }

        .net { margin-top: 8px; text-align: right; font-size: 14px; font-weight: bold; padding: 10px 0; }

        /* Tampon payé / non payé */
        .stamp { display:inline-block; padding:6px 10px; border:2px solid; font-weight:700; letter-spacing:1px; margin-left:10px; }
        .paid { color:#2e7d32; border-color:#2e7d32; }
        .unpaid { color:#c62828; border-color:#c62828; }

        /* Pied de page (infos société en bas) */
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
        <!-- Logo centré + Titre -->
        <div class="header">
          <img src="https://www.avenir-informatique.fr/logo.webp" alt="Avenir Informatique" />
          <div class="title">FACTURE</div>
        </div>

        <!-- Blocs client / facture -->
        <div class="meta">
          <div class="card">
            <h3>Client</h3>
            <p><strong>${clientname}</strong></p>
            <p>Téléphone : ${clientphone}</p>
            <p>Adresse : ${client_address || "—"}</p>
          </div>
          <div class="card">
            <h3>Détails</h3>
            <p>Numéro : <strong>${invoicenumber}</strong></p>
            <p>Date : ${invoicedate}</p>
            ${quoteNumber ? `<p>Devis d'origine : ${quoteNumber}</p>` : ""}
            <p>Mode de paiement : ${paymentmethod || "—"}</p>
          </div>
        </div>

        <!-- Détail prestations -->
        <table>
          <thead>
            <tr>
              <th class="th">Désignation</th>
              <th class="th c" style="width:90px;">Qté</th>
              <th class="th r" style="width:120px;">P.U. HT</th>
              <th class="th r" style="width:140px;">Montant TTC</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <!-- Totaux -->
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
            ${acompteN > 0 ? `
            <tr>
              <td class="label">Acompte versé</td>
              <td class="r">-${n2p(acompteN)} €</td>
            </tr>` : ""}
          </table>
        </div>

        <div class="net">
          Net à payer : ${n2p(netToPay)} €
          ${stamp}
        </div>
      </div>

      <!-- Pied de page : infos société -->
      <div class="footer">
        <strong>AVENIR INFORMATIQUE</strong> — 16, place de l'Hôtel de Ville, 93700 Drancy — Tél : 01 41 60 18 18 — SIRET : 422 240 457 00016<br/>
        Clause de réserve de propriété : les marchandises restent la propriété du vendeur jusqu'au paiement intégral.<br/>
        En cas de litige, le tribunal de Bobigny est seul compétent. TVA non applicable, art. 293B du CGI.
      </div>
    </body>
  </html>`;

  await Print.printAsync({ html });
};



const handleSave = async () => {
	  if (isSaved) {
    alert("✅ Cette facture est déjà enregistrée. Impossible de la sauvegarder à nouveau.");
    return;
  }
  if (!clientname.trim()) return alert("❌ Le nom du client est requis.");
  if (!clientphone.trim()) return alert("❌ Le téléphone du client est requis.");
  if (!paymentmethod.trim()) return alert("❌ Le mode de paiement est requis.");
  if (
    lines.length === 0 ||
    lines.some((l) => !String(l.designation).trim() || !String(l.quantity).trim() || !String(l.price).trim())
  ) {
    return alert("❌ Remplissez correctement toutes les lignes de prestation.");
  }

  try {
    // 1) Vérifier unicité du numéro
    const { data: existing, error: fetchError } = await supabase
      .from("billing")
      .select("id, express_id, order_id")
      .eq("invoicenumber", invoicenumber)
      .maybeSingle();
    if (fetchError) {
      console.error("Erreur vérification facture :", fetchError);
      return alert("❌ Erreur lors de la vérification de la facture.");
    }

    // 2) Vérifier que express_id et order_id existent réellement (sinon null)
    let expressIdForDB = express_id ?? null;
    let orderIdForDB = order_id ?? null;

    if (expressIdForDB != null) {
      const { data: exRow, error: exErr } = await supabase
        .from("express")
        .select("id")
        .eq("id", expressIdForDB)
        .maybeSingle();
      if (exErr || !exRow) {
        console.warn("⚠️ express_id invalide → mise à null");
        expressIdForDB = null;
      }
    }

    if (orderIdForDB != null) {
      const { data: orRow, error: orErr } = await supabase
        .from("orders")
        .select("id")
        .eq("id", orderIdForDB)
        .maybeSingle();
      if (orErr || !orRow) {
        console.warn("⚠️ order_id invalide → mise à null");
        orderIdForDB = null;
      }
    }

    // 3) Construire les totaux
    const totalttcLocal = lines.reduce(
      (s, l) => s + parseFloat(String(l.quantity).replace(",", ".")) * parseFloat(String(l.price).replace(",", ".")),
      0
    );
    const tvaRate = 0.2;
    const totalhtLocal = totalttcLocal / (1 + tvaRate);
    const totaltvaLocal = totalttcLocal - totalhtLocal;

    // 4) Données facture
    const factureData = {
      clientname,
      clientphone,
      client_address,
      invoicenumber,
      invoicedate: new Date(invoicedate.split("/").reverse().join("-")),
      paymentmethod,
      acompte: acompte === "" ? 0 : n(acompte),
      lines,
      totalht: isNaN(totalhtLocal) ? 0 : totalhtLocal,
      totaltva: isNaN(totaltvaLocal) ? 0 : totaltvaLocal,
      totalttc: isNaN(totalttcLocal) ? 0 : totalttcLocal,
      created_at: new Date(),
      paid,
      express_id: expressIdForDB, // ✅ seulement si présent en BDD
      order_id: orderIdForDB,     // ✅ idem
    };

    // 5) Insert / Update
    let saveError;
    if (existing) {
      const { error } = await supabase
        .from("billing")
        .update(factureData)
        .eq("id", existing.id);
      saveError = error;
    } else {
      const { error } = await supabase
        .from("billing")
        .insert([factureData]);
      saveError = error;
    }

    if (saveError) {
      console.error("Erreur sauvegarde :", saveError);
      alert("❌ Erreur lors de la sauvegarde de la facture.");
    } else {
      alert("✅ Facture enregistrée avec succès.");
      setIsSaved(true);
    }
  } catch (e) {
    console.error("Erreur inattendue :", e);
    alert("❌ Erreur inattendue lors de la sauvegarde.");
  }
};

    const searchClients = async (text) => {
        setClientName(text);
        if (text.length < 2) {
            setClientSuggestions([]);
            return;
        }
        const { data, error } = await supabase
            .from("clients")
            .select("name, phone")
            .ilike("name", `${text}%`);
        if (!error) setClientSuggestions(data || []);
    };

    const selectClient = (client) => {
        setClientName(client.name);
        setClientPhone(client.phone || "");
        setClientSuggestions([]);
    };
    // met à jour une ligne (désignation / quantity / price / serial)
    const updateLine = (index, field, value) => {
        setLines((prev) => {
            const copy = Array.isArray(prev) ? [...prev] : [];
            copy[index] = { ...copy[index], [field]: value };
            return copy;
        });
        setIsSaved(false);
    };

    return (
        <View style={{ flex: 1 }}>
            <ScrollView
                contentContainerStyle={[
                    styles.container,
                    { paddingBottom: 120 },
                ]}
            >
                <Text style={styles.title}>Facture client</Text>

                {/* Client */}
                <View style={{ marginBottom: 20 }}>
                    <Text
                        style={[
                            styles.floatingLabel,
                            (focusedField === "name" || clientname) &&
                                styles.floatingLabelFocused,
                        ]}
                    >
                        Nom du client
                    </Text>
                    <TextInput
                        value={clientname}
                        onChangeText={searchClients}
                        style={[
                            styles.input,
                            (focusedField === "name" || clientname) && {
                                paddingTop: 18,
                            },
                            focusedField === "name" && styles.inputFocused,
                        ]}
                        onFocus={() => setFocusedField("name")}
                        onBlur={() => setFocusedField(null)}
                    />
                    {clientSuggestions.length > 0 && (
                        <View style={styles.suggestionContainer}>
                            {clientSuggestions.map((item, index) => (
                                <TouchableOpacity
                                    key={index}
                                    onPress={() => selectClient(item)}
                                    style={styles.suggestionItem}
                                >
                                    <Text style={styles.suggestionText}>
                                        {item.name} - {item.phone}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Téléphone */}
                <View style={{ marginBottom: 20 }}>
                    <Text
                        style={[
                            styles.floatingLabel,
                            (focusedField === "phone" || clientphone) &&
                                styles.floatingLabelFocused,
                        ]}
                    >
                        Téléphone
                    </Text>
                    <TextInput
                        value={clientphone}
                        onChangeText={setClientPhone}
                        keyboardType="phone-pad"
                        style={[
                            styles.input,
                            (focusedField === "phone" || clientphone) && {
                                paddingTop: 18,
                            },
                            focusedField === "phone" && styles.inputFocused,
                        ]}
                        onFocus={() => setFocusedField("phone")}
                        onBlur={() => setFocusedField(null)}
                    />
                </View>

                {/* Adresse */}
                <View style={{ marginBottom: 20 }}>
                    <Text
                        style={[
                            styles.floatingLabel,
                            (focusedField === "address" || client_address) &&
                                styles.floatingLabelFocused,
                        ]}
                    >
                        Adresse
                    </Text>
                    <TextInput
                        value={client_address}
                        onChangeText={setClientAddress}
                        style={[
                            styles.input,
                            (focusedField === "address" || client_address) && {
                                paddingTop: 18,
                            },
                            focusedField === "address" && styles.inputFocused,
                        ]}
                        onFocus={() => setFocusedField("address")}
                        onBlur={() => setFocusedField(null)}
                    />
                </View>

                {/* Numéro de facture */}
                <View style={{ marginBottom: 20 }}>
                    <Text
                        style={[
                            styles.floatingLabel,
                            (focusedField === "invoice" || invoicenumber) &&
                                styles.floatingLabelFocused,
                        ]}
                    >
                        Numéro de facture
                    </Text>
                    <TextInput
                        value={invoicenumber}
                        onChangeText={setInvoiceNumber}
                        style={[
                            styles.input,
                            (focusedField === "invoice" || invoicenumber) && {
                                paddingTop: 18,
                            },
                            focusedField === "invoice" && styles.inputFocused,
                        ]}
                        onFocus={() => setFocusedField("invoice")}
                        onBlur={() => setFocusedField(null)}
                    />
                </View>

                {quoteNumber ? (
                    <Text
                        style={{
                            fontStyle: "italic",
                            color: "#555",
                            marginBottom: 10,
                        }}
                    >
                        📎 Issu du devis : {quoteNumber}
                    </Text>
                ) : null}

                {/* Date */}
                <View style={{ marginBottom: 20 }}>
                    <Text
                        style={[
                            styles.floatingLabel,
                            (focusedField === "date" || invoicedate) &&
                                styles.floatingLabelFocused,
                        ]}
                    >
                        Date
                    </Text>
                    <TextInput
                        value={invoicedate}
                        onChangeText={setInvoiceDate}
                        style={[
                            styles.input,
                            (focusedField === "date" || invoicedate) && {
                                paddingTop: 18,
                            },
                            focusedField === "date" && styles.inputFocused,
                        ]}
                        onFocus={() => setFocusedField("date")}
                        onBlur={() => setFocusedField(null)}
                    />
                </View>

                {/* Acompte */}
                <View style={{ marginBottom: 20 }}>
                    <Text
                        style={[
                            styles.floatingLabel,
                            (focusedField === "acompte" || acompte) &&
                                styles.floatingLabelFocused,
                        ]}
                    >
                        Acompte versé (€)
                    </Text>
                    <TextInput
                        value={acompte}
                        onChangeText={setAcompte}
                        keyboardType="numeric"
                        placeholder="0"
                        style={[
                            styles.input,
                            (focusedField === "acompte" || acompte) && {
                                paddingTop: 18,
                            },
                            focusedField === "acompte" && styles.inputFocused,
                        ]}
                        onFocus={() => setFocusedField("acompte")}
                        onBlur={() => setFocusedField(null)}
                    />
                </View>

                {/* En-tête colonnes */}
                <View style={[styles.lineRow, { marginBottom: 6 }]}>
                    <Text style={[styles.cellHeader, { flex: 2 }]}>
                        Prestation
                    </Text>
                    <Text
                        style={[
                            styles.cellHeader,
                            { flex: 1, textAlign: "center" },
                        ]}
                    >
                        Qté
                    </Text>
                    <Text
                        style={[
                            styles.cellHeader,
                            { flex: 1, textAlign: "center" },
                        ]}
                    >
                        P.U. TTC
                    </Text>
                    <Text
                        style={[
                            styles.cellHeader,
                            { flex: 1, textAlign: "right" },
                        ]}
                    >
                        Total TTC
                    </Text>
                </View>

                {/* Lignes */}
                {lines.map((line, index) => {
                    const lineTotal = n(line.quantity) * n(line.price);
                    return (
                        <View key={index} style={{ marginBottom: 12 }}>
                            <View
                                style={[
                                    styles.lineRow,
                                    { alignItems: "flex-start" },
                                ]}
                            >
                                {/* Prestation */}
                                <TextInput
                                    placeholder="Désignation"
                                    value={line.designation}
                                    onChangeText={(text) =>
                                        updateLine(index, "designation", text)
                                    }
                                    multiline
                                    numberOfLines={2}
                                    style={[
                                        styles.input,
                                        {
                                            flex: 2,
                                            minHeight: 50,
                                            textAlignVertical: "top",
                                        },
                                        focusedField ===
                                            `designation-${index}` &&
                                            styles.inputFocused,
                                    ]}
                                    onFocus={() =>
                                        setFocusedField(`designation-${index}`)
                                    }
                                    onBlur={() => setFocusedField(null)}
                                />

                                {/* Qté */}
                                <TextInput
                                    placeholder="Qté"
                                    value={line.quantity}
                                    onChangeText={(text) =>
                                        updateLine(index, "quantity", text)
                                    }
                                    keyboardType="numeric"
                                    style={[
                                        styles.input,
                                        { flex: 1, textAlign: "center" },
                                        focusedField === `quantity-${index}` &&
                                            styles.inputFocused,
                                    ]}
                                    onFocus={() =>
                                        setFocusedField(`quantity-${index}`)
                                    }
                                    onBlur={() => setFocusedField(null)}
                                />

                                {/* P.U. TTC */}
                                <TextInput
                                    placeholder="P.U. TTC"
                                    value={line.price}
                                    onChangeText={(text) =>
                                        updateLine(index, "price", text)
                                    }
                                    keyboardType="numeric"
                                    style={[
                                        styles.input,
                                        { flex: 1, textAlign: "center" },
                                        focusedField === `price-${index}` &&
                                            styles.inputFocused,
                                    ]}
                                    onFocus={() =>
                                        setFocusedField(`price-${index}`)
                                    }
                                    onBlur={() => setFocusedField(null)}
                                />

                                {/* Total TTC (lecture seule) */}
                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={{
                                            height: 42,
                                            borderWidth: 1,
                                            borderColor: "#ccc",
                                            borderRadius: 5,
                                            backgroundColor: "#f6f6f6",
                                            textAlign: "right",
                                            paddingHorizontal: 8,
                                            paddingTop: 10,
                                            fontSize: 14,
                                        }}
                                    >
                                        {lineTotal.toFixed(2)} €
                                    </Text>
                                </View>

                                {/* Supprimer */}
                                <TouchableOpacity
                                    onPress={() => removeLine(index)}
                                    style={styles.deleteButton}
                                >
                                    <Text style={styles.deleteButtonText}>
                                        🗑️
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* N° de série (optionnel) */}
                            <TextInput
                                placeholder="Numéro de série"
                                value={line.serial || ""}
                                onChangeText={(text) =>
                                    updateLine(index, "serial", text)
                                }
                                style={[
                                    styles.input,
                                    focusedField === `serial-${index}` &&
                                        styles.inputFocused,
                                    { marginTop: 4 },
                                ]}
                                onFocus={() =>
                                    setFocusedField(`serial-${index}`)
                                }
                                onBlur={() => setFocusedField(null)}
                            />
                        </View>
                    );
                })}

                {/* Ajouter une ligne */}
                <View style={styles.addButtonContainer}>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() =>
                            setLines([
                                ...lines,
                                {
                                    designation: "",
                                    quantity: "1",
                                    price: "",
                                    serial: "",
                                },
                            ])
                        }
                    >
                        <Text style={styles.addButtonText}>
                            ➕ Ajouter une ligne
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Paiement */}
                <Text style={styles.subtitle}>Mode de paiement :</Text>
                <View style={styles.paymentRow}>
                    <TouchableOpacity
                        style={[
                            styles.paymentButton,
                            paymentmethod === "CB" &&
                                styles.paymentButtonSelected,
                        ]}
                        onPress={() => setPaymentMethod("CB")}
                    >
                        <Text style={styles.paymentButtonText}>
                            💳 CARTE BANCAIRE
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.paymentButton,
                            paymentmethod === "Espèces" &&
                                styles.paymentButtonSelected,
                        ]}
                        onPress={() => setPaymentMethod("Espèces")}
                    >
                        <Text style={styles.paymentButtonText}>💵 ESPÈCES</Text>
                    </TouchableOpacity>
                </View>

                {/* Marquer payée */}
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 10,
                    }}
                >
                    <TouchableOpacity
                        onPress={() => setPaid(!paid)}
                        style={{
                            backgroundColor: paid ? "#28a745" : "#ccc",
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 6,
                        }}
                    >
                        <Text style={{ color: "#fff", fontWeight: "bold" }}>
                            {paid ? "✅ Payée" : "Marquer comme payée"}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* État sauvegarde */}
                {isSaved ? (
                    <Text
                        style={{
                            textAlign: "center",
                            color: "#28a745",
                            fontWeight: "bold",
                            marginBottom: 8,
                        }}
                    >
                        ✅ Facture enregistrée et prête à être imprimée
                    </Text>
                ) : (
                    <Text
                        style={{
                            textAlign: "center",
                            color: "#888",
                            marginBottom: 8,
                        }}
                    >
                        🔒 Veuillez sauvegarder la facture avant impression
                    </Text>
                )}

                {/* Actions */}
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[
                            styles.actionButton,
                            {
                                backgroundColor:
                                    isSaved && paid ? "#28a745" : "#ccc",
                            },
                        ]}
                        onPress={() => {
                            if (!paid)
                                return alert(
                                    "❌ Impossible d'imprimer : la facture n'est pas encore payée."
                                );
                            if (!isSaved)
                                return alert(
                                    "❌ Merci de sauvegarder la facture avant d'imprimer."
                                );
                            handlePrint();
                        }}
                        disabled={!isSaved || !paid}
                    >
                        <Text style={styles.buttonText}>🖨️ Imprimer</Text>
                    </TouchableOpacity>

<TouchableOpacity
  style={[
    styles.actionButton,
    { backgroundColor: isSaved ? "#aaa" : "#007bff" },
  ]}
  onPress={handleSave}
  disabled={isSaved}   // ✅ désactivé après sauvegarde
>
  <Text style={styles.buttonText}>
    {isSaved ? "✅ Déjà sauvegardée" : "💾 Sauvegarder"}
  </Text>
</TouchableOpacity>


                    <TouchableOpacity
                        style={[
                            styles.actionButton,
                            { backgroundColor: "#555" },
                        ]}
                        onPress={() => navigation.navigate("BillingListPage")}
                    >
                        <Text style={styles.buttonText}>
                            📄 Liste des Factures
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Retour fixe */}
            <TouchableOpacity
                style={styles.returnButtonFixed}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.buttonText}>⬅ Retour</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { padding: 20 },

    title: {
        fontSize: 22,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
    },

    subtitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginTop: 20,
        marginBottom: 10,
    },

    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 8,
        borderRadius: 5,
        marginBottom: 10,
        backgroundColor: "#fff",
        height: 42,
        fontSize: 14,
    },

    inputFocused: {
        borderColor: "#007bff",
        backgroundColor: "#eef6ff",
        fontSize: 18,
        height: 55,
    },

    floatingLabel: {
        position: "absolute",
        left: 10,
        top: 12,
        fontSize: 14,
        color: "#888",
        zIndex: 1,
    },

    floatingLabelFocused: {
        top: -10,
        left: 8,
        fontSize: 12,
        color: "#007bff",
        backgroundColor: "#eef6ff",
        paddingHorizontal: 5,
        borderRadius: 4,
    },

    suggestionContainer: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        marginBottom: 10,
        paddingVertical: 5,
        elevation: 3,
    },

    suggestionItem: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },

    suggestionText: { fontSize: 14 },

    lineRow: { flexDirection: "row", gap: 10, marginBottom: 10 },

    cellHeader: { fontWeight: "bold", color: "#222" },

    buttonRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 20,
    },

    actionButton: {
        flex: 1,
        marginHorizontal: 5,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: "center",
    },

    buttonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

    paymentRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 10,
        marginVertical: 20,
    },

    paymentButton: {
        flex: 1,
        backgroundColor: "#ddd",
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        elevation: 3,
    },

    paymentButtonSelected: { backgroundColor: "#28a745" },

    paymentButtonText: {
        color: "#000",
        fontWeight: "bold",
        fontSize: 14,
        textTransform: "uppercase",
    },

    addButtonContainer: { marginVertical: 10, alignItems: "center" },

    addButton: {
        backgroundColor: "#4da6ff",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: "center",
        elevation: 3,
    },

    addButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

    deleteButton: {
        backgroundColor: "#dc3545",
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
        height: 36,
        width: 36,
        alignSelf: "center",
        marginLeft: 8,
    },

    deleteButtonText: { color: "white", fontSize: 22, fontWeight: "bold" },

    returnButtonFixed: {
        position: "absolute",
        bottom: 16,
        left: 16,
        right: 16,
        backgroundColor: "#6c757d",
        padding: 14,
        borderRadius: 8,
        alignItems: "center",
        zIndex: 100,
    },
});

export default BillingPage;
