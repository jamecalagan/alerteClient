import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, ScrollView, KeyboardAvoidingView, Platform, Modal, Image, TouchableWithoutFeedback, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialIcons } from '@expo/vector-icons';
import Icon from "react-native-vector-icons/FontAwesome";

export default function AddInterventionPage({ route, navigation }) {
	const { clientId } = route.params || {};
  const [reference, setReference] = useState('');
  const [brand, setBrand] = useState('');
  const [serial_number, setSerial_number] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [paymentStatus, setPaymentStatus] = useState("non_regle");
  const [status, setStatus] = useState('default');
  const [deviceType, setDeviceType] = useState('default');
  const [password, setPassword] = useState('');
  const [commande, setCommande] = useState('');
  const [chargeur, setChargeur] = useState('Non');
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertTitle, setAlertTitle] = useState('');
  const [photos, setPhotos] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isPhotoTaken, setIsPhotoTaken] = useState(false);
  const [labelPhoto, setLabelPhoto] = useState(null);
  const [model, setModel] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [customDeviceType, setCustomDeviceType] = useState('');
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [remarks, setRemarks] = useState(''); // État pour les remarques
  useEffect(() => {
	loadProducts();
}, []);

const loadProducts = async () => {
	const { data, error } = await supabase.from('article').select('*');
	if (error) {
		console.error("Erreur lors du chargement des produits:", error.message);
	} else {
		setProducts(data);
	}
};

const loadBrands = async (articleId) => {
	const { data, error } = await supabase.from('marque').select('*').eq('article_id', articleId);
	if (error) {
		console.error("Erreur lors du chargement des marques :", error);
	} else {
		setBrands(data);
	}
};

const loadModels = async (brandId) => {
	const { data, error } = await supabase.from('modele').select('*').eq('marque_id', brandId);
	if (error) {
		console.error("Erreur lors du chargement des modèles :", error);
	} else {
		setModels(data);
	}
};
  
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
          setPhotos([...photos, base64Image]);
          setIsPhotoTaken(true);
          setLabelPhoto(base64Image);
          if (!reference) {
            setReference('Voir photo pour référence produit');
          }
        }
      } else {
        console.log('Aucune image capturée ou opération annulée.');
      }
    } catch (error) {
      console.error('Erreur lors de la capture d\'image :', error);
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
          setPhotos([...photos, base64Image]);
        }
      } else {
        console.log('Aucune image capturée ou opération annulée.');
      }
    } catch (error) {
      console.error('Erreur lors de la capture d\'image :', error);
    }
  };

  const convertImageToBase64 = async (uri) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (error) {
      console.error('Erreur lors de la conversion de l\'image en base64 :', error);
      return null;
    }
  };

  const handleDeviceTypeChange = async (value) => {
	setDeviceType(value);
	setCustomDeviceType('');
	const selectedProduct = products.find((product) => product.nom === value);
	if (selectedProduct) {
		await loadBrands(selectedProduct.id);
	} else {
		setBrands([]);
	}
};




const [selectedBrandName, setSelectedBrandName] = useState(''); // Nouvel état pour stocker le nom

const handleBrandChange = async (value) => {
	setBrand(value);
	setCustomBrand('');
	const selectedBrand = brands.find((b) => b.id === value);
	if (selectedBrand) {
		await loadModels(selectedBrand.id);
	} else {
		setModels([]);
	}
};
const addArticleIfNeeded = async () => {
	if (deviceType === 'Autre' && customDeviceType) {
		const { data, error } = await supabase
			.from('article')
			.insert([{ nom: customDeviceType }])
			.select();

		if (error) {
			console.error("Erreur lors de l'ajout de l'article :", error);
			Alert.alert("Erreur", "Impossible d'ajouter le nouvel article.");
			return null;
		}
		if (data) {
			setProducts([...products, data[0]]);
			return data[0].id;
		}
	}
	return products.find((product) => product.nom === deviceType)?.id || null;
};

const addBrandIfNeeded = async (articleId) => {
	if (brand === 'Autre' && customBrand) {
		const { data, error } = await supabase
			.from('marque')
			.insert([{ nom: customBrand, article_id: articleId }])
			.select();

		if (error) {
			console.error("Erreur lors de l'ajout de la marque :", error);
			Alert.alert("Erreur", "Impossible d'ajouter la nouvelle marque.");
			return null;
		}
		if (data) {
			setBrands([...brands, data[0]]);
			return data[0].id;
		}
	}
	return brands.find((b) => b.id === brand)?.id || null;
};

const addModelIfNeeded = async (brandId, articleId) => {
	if (model === 'Autre' && customModel) {
		const { data, error } = await supabase
			.from('modele')
			.insert([{ nom: customModel, marque_id: brandId, article_id: articleId }]) // Ajout de article_id ici
			.select();

		if (error) {
			console.error("Erreur lors de l'ajout du modèle :", error);
			Alert.alert("Erreur", "Impossible d'ajouter le nouveau modèle.");
			return null;
		}
		if (data) {
			setModels([...models, data[0]]);
			return data[0].id;
		}
	}
	return models.find((m) => m.id === model)?.id || null;
};
const handlePaymentStatusChange = (status) => {
    setPaymentStatus(status);
};


const handleSaveIntervention = async () => {
    if (!reference || !brand || !model || !description || deviceType === 'default' || status === 'default') {
        Alert.alert('Erreur', 'Tous les champs doivent être remplis et une option doit être sélectionnée.');
        return;
    }

    // Vérifie le coût sauf si le statut est "Devis en cours"
    if (status !== 'Devis en cours' && !cost) {
        Alert.alert('Erreur', 'Veuillez indiquer le coût de la réparation.');
        return;
    }

    if (!labelPhoto) {
        setAlertTitle('Erreur');
        setAlertMessage("Veuillez prendre une photo d'étiquette.");
        setAlertVisible(true);
        return;
    }

    // Convertir `cost` en null si vide pour éviter l'erreur dans la base de données
    const costValue = cost ? parseFloat(cost) : null;

    const articleId = await addArticleIfNeeded();
    const brandId = await addBrandIfNeeded(articleId);
    const modelId = await addModelIfNeeded(brandId, articleId);

    const interventionData = {
        reference,
        brand: customBrand || brands.find((b) => b.id === brand)?.nom,
        model: customModel || models.find((m) => m.id === model)?.nom,
        serial_number,
        description,
        cost: costValue, // Utiliser `costValue` ici
        status,
        deviceType: customDeviceType || deviceType,
        password,
        commande,
        chargeur: chargeur === 'Oui',
        client_id: clientId,
        photos: photos.length > 0 ? photos : [],
        label_photo: labelPhoto,
        article_id: articleId,
        marque_id: brandId,
        modele_id: modelId,
        remarks, // Ajoute les remarques ici
        paymentStatus,
    };

    try {
        const { error } = await supabase.from('interventions').insert(interventionData);
        if (error) throw error;

        Alert.alert('Succès', 'Intervention ajoutée avec succès.');
        navigation.navigate('Home');
    } catch (error) {
        Alert.alert('Erreur', "Erreur lors de l'ajout de l'intervention.");
        console.error("Erreur lors de l'ajout de l'intervention :", error);
    }
};

  

  const closeAlert = () => {
    setAlertVisible(false);
    if (alertTitle === 'Succès') {
		navigation.navigate('Home');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={80}
    >
      <ScrollView>
	  <Text style={styles.label}>Type de produit</Text>
                <Picker selectedValue={deviceType} style={styles.input} onValueChange={handleDeviceTypeChange}>
                    <Picker.Item label="Sélectionnez un type de produit..." value="default" />
                    {products.map((product) => (
                        <Picker.Item key={product.id} label={product.nom} value={product.nom} />
                    ))}
                    <Picker.Item label="Autre" value="Autre" />
                </Picker>
                {deviceType === 'Autre' && (
                    <TextInput
                        style={styles.input}
                        placeholder="Entrez le type de produit"
                        value={customDeviceType}
                        onChangeText={setCustomDeviceType}
                    />
                )}

        {/* Sélection de la Marque */}
		<Text style={styles.label}>Marque</Text>
                <Picker selectedValue={brand} style={styles.input} onValueChange={handleBrandChange}>
                    <Picker.Item label="Sélectionnez une marque..." value="" />
                    {brands.map((brandOption) => (
                        <Picker.Item key={brandOption.id} label={brandOption.nom} value={brandOption.id} />
                    ))}
                    <Picker.Item label="Autre" value="Autre" />
                </Picker>
                {brand === 'Autre' && (
                    <TextInput
                        style={styles.input}
                        placeholder="Entrez la marque"
                        value={customBrand}
                        onChangeText={setCustomBrand}
                    />
                )}

        {/* Sélection du Modèle */}
		<Text style={styles.label}>Modèle</Text>
                <Picker selectedValue={model} style={styles.input} onValueChange={(itemValue) => setModel(itemValue)}>
                    <Picker.Item label="Sélectionnez un modèle..." value="" />
                    {models.map((modelOption) => (
                        <Picker.Item key={modelOption.id} label={modelOption.nom} value={modelOption.id} />
                    ))}
                    <Picker.Item label="Autre" value="Autre" />
                </Picker>
                {model === 'Autre' && (
                    <TextInput
                        style={styles.input}
                        placeholder="Entrez le modèle"
                        value={customModel}
                        onChangeText={setCustomModel}
                    />
                )}


        <Text style={styles.label}>Numéro de série</Text>
        <TextInput
          style={styles.input}
          value={serial_number.toUpperCase()}
          onChangeText={(text) => setSerial_number(text.toUpperCase())}
          autoCapitalize="characters"
          placeholder="Numéro de série"
        />


  <View style={styles.referenceContainer}>
    <TextInput
      style={styles.referenceInput}
      value={reference.toUpperCase()}
      onChangeText={(text) => setReference(text.toUpperCase())}
      autoCapitalize="characters"
      placeholder="Référence du produit / Numéro de série / photo étiquette"
    />
    {/* Afficher la coche verte si la photo est prise */}
    {isPhotoTaken && (
      <MaterialIcons name="check-circle" size={24} color="green" style={styles.checkIcon} />
    )}
  </View>

  <TouchableOpacity style={styles.button} onPress={pickLabelImage}>
  <Icon name="camera" size={20} color="#222177" style={styles.buttonIcon} />
    <Text style={styles.buttonText}>Prendre une photo de l'étiquette</Text>
  </TouchableOpacity>

  {/* Autres champs de description, mot de passe, etc. */}
  <Text style={styles.label}>Description de la panne</Text>
  <TextInput
    style={styles.input}
    value={description.toUpperCase()}
    onChangeText={(text) => setDescription(text.toUpperCase())}
    multiline
    autoCapitalize="characters"
  />

  <Text style={styles.label}>Mot de passe (si applicable)</Text>
  <TextInput
    style={styles.input}
    value={password}
    onChangeText={setPassword}
  />

<Text style={styles.label}>Coût de la réparation (€)</Text>
<TextInput
    style={styles.input}
    value={cost ? cost.toString() : ''}
    onChangeText={setCost}
    keyboardType="numeric"
    editable={status !== 'Devis en cours'} // Désactiver si "Devis en cours" est sélectionné
    placeholder={status === 'Devis en cours' ? 'Indisponible en mode Devis' : 'Entrez le coût'}
/>

<View style={styles.checkboxContainer}>
    <TouchableOpacity onPress={() => setPaymentStatus('non_regle')} style={styles.checkboxRow}>
        <View style={[styles.checkbox, paymentStatus === 'non_regle' && styles.checkboxCheckedRed]}>
            {paymentStatus === 'non_regle' && <View style={styles.checkboxIndicator} />}
        </View>
        <Text style={styles.checkboxLabel}>Non réglé</Text>
    </TouchableOpacity>

    <TouchableOpacity onPress={() => setPaymentStatus('reglement_partiel')} style={styles.checkboxRow}>
        <View style={[styles.checkbox, paymentStatus === 'reglement_partiel' && styles.checkboxCheckedOrange]}>
            {paymentStatus === 'reglement_partiel' && <View style={styles.checkboxIndicator} />}
        </View>
        <Text style={styles.checkboxLabel}>Règlement partiel</Text>
    </TouchableOpacity>

    <TouchableOpacity onPress={() => setPaymentStatus('solde')} style={styles.checkboxRow}>
        <View style={[styles.checkbox, paymentStatus === 'solde' && styles.checkboxCheckedGreen]}>
            {paymentStatus === 'solde' && <View style={styles.checkboxIndicator} />}
        </View>
        <Text style={styles.checkboxLabel}>Soldé</Text>
    </TouchableOpacity>

</View>

  <View style={[styles.rowFlexContainer, status === 'En attente de pièces' && { paddingHorizontal: 20 }]}>
    <View style={styles.fullwidthContainer}>
      <Text style={styles.label}>Statut</Text>
	  <Picker
    selectedValue={status}
    style={styles.input}
    onValueChange={(itemValue) => {
        setStatus(itemValue);
        if (itemValue === 'Devis en cours') {
            setCost(''); // Efface le coût si "Devis en cours" est sélectionné
        }
    }}
>
    <Picker.Item label="Sélectionnez un statut..." value="default" />
    <Picker.Item label="En attente de pièces" value="En attente de pièces" />
    <Picker.Item label="Devis en cours" value="Devis en cours" />
    <Picker.Item label="Devis accepté" value="Devis accepté" />
    <Picker.Item label="Réparation en cours" value="Réparation en cours" />
    <Picker.Item label="Réparé" value="Réparé" />
    <Picker.Item label="Non réparable" value="Non réparable" />
</Picker>

    </View>
    {status === 'En attente de pièces' && (
      <View style={styles.halfWidthContainer}>
        <Text style={styles.label}>Commande</Text>
        <TextInput
          style={styles.input}
          value={commande.toUpperCase()}
          onChangeText={(text) => setCommande(text.toUpperCase())}
          autoCapitalize="characters"
        />
      </View>
    )}
  </View>
  <Text style={styles.label}>Remarques</Text>
<TextInput
    style={styles.input}
    value={remarks}
    onChangeText={setRemarks}
    placeholder="Ajoutez des remarques ici..."
    multiline
/>

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
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 }}>
    {photos.map((photo, index) => (
      <TouchableWithoutFeedback key={index} onPress={() => setSelectedImage(photo)}>
        <Image
          source={{ uri: `data:image/jpeg;base64,${photo}` }}
          style={[
            { width: 100, height: 100, margin: 5, borderRadius: 10 },
            photo === labelPhoto && { borderWidth: 2, borderColor: '#43ec86' } // Applique le contour vert uniquement pour la photo d'étiquette
          ]}
        />
      </TouchableWithoutFeedback>
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


      {/* Modal pour afficher l'image en taille réelle */}
      {selectedImage && (
        <Modal visible={true} transparent={true} onRequestClose={() => setSelectedImage(null)}>
          <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
            <View style={styles.modalBackground}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${selectedImage}` }}
                style={styles.fullImage}
              />
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

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
            <TouchableOpacity style={styles.modalButton} onPress={closeAlert}>
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
    backgroundColor: '#f2f2f2',
    paddingHorizontal: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#fff',
    width: '90%',
    alignSelf: 'center',
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
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#555',
    width: '90%',
    alignSelf: 'center',
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
    color: '#202020',
    fontSize: 16,
    fontWeight: 'bold',
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
    color: '#202020',
    fontWeight: 'bold',
  },
  referenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '90%',
    alignSelf: 'center',
  },
  referenceInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    width: '84%',
  },
  checkIcon: {
    marginLeft: 10,
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  fullImage: {
    width: '90%',
    height: '90%',
    resizeMode: 'contain',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  photo: {
    width: 100,
    height: 100,
    margin: 5,
  },
  labelPhoto: {
    borderWidth: 3,
    borderColor: 'green',
  },
  alertBox: {
    width: 300,
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    alignItems: 'center',
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  alertMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  fullwidthContainer: {
    flex: 1,
    width: '48%', 
  },
  rowFlexContainer:{
    flexDirection:"row",
    width:"100%",
  },
  buttonContainer: {
	flexDirection: "row", // Positionne les boutons côte à côte
	justifyContent: "space-between", // Espace entre les boutons
	width: "100%",
	paddingHorizontal: 40,
	gap: 10,
},
iconButton: {
	flexDirection: 'row', // Positionne l'icône et le texte côte à côte
	alignItems: 'center',
	marginRight: 8,
	backgroundColor: '#acf5bb',
	borderWidth: 1,
	paddingVertical: 10,
	paddingHorizontal: 20,
	borderRadius: 5,
	justifyContent: 'center',
	flex: 1, // Prend 50% de la largeur (car il y a 2 boutons)
	marginHorizontal: 5, // Un petit espace entre les deux boutons
  },
  buttonIcon: {
    marginRight: 8, // Espace entre l'icône et le texte
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
checkboxContainer: {
	flexDirection: 'row',
    marginVertical: 10,
},
checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
	marginRight: 10,
	marginLeft: 40,
},
checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#444',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
},
checkboxCheckedRed: {
    backgroundColor: '#fc0707', // Couleur verte lorsque la case est cochée
},
checkboxCheckedGreen: {
    backgroundColor: '#4CAF50', // Couleur verte lorsque la case est cochée
},
checkboxCheckedOrange: {
    backgroundColor: '#e4a907', // Couleur verte lorsque la case est cochée
},
checkboxIndicator: {
    width: 12,
    height: 12,
    backgroundColor: 'white', // Couleur de l'indicateur
},
checkboxLabel: {
    fontSize: 16,
},
  
});
