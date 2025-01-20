import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as Print from 'expo-print';

export default function PrintPage({ route }) {
  const { clientInfo, receiverName, guaranteeText, signature } = route.params;

  // Fonction pour imprimer le contenu
  const handlePrint = async () => {
    try {
      const htmlContent = `
        <html>
          <body>
            <h4 style="text-align: center;">Restitution du matériel</h4>
            <p><strong>Client :</strong> ${clientInfo.clients?.name || 'N/A'}</p>
            <p><strong>Fiche N° :</strong> ${clientInfo.clients?.ficheNumber || 'N/A'}</p>
            <p><strong>Nom du réceptionnaire :</strong> ${receiverName || '__________________'}</p>
            <p>
              <strong>1. Garantie de 3 mois :</strong><br>
              - Le matériel récupéré bénéficie d'une garantie de <strong>trois mois</strong> à compter de la date de restitution.<br>
              - Cette garantie couvre exclusivement la même panne que celle initialement réparée. Toute autre panne ou problème distinct constaté après la restitution ne sera pas pris en charge.
            </p>
            <p>
              <strong>2. Réclamations sur la réparation :</strong><br>
              - Le client dispose d'un délai de <strong>10 jours</strong> à compter de la date de récupération pour signaler toute réclamation.<br>
              - Passé ce délai, aucune réclamation ne sera acceptée.
            </p>
            <p>
              <strong>3. Exclusions de garantie :</strong><br>
              - Les dommages causés par une mauvaise utilisation, des chocs, une exposition à des liquides ou toute intervention non autorisée annulent automatiquement la garantie.
            </p>
            <p>
              En récupérant le matériel, le client reconnaît que celui-ci a été testé et vérifié en présence du technicien ou du personnel d'AVENIR INFORMATIQUE.
            </p>
            <p>
              <strong>Responsabilité en cas de perte de données :</strong><br>
              Le client est seul responsable de ses données personnelles et de leur sauvegarde régulière. AVENIR INFORMATIQUE ne pourra être tenue responsable de toute perte de données.
            </p>
            <p>Fait à : Drancy, le : ${new Date().toLocaleDateString()}</p>
            <h5>Signature du client :</h5>
            ${
              signature
                ? `<img src="${signature}" style="width: 40%; height: auto;" />`
                : '<p>Aucune signature fournie.</p>'
            }
          </body>
        </html>
      `;

      await Print.printAsync({
        html: htmlContent,
      });

      Alert.alert('Succès', 'Le document a été envoyé à l\'imprimante.');
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue lors de l\'impression.');
      console.error('Erreur d\'impression :', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Restitution du matériel</Text>
      <Text style={styles.text}>Client : {clientInfo.clients?.name || 'N/A'}</Text>
      <Text style={styles.text}>Fiche N° : {clientInfo.clients?.ficheNumber || 'N/A'}</Text>
      <Text style={styles.text}>Nom du réceptionnaire : {receiverName || '__________________'}</Text>
      <Text style={styles.text}>Remarques : {guaranteeText || 'Aucune remarque.'}</Text>
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

  {"\n\n"}Signature du client
</Text>
      <View style={styles.signatureContainer}>
        {signature ? (
          <Image
            source={{ uri: signature }}
            style={styles.signatureImage}
            resizeMode="contain"
          />
        ) : (
          <Text>Aucune signature fournie.</Text>
        )}
      </View>
      <TouchableOpacity style={styles.printButton} onPress={handlePrint}>
        <Text style={styles.printButtonText}>Imprimer</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  text: { fontSize: 14, marginBottom: 10 },
  fixedText: { fontSize: 16, lineHeight: 24, marginTop: 20, color: '#000' },
  boldText: { fontWeight: 'bold' },
  signatureContainer: { marginTop: 20, borderWidth: 1, borderColor: '#ccc', height: 150 },
  signatureImage: { width: '100%', height: '100%' },
  printButton: { marginTop: 20, backgroundColor: '#007BFF', padding: 15, borderRadius: 5, alignItems: 'center' },
  printButtonText: { color: '#fff', fontWeight: 'bold' },
});
