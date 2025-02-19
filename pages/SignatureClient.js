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
	<Text style={styles.fixedText}>
	  Je certifie avoir pris connaissance des conditions suivantes :
	  
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
            height: 80%;  /* Réduit la hauteur pour le mode portrait */
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
  fixedText: {
    fontSize: 16,
    lineHeight: 18,
    color: '#000',
  },
});
