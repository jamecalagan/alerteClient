import React, { useState, useEffect } from "react";
import {
    View,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Text,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Modal,
    Image,
    TouchableWithoutFeedback,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "../supabaseClient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { MaterialIcons } from "@expo/vector-icons"; // Pour l'icône de coche
import Icon from "react-native-vector-icons/FontAwesome"; // Pour les icônes
export default function EditInterventionPage({ route, navigation }) {
    const { interventionId } = route.params;
    const [reference, setReference] = useState("");
    const [brand, setBrand] = useState("");
	const [customBrand, setCustomBrand] = useState("");
    const [description, setDescription] = useState("");
    const [cost, setCost] = useState("");
    const [status, setStatus] = useState("default");
    const [deviceType, setDeviceType] = useState("default");
	const [customDeviceType, setCustomDeviceType] = useState("");
    const [password, setPassword] = useState("");
    const [commande, setCommande] = useState("");
    const [chargeur, setChargeur] = useState("Non");
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [alertTitle, setAlertTitle] = useState("");
    const [photos, setPhotos] = useState([]);
    const [labelPhoto, setLabelPhoto] = useState(null); // Pour la photo de l'étiquette
    const [selectedImage, setSelectedImage] = useState(null); // Pour afficher l'image sélectionnée en plein écran
    const [serialNumber, setSerialNumber] = useState(""); // Pour stocker le numéro de série
	const [customModel, setCustomModel] = useState("");
    const [model, setModel] = useState("");
	useEffect(() => {
        const loadIntervention = async () => {
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select(
                        "reference, brand, model, description, cost, status, deviceType, password, commande, chargeur, photos, label_photo, serialnumber"
                    )
                    .eq("id", interventionId)
                    .single();

                if (error) throw error;

                setReference(data.reference);
                
// Gestion du type de produit
if (Object.keys(productBrands).includes(data.deviceType)) {
    setDeviceType(data.deviceType);
    setCustomDeviceType("");
} else {
    setDeviceType("Autre");
    setCustomDeviceType(data.deviceType); // Récupération de la valeur "Autre"
}

// Gestion de la marque
if (productBrands[data.deviceType]?.includes(data.brand)) {
    setBrand(data.brand);
    setCustomBrand("");
} else {
    setBrand("Autre");
    setCustomBrand(data.brand); // Récupération de la valeur "Autre"
}

// Gestion du modèle
if (productModels[data.deviceType]?.[data.brand]?.includes(data.model)) {
    setModel(data.model);
    setCustomModel("");
} else {
    setModel("Autre");
    setCustomModel(data.model); // Récupération de la valeur "Autre"
}


                setSerialNumber(data.serialnumber || "");
                setDescription(data.description);
                setCost(data.cost);
                setStatus(data.status);
                setPassword(data.password);
                setCommande(data.commande);
                setChargeur(data.chargeur ? "Oui" : "Non");
                setPhotos(data.photos || []);
                setLabelPhoto(data.label_photo || null);
            } catch (error) {
                console.error("Erreur lors du chargement de l'intervention :", error);
            }
        };

        loadIntervention();
    }, [interventionId]);

	const productBrands = {
		"PC portable": ["Apple", "Dell", "HP", "Lenovo", "Acer", "Asus", "Microsoft", "MSI", "Razer", "Samsung", "Toshiba", "Sony", "LG", "Huawei", "Xiaomi"],
		"PC Fixe": ["Dell", "HP", "Lenovo", "Acer", "Asus", "Microsoft", "MSI", "Razer", "Samsung", "LG", "Huawei"],
		"Tablette": ["Apple", "Samsung", "Huawei", "Microsoft", "Lenovo", "Asus", "Xiaomi", "Acer", "Google", "Amazon"],
		"Smartphone": ["Apple", "Samsung", "Huawei", "Xiaomi", "Sony", "OnePlus", "Google", "LG", "Oppo", "Vivo", "Motorola", "Nokia"],
		"Console": ["Sony (PlayStation)", "Microsoft (Xbox)", "Nintendo", "Sega"],
		"Disque dur": ["Seagate", "Western Digital", "Toshiba", "Samsung", "LaCie", "Hitachi", "Buffalo"],
		"Carte SD": ["SanDisk", "Kingston", "Transcend", "Lexar", "PNY", "Sony", "Patriot", "Verbatim", "ADATA"],
		"Cle usb": ["SanDisk", "Kingston", "Corsair", "Transcend", "Samsung", "PNY", "Lexar", "ADATA", "Patriot", "Verbatim", "Toshiba", "Integral"]
	  };
	  const productModels = {
		"PC portable": {
		  "Apple": ["MacBook Air", "MacBook Pro 13\"", "MacBook Pro 14\"", "MacBook Pro 16\""],
		  "Dell": ["XPS 13", "XPS 15", "Inspiron 15", "Inspiron 13", "Latitude 7410", "Alienware M15", "Precision 5550"],
		  "HP": ["Pavilion 15", "Spectre x360", "Envy 13", "Envy x360", "Omen 15", "Elite Dragonfly", "ZBook Firefly"],
		  "Lenovo": ["ThinkPad X1 Carbon", "ThinkPad T14", "Yoga Slim 7", "IdeaPad 5", "Legion 5", "ThinkPad E15"],
		  "Acer": ["Aspire 5", "Swift 3", "Predator Helios 300", "Nitro 5", "Spin 5"],
		  "Asus": ["ZenBook 14", "ROG Zephyrus G14", "VivoBook S15", "TUF Gaming A15", "ExpertBook B9"],
		  "Microsoft": ["Surface Laptop 4", "Surface Book 3", "Surface Go", "Surface Pro 7"],
		  "MSI": ["GF63 Thin", "Prestige 14", "Modern 14", "Stealth 15M", "GE76 Raider"],
		  "Razer": ["Razer Blade 15", "Razer Blade Stealth 13", "Razer Blade Pro 17"],
		  "Samsung": ["Galaxy Book S", "Galaxy Book Flex", "Galaxy Book Ion", "Notebook 9"],
		  "Toshiba": ["Dynabook Tecra A50", "Dynabook Portege X30", "Satellite Pro L50"],
		  "Sony": ["VAIO SX14", "VAIO Z", "VAIO S11"],
		  "LG": ["Gram 14", "Gram 16", "Gram 17"],
		  "Huawei": ["MateBook X Pro", "MateBook 13", "MateBook D 14"],
		  "Xiaomi": ["Mi Notebook Pro", "Mi Air 13.3\"", "Redmibook 14", "Mi Gaming Laptop"]
		},
		"PC Fixe": {
		  "Dell": ["OptiPlex 7070", "OptiPlex 3080", "Inspiron 3880", "XPS Desktop", "Alienware Aurora R11"],
		  "HP": ["Pavilion Desktop", "Envy Desktop", "OMEN 30L", "EliteDesk 800", "ProDesk 600"],
		  "Lenovo": ["ThinkCentre M720", "ThinkCentre M920", "IdeaCentre 5", "Legion Tower 5", "ThinkStation P340"],
		  "Acer": ["Aspire TC", "Nitro 50", "Predator Orion 3000", "Veriton X", "ConceptD 500"],
		  "Asus": ["ROG Strix GA35", "ROG Strix GT15", "ExpertCenter D7", "ProArt Station D940MX", "VivoPC K20"],
		  "Apple": ["iMac 24\"", "iMac 27\"", "Mac Pro", "Mac mini"],
		  "MSI": ["Creator P100X", "Trident 3", "Codex R", "Infinite X Plus", "MEG Aegis Ti5"]
		},
		"Tablette": {
		  "Apple": ["iPad Pro 12.9\"", "iPad Pro 11\"", "iPad Air", "iPad Mini", "iPad (9e génération)", "iPad (8e génération)"],
		  "Samsung": ["Galaxy Tab S8", "Galaxy Tab S8+", "Galaxy Tab S8 Ultra", "Galaxy Tab A7", "Galaxy Tab S7", "Galaxy Tab S6 Lite", "Galaxy Tab Active3"],
		  "Huawei": ["MatePad Pro", "MatePad 11", "MatePad T10s", "MediaPad M5", "MediaPad T5"],
		  "Microsoft": ["Surface Pro 8", "Surface Go 3", "Surface Pro X", "Surface Pro 7+"],
		  "Lenovo": ["Tab P11", "Tab P11 Pro", "Tab M10", "Yoga Tab 13", "Yoga Tab 11", "Tab M8"],
		  "Asus": ["ZenPad 3S 10", "ZenPad Z8", "Transformer Mini", "ROG Flow Z13"],
		  "Xiaomi": ["Mi Pad 5", "Mi Pad 4", "Mi Pad 3", "Redmi Pad"],
		  "Acer": ["Iconia One 10", "Enduro T1", "Iconia Tab 10"],
		  "Google": ["Pixel Slate", "Pixel C"],
		  "Amazon": ["Fire HD 10", "Fire HD 8", "Fire 7"]
		},
		"Smartphone": {
		  "Apple": ["iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15", "iPhone 14 Pro Max", "iPhone 14", "iPhone SE (2022)"],
		  "Samsung": ["Galaxy S23 Ultra", "Galaxy S23+", "Galaxy S23", "Galaxy Z Fold 5", "Galaxy Z Flip 5", "Galaxy A54 5G", "Galaxy A34 5G"],
		  "Huawei": ["Mate 60 Pro", "P60 Pro", "Mate 50", "Nova 11", "P50 Pocket"],
		  "Xiaomi": ["Xiaomi 13 Pro", "Xiaomi 13", "Redmi Note 12 Pro+", "Redmi Note 12", "Poco F5", "Poco X5 Pro"],
		  "Sony": ["Xperia 1 V", "Xperia 5 IV", "Xperia 10 V", "Xperia Pro-I"],
		  "OnePlus": ["OnePlus 11", "OnePlus 10 Pro", "OnePlus Nord 3", "OnePlus Nord CE 3"],
		  "Google": ["Pixel 8 Pro", "Pixel 8", "Pixel 7a", "Pixel Fold"],
		  "LG": ["Velvet 2 Pro", "Wing 5G", "Velvet 5G", "K92 5G"],
		  "Oppo": ["Find X6 Pro", "Find X6", "Reno 10 Pro+", "Reno 10 Pro"],
		  "Vivo": ["X90 Pro+", "X90 Pro", "V27 Pro", "V25 5G"],
		  "Motorola": ["Edge 40 Pro", "Edge 30 Ultra", "Moto G73", "Moto G53"],
		  "Nokia": ["X30 5G", "G60 5G", "X20", "G50"]
		},
		"Console": {
		  "Sony (PlayStation)": ["PlayStation 5", "PlayStation 4", "PlayStation 3", "PlayStation 2", "PlayStation Portable (PSP)", "PlayStation Vita"],
		  "Microsoft (Xbox)": ["Xbox Series X", "Xbox Series S", "Xbox One", "Xbox 360", "Xbox"],
		  "Nintendo": ["Nintendo Switch", "Nintendo Switch Lite", "Nintendo Switch OLED", "Nintendo 3DS", "Nintendo 2DS", "Wii U", "Wii", "GameCube"],
		  "Sega": ["Sega Genesis", "Sega Saturn", "Dreamcast", "Game Gear", "Master System", "Mega Drive"]
		},
		"Disque dur": {
		  "Seagate": ["BarraCuda", "FireCuda", "IronWolf", "SkyHawk", "Exos", "Backup Plus", "Expansion Desktop"],
		  "Western Digital": ["WD Blue", "WD Black", "WD Red", "WD Purple", "WD Gold", "My Passport", "Elements Desktop"],
		  "Toshiba": ["Canvio Basics", "Canvio Advance", "Canvio Flex", "N300 NAS", "X300 Performance", "DT02 Desktop"],
		  "Samsung": ["Samsung 870 QVO", "Samsung 860 EVO", "Samsung T7", "Samsung T5", "Samsung 980 PRO", "Samsung X5"],
		  "LaCie": ["Rugged Mini", "Rugged Thunderbolt", "Rugged RAID Pro", "Mobile Drive", "d2 Professional", "2big Dock"],
		  "Hitachi": ["Ultrastar DC HC550", "Ultrastar DC HC520", "Deskstar NAS", "Travelstar Z5K500", "Endurastar J4K100"],
		  "Buffalo": ["DriveStation Axis", "MiniStation Extreme NFC", "DriveStation Duo", "TeraStation 1200", "LinkStation SoHo"]
		},
		"Carte SD": {
		  "SanDisk": ["Extreme Pro", "Ultra", "Extreme", "High Endurance", "Max Endurance", "Pixtor", "Nintendo Switch"],
		  "Kingston": ["Canvas Select Plus", "Canvas Go! Plus", "Canvas React Plus", "Endurance", "Canvas Select", "Canvas Focus"],
		  "Transcend": ["Ultimate UHS-I U3", "High Endurance", "Standard", "Premium", "Industrial", "JetDrive Lite"],
		  "Lexar": ["Professional 2000x", "Professional 1066x", "High-Performance 633x", "Play", "NS100", "Silver Series"],
		  "PNY": ["Elite-X", "PRO Elite", "High Performance", "Premier-X", "Performance Plus", "Elite Gaming"],
		  "Sony": ["Tough SF-G series", "SF-M series", "SF-UY3 series", "TOUGH-M series", "Class 10 UHS-I", "Professional Series"],
		  "Patriot": ["EP Series", "LX Series", "V30 A1", "High Endurance", "Signature Line", "Gaming Series"],
		  "Verbatim": ["Premium SDXC UHS-I", "Pro+ SDHC UHS-II", "Pro SDXC UHS-I", "Class 10", "Standard SDHC", "Industrial"],
		  "ADATA": ["Premier Pro", "Premier One", "Premier", "Industrial", "XPG GAMMIX", "Premier Gaming"]
		},
		"Cle usb": {
		  "SanDisk": ["Ultra Flair", "Cruzer Blade", "Ultra Fit", "Extreme Pro", "iXpand Flash Drive", "Cruzer Glide", "Ultra Dual Drive"],
		  "Kingston": ["DataTraveler Kyson", "DataTraveler 80", "DataTraveler Exodia", "DataTraveler Max", "DataTraveler Micro", "DataTraveler Locker+ G3"],
		  "Corsair": ["Flash Voyager GT", "Flash Survivor Stealth", "Flash Voyager Slider X1", "Flash Padlock 3", "Flash Voyager Vega", "Flash Survivor Mini"],
		  "Transcend": ["JetFlash 790", "JetFlash 820", "JetFlash 920", "JetFlash 930C", "JetFlash 700", "JetFlash 710"],
		  "Samsung": ["BAR Plus", "FIT Plus", "DUO Plus", "USB Type-C Flash Drive", "BAR (Metal)", "DUO (Metal)"],
		  "PNY": ["Turbo Attaché 3", "Elite-X Fit", "Pro Elite Type-C", "Attaché 4", "Performance 3.0", "Metal Hook Attaché"],
		  "Lexar": ["JumpDrive S75", "JumpDrive S80", "JumpDrive S57", "JumpDrive Fingerprint F35", "JumpDrive C20i", "JumpDrive S45"],
		  "ADATA": ["UV128", "UV150", "UV350", "UV360", "UE700 Pro", "i-Memory Flash Drive AI920"],
		  "Patriot": ["Supersonic Rage 2", "Supersonic Boost XT", "Supersonic Magnum 2", "Supersonic Rage Pro", "Spark USB", "Vex USB"],
		  "Verbatim": ["PinStripe", "Store 'n' Go V3", "Metal Executive", "Store 'n' Click", "ToughMAX", "Store 'n' Stay Nano"]
		}
	  };

	  const handleBrandChange = (value) => {
        setBrand(value);
        setModel("");
        if (value !== "Autre") {
            setCustomBrand("");
        }
    };
    const brandsForDeviceType = productBrands[deviceType] || [];
	const modelsForSelectedBrand = productModels[deviceType]?.[brand] || [];

    const handleDeviceTypeChange = (value) => {
        setDeviceType(value);
        setBrand("");
        setModel("");
        if (value !== "Autre") {
            setCustomDeviceType("");
        }
    };
    const handleModelChange = (value) => {
        setModel(value);
        if (value !== "Autre") {
            setCustomModel("");
        }
    };
    // Fonction pour prendre la photo de l'étiquette
    const pickLabelImage = async () => {
        try {
            let result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.5,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const imageUri = result.assets[0].uri;
                const base64Image = await convertImageToBase64(imageUri);
                if (base64Image) {
                    setPhotos([...photos, base64Image]); // Ajouter l'image à la liste
                    setLabelPhoto(base64Image); // Marquer cette photo comme l'étiquette
                    // console.log("Photo d'étiquette définie :", base64Image); // Log pour vérifier
                    if (!reference) {
                        setReference("Voir photo pour référence produit");
                    }
                }
            } else {
                console.log("Aucune image capturée ou opération annulée.");
            }
        } catch (error) {
            console.error("Erreur lors de la capture d'image :", error);
        }
    };

    const pickAdditionalImage = async () => {
        try {
            let result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.5,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const imageUri = result.assets[0].uri;
                const base64Image = await convertImageToBase64(imageUri);
                if (base64Image) {
                    setPhotos([...photos, base64Image]); // Ajouter l'image à la liste
                }
            } else {
                console.log("Aucune image capturée ou opération annulée.");
            }
        } catch (error) {
            console.error("Erreur lors de la capture d'image :", error);
        }
    };

    const convertImageToBase64 = async (uri) => {
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            return base64;
        } catch (error) {
            console.error(
                "Erreur lors de la conversion de l'image en base64 :",
                error
            );
            return null;
        }
    };

    const handleSaveIntervention = async () => {
        if (
            !reference ||
            !brand ||
            !model ||
            !description ||
            !cost ||
            deviceType === "default" ||
            status === "default"
        ) {
            setAlertTitle("Erreur");
            setAlertMessage(
                "Tous les champs doivent être remplis et une option doit être sélectionnée."
            );
            setAlertVisible(true);
            return;
        }

		const updatedIntervention = {
			reference,
			brand: brand === "Autre" ? customBrand : brand,
			model: model === "Autre" ? customModel : model,
			description,
			cost,
			status,
			deviceType: deviceType === "Autre" ? customDeviceType : deviceType,
			password,
			commande,
			chargeur: chargeur === "Oui",
			photos,
			label_photo: labelPhoto,
			serialnumber: serialNumber,
		};
		

        try {
            const { error } = await supabase
                .from("interventions")
                .update(updatedIntervention)
                .eq("id", interventionId);

            if (error) throw error;

            setAlertTitle("Succès");
            setAlertMessage("Intervention mise à jour avec succès.");
            setAlertVisible(true);
        } catch (error) {
            setAlertTitle("Erreur");
            setAlertMessage("Erreur lors de la mise à jour de l'intervention.");
            setAlertVisible(true);
            console.error(
                "Erreur lors de la mise à jour de l'intervention :",
                error
            );
        }
    };

    const closeAlert = () => {
        setAlertVisible(false);
        if (alertTitle === "Succès") {
            navigation.goBack();
        }
    };
    const handleImagePress = (imageUri) => {
        setSelectedImage(imageUri); // Sélectionner l'image pour l'afficher en plein écran
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
            keyboardVerticalOffset={80}
        >
            <ScrollView>
<Text style={styles.label}>Type de produit</Text>
                <Picker
                    selectedValue={deviceType}
                    style={styles.input}
                    onValueChange={handleDeviceTypeChange}
                >
                    <Picker.Item label="Sélectionnez un type de produit..." value="default" />
                    {Object.keys(productBrands).map((type) => (
                        <Picker.Item key={type} label={type} value={type} />
                    ))}
                    <Picker.Item label="Autre" value="Autre" />
                </Picker>
                {deviceType === "Autre" && (
                    <TextInput
                        style={styles.autreInput}
                        placeholder="Entrez le type de produit"
                        value={customDeviceType}
                        onChangeText={setCustomDeviceType}
                    />
                )}

				<View style={styles.rowContainer}>
    {/* Sélection de la Marque du produit */}
    <View style={styles.halfWidthContainer}>
        <Text style={styles.label}>Marque du produit</Text>
        <Picker
            selectedValue={brand}
            style={styles.input}
            onValueChange={handleBrandChange}
        >
            <Picker.Item label="Sélectionnez une marque..." value="" />
            {(productBrands[deviceType] || []).map((brandOption) => (
                <Picker.Item key={brandOption} label={brandOption} value={brandOption} />
            ))}
            <Picker.Item label="Autre" value="Autre" />
        </Picker>
        {brand === "Autre" && (
            <TextInput
                style={styles.autreInput}
                placeholder="Entrez la marque"
                value={customBrand}
                onChangeText={setCustomBrand}
            />
        )}
    </View>

    {/* Sélection du Modèle du produit */}
    <View style={styles.halfWidthContainer}>
        <Text style={styles.label}>Modèle du produit</Text>
        {(productModels[deviceType]?.[brand] || []).length > 0 ? (
            <Picker
                selectedValue={model}
                style={styles.input}
                onValueChange={handleModelChange}
            >
                <Picker.Item label="Sélectionnez un modèle..." value="" />
                {(productModels[deviceType][brand] || []).map((modelOption) => (
                    <Picker.Item key={modelOption} label={modelOption} value={modelOption} />
                ))}
                <Picker.Item label="Autre" value="Autre" />
            </Picker>
        ) : (
            <TextInput
                style={styles.input}
                placeholder="Entrez le modèle"
                value={model}
                onChangeText={(text) => setModel(text.toUpperCase())}
            />
        )}
        {model === "Autre" && (
            <TextInput
                style={styles.autreInput}
                placeholder="Entrez le modèle"
                value={customModel}
                onChangeText={setCustomModel}
            />
        )}
    </View>
</View>



                <View style={styles.fullfWidthContainer}>
                    <Text style={styles.label}>Numéro de série</Text>
                    <TextInput
                        style={styles.input}
                        value={serialNumber.toUpperCase()} // Afficher en majuscules
                        onChangeText={(text) =>
                            setSerialNumber(text.toUpperCase())
                        } // Forcer la saisie en majuscules
                        autoCapitalize="characters" // Forcer la saisie en majuscules
                        placeholder="Numéro de série"
                    />
                </View>

                <View style={styles.referenceContainer}>
                    <TextInput
                        style={styles.referenceInput}
                        value={reference.toUpperCase()} // Afficher en majuscules
                        onChangeText={(text) =>
                            setReference(text.toUpperCase())
                        } // Forcer la saisie en majuscules
                        autoCapitalize="characters" // Forcer la saisie en majuscules
                        placeholder="Référence du produit"
                    />
                    {labelPhoto && (
                        <MaterialIcons
                            name="check-circle"
                            size={24}
                            color="green"
                            style={styles.checkIcon}
                        />
                    )}
                </View>

                <TouchableOpacity
                    style={styles.button}
                    onPress={pickLabelImage}
                >
				<Icon name="camera" size={20} color="#222177" style={styles.buttonIcon} />
                    <Text style={styles.buttonText}>
                        Prendre une photo de l'étiquette
                    </Text>
                </TouchableOpacity>

                <Text style={styles.label}>Description de la panne</Text>
                <TextInput
                    style={styles.input}
                    value={description.toUpperCase()} // Afficher en majuscules
                    onChangeText={(text) => setDescription(text.toUpperCase())} // Forcer la saisie en majuscules
                    multiline
                    autoCapitalize="characters" // Forcer la saisie en majuscules
                />

                <Text style={styles.label}>Mot de passe (si applicable)</Text>
                <TextInput
                    style={styles.input}
                    value={password} // Pas de transformation en majuscules
                    onChangeText={setPassword} // Pas de forçage en majuscules
                />

                <Text style={styles.label}>Coût de la réparation (€)</Text>
                <TextInput
                    style={styles.input}
                    value={cost ? cost.toString() : ""} // Convertir en string pour affichage
                    keyboardType="numeric"
                />

                <View
                    style={[
                        styles.rowFlexContainer,
                        status === "En attente de pièces" && {
                            paddingHorizontal: 20,
                        },
                    ]}
                >
                    <View style={styles.fullwidthContainer}>
                        <Text style={styles.label}>Statut</Text>
                        <Picker
                            selectedValue={status}
                            style={styles.input}
                            onValueChange={(itemValue) => setStatus(itemValue)}
                        >
                            <Picker.Item
                                label="Sélectionnez un statut..."
                                value="default"
                            />
                            <Picker.Item
                                label="En attente de pièces"
                                value="En attente de pièces"
                            />
                            <Picker.Item
                                label="Devis accepté"
                                value="Devis accepté"
                            />
                            <Picker.Item
                                label="Réparation en cours"
                                value="Réparation en cours"
                            />
                            <Picker.Item label="Réparé" value="Réparé" />
                            <Picker.Item
                                label="Non réparable"
                                value="Non réparable"
                            />
                        </Picker>
                    </View>
                    {status === "En attente de pièces" && (
                        <View style={styles.halfWidthContainer}>
                            <Text style={styles.label}>Commande</Text>
                            <TextInput
                                style={styles.input}
                                value={commande.toUpperCase()} // Afficher en majuscules
                                onChangeText={(text) =>
                                    setCommande(text.toUpperCase())
                                } // Forcer la saisie en majuscules
                                autoCapitalize="characters" // Forcer la saisie en majuscules
                            />
                        </View>
                    )}
                </View>

                <Text style={styles.label}>Chargeur</Text>
                <Picker
                    selectedValue={chargeur}
                    style={styles.input}
                    onValueChange={(itemValue) => setChargeur(itemValue)}
                >
                    <Picker.Item label="Non" value="Non" />
                    <Picker.Item label="Oui" value="Oui" />
                </Picker>

{/* Affichage des images capturées */}
{photos.length > 0 && (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 20  }}>
    {photos.map((photo, index) => (
      <TouchableOpacity key={index} onPress={() => handleImagePress(photo)}>
        <Image
          source={{ uri: `data:image/jpeg;base64,${photo}` }} // Afficher les images en base64
          style={[styles.thumbnail, labelPhoto === photo && styles.labelPhoto]} // Bordure verte si c'est l'étiquette
        />
      </TouchableOpacity>
    ))}
  </View>
)}
{selectedImage && (
  <Modal visible={true} transparent={true} onRequestClose={() => setSelectedImage(null)}>
    <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
      <View style={styles.modalBackground}>
        <Image
          source={{ uri: `data:image/jpeg;base64,${selectedImage}` }}  // Affichage en grand
          style={styles.fullImage}
        />
      </View>
    </TouchableWithoutFeedback>
  </Modal>
)}

                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[styles.iconButton, styles.button]}
                        onPress={pickAdditionalImage}
                    >
					<Icon name="camera" size={20} color="#222177" style={styles.buttonIcon} />
                        <Text style={styles.buttonText}>
                            Prendre une autre photo
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.iconButton, styles.saveButton]}
                        onPress={handleSaveIntervention}
                    >
					<Icon name="save" size={20} color="#084710" style={styles.buttonIcon} />
                        <Text style={styles.buttonText}>
                            Sauvegarder l'intervention
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <Modal
                transparent={true}
                visible={alertVisible}
                animationType="fade"
                onRequestClose={closeAlert}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.alertBox}>
                        <Text style={styles.alertTitle}>{alertTitle}</Text>
                        <Text style={styles.alertMessage}>{alertMessage}</Text>
                        <TouchableOpacity
                            style={styles.modalButton}
                            onPress={closeAlert}
                        >
                            <Text style={styles.modalButtonText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f2f2f2",
        paddingHorizontal: 20,
    },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        marginBottom: 20,
        borderRadius: 5,
        backgroundColor: "#fff",
        width: "90%",
        alignSelf: "center",
    },
    label: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 5,
        color: "#555",
        width: "90%",
        alignSelf: "center",
    },
    rowContainer: {
        flexDirection: "row",
        justifyContent: "space-between", // Pour espacer les éléments
        width: "95%", // Assurez-vous que cela ne dépasse pas de l'écran
        alignSelf: "center",
    },
    // Chaque champ prendra 50% de la largeur
    halfWidthContainer: {
        flex: 1, // Chaque élément prend 50% de l'espace disponible
    },
    referenceContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "90%",
        alignSelf: "center",
    },
    referenceInput: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        borderRadius: 5,
        backgroundColor: "#fff",
        width: "84%",
    },
    checkIcon: {
        marginLeft: 10,
    },
    thumbnail: {
        width: 100,
        height: 100,
        margin: 5,
        borderRadius: 10,
    },
    labelPhoto: {
        borderWidth: 3,
        borderColor: "green",
    },
    button: {
        backgroundColor: "#dddddd",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderRadius: 5,
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        alignSelf: "center",
        marginTop: 20,
        marginBottom: 20,
    },
    buttonText: {
        color: "#202020",
        fontWeight: "bold",
    },
    saveButton: {
        backgroundColor: "#acf5bb",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderRadius: 5,
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        alignSelf: "center",
		marginTop: 20,
        marginBottom: 20,
    },
    saveButtonText: {
        color: "#202020",
        fontSize: 16,
        fontWeight: "bold",
    },
    modalOverlay: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    alertBox: {
        width: 300,
        padding: 20,
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        borderRadius: 20,
        alignItems: "center",
    },
    alertTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 10,
        color: "#333",
    },
    alertMessage: {
        fontSize: 16,
        color: "#666",
        textAlign: "center",
        marginBottom: 20,
    },
    modalBackground: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.8)", // Fond transparent
    },
    fullImage: {
        width: "90%",
        height: "90%",
        resizeMode: "contain", // Adapter l'image à la taille de l'écran
    },
    fullwidthContainer: {
        flex: 1,
        width: "48%",
    },
    rowFlexContainer: {
        flexDirection: "row",
        width: "100%",
    },
	buttonContainer: {
		flexDirection: "row", // Positionne les boutons côte à côte
		justifyContent: "space-between", // Espace entre les boutons
		width: "100%",
		paddingHorizontal: 40,
		gap: 10,
	},
	buttonIcon: {
		marginRight: 10, // Espace entre l'icône et le texte
	  },
	  iconButton: {
		flexDirection: 'row', // Positionne l'icône et le texte côte à côte
		alignItems: 'center',
		backgroundColor: '#acf5bb',
		borderWidth: 1,
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 5,
		justifyContent: 'center',
		flex: 1, // Prend 50% de la largeur (car il y a 2 boutons)
		marginHorizontal: 5, // Un petit espace entre les deux boutons
	  },
	  addButtonText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: 'bold',
	  },
	  modalButton:{
		backgroundColor: "#dddddd",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderRadius: 5,
        alignItems: "center",
        justifyContent: "center",
        
        alignSelf: "center",
        marginTop: 20,
        marginBottom: 20,
},
modalButtonText: {
	color: '#202020',
	fontSize: 16,
	fontWeight: 'bold',
},
autreInput: {
    borderWidth: 1,
    borderColor: '#202020',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#b2f8ba',
    width: '90%',
    alignSelf: 'center',
},
	  
});
