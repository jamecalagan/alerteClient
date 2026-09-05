import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Print from "expo-print";
import { WebView } from "react-native-webview";
import { supabase } from "../supabaseClient";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";
import { commonStyles } from "../themes/modernTheme";

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

  // --- Contexte appel ---
  const fromQuote = route.params?.fromQuote || false;
  const useGlobalFromQuote = route.params?.useGlobalTotal === true;
  const globalTotalFromQuote = route.params?.globalTotal;

  // Mode "coût total" (devis sans détails de prix)
  const [useGlobalTotal, setUseGlobalTotal] = useState(useGlobalFromQuote);
  const [globalTotal, setGlobalTotal] = useState(
    useGlobalFromQuote && globalTotalFromQuote != null
      ? String(globalTotalFromQuote)
      : ""
  );

  const expressData = route.params?.expressData || {};
  const order_id = expressData.order_id || null;
  const express_id =
    route.params?.express_id ?? expressData.express_id ?? null;
  const intervention_id =
    route.params?.intervention_id ?? expressData.intervention_id ?? null;

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

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
  const [previewMode, setPreviewMode] = useState(false);

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
    const fromQuoteFlag = route.params?.fromQuote;
    const ed = route.params?.expressData || {};

    // --- Numéro de facture ---
    if (ed.invoicenumber) setInvoiceNumber(String(ed.invoicenumber));
    else generateInvoiceNumber();

    // --- En-tête client par défaut (Express) ---
    setClientName(ed.name || ed.clientname || "");
    setClientPhone(ed.phone || ed.clientphone || "");
    setClientAddress(ed.client_address || "");
    setPaymentMethod(ed.paymentmethod || "");
    setAcompte(
      ed.acompte != null && !isNaN(ed.acompte) ? String(ed.acompte) : ""
    );
    setPaid(!!ed.paid);

    if (fromQuoteFlag) {
      // ==============================
      //         CAS : depuis devis
      // ==============================
      setQuoteNumber(route.params.quoteNumber || null);

      // Infos client venant du devis
      setClientName(
        route.params?.clientName ||
          route.params?.name ||
          ed.name ||
          ed.clientname ||
          ""
      );
      setClientPhone(
        route.params?.clientPhone ||
          route.params?.phone ||
          ed.phone ||
          ed.clientphone ||
          ""
      );
      setClientAddress(route.params?.clientAddress || ed.client_address || "");

      // Mode "coût total" hérité du devis
      const useGlobal = route.params?.useGlobalTotal === true;
      setUseGlobalTotal(useGlobal);
      if (useGlobal) {
        const g =
          route.params?.globalTotal != null
            ? route.params.globalTotal
            : route.params?.totalttc ?? null;
        if (g != null) setGlobalTotal(String(g));
      } else {
        setGlobalTotal("");
      }

      const items = route.params.items || [];

      const built = items.map((item) => {
        const qty =
          n(item.quantity) ||
          n(item.qty) ||
          parseCassetteCount(item.cassettecount) ||
          1;

        const brandModel = [item.brand, item.model]
          .filter((v) => v && String(v).trim())
          .join(" - ");
        const baseDesignation = item.label
          ? `${item.label} — ${item.description || ""}`
          : item.description || "";
        const designation = brandModel
          ? `${baseDesignation} — ${brandModel}`
          : baseDesignation;

        // Si mode global → on ne se sert plus des P.U.
        let priceStr = "";
        if (!useGlobal) {
          const unit =
            n(item.unitPrice) ||
            n(item.unit_price) ||
            (qty > 0
              ? n(item.total || item.totalttc || item.price) / qty
              : 0);
          priceStr = String(unit || 0); // P.U. TTC
        }

        return {
          designation,
          quantity: String(qty || 1),
          price: priceStr,
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
      // ==============================
      //       CAS : depuis Express
      // ==============================
      const formattedDesignation = String(ed.description || "")
        .split("<br/>")
        .join("\n");

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

        if (typeof v === "boolean") return v === true;

        const s = String(v ?? "").trim().toLowerCase();
        if (["true", "1", "oui", "magasin", "store", "shop"].includes(s))
          return true;
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

        return false;
      })();

      // 4) type de support
      const out = String(ed.outputtype || "").trim().toLowerCase();
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
          designation: formattedDesignation,
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
  }, []);

  const removeLine = (indexToRemove) => {
    setLines(lines.filter((_, i) => i !== indexToRemove));
  };

  // Totaux "instantanés" (peu utilisés, mais on les garde cohérents)
  const tvaRate = 0.2;
  const totalttc = useGlobalTotal
    ? n(globalTotal)
    : lines.reduce((sum, l) => sum + n(l.quantity) * n(l.price), 0);
  const totalht = totalttc / (1 + tvaRate);
  const totaltva = totalttc - totalht;

  const buildInvoiceHtml = () => {
    const n2 = (x) =>
      (Number.isFinite(x) ? x.toFixed(2) : "0,00").replace(".", ",");
    const n2p = (x) => (Number.isFinite(x) ? x.toFixed(2) : "0.00");

    let totalttcLocal;
    let totalhtLocal;
    let totaltvaLocal;

    if (useGlobalTotal) {
      totalttcLocal = n(globalTotal);
    } else {
      totalttcLocal = lines.reduce(
        (s, l) =>
          s +
          parseFloat(String(l.quantity).replace(",", ".")) *
            parseFloat(String(l.price).replace(",", ".")),
        0
      );
    }
    totalhtLocal = totalttcLocal / (1 + tvaRate);
    totaltvaLocal = totalttcLocal - totalhtLocal;

    const acompteN = parseFloat(
      String(acompte || 0).replace(",", ".")
    );
    const netToPay = Math.max(
      0,
      totalttcLocal - (Number.isFinite(acompteN) ? acompteN : 0)
    );
    const stamp = paid
      ? `<div class="stamp paid">FACTURE RÉGLÉE</div>`
      : `<div class="stamp unpaid">FACTURE NON RÉGLÉE</div>`;

    // En-têtes & lignes du tableau
    let headerCols = "";
    let rows = "";

    if (useGlobalTotal) {
      headerCols = `
        <th class="th">Désignation</th>
        <th class="th c" style="width:90px;">Qté</th>
      `;
      rows = lines
        .map((line) => {
          const q =
            parseFloat(String(line.quantity).replace(",", ".")) || 0;
          return `
            <tr>
              <td class="td desc">
                ${String(line.designation || "").replace(/</g, "&lt;")}
                ${
                  line.serial
                    ? `<div class="serial">SN : ${String(
                        line.serial
                      ).replace(/</g, "&lt;")}</div>`
                    : ""
                }
              </td>
              <td class="td num c">${n2p(q)}</td>
            </tr>
          `;
        })
        .join("");
    } else {
      headerCols = `
        <th class="th">Désignation</th>
        <th class="th c" style="width:90px;">Qté</th>
        <th class="th r" style="width:120px;">P.U. HT</th>
        <th class="th r" style="width:140px;">Montant TTC</th>
      `;
      rows = lines
        .map((line) => {
          const q =
            parseFloat(String(line.quantity).replace(",", ".")) || 0;
          const unitTTC =
            parseFloat(String(line.price).replace(",", ".")) || 0;
          const unitHT = unitTTC / 1.2;
          const lineTTC = q * unitTTC;
          return `
            <tr>
              <td class="td desc">
                ${String(line.designation || "").replace(/</g, "&lt;")}
                ${
                  line.serial
                    ? `<div class="serial">SN : ${String(
                        line.serial
                      ).replace(/</g, "&lt;")}</div>`
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
    }

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
            ${
              quoteNumber
                ? `<p>Devis d'origine : ${quoteNumber}</p>`
                : ""
            }
            <p>Mode de paiement : ${paymentmethod || "—"}</p>
          </div>
        </div>

        <!-- Détail prestations -->
        <table>
          <thead>
            <tr>
              ${headerCols}
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

      <!-- Pied de page : infos société -->
      <div class="footer">
        <strong>AVENIR INFORMATIQUE</strong> — 16, place de l'Hôtel de Ville, 93700 Drancy — Tél : 01 41 60 18 18 — SIRET : 422 240 457 00016<br/>
        RCS Bobigny B422 240 457 — N° TVA intracommunautaire : FR32422240457<br/>
        Clause de réserve de propriété : les marchandises restent la propriété du vendeur jusqu'au paiement intégral.<br/>
        En cas de litige, le tribunal de Bobigny est seul compétent.
      </div>
    </body>
  </html>`;

    return html;
  };

  const handlePrint = async () => {
    if (!clientname.trim())
      return alert("❌ Merci d'entrer le nom du client.");
    if (!clientphone.trim())
      return alert("❌ Merci d'entrer le numéro de téléphone.");
    if (!paymentmethod.trim())
      return alert("❌ Merci de sélectionner un mode de paiement.");

    if (lines.length === 0) {
      return alert("❌ Merci d’ajouter au moins une ligne de prestation.");
    }

    if (useGlobalTotal) {
      // Mode "coût total unique" : on ne demande pas les P.U.
      if (
        lines.some(
          (l) =>
            !String(l.designation).trim() || !String(l.quantity).trim()
        )
      ) {
        return alert(
          "❌ Merci de remplir toutes les lignes (désignation et quantité)."
        );
      }
      if (!globalTotal || isNaN(n(globalTotal))) {
        return alert(
          "❌ Merci de renseigner le montant total TTC (coût global)."
        );
      }
    } else {
      // Mode classique
      if (
        lines.some(
          (l) =>
            !String(l.designation).trim() ||
            !String(l.quantity).trim() ||
            !String(l.price).trim()
        )
      ) {
        return alert(
          "❌ Merci de remplir toutes les lignes (désignation, quantité et P.U.)."
        );
      }
    }

    const html = buildInvoiceHtml();

    await Print.printAsync({ html });
  };

  const handleSave = async () => {
    if (isSaved) {
      alert(
        "✅ Cette facture est déjà enregistrée. Impossible de la sauvegarder à nouveau."
      );
      return;
    }
    if (!clientname.trim())
      return alert("❌ Le nom du client est requis.");
    if (!clientphone.trim())
      return alert("❌ Le téléphone du client est requis.");
    if (!paymentmethod.trim())
      return alert("❌ Le mode de paiement est requis.");

    if (lines.length === 0) {
      return alert(
        "❌ Remplissez au moins une ligne de prestation."
      );
    }

    if (useGlobalTotal) {
      if (
        lines.some(
          (l) =>
            !String(l.designation).trim() || !String(l.quantity).trim()
        )
      ) {
        return alert(
          "❌ Remplissez correctement toutes les lignes (désignation et quantité)."
        );
      }
      if (!globalTotal || isNaN(n(globalTotal))) {
        return alert(
          "❌ Merci de renseigner le montant total TTC (coût global)."
        );
      }
    } else {
      if (
        lines.some(
          (l) =>
            !String(l.designation).trim() ||
            !String(l.quantity).trim() ||
            !String(l.price).trim()
        )
      ) {
        return alert(
          "❌ Remplissez correctement toutes les lignes de prestation."
        );
      }
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

      // 2) Vérifier que express_id, order_id et intervention_id existent réellement (sinon null)
      let expressIdForDB = express_id ?? null;
      let orderIdForDB = order_id ?? null;
      let interventionIdForDB = intervention_id ?? null;

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

      if (interventionIdForDB != null) {
        const { data: itRow, error: itErr } = await supabase
          .from("interventions")
          .select("id")
          .eq("id", interventionIdForDB)
          .maybeSingle();
        if (itErr || !itRow) {
          console.warn("⚠️ intervention_id invalide → mise à null");
          interventionIdForDB = null;
        }
      }

      // 3) Construire les totaux
      let totalttcLocal;
      if (useGlobalTotal) {
        totalttcLocal = n(globalTotal);
      } else {
        totalttcLocal = lines.reduce(
          (s, l) =>
            s +
            parseFloat(String(l.quantity).replace(",", ".")) *
              parseFloat(String(l.price).replace(",", ".")),
          0
        );
      }

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
        order_id: orderIdForDB, // ✅ idem
        intervention_id: interventionIdForDB, // ✅ idem
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
        showAlert("Erreur", "Erreur lors de la sauvegarde de la facture.");
      } else {
        // Garde le statut "Soldée/Non soldée" de la fiche express aligné
        // sur le statut payé de la facture liée.
        if (expressIdForDB) {
          const { error: expressPaidError } = await supabase
            .from("express")
            .update({ paid })
            .eq("id", expressIdForDB);
          if (expressPaidError) {
            console.error(
              "Erreur synchronisation statut payé express :",
              expressPaidError
            );
          }
        }

        showAlert("Succès", "Facture enregistrée avec succès.");
        setIsSaved(true);
      }
    } catch (e) {
      console.error("Erreur inattendue :", e);
      showAlert("Erreur", "Erreur inattendue lors de la sauvegarde.");
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
      <TouchableOpacity
        onPress={() => setPreviewMode((v) => !v)}
        style={{
          backgroundColor: previewMode ? "#374151" : "#2563eb",
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
          {previewMode ? "✏️ Retour au formulaire" : "👁️ Aperçu de la facture"}
        </Text>
      </TouchableOpacity>

      {previewMode ? (
        <WebView
          originWhitelist={["*"]}
          source={{ html: buildInvoiceHtml() }}
          style={{ flex: 1 }}
        />
      ) : (
      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={24}
        extraHeight={Platform.select({ ios: 0, android: 120 })}
        keyboardOpeningTime={0}
        contentContainerStyle={[styles.container, { paddingBottom: 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>🧾 Facture client</Text>

        {/* Carte : Client */}
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionTitle}>Client</Text>

          <View style={styles.cardFieldFull}>
            <Text style={styles.fieldLabel}>Nom du client</Text>
            <TextInput
              value={clientname}
              onChangeText={searchClients}
              style={[
                styles.input,
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

          <View style={styles.cardRow}>
            <View style={styles.cardField}>
              <Text style={styles.fieldLabel}>Téléphone</Text>
              <TextInput
                value={clientphone}
                onChangeText={setClientPhone}
                keyboardType="phone-pad"
                style={[
                  styles.input,
                  focusedField === "phone" && styles.inputFocused,
                ]}
                onFocus={() => setFocusedField("phone")}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <View style={styles.cardField}>
              <Text style={styles.fieldLabel}>Adresse</Text>
              <TextInput
                value={client_address}
                onChangeText={setClientAddress}
                style={[
                  styles.input,
                  focusedField === "address" && styles.inputFocused,
                ]}
                onFocus={() => setFocusedField("address")}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>
        </View>

        {/* Carte : Facture */}
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionTitle}>Facture</Text>

          <View style={styles.cardRow}>
            <View style={styles.cardField}>
              <Text style={styles.fieldLabel}>Numéro de facture</Text>
              <TextInput
                value={invoicenumber}
                editable={false}
                style={[
                  styles.input,
                  { backgroundColor: "#F3F4F6", color: "#6B7280" },
                ]}
              />
            </View>

            <View style={styles.cardField}>
              <Text style={styles.fieldLabel}>Date</Text>
              <TextInput
                value={invoicedate}
                onChangeText={setInvoiceDate}
                style={[
                  styles.input,
                  focusedField === "date" && styles.inputFocused,
                ]}
                onFocus={() => setFocusedField("date")}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          {quoteNumber ? (
            <Text style={styles.quoteRefText}>
              📎 Issu du devis : {quoteNumber}
            </Text>
          ) : null}
        </View>

        {/* Carte : Montant */}
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionTitle}>Montant</Text>

          <View style={styles.cardFieldFull}>
            <Text style={styles.fieldLabel}>Acompte versé (€)</Text>
            <TextInput
              value={acompte}
              onChangeText={setAcompte}
              keyboardType="numeric"
              placeholder="0"
              style={[
                styles.input,
                focusedField === "acompte" && styles.inputFocused,
              ]}
              onFocus={() => setFocusedField("acompte")}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {useGlobalTotal && (
            <View style={styles.cardFieldFull}>
              <Text style={styles.fieldLabel}>Montant total TTC du devis (€)</Text>
              <TextInput
                value={globalTotal}
                onChangeText={setGlobalTotal}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="Ex : 650"
              />
            </View>
          )}
        </View>

        {/* Carte : Prestations / Produits */}
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionTitle}>Prestations / Produits</Text>

        {/* Lignes */}
        {lines.map((line, index) => {
          const lineTotal = n(line.quantity) * n(line.price);

          return (
            <View key={index} style={styles.lineCard}>
              {/* Ligne titre + croix */}
              <View style={styles.lineTopRow}>
                <Text style={styles.lineLabel}>Ligne {index + 1}</Text>
                <TouchableOpacity
                  onPress={() => removeLine(index)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.lineDeleteText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Désignation + N° de série sur une seule ligne */}
              <View style={styles.lineTopInputsRow}>
                <TextInput
                  placeholder="Prestation / produit (désignation)"
                  value={line.designation}
                  onChangeText={(text) =>
                    updateLine(index, "designation", text)
                  }
                  style={[
                    styles.input,
                    styles.lineDesignationInputInline,
                    focusedField === `designation-${index}` &&
                      styles.inputFocused,
                  ]}
                  onFocus={() =>
                    setFocusedField(`designation-${index}`)
                  }
                  onBlur={() => setFocusedField(null)}
                />

                <TextInput
                  placeholder="N° série"
                  value={line.serial || ""}
                  onChangeText={(text) =>
                    updateLine(index, "serial", text)
                  }
                  style={[
                    styles.input,
                    styles.lineSerialInputInline,
                    focusedField === `serial-${index}` &&
                      styles.inputFocused,
                  ]}
                  onFocus={() =>
                    setFocusedField(`serial-${index}`)
                  }
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Qté / PU / Total */}
              <View style={styles.lineInputsRow}>
                {/* Qté */}
                <View style={styles.lineInputBlock}>
                  <Text style={styles.smallLabel}>Qté</Text>
                  <TextInput
                    placeholder="1"
                    value={line.quantity}
                    onChangeText={(text) =>
                      updateLine(index, "quantity", text)
                    }
                    keyboardType="numeric"
                    style={[
                      styles.input,
                      styles.lineSmallInput,
                      { textAlign: "center" },
                      focusedField === `quantity-${index}` &&
                        styles.inputFocused,
                    ]}
                    onFocus={() =>
                      setFocusedField(`quantity-${index}`)
                    }
                    onBlur={() => setFocusedField(null)}
                  />
                </View>

                {!useGlobalTotal && (
                  <>
                    {/* P.U. TTC */}
                    <View style={styles.lineInputBlock}>
                      <Text style={styles.smallLabel}>P.U. TTC</Text>
                      <TextInput
                        placeholder="0"
                        value={line.price}
                        onChangeText={(text) =>
                          updateLine(index, "price", text)
                        }
                        keyboardType="numeric"
                        style={[
                          styles.input,
                          styles.lineSmallInput,
                          { textAlign: "center" },
                          focusedField === `price-${index}` &&
                            styles.inputFocused,
                        ]}
                        onFocus={() =>
                          setFocusedField(`price-${index}`)
                        }
                        onBlur={() => setFocusedField(null)}
                      />
                    </View>

                    {/* Total TTC (lecture seule) */}
                    <View style={styles.lineInputBlock}>
                      <Text style={styles.smallLabel}>Total TTC</Text>
                      <Text style={styles.readonlyCell}>
                        {lineTotal.toFixed(2)} €
                      </Text>
                    </View>
                  </>
                )}
              </View>

            </View>
          );
        })}

        <TouchableOpacity
          style={styles.addMiniButton}
          onPress={() =>
            setLines([
              ...lines,
              { designation: "", quantity: "1", price: "", serial: "" },
            ])
          }
        >
          <Text style={styles.addMiniButtonText}>➕ Ligne</Text>
        </TouchableOpacity>
        </View>

        {/* Carte : Paiement */}
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionTitle}>Mode de paiement</Text>
        <View style={styles.paymentRow}>
          <TouchableOpacity
            style={[
              styles.paymentChip,
              paymentmethod === "CB" && styles.paymentChipSelected,
            ]}
            onPress={() => setPaymentMethod("CB")}
          >
            <Text
              style={[
                styles.paymentChipText,
                paymentmethod === "CB" && styles.paymentChipTextSelected,
              ]}
            >
              Carte bancaire
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.paymentChip,
              paymentmethod === "Espèces" && styles.paymentChipSelected,
            ]}
            onPress={() => setPaymentMethod("Espèces")}
          >
            <Text
              style={[
                styles.paymentChipText,
                paymentmethod === "Espèces" &&
                  styles.paymentChipTextSelected,
              ]}
            >
              Espèces
            </Text>
          </TouchableOpacity>
        </View>

        {/* Marquer payée */}
        <View style={styles.paidRow}>
          <Text style={styles.paidLabel}>État du règlement</Text>
          <TouchableOpacity
            onPress={() => setPaid(!paid)}
            style={[
              styles.paidPill,
              paid ? styles.paidPillOn : styles.paidPillOff,
            ]}
          >
            <Text
              style={[
                styles.paidPillText,
                paid ? styles.paidPillTextOn : styles.paidPillTextOff,
              ]}
            >
              {paid ? "Payée" : "Non payée"}
            </Text>
          </TouchableOpacity>
        </View>
        </View>

        <Text
          style={[
            styles.saveStateText,
            isSaved ? styles.saveStateOk : styles.saveStateWarn,
          ]}
        >
          {isSaved
            ? "Facture enregistrée et prête à être imprimée."
            : "Veuillez sauvegarder la facture avant impression."}
        </Text>

        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[
              styles.gridBtn,
              isSaved ? styles.gridBtnDisabled : styles.gridBtnPrimary,
            ]}
            onPress={handleSave}
            disabled={isSaved}
          >
            <Text
              style={[
                styles.gridBtnText,
                isSaved && styles.gridBtnTextDisabled,
              ]}
            >
              {isSaved ? "✅ Sauvegardée" : "💾 Sauvegarder"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.gridBtn,
              !isSaved || !paid
                ? styles.gridBtnDisabled
                : styles.gridBtnSuccess,
            ]}
            onPress={() => {
              if (!paid) {
                return alert(
                  "Impossible d'imprimer : la facture n'est pas encore payée."
                );
              }
              if (!isSaved) {
                return alert(
                  "Merci de sauvegarder la facture avant d'imprimer."
                );
              }
              handlePrint();
            }}
            disabled={!isSaved || !paid}
          >
            <Text
              style={[
                styles.gridBtnText,
                (!isSaved || !paid) && styles.gridBtnTextDisabled,
              ]}
            >
              🖨️ Imprimer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.gridBtn, styles.gridBtnDark]}
            onPress={() => navigation.navigate("BillingListPage")}
          >
            <Text style={styles.gridBtnText}>📋 Liste des factures</Text>
          </TouchableOpacity>

          <BackButton onPress={() => navigation.goBack()} />
        </View>
      </KeyboardAwareScrollView>
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
  ...commonStyles,
  // Alias : ce fichier utilise cardSection/cardSectionTitle dans le JSX,
  // le thème partage centralise le style sous card/cardTitle.
  cardSection: commonStyles.card,
  cardSectionTitle: commonStyles.cardTitle,

  quoteRefText: {
    fontStyle: "italic",
    color: "#555",
    fontSize: 12,
    marginTop: 2,
  },

  readonlyCell: {
    height: 40,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    backgroundColor: "#f9fafb",
    textAlign: "right",
    paddingHorizontal: 8,
    paddingTop: 9,
    fontSize: 13,
    color: "#111827",
  },

  // Paiement
  paymentRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  paymentChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 6,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  paymentChipSelected: {
    backgroundColor: "#2563eb",
    borderColor: "#1d4ed8",
  },
  paymentChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  paymentChipTextSelected: {
    color: "#ffffff",
  },

  // Payée / non payée
  paidRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  paidLabel: {
    fontSize: 13,
    color: "#4b5563",
  },
  paidPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  paidPillOn: {
    backgroundColor: "#ecfdf5",
    borderColor: "#bbf7d0",
  },
  paidPillOff: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
  },
  paidPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  paidPillTextOn: {
    color: "#15803d",
  },
  paidPillTextOff: {
    color: "#6b7280",
  },

  // État sauvegarde
  saveStateText: {
    textAlign: "center",
    fontSize: 12,
    marginBottom: 6,
    marginTop: 4,
  },
  saveStateOk: {
    color: "#15803d",
    fontWeight: "600",
  },
  saveStateWarn: {
    color: "#6b7280",
  },

  lineCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 8,
    marginBottom: 8,
  },
  lineTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  lineLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4b5563",
  },
  lineDeleteText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#9ca3af",
  },

  lineTopInputsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  lineDesignationInputInline: {
    flex: 2,
    fontSize: 13,
  },
  lineSerialInputInline: {
    flex: 1,
    fontSize: 13,
  },

  lineInputsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  lineInputBlock: {
    flex: 1,
  },
  smallLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 2,
  },
  lineSmallInput: {
    height: 38,
    fontSize: 13,
    paddingVertical: 6,
  },
});

export default BillingPage;
