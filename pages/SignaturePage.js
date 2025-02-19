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
  
	  // Naviguer vers la page PrintPage avec les données nécessaires
	  navigation.navigate('PrintPage', {
		clientInfo,
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
		clientInfo,
		receiverName,
		guaranteeText,
		signature,
	  });
	} catch (error) {
	  console.error('Erreur lors de la sauvegarde et de la navigation :', error);
	  Alert.alert('Erreur', 'Une erreur est survenue lors de la sauvegarde.');
	}
  };
  
  return (
	
    <View style={styles.container}>
      <Text style={styles.title}>Garantie et restitution</Text>

    
      {clientInfo && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>Client: {clientInfo.clients.name}</Text>
          <Text style={styles.infoText}>Fiche N°: {clientInfo.clients.ficheNumber}</Text>
          <Text style={styles.infoText}>Type d'appareil: {clientInfo.deviceType}</Text>
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
  Je soussigné(e), M. {receiverName || clientInfo?.clients?.name || "________________________"} , certifie avoir pris connaissance des conditions suivantes :
  
  {"\n\n"}<Text style={styles.boldText}>1. Garantie de 3 mois :</Text>
  {"\n"}  - Le matériel récupéré bénéficie d'une garantie de <Text style={styles.boldText}>trois mois</Text> à compter de la date de restitution.
  {"\n"}  - Cette garantie couvre exclusivement la même panne que celle initialement réparée. Toute autre panne ou problème distinct constaté après la restitution ne sera pas pris en charge dans le cadre de cette garantie.

  {"\n\n"}<Text style={styles.boldText}>2. Réclamations sur la réparation :</Text>
  {"\n"}  - Le client dispose d'un délai de <Text style={styles.boldText}>10 jours</Text> à compter de la date de récupération pour signaler toute réclamation concernant la réparation effectuée.
  {"\n"}  - Passé ce délai, aucune réclamation ne pourra être acceptée, et toute intervention ultérieure sera facturée.

  {"\n\n"}<Text style={styles.boldText}>3. Exclusions de garantie :</Text>
  {"\n"}  - Les dommages causés par une mauvaise utilisation, des chocs, une exposition à des liquides ou toute intervention non autorisée annulent automatiquement la garantie.

  {"\n\n"}En récupérant le matériel, le client reconnaît que celui-ci a été testé et vérifié en présence du technicien ou du personnel d'AVENIR INFORMATIQUE.

  {"\n\n"}<Text style={styles.boldText}>Responsabilité en cas de perte de données :</Text>
  {"\n"}Le client est seul responsable de ses données personnelles et de leur sauvegarde régulière. En cas de perte de données lors d'une prestation ou manipulation, qu'elle soit d'origine logicielle ou matérielle, AVENIR INFORMATIQUE ne pourra être tenue responsable et aucune indemnisation ne pourra être réclamée.

  {"\n\n"}En signant ce document, le client accepte les conditions de garantie et de réclamation mentionnées ci-dessus.

  {"\n\n"}Fait à : Drancy, le : {new Date().toLocaleDateString()}
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
		<TouchableOpacity style={styles.button} onPress={handleSaveAndNavigateToPrint}>
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
    marginTop: 30,
    marginBottom: 20,
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
  clearButton: {
    backgroundColor: '#FF6347',  // Rouge pour le bouton d'effacement
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  boldText: {
	fontSize: 16,
	color: '#fff',
	fontWeight: 'bold',
  },
});
