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

  // Fonction pour détecter l'orientation
  const detectOrientation = () => {
    const dim = Dimensions.get('window');
    setOrientation(dim.height >= dim.width ? 'portrait' : 'landscape');
  };

  // Charger les informations du client et de l'intervention
  useEffect(() => {
    const loadClientAndIntervention = async () => {
      try {
        const { data, error } = await supabase
          .from('interventions')
          .select('*, clients(name, ficheNumber)')
          .eq('id', interventionId)
          .single(); // Récupère les infos de l'intervention et du client

        if (error) throw error;

        setClientInfo(data); // Enregistre les informations du client et de l'intervention
      } catch (error) {
        console.error('Erreur lors du chargement des infos :', error);
      }
    };

    loadClientAndIntervention();

    // Détecter l'orientation au chargement et à chaque changement
    detectOrientation();
    const subscription = Dimensions.addEventListener('change', detectOrientation);

    return () => {
      // Nettoyage de l'écouteur d'événements lors de la sortie de la page
      subscription.remove();
    };
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
    console.log('Signature capturée :', sig);  // Affiche la signature capturée
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
    height: 90%;  /* Réduit la hauteur pour le mode portrait */
    margin: 0; 
    padding: 0;
  }
  .m-signature-pad {
    box-shadow: none; 
    border: 3px solid black;
    width: 100%; /* Prendre 100% de la largeur de l'écran */
    height: 100%;  /* Réduit la hauteur de la zone de signature */
    margin: 0 auto;
  }
  `;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Signature de restitution</Text>

      {/* Affichage des informations du client et de l'intervention */}
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

      {/* Boutons pour capturer, confirmer et effacer la signature */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.button} onPress={handleCaptureAndConfirmSignature}>
          <Text style={styles.buttonText}>Capturer et Confirmer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={handleClearSignature}>
          <Text style={styles.buttonText}>Effacer la signature</Text>
        </TouchableOpacity>
      </View>

      {/* Champ pour le texte non modifiable récupéré depuis la BDD */}
      <Text style={styles.fixedText}>
        Je soussigné(e), M. {clientInfo?.clients?.name || '________________________'}, certifie avoir pris connaissance que le matériel, qu'il soit réparé ou jugé non réparable, devra être récupéré dans un délai maximum de 30 jours. Au-delà de ce délai, le matériel sera considéré comme abandonné et pourra être détruit ou jeté sans recours possible.
        AVENIR INFORMATIQUE ne peut être tenu responsable de la perte de données sur disque dur ou tout autre support. Aucune réclamation ne sera prise en compte après le règlement de la facture.

Les anciens supports sont systématiquement restitués. Si le client ne souhaite pas récupérer son ancien support, celui-ci sera archivé avec le numéro de la fiche correspondant pour une durée de 3 mois avant destruction. Les supports démontés pour être remplacés seront numérotés avec le numéro de la fiche client.

Nos forfaits varient en fonction des problèmes à résoudre, hors remplacement de matériel. Le prix indiqué est donc indicatif, basé sur les informations fournies. En cas de remplacement de bloc vitre tactile ou d’écran LCD sur smartphone ou tablette, seuls les éléments remplacés seront couverts par la garantie. Vous demeurez responsable des autres problèmes éventuels qui pourraient survenir après la réparation.

Responsabilité en cas de perte de données : Le client est seul responsable de ses données personnelles et/ou professionnelles et de leur sauvegarde régulière.

En cas de perte de données lors d’une prestation et/ou d’une manipulation, qu’elle soit d’origine logicielle ou matérielle, le client (particulier ou professionnel) ne pourra prétendre à aucune indemnisation, qu'il ait ou non une sauvegarde récente ou ancienne de ses données sur un autre support.

Toute intervention effectuée par le personnel d'AVENIR INFORMATIQUE se fait sous l’entière responsabilité du client. AVENIR INFORMATIQUE ne pourra en aucun cas être tenue responsable de la perte éventuelle d’informations. Le client reste donc seul responsable de ses données.

En signant ce document, vous acceptez les conditions ci-dessus.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f2f2f2',
  },
  fixedText: {
    fontSize: 12,
    lineHeight: 24,
    color: '#000',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  infoContainer: {
    marginBottom: 20,
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
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  signatureContainer: {
    borderColor: '#007BFF',
    borderWidth: 2,
    marginTop: 20,
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
    height: '30%',
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
    borderRadius: 50,
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
});
