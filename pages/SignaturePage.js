import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Dimensions } from 'react-native';
import Signature from 'react-native-signature-canvas';
import { supabase } from '../supabaseClient';

export default function SignaturePage({ route, navigation }) {
  const { clientId, interventionId } = route.params;
  const [signature, setSignature] = useState(null); // Stocke la signature
  const [guaranteeText, setGuaranteeText] = useState(''); // Texte pour la garantie
  const [clientInfo, setClientInfo] = useState(null); // Stocke les infos du client et de l'intervention
  const [fixedText, setFixedText] = useState(''); // Champ de texte modifiable
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
  
      // Après la mise à jour, vous devez rafraîchir les pages pour qu'elles affichent les bonnes données
      // Ceci peut être fait via un hook ou un appel direct au chargement des données
  
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
      width: 90%; height: 80%;
      margin: 0; padding: 0;
    }
    .m-signature-pad {
      box-shadow: none; border: none;
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

      {/* Champ pour le texte modifiable récupéré depuis la BDD */}
      <TextInput
        style={styles.input}
        placeholder="Texte modifiable"
        value={fixedText}
        onChangeText={setFixedText}  // Permet la modification du texte
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f2f2f2',
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
    borderColor: '#ccc',
    borderWidth: 1,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',  // Utilise la largeur complète du conteneur parent
    height: 300,    // Taille fixe pour le conteneur
    paddingHorizontal: 10,  // Ajoute un peu de marge intérieure
  },
  portraitSignature: {
    width: '95%',  // Réduit légèrement la largeur pour éviter les débordements en mode portrait
    height: '50%',
  },
  landscapeSignature: {
    width: '80%',  // Largeur légèrement réduite en mode paysage
    height: '100%',
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
  },
  clearButton: {
    backgroundColor: '#FF6347',  // Rouge pour le bouton d'effacement
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
