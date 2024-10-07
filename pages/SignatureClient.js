import React, { useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, Dimensions } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import { supabase } from '../supabaseClient';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function SignatureClient() {
  const ref = useRef(null);
  const navigation = useNavigation();
  const route = useRoute();
  const { clientId } = route.params;

  const { width } = Dimensions.get('window'); // Obtenir la largeur de l'écran

  const handleSignature = async (signature) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ signature })
        .eq('id', clientId);

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
          .m-signature-pad {
            box-shadow: none;
            border: 1px solid #000;
            width: 100%;
            height: 100%; 
          }
          .m-signature-pad--body {
            border: none;
            margin: 0;
            padding: 0;
          }
          .m-signature-pad--footer {
            display: none;
          }
          body, html, .m-signature-pad--body canvas {
            width: ${width}px;
            height: 250px;
          }
        `}
        style={styles.signature}
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleClear}>
          <Text style={styles.buttonText}>Effacer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleCancel}>
          <Text style={styles.buttonText}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleSave}>
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
  signature: {
    width: '100%',
    height: 250,  // Fixe la hauteur de la zone de signature
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    width: '30%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
