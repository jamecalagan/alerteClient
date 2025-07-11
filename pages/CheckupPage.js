import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Image,
  Dimensions,
  KeyboardAvoidingView,
} from "react-native";
import Signature from "react-native-signature-canvas";
import * as Print from "expo-print";
import { shareAsync } from "expo-sharing";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

export default function CheckupPage() {
  const route = useRoute();
  const navigation = useNavigation();
  const sigRef = useRef(null);
const [isSigning, setIsSigning] = useState(false);
  const isEdit = route.params?.isEdit || false;
  const editData = route.params?.checkup || null;

  const [selectedProduct, setSelectedProduct] = useState(
    route.params?.deviceType || editData?.product_type || "PC Portable"
  );
  const [components, setComponents] = useState(editData?.components || {});
  const [remarks, setRemarks] = useState(editData?.remarks || "");
  const [signature, setSignature] = useState(editData?.signature || null);

  const clientName = route.params?.clientName || editData?.client_name || "";
  const clientPhone = route.params?.clientPhone || editData?.client_phone || "";
  const clientDate =
    route.params?.clientDate || editData?.client_date || new Date().toLocaleDateString("fr-FR");

  useEffect(() => {
    if (isEdit && editData?.signature) {
      setSignature(editData.signature);
    }
  }, [isEdit, editData]);

  useEffect(() => {
    if (route.params?.deviceType) {
      setSelectedProduct(route.params.deviceType);
      console.log("Type de produit reçu :", route.params.deviceType);
    }
  }, [route.params?.deviceType]);

  const toggleComponentState = (name, state) => {
    setComponents((prev) => ({ ...prev, [name]: state }));
  };

  const productComponents = {
    "PC portable": [
      "Écran", "Clavier", "Pavé tactile", "Alimentation", "Batterie", "Port USB",
      "Disque dur", "RAM", "Ventilation", "État général",
    ],
    "PC Fixe": [
      "Écran", "Clavier", "Souris", "Boîtier", "Alimentation", "Carte mère",
      "Carte graphique", "RAM", "Disque dur", "État général",
    ],
    Tablette: [
      "Écran", "Écran tactile", "Connecteur de charge", "Boutons volume", "Caméra",
      "WiFi", "Bluetooth", "Batterie", "État général",
    ],
    "Console de jeux": [
      "Écran/Sortie vidéo", "Manette", "Lecteur disque", "Port HDMI", "Alimentation",
      "Ventilation", "Connexion Internet", "État général",
    ],
    "PC tout en un": [
      "Écran", "Clavier", "Souris", "Boutons", "Ports USB", "Disque dur",
      "RAM", "Connexion Internet", "État général",
    ],
    iMac: [
      "Écran", "Clavier", "Souris", "Ports USB/Thunderbolt", "Disque dur",
      "RAM", "Connexion WiFi", "État général",
    ],
    iPad: [
      "Écran", "Tactile", "Connecteur de charge", "Boutons", "Caméra",
      "WiFi", "Bluetooth", "Batterie", "État général",
    ],
    MacBook: [
      "Écran", "Clavier", "Trackpad", "Ports", "Batterie",
      "Disque SSD", "RAM", "WiFi", "État général",
    ],
	"Autre": [
  "Alimentation",
  "Connectique",
  "Fonctionnement général",
  "État visuel",
  "Accessoires",
  "Test de fonctionnement",
  "Connexion USB",
  "État général",
]

  };
const allTypes = Object.keys(productComponents);

useEffect(() => {
  const received = route.params?.deviceType || editData?.product_type;

  if (!received) return;

  const knownTypes = Object.keys(productComponents);

  if (knownTypes.includes(received)) {
    setSelectedProduct(received);
  } else {
    // Produit inconnu : on conserve le nom original mais on affichera les composants génériques
    setSelectedProduct(received); // affichage dans titre/impression = reçu tel quel
  }
}, [route.params?.deviceType]);



  const screenWidth = Dimensions.get("window").width;
  const macProducts = ["iMac", "iPad", "MacBook"];
  const nonMacProducts = Object.keys(productComponents).filter(
    (type) => !macProducts.includes(type)
  );

  const handleSignature = (sig) => {
    const finalSig = sig.startsWith("data:image") ? sig : `data:image/png;base64,${sig}`;
    setSignature(finalSig);
  };

  const handleClearSig = () => {
    sigRef.current?.clearSignature();
    setSignature(null);
  };

  const validate = () => {
    const missing = productComponents[selectedProduct].some((c) => !components[c]);
    if (missing) {
      Alert.alert("Attention", "Merci de cocher l'état de tous les composants.");
      return false;
    }
    if (!remarks.trim()) {
      Alert.alert("Remarques manquantes", "Ajoutez des remarques générales.");
      return false;
    }
    if (!signature) {
      Alert.alert("Signature manquante", "Faites signer la fiche avant de sauvegarder ou d'imprimer.");
      return false;
    }
    return true;
  };

  const saveAndPrint = async () => {
    if (!validate()) return;
    const payload = {
      client_name: clientName,
      client_phone: clientPhone,
      client_date: clientDate,
      product_type: selectedProduct,
      components,
      remarks,
      signature,
    };

    try {
      if (isEdit && editData?.id) {
        const { error } = await supabase
          .from("checkup_reports")
          .update(payload)
          .eq("id", editData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("checkup_reports").insert(payload);
        if (error) throw error;
      }
      await printCheckup();
    } catch (e) {
      console.error(e);
      Alert.alert("Erreur", "Impossible de sauvegarder la fiche avant impression.");
    }
  };

const saveCheckup = async () => {
  if (!validate()) return;

  const payload = {
    client_name: clientName,
    client_phone: clientPhone,
    client_date: clientDate,
    product_type: selectedProduct,
    components,
    remarks,
    signature,
  };

  try {
    if (isEdit && editData?.id) {
      const { error } = await supabase
        .from("checkup_reports")
        .update(payload)
        .eq("id", editData.id);

      if (error) throw error;

      Alert.alert("Succès", "Fiche mise à jour.");
    } else {
      const { error } = await supabase.from("checkup_reports").insert(payload);
      if (error) throw error;

      Alert.alert("Succès", "Fiche sauvegardée.");
    }
  } catch (e) {
    console.error(e);
    Alert.alert("Erreur", "Impossible de sauvegarder la fiche.");
  }
};


  const deleteCheckup = async () => {
    if (!editData?.id) return;
    Alert.alert("Confirmation", "Voulez-vous vraiment supprimer cette fiche ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("checkup_reports")
            .delete()
            .eq("id", editData.id);
          if (error) {
            Alert.alert("Erreur", "La suppression a échoué.");
          } else {
            Alert.alert("Supprimée", "La fiche a bien été supprimée.", [
              { text: "OK", onPress: () => navigation.goBack() },
            ]);
          }
        },
      },
    ]);
  };

  const printCheckup = async () => {
    if (!validate()) return;
    const html = `
      <html><head><style>
        body{font-family:Arial,sans-serif;font-size:12px;padding:20px;}
        h1{text-align:center;font-size:20px;margin-bottom:20px;}
        .info{border:1px solid #000;padding:10px;margin-bottom:20px;}
        table{width:100%;border-collapse:collapse;margin-top:10px;}
        th,td{border:1px solid #000;padding:6px;text-align:left;font-size:12px;}
        .remarks{margin-top:20px;font-size:12px;}
      </style></head><body>
      <h1>Fiche de Contrôle – ${selectedProduct}</h1>
      <div class="info">
        <strong>Client :</strong> ${clientName}<br/>
        <strong>Téléphone :</strong> ${clientPhone}<br/>
        <strong>Date :</strong> ${clientDate}<br/>
      </div>
      <table><tr><th>Composant</th><th>État</th></tr>
      ${productComponents[selectedProduct]
        .map((c) => `<tr><td>${c}</td><td>${components[c] || ""}</td></tr>`)
        .join("")}
      </table>
      <div class="remarks"><strong>Remarques :</strong><p>${remarks}</p></div>
      <div style="margin-top:20px"><strong>Signature :</strong><br/>
      <img src="${signature}" style="width:200px;height:80px"/>
      </div>
      </body></html>`;

    await Print.printAsync({ html });
  };

return (
  <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView
  contentContainerStyle={[styles.container, { flexGrow: 1 }]}
  scrollEnabled={!isSigning}
>
      <Text style={styles.title}>Fiche de contrôle</Text>

      <View style={styles.infoBox}>
        <Text style={styles.info}>Client : {clientName}</Text>
        <Text style={styles.info}>Téléphone : {clientPhone}</Text>
        <Text style={styles.info}>Date : {clientDate}</Text>
        <Text style={styles.info}>Produit : {selectedProduct}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorContainer}>
        {nonMacProducts.map((type) => {
          const knownTypes = Object.keys(productComponents);
          const isTypeKnown = knownTypes.includes(selectedProduct);
          const isAutre = type === "Autre";
          const label = isAutre && !isTypeKnown ? selectedProduct : type;
          const isSelected =
            (isTypeKnown && selectedProduct === type) ||
            (!isTypeKnown && isAutre);
          return (
            <TouchableOpacity
              key={type}
              style={[styles.selector, isSelected && styles.selected]}
              onPress={() => {
                if (isTypeKnown || !isAutre) {
                  setSelectedProduct(type);
                }
              }}
            >
              <Text
                style={[styles.selectorText, isSelected && { color: "#fff" }]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorContainer}>
        {macProducts.map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.selector, selectedProduct === type && styles.selected]}
            onPress={() => setSelectedProduct(type)}
          >
            <Text style={styles.selectorText}>{type}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.subtitle}>État des composants :</Text>
      {(productComponents[selectedProduct] || productComponents["Autre"]).map((name) => (
        <View key={name} style={styles.componentRow}>
          <Text style={{ flex: 1 }}>{name}</Text>
          {["Bon", "Moyen", "Mauvais", "Absent"].map((state) => {
            const color =
              state === "Bon"
                ? "#d4edda"
                : state === "Moyen"
                ? "#fff3cd"
                : state === "Mauvais"
                ? "#f8d7da"
                : "#b9b9b9";
            return (
              <TouchableOpacity
                key={state}
                style={[
                  styles.stateButton,
                  { backgroundColor: components[name] === state ? color : "#eee" },
                ]}
                onPress={() => toggleComponentState(name, state)}
              >
                <Text style={styles.stateText}>{state}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <Text style={styles.subtitle}>Remarques générales :</Text>
      <TextInput
        style={styles.remarkInput}
        placeholder="Saisir ici..."
        value={remarks}
        onChangeText={setRemarks}
        multiline
      />


      <View style={styles.signatureBox}>
        <Signature
          ref={sigRef}
          onOK={handleSignature}
          descriptionText="Signez ici"
          clearText="Effacer"
          confirmText="Valider"
          webStyle=".m-signature-pad--footer {display:none;}"
          onEnd={() => {
            sigRef.current?.readSignature();
            setIsSigning(false);
          }}
          onBegin={() => setIsSigning(true)}
        />
        <TouchableOpacity onPress={handleClearSig} style={styles.clearButton}>
          <Text style={{ color: "red", textAlign: "center" }}>❌ Effacer la signature</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.saveButton} onPress={saveCheckup}>
          <Text style={styles.btnText}>💾 Sauvegarder</Text>
        </TouchableOpacity>
<TouchableOpacity style={styles.printButton} onPress={printCheckup}>
  <Text style={styles.btnText}>🖨️ Imprimer</Text>
</TouchableOpacity>

        {isEdit && (
          <TouchableOpacity style={styles.deleteButton} onPress={deleteCheckup}>
            <Text style={styles.btnText}>🗑️ Supprimer</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
);

}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  infoBox: { marginBottom: 15 },
  info: { fontSize: 16, fontWeight: "bold" },
  selectorContainer: { marginBottom: 5, flexDirection: "row" },
  selector: {
    backgroundColor: "#ddd",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 8,
  },
  selected: { backgroundColor: "#007bff" },
  selectorText: { color: "#000" },
  subtitle: { fontWeight: "bold", marginTop: 18, marginBottom: 8 },
  componentRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  stateButton: {
    padding: 4,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
  },
  stateText: { fontSize: 12 },
  remarkInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 5,
    minHeight: 60,
  },
  signatureBox: {
    borderWidth: 1,
    borderColor: "#ccc",
    height: 220,
    marginBottom: 20,
  },
  clearButton: { marginTop: 5 },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 10,
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#28a745",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  printButton: {
    flex: 1,
    backgroundColor: "#007bff",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  deleteButton: {
    flex: 1,
    backgroundColor: "#dc3545",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "bold" },
});
