import React, { useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, Dimensions } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import { supabase } from '../supabaseClient';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function SignatureClient() {
  const ref = useRef(null);
  const navigation = useNavigation();
  const route = useRoute();
  const { interventionId } = route.params;  // Assurez-vous que l'ID de l'intervention est passé

  const { width } = Dimensions.get('window'); // Obtenir la largeur de l'écran

  const handleSignature = async (signature) => {
    try {
      const { error } = await supabase
        .from('interventions')
        .update({ signatureIntervention: signature })  // Mise à jour de la colonne signatureIntervention
        .eq('id', interventionId);  // Assurez-vous d'utiliser l'ID de l'intervention

      if (error) {
        throw error;
      }

      Alert.alert('Succès', 'Signature enregistrée avec succès.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Erreur', 'Erreur lors de la sauvegarde de la signature.');
      console.error('Erreur lors de la sauvegarde de la signature:', error);
    }
  };

  const handleClear = () => {
    ref.current.clearSignature();
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  const handleSave = () => {
    ref.current.readSignature();
  };

  return (
    <View style={styles.container}>
      <SignatureScreen
        ref={ref}
        onOK={handleSignature}
        onEmpty={() => Alert.alert('Erreur', 'La signature est vide.')}
        descriptionText="Signez ici"
        clearText="Effacer"
        confirmText="Enregistrer"
        webStyle={`
          .m-signature-pad--footer {display: none; margin: 0px;}
          body,html {
            width: 100%; 
            height: 50%;  /* Réduit la hauteur pour le mode portrait */
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
        `}
        style={styles.signature}
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.buttonClear} onPress={handleClear}>
          <Text style={styles.buttonText}>Effacer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonCancel} onPress={handleCancel}>
          <Text style={styles.buttonText}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonSave} onPress={handleSave}>
          <Text style={styles.buttonText}>Sauvegarder</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  buttonClear: {
    backgroundColor: '#fff',
    padding: 10,
	borderWidth: 1,
    borderRadius: 5,
    width: '30%',
    alignItems: 'center',
	elevation: 5,
  },
  buttonCancel: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
	borderWidth: 3,
	borderColor: '#e90808',
    width: '30%',
    alignItems: 'center',
	elevation: 5,
  },
  buttonSave: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
	borderWidth: 3,
	borderColor: '#124902',
    width: '30%',
    alignItems: 'center',
	elevation: 5,
  },
  buttonText: {
    color: '#202020',
    fontWeight: 'bold',
  },
});
