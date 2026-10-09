// Fonctions partagées par RepriseListPage et RepriseEditPage (table
// "reprises", voir scripts/sql/reprises.sql).
import { supabase } from "../supabaseClient";

export const REPRISE_BUCKET = "images"; // bucket existant
export const REPRISE_FOLDER = "reprises"; // reprises/<id>/...

export const ID_TYPES = [
  "Carte d'identité",
  "Passeport",
  "Titre de séjour",
  "Permis de conduire",
];

export const CONDITIONS = ["Très bon état", "Bon état", "État correct", "Pour pièces"];

export const PAYMENT_METHODS = ["Virement", "Chèque", "Espèces", "Carte bancaire"];

export const formatRepriseNumber = (numero) =>
  numero != null ? `REP-${String(numero).padStart(6, "0")}` : "REP-……";

export const toNum = (v) => {
  const x = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

// Taille A5 en points, à passer à Print.printAsync : le @page CSS seul est
// souvent ignoré par la boîte de dialogue d'impression Android.
export const A5_PRINT_SIZE = { width: 420, height: 595 };

export const formatEuro = (value) =>
  `${toNum(value).toFixed(2).replace(".", ",")} €`;

export const isLocalUri = (uri) =>
  typeof uri === "string" &&
  (uri.startsWith("file://") || uri.startsWith("content://"));

// Envoie une photo locale dans le bucket et renvoie son chemin.
export const uploadReprisePhoto = async (repriseId, localUri, kind = "photo") => {
  const uriWithoutQuery = localUri.split("?")[0];
  const rawExtension = uriWithoutQuery.split(".").pop()?.toLowerCase() || "jpg";
  const extension = ["jpg", "jpeg", "png", "webp"].includes(rawExtension)
    ? rawExtension
    : "jpg";
  const mimeType =
    extension === "png"
      ? "image/png"
      : extension === "webp"
      ? "image/webp"
      : "image/jpeg";

  const filePath = `${REPRISE_FOLDER}/${repriseId}/${kind}-${Date.now()}-${Math.round(
    Math.random() * 1000
  )}.${extension}`;

  const { error } = await supabase.storage.from(REPRISE_BUCKET).upload(
    filePath,
    { uri: localUri, name: filePath.split("/").pop(), type: mimeType },
    { cacheControl: "3600", upsert: true, contentType: mimeType }
  );
  if (error) throw error;
  return filePath;
};

// URL affichable d'une photo (chemin du bucket → URL signée 1 h).
export const resolveReprisePhoto = async (pathOrUri) => {
  if (!pathOrUri) return null;
  if (isLocalUri(pathOrUri) || /^https?:\/\//i.test(pathOrUri)) return pathOrUri;
  const { data, error } = await supabase.storage
    .from(REPRISE_BUCKET)
    .createSignedUrl(pathOrUri, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const yesNo = (v) =>
  v ? '<span class="ok">✔ Oui</span>' : '<span class="ko">✘ Non</span>';

// Document imprimé (A5, une seule page ; imprimé deux fois), même charte que
// les devis (QuotePrintPage) : logo, titre, encadrés, tableaux bordés, pied
// de page société. La photo de la pièce d'identité n'est jamais imprimée
// (seuls type et numéro le sont).
export const buildRepriseHtml = (r, photoUrls = []) => {
  const date = r.created_at
    ? new Date(r.created_at).toLocaleDateString("fr-FR")
    : new Date().toLocaleDateString("fr-FR");
  const address = [
    r.seller_address,
    [r.seller_postal_code, r.seller_city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const isDeduction = r.reprise_type === "deduction";
  const device = [r.device_type, r.brand, r.model].filter(Boolean).join(" — ");
  const idLine = [
    r.id_type,
    r.id_number ? `n° ${r.id_number}` : "",
    r.id_issue_date ? `du ${r.id_issue_date}` : "",
    r.id_issuer ? `(${r.id_issuer})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const photosHtml = photoUrls.length
    ? `<div class="photos">${photoUrls
        .slice(0, 4)
        .map((u) => `<img src="${u}" />`)
        .join("")}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    /* Marge portée par .wrap : la marge @page est ignorée par l'impression Android */
    @page { size: A5; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 8.5px; }
    .wrap { box-sizing: border-box; width: 100%; padding: 9mm 10mm 7mm 10mm; }

    .header { text-align: center; margin-bottom: 4px; }
    .header img { height: 34px; }
    .title { font-size: 14px; font-weight: 700; margin: 3px 0 0 0; letter-spacing: 1px; }
    .subtitle { font-size: 9px; font-weight: 700; color: #333; margin-bottom: 6px; }

    .meta { display: flex; gap: 6px; margin: 0 0 6px 0; }
    .card { border: 1px solid #000; border-radius: 5px; padding: 4px 6px; flex: 1; }
    .card h3 { margin: 0 0 2px 0; font-size: 9px; text-transform: uppercase; }
    .card p { margin: 1px 0; font-size: 8.5px; }

    .section { font-size: 9px; font-weight: 700; text-transform: uppercase; margin: 6px 0 2px 0; }
    table { width: 100%; border-collapse: collapse; }
    .td { border: 1px solid #000; padding: 2px 4px; font-size: 8.5px; vertical-align: top; }
    .lbl { background: #efefef; width: 34%; font-weight: bold; }
    .ok { color: #15803d; font-weight: bold; }
    .ko { color: #b91c1c; font-weight: bold; }

    .amount { margin-top: 6px; display: flex; justify-content: flex-end; }
    .amount div { border: 2px solid #000; border-radius: 5px; padding: 4px 10px; font-size: 11px; font-weight: bold; }

    .photos { margin-top: 5px; }
    .photos img { width: 60px; height: 60px; object-fit: cover; border: 1px solid #000; margin-right: 3px; }

    .mentions { font-size: 7.5px; margin-top: 6px; text-align: justify; line-height: 1.3; }

    .signs { display: flex; gap: 6px; margin-top: 5px; }
    .sign { flex: 1; border: 1px solid #000; border-radius: 5px; padding: 3px 5px; height: 62px; }
    .sign h4 { margin: 0; font-size: 8px; }
    .sign img { max-width: 150px; max-height: 46px; object-fit: contain; }

    .footer { text-align: center; font-size: 6.5px; color: #444; line-height: 1.25; margin-top: 6px; }

    /* Aperçu à l'écran uniquement (comme les devis) : lecture plus confortable,
       sans effet sur l'impression réelle (canvas contraint à 420x595 pt). */
    @media screen {
      body { font-size: 13px; }
      .wrap { padding: 20px; }
      .header img { height: 56px; }
      .title { font-size: 22px; }
      .subtitle { font-size: 14px; margin-bottom: 14px; }
      .meta { gap: 14px; margin-bottom: 14px; }
      .card { padding: 10px 12px; }
      .card h3 { font-size: 14px; margin-bottom: 6px; }
      .card p, .td { font-size: 13px; }
      .section { font-size: 14px; margin-top: 14px; }
      .td { padding: 6px 8px; }
      .amount div { font-size: 18px; padding: 8px 16px; }
      .photos img { width: 120px; height: 120px; }
      .mentions { font-size: 12px; line-height: 1.5; }
      .sign { height: 110px; padding: 8px; }
      .sign h4 { font-size: 13px; }
      .sign img { max-width: 260px; max-height: 80px; }
      .footer { font-size: 11px; margin-top: 16px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <img src="https://www.avenir-informatique.fr/logo.webp" alt="Avenir Informatique" />
      <div class="title">FICHE DE REPRISE</div>
      <div class="subtitle">${esc(formatRepriseNumber(r.numero))} — ${date}</div>
    </div>

    <div class="meta">
      <div class="card">
        <h3>Vendeur</h3>
        <p><strong>${esc(r.seller_name)}</strong></p>
        <p>Tél : ${esc(r.seller_phone) || "—"}</p>
        ${r.seller_email ? `<p>${esc(r.seller_email)}</p>` : ""}
        <p>${esc(address) || "—"}</p>
      </div>
      <div class="card">
        <h3>Pièce d'identité</h3>
        <p>${esc(idLine) || "—"}</p>
        <h3 style="margin-top:4px;">Reprise</h3>
        <p>${isDeduction ? "Valeur déduite d'un achat / réparation" : "Rachat"}</p>
        <p>${
          isDeduction
            ? `Déduit de : ${esc(r.deduction_note) || "—"}`
            : `Paiement : ${esc(r.payment_method) || "—"}`
        }</p>
      </div>
    </div>

    <div class="section">Matériel repris</div>
    <table>
      <tr><td class="td lbl">Matériel</td><td class="td">${esc(device) || "—"}</td></tr>
      <tr><td class="td lbl">N° de série / IMEI</td><td class="td">${esc(r.serial_number) || "—"}</td></tr>
      <tr><td class="td lbl">État</td><td class="td">${esc(r.condition) || "—"}</td></tr>
      <tr><td class="td lbl">Accessoires</td><td class="td">${esc(r.accessories) || "—"}</td></tr>
      ${r.notes ? `<tr><td class="td lbl">Remarques</td><td class="td">${esc(r.notes)}</td></tr>` : ""}
    </table>

    <div class="section">Contrôles</div>
    <table>
      <tr>
        <td class="td">Compte iCloud / Google retiré : ${yesNo(r.check_account_removed)}</td>
        <td class="td">Données effacées : ${yesNo(r.check_data_erased)}</td>
        <td class="td">Non bloqué : ${yesNo(r.check_not_blocked)}</td>
      </tr>
    </table>

    ${photosHtml}

    <div class="amount"><div>Montant de la reprise : ${formatEuro(r.price)}</div></div>

    <div class="mentions">
      <strong>Attestation :</strong> Je soussigné(e) <strong>${esc(r.seller_name)}</strong> certifie
      être le propriétaire légitime du matériel décrit ci-dessus, qu'il n'est ni volé, ni gagé,
      ni loué, et le cède à AVENIR INFORMATIQUE pour le montant indiqué. Je reconnais avoir retiré
      ou fait retirer mes comptes et mes données personnelles de l'appareil.
    </div>

    <div class="signs">
      <div class="sign">
        <h4>Signature du vendeur</h4>
        ${r.signature ? `<img src="${r.signature}" />` : ""}
      </div>
      <div class="sign">
        <h4>Pour AVENIR INFORMATIQUE</h4>
      </div>
    </div>

    <div class="footer">
      <strong>AVENIR INFORMATIQUE</strong> — 16, place de l'Hôtel de Ville, 93700 Drancy — Tél : 01 41 60 18 18 — SIRET : 422 240 457 00016<br/>
      RCS Bobigny B422 240 457 — N° TVA intracommunautaire : FR32422240457
    </div>
  </div>
</body>
</html>`;
};
