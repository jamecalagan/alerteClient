// Palette et styles partagés du thème "moderne" (cartes claires, boutons
// pastilles) appliqué progressivement aux pages de l'app depuis 2026-09-05.
// Objectif : centraliser les valeurs répétées d'une page à l'autre
// (SearchClientsPage, ArticlesPage, ListingProduits, QuoteEditPage,
// BillingPage, ExpressSoftwarePage...) pour n'avoir qu'un seul endroit
// à modifier si le style doit évoluer.
//
// Usage dans une page :
//   import { colors, commonStyles } from "../themes/modernTheme";
//   const styles = StyleSheet.create({ ...commonStyles, monStyleSpecifique: {...} });

export const colors = {
  background: "#f8fafc",
  cardBackground: "#ffffff",
  cardBackgroundAlt: "#f9fafb",
  border: "#e5e7eb",

  textPrimary: "#0f172a",
  textSecondary: "#4b5563",
  textMuted: "#94a3b8",

  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  accent: "#4338ca",
  accentSoft: "#eef2ff",

  success: "#22c55e",
  successDark: "#15803d",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  dark: "#4b5563",
  disabled: "#d1d5db",
  disabledText: "#6b7280",
};

export const commonStyles = {
  container: { padding: 14, backgroundColor: colors.background },

  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
    color: colors.textPrimary,
  },

  // Carte "plate" (fond gris clair, bordure fine, sans ombre) — utilisee
  // dans les formulaires denses (QuoteEditPage, BillingPage).
  card: {
    backgroundColor: colors.cardBackgroundAlt,
    borderRadius: 10,
    padding: 8,
    marginTop: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },

  // Carte "elevee" (fond blanc, ombre legere, coins plus arrondis) —
  // utilisee pour les listes/pages de contenu (SearchClientsPage,
  // ArticlesPage, ListingProduits, ExpressSoftwarePage...).
  elevatedCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  elevatedCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  cardRow: {
    flexDirection: "row",
    gap: 8,
  },
  cardField: { flex: 1 },
  cardFieldFull: { width: "100%", marginBottom: 2 },

  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 1,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 6,
    backgroundColor: "#fff",
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputFocused: { borderColor: "#007bff", backgroundColor: "#eef6ff" },

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

  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 2,
  },
  gridBtn: {
    width: "48%",
    minHeight: 32,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginBottom: 5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.disabled,
  },
  gridBtnPrimary: { backgroundColor: colors.primary },
  gridBtnSuccess: { backgroundColor: colors.success },
  gridBtnDark: { backgroundColor: colors.dark },
  gridBtnDisabled: { backgroundColor: colors.disabled },
  gridBtnText: {
    color: "#f9fafb",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  gridBtnTextDisabled: { color: colors.disabledText },

  pager: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    marginTop: 6,
    marginBottom: 10,
  },
  pagerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  pagerBtnDisabled: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
  },
  pagerIcon: { width: 18, height: 18 },
  pagerInfo: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },

  suggestionContainer: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 6,
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
};
