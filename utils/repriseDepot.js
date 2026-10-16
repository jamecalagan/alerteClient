// Fonctions partagées par RepriseDepotListPage et RepriseDepotEditPage
// (table "reprise_depots", voir scripts/sql/reprise_depots.sql).

export const ITEM_STATUSES = [
  { value: "en_test", label: "En test" },
  { value: "accepte", label: "Accepté" },
  { value: "refuse", label: "Refusé" },
];

export const STATUS_LABELS = {
  en_test: "En test",
  accepte: "Accepté",
  refuse: "Refusé",
};

export const formatDepotNumber = (numero) =>
  numero != null ? `DEP-${String(numero).padStart(6, "0")}` : "DEP-……";

export const newDepotItem = () => ({
  key: `${Date.now()}-${Math.round(Math.random() * 100000)}`,
  device_type: "",
  brand: "",
  model: "",
  condition: "",
  accessories: "",
  status: "en_test",
  reprise_id: null,
  returned: false,
});

export const describeItem = (it) =>
  [it?.device_type, it?.brand, it?.model].filter((v) => v && String(v).trim()).join(" ") ||
  "Appareil";

// Un appareil est "réglé" quand il est accepté et transformé en fiche de
// reprise, ou refusé et rendu au client. Le dépôt est terminé quand tous
// ses appareils sont réglés.
export const isItemSettled = (it) =>
  (it.status === "accepte" && !!it.reprise_id) || (it.status === "refuse" && !!it.returned);

export const isDepotDone = (items = []) => items.length > 0 && items.every(isItemSettled);

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Bon de dépôt imprimé (A5, une page), même charte que la fiche de reprise.
// La colonne "Résultat" n'apparaît qu'une fois au moins un test terminé ;
// la signature de restitution seulement s'il y a du matériel refusé.
export const buildDepotHtml = (d) => {
  const date = d.created_at
    ? new Date(d.created_at).toLocaleDateString("fr-FR")
    : new Date().toLocaleDateString("fr-FR");
  const items = Array.isArray(d.items) ? d.items : [];
  const showResult = items.some((it) => it.status && it.status !== "en_test");
  const hasRefused = items.some((it) => it.status === "refuse");

  const rows = items
    .map(
      (it, i) => `<tr>
        <td class="td c">${i + 1}</td>
        <td class="td">${esc(describeItem(it))}</td>
        <td class="td">${esc(it.condition) || "—"}</td>
        <td class="td">${esc(it.accessories) || "—"}</td>
        ${
          showResult
            ? `<td class="td c res-${esc(it.status)}">${esc(STATUS_LABELS[it.status] || "En test")}${
                it.status === "refuse" && it.returned ? "<br/>(rendu)" : ""
              }</td>`
            : ""
        }
      </tr>`
    )
    .join("");

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
    .th { border: 1px solid #000; padding: 2px 4px; font-size: 8.5px; background: #efefef; font-weight: bold; text-align: left; }
    .c { text-align: center; }
    .res-accepte { color: #15803d; font-weight: bold; }
    .res-refuse { color: #b91c1c; font-weight: bold; }

    .mentions { font-size: 7.5px; margin-top: 6px; text-align: justify; line-height: 1.3; }

    .signs { display: flex; gap: 6px; margin-top: 5px; }
    .sign { flex: 1; border: 1px solid #000; border-radius: 5px; padding: 3px 5px; height: 62px; }
    .sign h4 { margin: 0; font-size: 8px; }
    .sign img { max-width: 150px; max-height: 46px; object-fit: contain; }

    .footer { text-align: center; font-size: 6.5px; color: #444; line-height: 1.25; margin-top: 6px; }

    /* Aperçu à l'écran uniquement : lecture plus confortable. */
    @media screen {
      body { font-size: 13px; }
      .wrap { padding: 20px; }
      .header img { height: 56px; }
      .title { font-size: 22px; }
      .subtitle { font-size: 14px; margin-bottom: 14px; }
      .meta { gap: 14px; margin-bottom: 14px; }
      .card { padding: 10px 12px; }
      .card h3 { font-size: 14px; margin-bottom: 6px; }
      .card p, .td, .th { font-size: 13px; }
      .section { font-size: 14px; margin-top: 14px; }
      .td, .th { padding: 6px 8px; }
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
      <div class="title">BON DE DÉPÔT POUR TEST</div>
      <div class="subtitle">${esc(formatDepotNumber(d.numero))} — ${date}</div>
    </div>

    <div class="meta">
      <div class="card">
        <h3>Client</h3>
        <p><strong>${esc(d.client_name)}</strong></p>
        <p>Tél : ${esc(d.client_phone) || "—"}</p>
        ${d.client_email ? `<p>${esc(d.client_email)}</p>` : ""}
      </div>
      <div class="card">
        <h3>Dépôt</h3>
        <p>${items.length} appareil${items.length > 1 ? "s" : ""} déposé${items.length > 1 ? "s" : ""}</p>
        <p>Objet : test en vue d'une éventuelle reprise</p>
      </div>
    </div>

    <div class="section">Matériel déposé</div>
    <table>
      <tr>
        <th class="th c" style="width:16px;">#</th>
        <th class="th">Matériel</th>
        <th class="th">État au dépôt</th>
        <th class="th">Accessoires</th>
        ${showResult ? '<th class="th c" style="width:60px;">Résultat</th>' : ""}
      </tr>
      ${rows}
    </table>
    ${d.notes ? `<p style="margin-top:4px;"><strong>Remarques :</strong> ${esc(d.notes)}</p>` : ""}

    <div class="mentions">
      <strong>Conditions :</strong> Le matériel ci-dessus est confié à AVENIR INFORMATIQUE pour être
      testé et vérifié en vue d'une éventuelle reprise. Aucune reprise n'est conclue avant la
      signature d'une fiche de reprise. Le matériel non retenu est à récupérer sur présentation de
      ce bon. Le client certifie être propriétaire du matériel déposé.
    </div>

    <div class="signs">
      <div class="sign">
        <h4>Signature du client au dépôt</h4>
        ${d.deposit_signature ? `<img src="${d.deposit_signature}" />` : ""}
      </div>
      ${
        hasRefused
          ? `<div class="sign">
        <h4>Matériel refusé récupéré${
          d.returned_at ? ` le ${new Date(d.returned_at).toLocaleDateString("fr-FR")}` : ""
        }</h4>
        ${d.return_signature ? `<img src="${d.return_signature}" />` : ""}
      </div>`
          : `<div class="sign"><h4>Pour AVENIR INFORMATIQUE</h4></div>`
      }
    </div>

    <div class="footer">
      <strong>AVENIR INFORMATIQUE</strong> — 16, place de l'Hôtel de Ville, 93700 Drancy — Tél : 01 41 60 18 18 — SIRET : 422 240 457 00016<br/>
      RCS Bobigny B422 240 457 — N° TVA intracommunautaire : FR32422240457
    </div>
  </div>
</body>
</html>`;
};
