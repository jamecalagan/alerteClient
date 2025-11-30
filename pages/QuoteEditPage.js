// pages/QuoteEditPage.js
import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Linking,
  Switch,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { supabase } from "../supabaseClient";

const BTN_COLS = 2; // 2 colonnes (sobre)
const GRID_BTN_WIDTH = BTN_COLS === 3 ? "32%" : "48%";

export default function QuoteEditPage() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // Params
  const editingId = route.params?.id || null;
  const { presetFromIntake, preset } = route.params || {};

  // États
  const suppressRef = useRef(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [items, setItems] = useState([
    { description: "", quantity: "1", unitPrice: "", total: "" },
  ]);
  const [remarks, setRemarks] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState("0");
  const [deposit, setDeposit] = useState("0");
  const [status, setStatus] = useState("en_attente");
  const [isSaved, setIsSaved] = useState(false);
  const [quoteId, setQuoteId] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  const [clientSuggestions, setClientSuggestions] = useState([]);

  const [clientId, setClientId] = useState(null);
  const [convertedOrderId, setConvertedOrderId] = useState(null);
  const [converting, setConverting] = useState(false); // anti double-tap

  // 👉 Nouveau : mode “coût global” (sans détail de prix)
  const [useGlobalTotal, setUseGlobalTotal] = useState(false);
  const [globalTotal, setGlobalTotal] = useState("");

  // === Helpers calcul ===
  const getTotalTTC = () =>
    items.reduce(
      (s, it) =>
        s +
        (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0),
      0
    );
  const getTotalHT = () => getTotalTTC() / 1.2;
  const getDiscountValue = () => getTotalHT() * (parseFloat(discount) / 100);
  const getTVA = (taux = 20) =>
    (getTotalHT() - getDiscountValue()) * (taux / 100);
  const getTotalTTCApresRemise = () =>
    getTotalHT() - getDiscountValue() + getTVA();
  const getTotalDue = () =>
    getTotalTTCApresRemise() - parseFloat(deposit || 0);

  // 👉 Nouveau : total TTC et total à payer en tenant compte du mode “coût global”
  const getEffectiveTotalTTC = () => {
    if (useGlobalTotal) {
      const v = parseFloat(globalTotal || 0);
      return Number.isFinite(v) ? v : 0;
    }
    return getTotalTTCApresRemise();
  };

  const getEffectiveTotalDue = () => {
    const total = getEffectiveTotalTTC();
    const acompte = parseFloat(deposit || 0) || 0;
    return total - acompte;
  };

  const getQuoteData = () => ({
    name,
    phone,
    email,
    items,
    remarks,
    // total stocké = soit coût global, soit total TTC classique
    total: useGlobalTotal
      ? (parseFloat(globalTotal || 0) || 0).toFixed(2)
      : getTotalTTC().toFixed(2),
    quote_number: quoteNumber,
    valid_until: validUntil,
    discount: parseFloat(discount || 0),
    deposit: parseFloat(deposit || 0),
    status,
    // champs BDD pour le mode “coût global”
    use_global_total: useGlobalTotal,
    global_total: useGlobalTotal ? parseFloat(globalTotal || 0) || 0 : null,
  });

  // === Chargement ===
  async function loadQuoteForEdit(id) {
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", id)
      .single();

    if (!error && data) {
      setName(data.name || "");
      setPhone(data.phone || "");
      setEmail(data.email || "");
      setItems(
        Array.isArray(data.items) && data.items.length
          ? data.items
          : [{ description: "", quantity: "1", unitPrice: "", total: "" }]
      );
      setRemarks(data.remarks || "");
      setQuoteNumber(data.quote_number || "");
      setValidUntil(data.valid_until || "");
      setClientId(data.client_id || null);

      setDiscount(
        (typeof data.discount === "number"
          ? data.discount
          : parseFloat(data.discount || "0")
        ).toString()
      );
      setDeposit(
        (typeof data.deposit === "number"
          ? data.deposit
          : parseFloat(data.deposit || "0")
        ).toString()
      );

      setStatus(data.status || "en_attente");
      setQuoteId(data.id);
      setConvertedOrderId(
        data.converted_to_order_id ? String(data.converted_to_order_id) : null
      );
      // 👉 Récupération du mode “coût global”
      setUseGlobalTotal(!!data.use_global_total);
      setGlobalTotal(
        data.global_total !== null && data.global_total !== undefined
          ? String(data.global_total)
          : ""
      );

      setIsSaved(true);
    } else {
      Alert.alert("Erreur", "Impossible de charger le devis.");
    }
  }

  // === Effects ===
  useEffect(() => {
    if (editingId) loadQuoteForEdit(editingId);
  }, [editingId]);

  useEffect(() => {
    if (!presetFromIntake) return;
    const {
      clientName,
      phone: phoneIn,
      email: emailIn,
      deviceType,
      brand,
      model,
      problem,
      condition,
      accessories,
      notes,
    } = presetFromIntake;

    setName(clientName || "");
    setPhone(phoneIn || "");
    setEmail(emailIn || "");

    const desc = [deviceType, brand, model, problem]
      .filter(Boolean)
      .join(" - ");
    setItems([{ description: desc, quantity: "1", unitPrice: "", total: "" }]);
    setRemarks([condition, accessories, notes].filter(Boolean).join("\n"));
  }, [presetFromIntake]);

  useEffect(() => {
    if (!validUntil) {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      setValidUntil(future.toISOString().split("T")[0]);
    }
  }, []);

  useEffect(() => {
    generateQuoteNumber();
  }, []);

  useEffect(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    if (name.length >= 2) searchClients(name);
    else setClientSuggestions([]);
  }, [name]);

  useEffect(() => {
    if (preset === "pc") {
      setItems([
        {
          label: "Boîtier PC",
          description: "",
          quantity: "1",
          unitPrice: "",
          total: "",
        },
        {
          label: "Carte mère",
          description: "",
          quantity: "1",
          unitPrice: "",
          total: "",
        },
        {
          label: "Processeur (CPU)",
          description: "",
          quantity: "1",
          unitPrice: "",
          total: "",
        },
        {
          label: "Mémoire RAM",
          description: "",
          quantity: "2",
          unitPrice: "",
          total: "",
        },
        {
          label: "Disque SSD / NVMe",
          description: "",
          quantity: "1",
          unitPrice: "",
          total: "",
        },
        {
          label: "Carte graphique (GPU)",
          description: "",
          quantity: "1",
          unitPrice: "",
          total: "",
        },
        {
          label: "Alimentation (PSU)",
          description: "",
          quantity: "1",
          unitPrice: "",
          total: "",
        },
        {
          label: "Refroidissement",
          description: "",
          quantity: "1",
          unitPrice: "",
          total: "",
        },
        {
          label: "Montage & tests",
          description: "",
          quantity: "1",
          unitPrice: "",
          total: "",
        },
        {
          label: "Installation système",
          description: "",
          quantity: "1",
          unitPrice: "",
          total: "",
        },
      ]);
    }
  }, [preset]);

  // === Autres helpers ===
  const generateQuoteNumber = async () => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const prefix = `DEV-AI-${year}-${month}`;
      const { data } = await supabase
        .from("quotes")
        .select("quote_number")
        .ilike("quote_number", `${prefix}-%`);
      const numbers = (data || []).map((q) => {
        const parts = q.quote_number?.split("-");
        return parts ? parseInt(parts[4], 10) : 0;
      });
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      const nextNumber = String(max + 1).padStart(4, "0");
      setQuoteNumber(`${prefix}-${nextNumber}`);
    } catch {}
  };

  const searchClients = async (text) => {
    setName(text);
    if (text.length < 2) {
      setClientSuggestions([]);
      return;
    }
    try {
      const [clientsRes, quotesRes] = await Promise.all([
        supabase.from("clients").select("name, phone").ilike("name", `${text}%`),
        supabase.from("quotes").select("name, phone").ilike("name", `${text}%`),
      ]);
      const merged = [...(clientsRes.data || []), ...(quotesRes.data || [])];
      const unique = [];
      const seen = new Set();
      for (const it of merged) {
        const k = `${it.name}-${it.phone || ""}`;
        if (!seen.has(k)) {
          unique.push(it);
          seen.add(k);
        }
      }
      setClientSuggestions(unique);
    } catch {
      setClientSuggestions([]);
    }
  };

  const selectClient = (client) => {
    suppressRef.current = true;
    setName(client.name);
    setPhone(client.phone || "");
    setClientSuggestions([]);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    const q = parseFloat(newItems[index].quantity) || 0;
    const pu = parseFloat(newItems[index].unitPrice) || 0;
    newItems[index].total = (q * pu).toFixed(2);
    setItems(newItems);
  };

  const addItem = () =>
    setItems([
      ...items,
      { description: "", quantity: "1", unitPrice: "", total: "" },
    ]);

  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  // === Save / Print ===
  const ensureSavedAndGetId = async () => {
    const payload = getQuoteData();
    if (editingId) {
      const { error } = await supabase
        .from("quotes")
        .update(payload)
        .eq("id", editingId);
      if (error) throw new Error(error.message);
      setIsSaved(true);
      setQuoteId(editingId);
      return editingId;
    } else {
      const { data, error } = await supabase
        .from("quotes")
        .insert([{ ...payload, created_at: new Date() }])
        .select();
      if (error) throw new Error(error.message);
      const newId = data?.[0]?.id;
      setIsSaved(true);
      setQuoteId(newId);
      return newId;
    }
  };

  const handleSave = async () => {
    try {
      if (!name || items.length === 0)
        return Alert.alert(
          "Erreur",
          "Le nom du client et une ligne de devis au moins sont requis."
        );

      if (useGlobalTotal && !globalTotal) {
        return Alert.alert(
          "Montant manquant",
          "Renseigne le coût total TTC pour ce devis."
        );
      }

      const id = await ensureSavedAndGetId();
      const quoteRequestId = route.params?.presetFromIntake?.quoteRequestId;
      if (quoteRequestId && id) {
        await supabase
          .from("quote_requests")
          .update({ status: "convertie", quote_id: id })
          .eq("id", quoteRequestId);
      }
      Alert.alert(editingId ? "✅ Devis modifié" : "✅ Devis enregistré");
    } catch (e) {
      Alert.alert("Erreur", String(e.message || e));
    }
  };

  const handlePrint = () => {
    if (!isSaved || !quoteId)
      return Alert.alert("Enregistrez d'abord le devis avant d'imprimer.");
    navigation.navigate("QuotePrintPage", { id: quoteId });
  };

  // === PDF sobre ===
  const buildQuoteHtml = () => {
    const useGlobal = useGlobalTotal;

    const tableHeader = useGlobal
      ? `
      <tr>
        <th style="padding:6px;border:1px solid #ddd;width:36px;">#</th>
        <th style="padding:6px;border:1px solid #ddd;">Désignation</th>
        <th style="padding:6px;border:1px solid #ddd;width:60px;">Qté</th>
      </tr>`
      : `
      <tr>
        <th style="padding:6px;border:1px solid #ddd;width:36px;">#</th>
        <th style="padding:6px;border:1px solid #ddd;">Désignation</th>
        <th style="padding:6px;border:1px solid #ddd;width:60px;">Qté</th>
        <th style="padding:6px;border:1px solid #ddd;width:90px;">PU TTC</th>
        <th style="padding:6px;border:1px solid #ddd;width:110px;">Total TTC</th>
      </tr>`;

    const rows = items
      .map((it, idx) => {
        const q = parseFloat(it.quantity) || 0;
        const labelPart = it.label ? `<strong>${it.label}</strong> - ` : "";
        const designation = labelPart + (it.description || "");

        if (useGlobal) {
          return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${idx + 1}</td>
          <td style="padding:6px;border:1px solid #ddd;">${designation}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${q}</td>
        </tr>`;
        } else {
          const pu = parseFloat(it.unitPrice) || 0;
          const tt = (q * pu).toFixed(2);
          return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${idx + 1}</td>
          <td style="padding:6px;border:1px solid #ddd;">${designation}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center;">${q}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${pu.toFixed(
            2
          )} €</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right;"><strong>${tt} €</strong></td>
        </tr>`;
        }
      })
      .join("");

    const totalHT = getTotalHT().toFixed(2);
    const remise = getDiscountValue().toFixed(2);
    const tva = getTVA().toFixed(2);
    const totalTTC = getTotalTTCApresRemise().toFixed(2);
    const acompte = (parseFloat(deposit || 0) || 0).toFixed(2);
    const du = getTotalDue().toFixed(2);

    const globalTTC = getEffectiveTotalTTC().toFixed(2);
    const globalDu = getEffectiveTotalDue().toFixed(2);

    const civiliteNom = name ? `M. ${name}` : "—";
    const today = new Date().toLocaleDateString();

    return `
<!DOCTYPE html><html lang="fr"><meta charset="utf-8" />
<body style="font-family:Arial, Helvetica, sans-serif; color:#111; padding:24px;">
  <header style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; border-bottom:2px solid #444; padding-bottom:8px;">
    <div><div style="font-size:20px; font-weight:800;">AVENIR INFORMATIQUE</div><div style="font-size:12px;">Réparations & Services</div></div>
    <div style="text-align:right;">
      <div style="font-size:22px; font-weight:800;">DEVIS</div>
      <div style="font-size:13px;">N° ${quoteNumber || "—"}</div>
      <div style="font-size:12px;">Date : ${today}</div>
      <div style="font-size:12px;">Valable jusqu'au : ${validUntil || "—"}</div>
    </div>
  </header>

  <section style="margin:10px 0 16px 0;">
    <div style="font-size:14px;"><strong>Client :</strong> ${civiliteNom}</div>
    ${phone ? `<div style="font-size:12px;">Tél : ${phone}</div>` : ""}
    ${email ? `<div style="font-size:12px;">E-mail : ${email}</div>` : ""}
  </section>

  <table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:6px;">
    <thead>
      ${tableHeader}
    </thead>
    <tbody>${
      rows ||
      `<tr><td colspan="${useGlobal ? 3 : 5}" style="padding:10px;border:1px solid #ddd;">(Aucune ligne)</td></tr>`
    }</tbody>
  </table>

  <section style="display:flex; justify-content:flex-end; margin-top:12px;">
    <table style="border-collapse:collapse; font-size:12px;">
      ${
        useGlobal
          ? `
      <tr><td style="padding:6px;border:1px solid #ddd;">Coût total TTC</td><td style="padding:6px;border:1px solid #ddd; text-align:right;">${globalTTC} €</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;">Acompte</td><td style="padding:6px;border:1px solid #ddd; text-align:right;">-${acompte} €</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;"><strong>Total à payer</strong></td><td style="padding:6px;border:1px solid #ddd; text-align:right;"><strong>${globalDu} €</strong></td></tr>
      `
          : `
      <tr><td style="padding:6px;border:1px solid #ddd;">Total HT</td><td style="padding:6px;border:1px solid #ddd; text-align:right;">${totalHT} €</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;">Remise</td><td style="padding:6px;border:1px solid #ddd; text-align:right;">-${remise} €</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;">TVA (20%)</td><td style="padding:6px;border:1px solid #ddd; text-align:right;">${tva} €</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;"><strong>Total TTC</strong></td><td style="padding:6px;border:1px solid #ddd; text-align:right;"><strong>${totalTTC} €</strong></td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;">Acompte</td><td style="padding:6px;border:1px solid #ddd; text-align:right;">-${acompte} €</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;"><strong>Total à payer</strong></td><td style="padding:6px;border:1px solid #ddd; text-align:right;"><strong>${du} €</strong></td></tr>
      `
      }
    </table>
  </section>

  ${
    remarks
      ? `<section style="margin-top:14px; font-size:12px;"><strong>Remarques :</strong><br/>${String(
          remarks
        ).replace(/\n/g, "<br/>")}</section>`
      : ""
  }

  <footer style="margin-top:18px; font-size:11px; color:#444;">Merci pour votre confiance. Devis valable sous réserve de disponibilité des pièces. Les délais de réparation sont indicatifs.</footer>
</body></html>`;
  };

  const handleCreatePdfAndShare = async () => {
    try {
      if (!name || items.length === 0) {
        Alert.alert("Erreur", "Nom client et au moins une ligne sont requis.");
        return;
      }

      if (useGlobalTotal && !globalTotal) {
        Alert.alert(
          "Montant manquant",
          "Renseigne le coût total TTC pour ce devis."
        );
        return;
      }

      const html = buildQuoteHtml();
      const { uri } = await Print.printToFileAsync({ html });
      if (!uri) {
        Alert.alert("Erreur", "Impossible de générer le PDF.");
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "Partage indisponible",
          "Le partage natif n’est pas disponible sur cet appareil."
        );
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Envoyer le devis",
        UTI: "com.adobe.pdf",
      });
    } catch (e) {
      console.log("❌ handleCreatePdfAndShare:", e);
      Alert.alert("Erreur", "Création ou partage du PDF impossible.");
    }
  };

  const handleSmsTextOnly = async () => {
    try {
      if (!phone) {
        Alert.alert("Téléphone manquant", "Ajoute un numéro pour envoyer le SMS.");
        return;
      }
      const who = name ? `Bonjour M. ${name},` : "Bonjour,";
      const refTxt = quoteNumber ? ` (réf. ${quoteNumber})` : "";
      const body =
        `${who} votre devis${refTxt} est prêt chez AVENIR INFORMATIQUE. ` +
        `Merci de nous répondre pour valider.`;

      const smsUrl = `sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(
        body
      )}`;
      const can = await Linking.canOpenURL("sms:");
      if (can) {
        await Linking.openURL(smsUrl);
      } else {
        await Clipboard.setStringAsync(String(phone));
        await Linking.openURL("https://messages.google.com/web");
        Alert.alert("Numéro copié", "Pas d’app SMS. Messages Web ouvert.");
      }
    } catch (e) {
      console.log("❌ handleSmsTextOnly:", e);
      Alert.alert("Erreur", "Impossible d’ouvrir l’envoi SMS.");
    }
  };

  const shortId = (v) => {
    if (!v) return "";
    const s = String(v);
    return s.slice(0, 8);
  };

  // === Convertir le devis en commande (garde-fous UI + BDD) ===
  const handleConvertToOrder = async () => {
    if (convertedOrderId) {
      return Alert.alert(
        "Déjà converti",
        "Ce devis a déjà été transformé en commande."
      );
    }
    if (converting) return; // anti double-tap
    setConverting(true);

    try {
      // 1) S’assurer que le devis est bien enregistré
      const qid = await ensureSavedAndGetId();

      // 2) Relecture BDD (cas état local perdu)
      const { data: q, error: qErr } = await supabase
        .from("quotes")
        .select("status, converted_to_order_id")
        .eq("id", qid)
        .single();

      if (!qErr && q?.converted_to_order_id) {
        const existedId = String(q.converted_to_order_id);
        setConvertedOrderId(existedId);
        setStatus(q?.status || "converti");
        Alert.alert("Déjà converti", "Ce devis a déjà une commande liée.");
        navigation.navigate("OrdersPage", {
          refreshAt: Date.now(),
          focusId: existedId,
        });
        return;
      }

      // 3) Forcer "accepte" si pas déjà
      if ((q?.status || status) !== "accepte") {
        await supabase.from("quotes").update({ status: "accepte" }).eq("id", qid);
        setStatus("accepte");
      }

      // 4) Montants (prend en compte le mode “coût global”)
      const totalTTCnum = Number(getEffectiveTotalTTC().toFixed(2));
      const acompteNum = Number(parseFloat(deposit || 0).toFixed(2));

      // 5) Désignation / brand/model sûrs
      const first = items?.[0] || {};
      const productLabel =
        (first.description && String(first.description).trim()) ||
        (first.label && String(first.label).trim()) ||
        (quoteNumber ? `Commande liée au devis ${quoteNumber}` : "Commande issue de devis");

      const safeStr = (v) => (v == null ? "" : String(v));
      const brandSafe = safeStr(first.brand) || "";
      const modelSafe = safeStr(first.model) || "";

      // 6) Payload conforme à ta table orders
      const orderPayload = {
        product: productLabel || "Commande",
        brand: brandSafe,
        model: modelSafe,

        price: totalTTCnum,
        deposit: acompteNum,
        total: totalTTCnum,

        quantity: "1",
        createdat: new Date().toISOString(),

        client_id: clientId || null,
        client_name: name || null,
        client_phone: phone || null,
        client_number: null,

        paid: false,
        saved: true,
        ordered: true,
        received: false,
        deleted: false,

        printed: false,
        notified: null,
        notify_type: "none",
        signatureclient: null,

        paid_at: null,
        photo_url: null,
        order_photos: "[]",
        serial: null,
        user_id: null,

        // Garde-fou BDD anti doublon (index unique conseillé)
        source_quote_id: qid,
      };

      // 7) Insertion
      const { data: inserted, error: insErr } = await supabase
        .from("orders")
        .insert([orderPayload])
        .select()
        .single();

      // 7-bis) Si contrainte unique (23505)
      if (insErr && insErr.code === "23505") {
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("source_quote_id", qid)
          .maybeSingle();

        const existingId = existingOrder?.id ? String(existingOrder.id) : null;
        if (existingId) {
          setConvertedOrderId(existingId);
          setStatus("converti");
          Alert.alert("Déjà converti", "Ce devis a déjà une commande liée.");
          navigation.navigate("OrdersPage", {
            refreshAt: Date.now(),
            focusId: existingId,
          });
          return;
        }
        throw insErr;
      }

      if (insErr) throw insErr;

      const newOrderId = inserted?.id ? String(inserted.id) : null;

      // 8) Marquer le devis converti + lier
      setConvertedOrderId(newOrderId);
      setStatus("converti");
      await supabase
        .from("quotes")
        .update({
          status: "converti",
          converted_to_order_id: newOrderId,
        })
        .eq("id", qid);

      // 9) Confirme + navigue
      Alert.alert(
        "✅ Converti",
        `Le devis a été transformé en commande #${shortId(newOrderId)}.`
      );
      navigation.navigate("OrdersPage", {
        clientId: clientId || null,
        clientName: name || "",
        clientPhone: phone || "",
        clientNumber: null, // si tu l’as, mets-le ici
        focusId: inserted?.id, // la commande nouvellement créée
        refreshAt: Date.now(), // force un rechargement
      });
    } catch (e) {
      console.log("❌ handleConvertToOrder:", e);
      Alert.alert("Erreur", String(e.message || e));
    } finally {
      setConverting(false);
    }
  };

  // === UI ===
  return (
    <KeyboardAwareScrollView
      enableOnAndroid
      extraScrollHeight={24}
      extraHeight={Platform.select({ ios: 0, android: 120 })}
      keyboardOpeningTime={0}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: 32 + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>📝 Nouveau Devis</Text>

      {convertedOrderId ? (
        <Text
          style={{
            textAlign: "center",
            color: "#065f46",
            fontWeight: "700",
            marginBottom: 8,
          }}
        >
          ✅ Devis converti (commande #{shortId(convertedOrderId)}…)
        </Text>
      ) : null}

      {/* Carte : infos de devis */}
      <View style={styles.cardSection}>
        <Text style={styles.cardSectionTitle}>Informations devis</Text>

        <View style={styles.cardRow}>
          <View style={styles.cardField}>
            <Text style={styles.fieldLabel}>Numéro</Text>
            <TextInput
              style={styles.input}
              value={quoteNumber}
              onChangeText={setQuoteNumber}
              placeholder="DEV-AI-2025-10-0001"
            />
          </View>

          <View style={styles.cardField}>
            <Text style={styles.fieldLabel}>Valable jusqu'au</Text>
            <TextInput
              style={styles.input}
              value={validUntil}
              onChangeText={setValidUntil}
              placeholder="2025-12-31"
            />
          </View>
        </View>
      </View>

      {/* Carte : client */}
      <View style={styles.cardSection}>
        <Text style={styles.cardSectionTitle}>Client</Text>

        <View style={styles.cardFieldFull}>
          <Text style={styles.fieldLabel}>Nom</Text>
          <TextInput
            style={[
              styles.input,
              focusedField === "name" && styles.inputFocused,
            ]}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocusedField("name")}
            onBlur={() => setFocusedField(null)}
            placeholder="JEAN DUPONT"
          />
        </View>

        {clientSuggestions.length > 0 && (
          <View style={styles.suggestionBox}>
            {clientSuggestions.map((it, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => selectClient(it)}
                style={styles.suggestionItem}
              >
                <Text>
                  {it.name} - {it.phone}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.cardRow}>
          <View style={styles.cardField}>
            <Text style={styles.fieldLabel}>Téléphone</Text>
            <TextInput
              style={[
                styles.input,
                focusedField === "phone" && styles.inputFocused,
              ]}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              onFocus={() => setFocusedField("phone")}
              onBlur={() => setFocusedField(null)}
              placeholder="06 xx xx xx xx"
            />
          </View>

          <View style={styles.cardField}>
            <Text style={styles.fieldLabel}>E-mail</Text>
            <TextInput
              style={[
                styles.input,
                focusedField === "email" && styles.inputFocused,
              ]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              placeholder="exemple@client.com"
            />
          </View>
        </View>
      </View>


      
      <View style={styles.pcHelperRow}>
        <TouchableOpacity
          style={styles.pcHelperButton}
          onPress={() =>
            navigation.navigate("PcComponentsTablePage", {
              fromQuote: true,
              quoteId: editingId || quoteId || null,
              clientName: name || "",
            })
          }
        >
          <Text style={styles.pcHelperButtonText}>
            ⚙️ Préparer une configuration PC gamer
          </Text>
          <Text style={styles.pcHelperButtonSub}>
            Ouvre la page composants, remplis marque / modèle / détails, copie
            le texte et colle-le ensuite dans les lignes ci-dessous.
          </Text>
        </TouchableOpacity>
      </View>

            {/* Carte : Prestations / Produits */}
      <View style={styles.cardSection}>
        <View style={styles.cardSectionHeaderRow}>
          <Text style={styles.cardSectionTitle}>Prestations / Produits</Text>

          <TouchableOpacity style={styles.addMiniButton} onPress={addItem}>
            <Text style={styles.addMiniButtonText}>➕ Ligne</Text>
          </TouchableOpacity>
        </View>

        {/* En-tête du tableau */}
        <View style={styles.itemsHeaderRow}>
          <Text style={[styles.itemsHeaderText, { flex: 2 }]}>Désignation</Text>
          <Text
            style={[
              styles.itemsHeaderText,
              { flex: 0.7, textAlign: "center" },
            ]}
          >
            Qté
          </Text>
          <Text
            style={[
              styles.itemsHeaderText,
              { flex: 1, textAlign: "right" },
            ]}
          >
            PU TTC
          </Text>
          <View style={{ width: 26 }} />
        </View>

        {items.map((item, index) => (
          <View key={index} style={styles.itemRowCard}>
            {item.label && (
              <Text style={styles.itemLabel}>{item.label}</Text>
            )}

            <View style={styles.rowLine}>
              <TextInput
                style={[styles.input, styles.itemInputDescription]}
                placeholder="Marque / modèle / détails"
                value={item.description}
                onChangeText={(t) => updateItem(index, "description", t)}
              />

              <TextInput
                style={[styles.input, styles.itemInputQty]}
                placeholder="Qté"
                keyboardType="numeric"
                value={item.quantity}
                onChangeText={(t) => updateItem(index, "quantity", t)}
              />

              <TextInput
                style={[styles.input, styles.itemInputPrice]}
                placeholder="Prix"
                keyboardType="decimal-pad"
                value={item.unitPrice}
                onChangeText={(t) => updateItem(index, "unitPrice", t)}
              />

              <TouchableOpacity
                style={styles.itemRemoveButton}
                onPress={() => removeItem(index)}
              >
                <Text style={styles.removeButton}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}


      </View>

      {/* Carte : Montant du devis */}
      <View style={styles.cardSection}>
        <Text style={styles.cardSectionTitle}>Montant du devis</Text>

        <View style={styles.switchRow}>
          <Text style={styles.labelInline}>
            Coût global (un seul montant TTC)
          </Text>
          <Switch value={useGlobalTotal} onValueChange={setUseGlobalTotal} />
        </View>

        {useGlobalTotal ? (
          <View style={styles.cardFieldFull}>
            <Text style={styles.fieldLabel}>Coût total TTC (€)</Text>
            <TextInput
              style={styles.input}
              value={globalTotal}
              onChangeText={setGlobalTotal}
              keyboardType="decimal-pad"
              placeholder="ex : 250"
            />
          </View>
        ) : (
          <View style={styles.cardFieldFull}>
            <Text style={styles.fieldLabel}>Remise globale (%)</Text>
            <TextInput
              style={styles.input}
              value={discount}
              onChangeText={setDiscount}
              keyboardType="decimal-pad"
              placeholder="ex : 10"
            />
          </View>
        )}

        <View style={styles.cardFieldFull}>
          <Text style={styles.fieldLabel}>Acompte versé (€)</Text>
          <TextInput
            style={styles.input}
            value={deposit}
            onChangeText={setDeposit}
            keyboardType="decimal-pad"
            placeholder="ex : 100"
          />
        </View>
      </View>


{useGlobalTotal ? (
  <View style={styles.totalsCard}>
    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>Total TTC</Text>
      <Text style={styles.totalsValueStrong}>
        {getEffectiveTotalTTC().toFixed(2)} €
      </Text>
    </View>

    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>Acompte</Text>
      <Text style={styles.totalsValueNegative}>
        -{parseFloat(deposit || 0).toFixed(2)} €
      </Text>
    </View>

    <View style={[styles.totalsRow, styles.totalsRowHighlight]}>
      <Text style={[styles.totalsLabel, styles.totalsLabelStrong]}>
        Total à payer
      </Text>
      <Text style={styles.totalsValueBig}>
        {getEffectiveTotalDue().toFixed(2)} €
      </Text>
    </View>
  </View>
) : (

  <View style={styles.totalsCard}>
    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>Total HT</Text>
      <Text style={styles.totalsValue}>
        {getTotalHT().toFixed(2)} €
      </Text>
    </View>

    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>Remise</Text>
      <Text style={styles.totalsValueNegative}>
        -{getDiscountValue().toFixed(2)} €
      </Text>
    </View>

    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>TVA (20%)</Text>
      <Text style={styles.totalsValue}>
        {getTVA().toFixed(2)} €
      </Text>
    </View>

    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>Total TTC</Text>
      <Text style={styles.totalsValueStrong}>
        {getTotalTTCApresRemise().toFixed(2)} €
      </Text>
    </View>

    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>Acompte</Text>
      <Text style={styles.totalsValueNegative}>
        -{parseFloat(deposit || 0).toFixed(2)} €
      </Text>
    </View>

    <View style={[styles.totalsRow, styles.totalsRowHighlight]}>
      <Text style={[styles.totalsLabel, styles.totalsLabelStrong]}>
        Total à payer
      </Text>
      <Text style={styles.totalsValueBig}>
        {getTotalDue().toFixed(2)} €
      </Text>
    </View>
  </View>
)}

<View style={styles.totalsCard}>
  <View style={styles.totalsRow}>
    <Text style={styles.totalsLabel}>Total HT</Text>
    <Text style={styles.totalsValue}>
      {getTotalHT().toFixed(2)} €
    </Text>
  </View>

  <View style={styles.totalsRow}>
    <Text style={styles.totalsLabel}>Remise</Text>
    <Text style={styles.totalsValueNegative}>
      -{getDiscountValue().toFixed(2)} €
    </Text>
  </View>

  <View style={styles.totalsRow}>
    <Text style={styles.totalsLabel}>TVA (20%)</Text>
    <Text style={styles.totalsValue}>
      {getTVA().toFixed(2)} €
    </Text>
  </View>

  <View style={styles.totalsRow}>
    <Text style={styles.totalsLabel}>Total TTC</Text>
    <Text style={styles.totalsValueStrong}>
      {getTotalTTCApresRemise().toFixed(2)} €
    </Text>
  </View>

  <View style={styles.totalsRow}>
    <Text style={styles.totalsLabel}>Acompte</Text>
    <Text style={styles.totalsValueNegative}>
      -{parseFloat(deposit || 0).toFixed(2)} €
    </Text>
  </View>

  <View style={[styles.totalsRow, styles.totalsRowHighlight]}>
    <Text style={[styles.totalsLabel, styles.totalsLabelStrong]}>
      Total à payer
    </Text>
    <Text style={styles.totalsValueBig}>
      {getTotalDue().toFixed(2)} €
    </Text>
  </View>
</View>



      <Text style={styles.label}>Remarques ou conditions particulières</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        multiline
        value={remarks}
        onChangeText={setRemarks}
      />

            <View style={styles.actionsGrid}>
        <TouchableOpacity
          style={[styles.gridBtn, styles.gridBtnPrimary]}
          onPress={handleSave}
        >
          <Text style={styles.gridBtnText}>💾 Enregistrer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.gridBtn,
            isSaved ? styles.gridBtnSuccess : styles.gridBtnDisabled,
          ]}
          onPress={handlePrint}
          disabled={!isSaved}
        >
          <Text
            style={[
              styles.gridBtnText,
              !isSaved && styles.gridBtnTextDisabled,
            ]}
          >
            🖨️ Imprimer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.gridBtn, styles.gridBtnBrown]}
          onPress={handleCreatePdfAndShare}
        >
          <Text style={styles.gridBtnText}>📄 PDF</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.gridBtn,
            phone ? styles.gridBtnDark : styles.gridBtnDisabled,
          ]}
          onPress={handleSmsTextOnly}
          disabled={!phone}
        >
          <Text
            style={[
              styles.gridBtnText,
              !phone && styles.gridBtnTextDisabled,
            ]}
          >
            ✉️ SMS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.gridBtn,
            convertedOrderId || converting
              ? styles.gridBtnDisabled
              : styles.gridBtnPurple,
          ]}
          onPress={handleConvertToOrder}
          disabled={!!convertedOrderId || converting}
        >
          <Text
            style={[
              styles.gridBtnText,
              (convertedOrderId || converting) && styles.gridBtnTextDisabled,
            ]}
          >
            {convertedOrderId
              ? "✅ Commande"
              : converting
              ? "…"
              : "↪️ Commande"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.gridBtn, styles.gridBtnNeutral]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.gridBtnText}>⬅ Retour</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 12 + insets.bottom }} />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#fff" },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    borderRadius: 6,
    backgroundColor: "#fff",
    fontSize: 16,
    color: "#111827",
  },
  inputFocused: { borderColor: "#007bff", backgroundColor: "#eef6ff" },
  label: { fontWeight: "bold", marginBottom: 5, marginTop: 10 },
  subtitle: { fontSize: 18, fontWeight: "bold", marginVertical: 10 },
  itemRow: { marginBottom: 12 },
  itemLabel: {
    fontWeight: "bold",
    fontSize: 13,
    marginBottom: 4,
    color: "#333",
  },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  removeButton: { fontSize: 20, marginLeft: 8 },
  addButton: {
    backgroundColor: "#007bff",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 10,
  },
  addButtonText: { color: "#fff", fontWeight: "bold" },
  total: { fontSize: 16, fontWeight: "bold", marginVertical: 4 },
  suggestionBox: {
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    marginBottom: 10,
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 10,
  },
  gridBtn: {
    width: GRID_BTN_WIDTH,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  gridBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  // 👉 Styles pour le mode “coût global”
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  labelInline: {
    fontWeight: "bold",
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  // 👉 Styles pour le bouton d’accès à PcComponentsTablePage
  pcHelperRow: {
    marginTop: 12,
    marginBottom: 4,
  },
  pcHelperButton: {
    backgroundColor: "#f3f4ff",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#a5b4fc",
  },
  pcHelperButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1d4ed8",
    marginBottom: 2,
  },
  pcHelperButtonSub: {
    fontSize: 12,
    color: "#4b5563",
  },
    totalsCard: {
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  totalsRowHighlight: {
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    marginTop: 4,
    paddingTop: 6,
  },
  totalsLabel: {
    fontSize: 13,
    color: "#4b5563",
  },
  totalsLabelStrong: {
    fontWeight: "700",
    color: "#111827",
  },
  totalsValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  totalsValueStrong: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  totalsValueNegative: {
    fontSize: 13,
    fontWeight: "600",
    color: "#b91c1c",
  },
  totalsValueBig: {
    fontSize: 15,
    fontWeight: "800",
    color: "#065f46",
  },
    cardSection: {
    marginTop: 10,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  cardRow: {
    flexDirection: "row",
    gap: 8,
  },
  cardField: {
    flex: 1,
  },
  cardFieldFull: {
    width: "100%",
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4b5563",
    marginBottom: 2,
  },
  cardSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  addMiniButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e0f2fe",
    borderWidth: 1,
    borderColor: "#38bdf8",
  },
  addMiniButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0369a1",
  },
  itemsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
    marginBottom: 4,
  },
  itemsHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#374151",
  },
  itemRowCard: {
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  itemInputDescription: {
    flex: 2,
  },
  itemInputQty: {
    flex: 0.7,
    textAlign: "center",
  },
  itemInputPrice: {
    flex: 1,
    textAlign: "right",
  },
  itemRemoveButton: {
    marginLeft: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 4,
  },
  gridBtn: {
    width: GRID_BTN_WIDTH,        // tu l'as déjà défini en haut
    minHeight: 36,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginBottom: 6,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#e5e7eb",
  },
  gridBtnPrimary: {
    backgroundColor: "#2563eb",
  },
  gridBtnSuccess: {
    backgroundColor: "#22c55e",
  },
  gridBtnBrown: {
    backgroundColor: "#92400e",
  },
  gridBtnDark: {
    backgroundColor: "#4b5563",
  },
  gridBtnPurple: {
    backgroundColor: "#8b5cf6",
  },
  gridBtnNeutral: {
    backgroundColor: "#6b7280",
  },
  gridBtnDisabled: {
    backgroundColor: "#d1d5db",
  },
  gridBtnText: {
    color: "#f9fafb",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  gridBtnTextDisabled: {
    color: "#6b7280",
  },


});
