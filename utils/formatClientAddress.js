// Adresse postale d'un client sur une ligne : "8 rue X, 75001 Paris".
// Renvoie "" si aucune information (l'adresse est optionnelle).
export const formatClientAddress = (client) =>
  [
    client?.address,
    [client?.postal_code, client?.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
