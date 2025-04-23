import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Dimensions } from 'react-native';
import Signature from 'react-native-signature-canvas';
import { supabase } from '../supabaseClient';

export default function SignaturePage({ route, navigation }) {
  const { clientId, interventionId } = route.params;  // Récupère les paramètres clientId et interventionId
  const [signature, setSignature] = useState(null); // Stocke la signature
  const [guaranteeText, setGuaranteeText] = useState(''); // Texte pour la garantie
  const [clientInfo, setClientInfo] = useState(null); // Stocke les infos du client et de l'intervention
  const [orientation, setOrientation] = useState('portrait'); // Gérer l'orientation
  const ref = useRef(null); // Référence pour le composant de signature
  const [receiverName, setReceiverName] = useState('');
  const [description, setDescription] = useState('');

  // Fonction pour détecter l'orientation
  const detectOrientation = () => {
    const dim = Dimensions.get('window');
    setOrientation(dim.height >= dim.width ? 'portrait' : 'landscape');
  };

  const isValidUUID = (id) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[4][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(id);

  useEffect(() => {
	if (!interventionId || !isValidUUID(interventionId)) {
	  console.error('Erreur : interventionId n\'est pas un UUID valide ou est manquant.');
	  return;
	}
  
	const loadClientAndIntervention = async () => {
	  try {
		const { data, error } = await supabase
		  .from('interventions')
		  .select('*, clients(name, ficheNumber)')
		  .eq('id', interventionId)
		  .single();
  
		if (error) throw error;
  
		setClientInfo(data);
	  } catch (error) {
		console.error('Erreur lors du chargement des infos :', error);
	  }
	};
  
	loadClientAndIntervention();
  }, [interventionId]);
  

  const handleCaptureAndConfirmSignature = async () => {
    try {
      if (!signature) {
        Alert.alert('Erreur', 'Veuillez fournir une signature.');
        return;
      }

      // Mise à jour du statut de l'intervention à "Récupéré"
      const { error } = await supabase
        .from('interventions')
        .update({
          status: 'Récupéré', // Mise à jour du statut à "Récupéré"
          signature,
          guarantee: guaranteeText,
		  receiver_name: receiverName, // Enregistrer le nom de la personne récupérant
          updatedAt: new Date().toISOString(),
        })
        .eq('id', interventionId);

      if (error) throw error;

      Alert.alert('Succès', 'La signature et la garantie ont été enregistrées.');

      // Naviguer vers la page précédente après la confirmation
      navigation.goBack();

    } catch (error) {
      console.error('Erreur lors de la confirmation de la signature :', error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de l\'enregistrement.');
    }
  };

  // Gestion de la signature capturée
  const handleSignature = (sig) => {
    // console.log('Signature capturée :', sig);  // Affiche la signature capturée
    setSignature(sig); // Mettre à jour la signature capturée
  };

  // Effacer la signature
  const handleClearSignature = () => {
    ref.current.clearSignature(); // Effacer la signature dans l'interface
    setSignature(null); // Réinitialiser l'état de la signature pour permettre de réécrire
  };

  // Style personnalisé pour la WebView
  const webStyle = `
  .m-signature-pad--footer {display: none; margin: 0px;}
  body,html {
    width: 100%; 
    height: 100%;  /* Réduit la hauteur pour le mode portrait */
    margin: 0; 
    padding: 0;
  }
  .m-signature-pad {
    box-shadow: none; 
    border: 1px solid black;
    width: 100%; /* Prendre 100% de la largeur de l'écran */
    height: 100%;  /* Réduit la hauteur de la zone de signature */
    margin: 0 auto;
  }
  `;
  const handleCaptureAndPrint = async () => {
	try {
	  if (!signature) {
		Alert.alert('Erreur', 'Veuillez fournir une signature avant d\'imprimer.');
		return;
	  }
  
	  // Mettre à jour la base de données avec la signature et les informations nécessaires
	  const { error } = await supabase
		.from('interventions')
		.update({
		  status: 'Récupéré',
		  signature,
		  guarantee: guaranteeText,
		  receiver_name: receiverName,
		  updatedAt: new Date().toISOString(),
		})
		.eq('id', interventionId);
  
	  if (error) throw error;
	  console.log("🧾 Données envoyées à PrintPage :", {
		name: clientInfo?.clients?.name,
		ficheNumber: clientInfo?.clients?.ficheNumber,
	  });
	  navigation.navigate('PrintPage', {
		clientInfo: {
		  name: clientInfo?.clients?.name || "",
		  ficheNumber: clientInfo?.clients?.ficheNumber || "",
		},
		receiverName,
		guaranteeText,
		signature,
	  });
	  
	} catch (error) {
	  console.error('Erreur lors de la sauvegarde ou de la navigation :', error);
	  Alert.alert('Erreur', 'Une erreur est survenue lors de l\'enregistrement.');
	}
  };
  const handleSaveAndNavigateToPrint = async () => {
	try {
	  if (!signature) {
		Alert.alert('Erreur', 'Veuillez fournir une signature.');
		return;
	  }
  
	  // Mise à jour dans la base de données
	  const { error } = await supabase
		.from('interventions')
		.update({
		  status: 'Récupéré',
		  signature,
		  guarantee: guaranteeText,
		  receiver_name: receiverName,
		  updatedAt: new Date().toISOString(),
		})
		.eq('id', interventionId);
  
	  if (error) {
		throw error;
	  }
  
	  // Navigation vers PrintPage après sauvegarde
	  navigation.navigate('PrintPage', {
		clientInfo: {
		  name: clientInfo?.clients?.name || '',
		  ficheNumber: clientInfo?.clients?.ficheNumber || '',
		  phone: clientInfo?.clients?.phone || '',
		},
		receiverName,
		guaranteeText,
		signature,
		description,
		productInfo: {
		  deviceType: clientInfo?.deviceType || '',
		  brand: clientInfo?.brand || '',
		  model: clientInfo?.model || '',
		  reference: clientInfo?.reference || '',
		  cost: clientInfo?.cost || '',
		  remarks: clientInfo?.remarks || '',
		  date: clientInfo?.updatedAt || '',
		  description: clientInfo?.description || '', // 👈 ICI on récupère la description initiale
		},
	  });
	  
	} catch (error) {
	  console.error('Erreur lors de la sauvegarde et de la navigation :', error);
	  Alert.alert('Erreur', 'Une erreur est survenue lors de la sauvegarde.');
	}
  };
  
  return (
	
    <View style={styles.container}>
      <Text style={styles.title}>Garantie et restitution</Text>

{clientInfo?.clients && (
  <View style={styles.infoContainer}>
	<Text style={styles.infoText}>Client: {clientInfo.clients.name}</Text>
	<Text style={styles.infoText}>Fiche N°: {clientInfo.clients.ficheNumber}</Text>
	<Text style={styles.infoText}>Type d'appareil: {clientInfo.deviceType} {clientInfo.brand} {clientInfo.model}</Text>
	<Text style={styles.infoText}>Description: {clientInfo.description}</Text>
	<Text style={styles.infoText}>Coût: {clientInfo.cost} €</Text>
  </View>
)}



      <TextInput
        style={styles.input}
        placeholder="Remarques"
        value={guaranteeText}
        onChangeText={setGuaranteeText}
      />
	        <TextInput
        style={styles.input}
        placeholder="Nom de la personne récupérant le matériel"
        value={receiverName}
        onChangeText={setReceiverName}
      />
<Text style={styles.fixedText}>
Je soussigné(e), M./Mme {receiverName || clientInfo?.clients?.name || "________________________"}, atteste avoir récupéré le matériel mentionné et reconnais avoir été informé(e) des conditions suivantes :
  
	  {"\n\n"}<Text style={styles.boldText}>1. Garantie commerciale – durée et portée :</Text>
	  {"\n"}Le matériel restitué est couvert par une garantie commerciale d’une durée de trois (3) mois à compter de la date de restitution.
	  {"\n"}Cette garantie ne s’applique qu’à la panne initialement identifiée et réparée. Toute autre anomalie ou défaillance ultérieure, non directement liée à l’intervention initiale, est expressément exclue de cette garantie.
	  {"\n"}Les réparations consécutives à une oxydation ou à une exposition à un liquide ne sont pas couvertes, en raison du caractère aléatoire et non maîtrisable de ce type de dysfonctionnement.
  
	  {"\n\n"}<Text style={styles.boldText}>2. Délais de réclamation :</Text>
	  {"\n"}Le client dispose d’un délai de dix (10) jours calendaires à compter de la date de restitution pour formuler toute réclamation.
	  {"\n"}Aucune demande ne pourra être recevable au-delà de ce délai, sauf disposition légale contraire.
  
	  {"\n\n"}<Text style={styles.boldText}>3. Exclusions de garantie :</Text>
	  {"\n"}La garantie est automatiquement réputée caduque en cas :
	  {"\n"}• de mauvaise utilisation du matériel,
	  {"\n"}• de dommages physiques (chocs, fissures, etc.),
	  {"\n"}• d’exposition à des liquides,
	  {"\n"}• ou d’intervention effectuée par un tiers non autorisé par AVENIR INFORMATIQUE.
  
	  {"\n\n"}<Text style={styles.boldText}>4. Responsabilité relative aux données personnelles :</Text>
	  {"\n"}Il appartient exclusivement au client de procéder à la sauvegarde préalable de ses données.
	  {"\n"}AVENIR INFORMATIQUE décline toute responsabilité en cas de perte totale ou partielle de données, quelle qu’en soit la cause, y compris lors de l’intervention technique.
  
	  {"\n\n"}Fait à : Drancy
	  {"\n"}Le : {new Date().toLocaleDateString()}
  
	  {"\n"}Signature du client :
	</Text>

      <View
        style={[
          styles.signatureContainer,
          orientation === 'portrait' ? styles.portraitSignature : styles.landscapeSignature,
        ]}
      >
	  
        <Signature
          ref={ref}
          onOK={handleSignature}
          onEnd={() => ref.current.readSignature()} // Appelé quand l'utilisateur termine une nouvelle signature
          descriptionText="Signature"
          confirmText="Confirmer"
          webStyle={webStyle} // Appliquer le style personnalisé
        />
      </View>

     
      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.button} onPress={handleCaptureAndConfirmSignature}>
          <Text style={styles.buttonText}>Capturer et Confirmer</Text>
        </TouchableOpacity>
		<TouchableOpacity style={styles.buttonGreen} onPress={handleSaveAndNavigateToPrint}>
  <Text style={styles.buttonText}>Capturer et Imprimer</Text>
</TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={handleClearSignature}>
          <Text style={styles.buttonText}>Effacer la signature</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f2f2f2',
  },
  fixedText: {
    fontSize: 16,
    lineHeight: 18,
    color: '#000',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  infoContainer: {
    marginBottom: 10,
  },
  infoText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  signatureContainer: {
    borderColor: '#007BFF',
    borderWidth: 2,
	marginLeft: 18,
    marginTop: 10,
    marginBottom: 5,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',  // Utilise la largeur complète du conteneur parent
    height: 100,    // Taille fixe pour le conteneur
    paddingHorizontal: 10,  // Ajoute un peu de marge intérieure
    backgroundColor: '#babbbd',
  },
  portraitSignature: {
    width: '95%',  // Réduit légèrement la largeur pour éviter les débordements en mode portrait
    height: '20%',
  },
  landscapeSignature: {
    width: '100%',  // Largeur légèrement réduite en mode paysage
    height: '100%',
    backgroundColor: '#007BFF',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
	marginTop: 5,
  },
  button: {
    backgroundColor: '#007BFF',
    padding: 15,
    borderRadius: 2,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
    marginVertical: 20,
  },
  buttonGreen: {
    backgroundColor: '#028d0e',
    padding: 15,
    borderRadius: 2,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
    marginVertical: 20,
  },
  clearButton: {
    backgroundColor: '#FF6347',  // Rouge pour le bouton d'effacement
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  boldText: {
	fontSize: 16,
	color: '#000000',
	fontWeight: 'bold',
  },
});
