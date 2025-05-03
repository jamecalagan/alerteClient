import React, { useState } from "react";
import {
    View,
    Text,
    TextInput,
    Button,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const ExpressClientPage = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const type = route.params?.type || "reparation";
	const isQuote = type === "devis";
    const [focusedField, setFocusedField] = useState(null);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [device, setDevice] = useState("");
    const [description, setDescription] = useState(
        type === "video" ? "Transfert vidéo d'anciennes cassettes" : ""
    );
    const [price, setPrice] = useState("");
    const [cassettecount, setCassetteCount] = useState("");
    const [cassettetype, setCassetteType] = useState("");
    const [outputtype, setOutputType] = useState("");
    const [softwaretype, setSoftwareType] = useState("");
    const [clientSuggestions, setClientSuggestions] = useState([]);
    const [unitprice, setUnitPrice] = useState("");
    const searchClients = async (text) => {
        setName(text);

        if (text.length < 2) {
            setClientSuggestions([]);
            return;
        }

        const { data, error } = await supabase
            .from("clients")
            .select("name, phone")
            .ilike("name", `${text}%`); // 🛠️ correction ici

        if (!error) setClientSuggestions(data || []);
    };

    const selectClient = (client) => {
        setName(client.name);
        setPhone(client.phone || "");
        setClientSuggestions([]);
    };

    const handleSubmit = async () => {
        if (
            !name ||
            !phone ||
            !price ||
            (type === "reparation" && (!device || !description)) ||
            (type === "logiciel" && (!softwaretype || !description)) ||
            (type === "video" &&
                (!cassettecount || !cassettetype || !outputtype))
        ) {
            alert(
                "Merci de remplir tous les champs obligatoires selon le type de prestation."
            );
            return;
        }

        // Après avoir inséré dans Supabase :
        const { data, error } = await supabase
            .from("express")
            .insert([
                {
                    name,
                    phone,
                    type: isQuote ? "devis" : type,
                    device,
                    description,
                    price,
                    cassettecount,
                    cassettetype,
                    outputtype,
                    softwaretype,
                    created_at: new Date(),
                },
            ])
            .select(); // <-- Important pour récupérer l'id !

        if (data) {
            // On récupère l'ID créé
            const insertedId = data[0].id;

            navigation.navigate("PrintExpressPage", {
                id: insertedId, // ✅ ENVOI de l'ID ici
                name,
                phone,
                device,
                description,
                price,
                date: new Date().toLocaleDateString(),
                type,
                cassettecount,
                cassettetype,
                outputtype,
                softwaretype,
            });
        } else {
            alert("Erreur lors de l'enregistrement : " + error.message);
        }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
<FlatList
  ListHeaderComponent={
    <View style={styles.container}>
      <Text style={styles.title}>
        Fiche Express -{" "}
        {type === "logiciel"
          ? "Dépannage système"
          : type === "video"
          ? "Transfert vidéo"
          : "Réparation matériel"}
      </Text>

      {/* -- GESTION DU FOCUS -- */}
      <TextInput
        style={[
          styles.input,
          focusedField === "name" && styles.inputFocused,
        ]}
        placeholder="Nom"
        value={name}
        onChangeText={searchClients}
        onFocus={() => setFocusedField("name")}
        onBlur={() => setFocusedField(null)}
      />

      {clientSuggestions.length > 0 &&
        clientSuggestions.map((item, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => selectClient(item)}
            style={styles.suggestion}
          >
            <Text>
              {item.name} - {item.phone}
            </Text>
          </TouchableOpacity>
        ))}

      <TextInput
        style={[
          styles.input,
          focusedField === "phone" && styles.inputFocused,
        ]}
        placeholder="Téléphone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        onFocus={() => setFocusedField("phone")}
        onBlur={() => setFocusedField(null)}
      />

      {type === "reparation" && (
        <>
          <TextInput
            style={[
              styles.input,
              focusedField === "device" && styles.inputFocused,
            ]}
            placeholder="Matériel"
            value={device}
            onChangeText={setDevice}
            onFocus={() => setFocusedField("device")}
            onBlur={() => setFocusedField(null)}
          />
          <TextInput
            style={[
              styles.textArea,
              focusedField === "description" && styles.inputFocused,
            ]}
            placeholder="Description du problème"
            value={description}
            onChangeText={setDescription}
            multiline
            onFocus={() => setFocusedField("description")}
            onBlur={() => setFocusedField(null)}
          />
        </>
      )}

      {type === "logiciel" && (
        <>
          <Text style={styles.label}>Type de dépannage :</Text>

          <TouchableOpacity
            style={styles.radioOption}
            onPress={() => setSoftwareType("Installation")}
          >
            <Text>
              {softwaretype === "Installation" ? "🔘" : "⚪"} Installation Logiciel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.radioOption}
            onPress={() => setSoftwareType("Maintenance")}
          >
            <Text>
              {softwaretype === "Maintenance" ? "🔘" : "⚪"} Maintenance Systeme
            </Text>
          </TouchableOpacity>

          <TextInput
            style={[
              styles.textArea,
              focusedField === "description" && styles.inputFocused,
            ]}
            placeholder="Détails"
            value={description}
            onChangeText={setDescription}
            multiline
            onFocus={() => setFocusedField("description")}
            onBlur={() => setFocusedField(null)}
          />
        </>
      )}

      {type === "video" && (
        <>
          <TextInput
            style={[
              styles.textArea,
              focusedField === "description" && styles.inputFocused,
            ]}
            placeholder="Prestation: Transfert vidéo d'anciennes cassettes"
            value={description}
            onChangeText={setDescription}
            multiline
            onFocus={() => setFocusedField("description")}
            onBlur={() => setFocusedField(null)}
          />

          <TextInput
            style={[
              styles.input,
              focusedField === "cassettecount" && styles.inputFocused,
            ]}
            placeholder="Nombre de cassettes"
            value={cassettecount}
            onChangeText={(text) => {
              setCassetteCount(text);
              if (unitprice) {
                const total = parseFloat(text) * parseFloat(unitprice);
                setPrice(total.toString());
              }
            }}
            keyboardType="numeric"
            onFocus={() => setFocusedField("cassettecount")}
            onBlur={() => setFocusedField(null)}
          />

          <TextInput
            style={[
              styles.input,
              focusedField === "unitprice" && styles.inputFocused,
            ]}
            placeholder="Prix unitaire (€)"
            value={unitprice}
            onChangeText={(text) => {
              setUnitPrice(text);
              if (cassettecount) {
                const total = parseFloat(text) * parseFloat(cassettecount);
                setPrice(total.toString());
              }
            }}
            keyboardType="decimal-pad"
            onFocus={() => setFocusedField("unitprice")}
            onBlur={() => setFocusedField(null)}
          />

          <Text style={styles.label}>Type de cassette :</Text>
          <View style={styles.radioGroup}>
            {["VHS", "Hi8", "DV"].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.radioOption,
                  { backgroundColor: cassettetype === type ? "#007bff" : "#f0f8ff" },
                ]}
                onPress={() => setCassetteType(type)}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: cassettetype === type ? "white" : "#007bff",
                  }}
                >
                  {cassettetype === type ? "🔘" : "⚪"} {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Support souhaité :</Text>
          <View style={styles.radioGroup}>
            {["Clé USB", "CD", "DVD", "Disque dur"].map((output) => (
              <TouchableOpacity
                key={output}
                style={[
                  styles.radioOption,
                  { backgroundColor: outputtype === output ? "#007bff" : "#f0f8ff" },
                ]}
                onPress={() => setOutputType(output)}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: outputtype === output ? "white" : "#007bff",
                  }}
                >
                  {outputtype === output ? "🔘" : "⚪"} {output}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TextInput
        style={[
          styles.input,
          focusedField === "price" && styles.inputFocused,
        ]}
        placeholder="Montant (€)"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        onFocus={() => setFocusedField("price")}
        onBlur={() => setFocusedField(null)}
      />

<TouchableOpacity
  style={[
    styles.customButton,
    { backgroundColor: isQuote ? "#28a745" : "#007bff" },
  ]}
  onPress={handleSubmit}
>
  <Text style={styles.buttonText}>
    {isQuote ? "📝 Enregistrer le devis" : "🖋️ Faire signer la fiche"}
  </Text>
</TouchableOpacity>

    </View>
  }
  data={[]}
  renderItem={null}
/>

        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { padding: 20 },
    title: {
        fontSize: 22,
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: 20,
    },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        marginBottom: 15,
        borderRadius: 5,
    },
    textArea: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        marginBottom: 15,
        borderRadius: 5,
        height: 100,
        textAlignVertical: "top",
    },
    label: { fontWeight: "bold", marginTop: 10 },
    radioOption: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderWidth: 1,
        borderColor: "#007bff",
        borderRadius: 20,
        margin: 5,
        backgroundColor: "#f0f8ff", // léger fond bleu très clair
    },
    suggestion: {
        padding: 10,
        backgroundColor: "#eee",
        borderBottomWidth: 1,
        borderBottomColor: "#ccc",
    },
    radioGroup: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginBottom: 10,
        gap: 10,
        justifyContent: "flex-start",
    },
    customButton: {
        backgroundColor: "#007bff",
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 10,
        alignSelf: "center", // centre le bouton
        width: "50%", // largeur de 50%
        alignItems: "center", // centre le texte
        marginVertical: 10,
    },
    buttonText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
    },
inputFocused: {
  borderColor: "#007bff",
  backgroundColor: "#eef6ff",
  fontSize: 18,
  height: 55,
},
});

export default ExpressClientPage;
