import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";

// Bloc "RAPPELS" d'une fiche client dans la Home : accessoire prêté et/ou
// information client à transmettre, chacun avec une croix pour le
// supprimer (marque le rappel résolu). Extrait de HomePage.js pour
// alléger ce fichier — logique et rendu inchangés.
//
// item.pendingLoanedItem / item.pendingRestitutionNote couvrent aussi les
// interventions "Réparé" (exclues des onglets/latestIntervention, sans
// onglet dédié), là où ces rappels sont le plus souvent saisis.
export default function ClientReminderBlock({ latestIntervention, item, onDismiss }) {
  const loanedItem =
    latestIntervention?.loaned_item || item.pendingLoanedItem || "";

  const loanedItemFromLatest = latestIntervention?.loaned_item === loanedItem;

  const hasLoanedItem =
    loanedItem.trim().length > 0 &&
    (loanedItemFromLatest
      ? latestIntervention?.loaned_item_returned !== true
      : true);

  const loanedItemInterventionId = loanedItemFromLatest
    ? latestIntervention?.id
    : item.pendingLoanedItemInterventionId;

  const restitutionNote =
    latestIntervention?.restitution_note || item.pendingRestitutionNote || "";

  const restitutionNoteFromLatest =
    latestIntervention?.restitution_note === restitutionNote;

  const hasRestitutionNote =
    restitutionNote.trim() !== "" &&
    (restitutionNoteFromLatest
      ? latestIntervention?.restitution_note_done !== true
      : true);

  const restitutionNoteInterventionId = restitutionNoteFromLatest
    ? latestIntervention?.id
    : item.pendingRestitutionNoteInterventionId;

  const hasReminder = hasLoanedItem || hasRestitutionNote;

  if (!hasReminder) return null;

  return (
    <View style={styles.reminderBox}>
      <Text style={styles.reminderBoxTitle}>RAPPELS</Text>

      {hasLoanedItem && (
        <View style={[styles.reminderItem, styles.reminderItemLoan]}>
          <View style={styles.reminderHeaderRow}>
            <Text style={styles.reminderLoanTitle}>📦 ACCESSOIRE PRÊTÉ</Text>
            <TouchableOpacity
              style={styles.reminderCloseBtn}
              onPress={() =>
                onDismiss({
                  interventionId: loanedItemInterventionId,
                  field: "loaned_item_returned",
                })
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Image
                source={require("../assets/icons/close.png")}
                style={styles.reminderCloseIcon}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.reminderText} numberOfLines={2}>
            {loanedItem}
          </Text>
        </View>
      )}

      {hasRestitutionNote && (
        <View
          style={[
            styles.reminderItem,
            styles.reminderItemInfo,
            hasLoanedItem && styles.reminderItemSpacing,
          ]}
        >
          <View style={styles.reminderHeaderRow}>
            <Text style={styles.reminderInfoTitle}>💬 INFORMATION CLIENT</Text>
            <TouchableOpacity
              style={styles.reminderCloseBtn}
              onPress={() =>
                onDismiss({
                  interventionId: restitutionNoteInterventionId,
                  field: "restitution_note_done",
                })
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Image
                source={require("../assets/icons/close.png")}
                style={styles.reminderCloseIcon}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.reminderText} numberOfLines={3}>
            {restitutionNote}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  reminderBox: {
    width: "100%",
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },

  reminderBoxTitle: {
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "bold",
    color: "#475569",
  },

  reminderItem: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: "#ffffff",
  },

  reminderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  reminderCloseBtn: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  reminderCloseIcon: {
    width: 12,
    height: 12,
    tintColor: "#64748b",
  },

  reminderItemInfo: {
    backgroundColor: "#e0f2fe",
    borderLeftWidth: 4,
    borderLeftColor: "#0369a1",
  },

  reminderItemLoan: {
    backgroundColor: "#fff7ed",
    borderLeftWidth: 4,
    borderLeftColor: "#b45309",
  },

  reminderItemSpacing: {
    marginTop: 6,
  },

  reminderLoanTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#b45309",
    letterSpacing: 0.3,
  },

  reminderInfoTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0369a1",
    letterSpacing: 0.3,
  },

  reminderText: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
});
