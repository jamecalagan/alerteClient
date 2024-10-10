import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../supabaseClient';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';  // Importation d'expo-print
export default function ClientPreviewPage() {
  const [clientInfo, setClientInfo] = useState(null);
  const route = useRoute();
  const navigation = useNavigation();
  const { clientId } = route.params;

  const fetchClientInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('name, phone, createdAt, ficheNumber, signature, interventions(deviceType, brand, reference, serialnumber, description, cost, password, chargeur)')
        .eq('id', clientId)
        .single();

      if (error) throw error;

      const latestIntervention = data.interventions?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      setClientInfo({ ...data, latestIntervention });
    } catch (error) {
      console.error('Erreur lors du chargement du client', error);
    }
  };

  useEffect(() => {
    fetchClientInfo();
  }, [clientId]);

  // Rafraîchir automatiquement la page lorsque la page devient active
  useFocusEffect(
    React.useCallback(() => {
      fetchClientInfo();  // Recharger les données à chaque focus
    }, [])
  );

  const formatPhoneNumber = (phone) => {
    return phone.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  };

  if (!clientInfo) {
    return <Text>Chargement...</Text>;
  }

  const handleOpenSignaturePage = () => {
    navigation.navigate('SignatureClient', { clientId });
  };

  const handlePrint = async () => {
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: 0; }
            .section-title { font-size: 18px; font-weight: bold; margin-top: 20px; color: #2C3E50; }
            .info { margin-bottom: 8px; font-size: 16px; }
            .cost { font-size: 30px; color: green; font-weight: bold; text-align: right; margin-top: 10px; }
            .header { display: flex; justify-content: center; align-items: center; margin-bottom: 20px; }
            .logo { width: 180px; }
            .signature { width: 300px; height: 80px; margin-top: 20px; }
            .company-details { text-align: center; }
            .single-line-details { text-align: center; font-size: 14px; color: #333; }
            .border-box { border: 2px solid #ddd; padding: 10px; border-radius: 10px; margin-bottom: 20px; background-color: #fff; }
            .terms-section { margin-top: 10px; padding: 5px; background-color: #EFEFEF; border-radius: 10px; }
            .terms-text { font-size: 10px; color: #333; margin-bottom: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="https://www.avenir-informatique.fr/logo.webp" class="logo" alt="Logo de la société"/>
          </div>
          <div class="company-details">
            <p class="single-line-details">AVENIR INFORMATIQUE, 16 place de l'Hôtel de Ville 93700 Drancy, Téléphone : 01 41 60 18 18</p>
          </div>
          
          <div class="border-box">
            <div class="info"><strong>Numéro de Fiche:</strong> ${clientInfo.ficheNumber}</div>
            <div class="info"><strong>Date de création:</strong> ${new Date(clientInfo.createdAt).toLocaleDateString('fr-FR')}</div>
          </div>
          
          <div class="section-title">Informations du Client</div>
          <div class="border-box">
            <div class="info"><strong>Nom:</strong> ${clientInfo.name}</div>
            <div class="info"><strong>Téléphone:</strong> ${formatPhoneNumber(clientInfo.phone)}</div>
          </div>
  
          <div class="section-title">Détails du Matériel</div>
          <div class="border-box">
            <div class="info"><strong>Type d'appareil:</strong> ${clientInfo.latestIntervention.deviceType}</div>
            <div class="info"><strong>Marque:</strong> ${clientInfo.latestIntervention.brand}</div>
            <div class="info"><strong>Référence:</strong> ${clientInfo.latestIntervention.reference}</div>
            <div class="info"><strong>Numéro de série:</strong> ${clientInfo.latestIntervention.serialNumber}</div>
            <div class="info"><strong>Mot de passe:</strong> ${clientInfo.latestIntervention.password}</div>
            <div class="info"><strong>Chargeur:</strong> ${clientInfo.latestIntervention.chargeur ? 'Oui' : 'Non'}</div>
          </div>
  
          <div class="section-title">Réparation à effectuer</div>
          <div class="border-box">
            <div class="info"><strong>Description:</strong> ${clientInfo.latestIntervention.description}</div>
            <div class="cost">Total TTC: ${clientInfo.latestIntervention.cost} €</div>
          </div>
  
          <div class="terms-section">
            <p class="terms-text">
              Je soussigné(e), M. ${clientInfo.name || '________________________'}, certifie avoir pris connaissance que le matériel, qu'il soit réparé ou jugé non réparable, devra être récupéré dans un délai maximum de 30 jours. Au-delà de ce délai, le matériel sera considéré comme abandonné et pourra être détruit ou jeté sans recours possible.
            </p>
            <p class="terms-text">
              AVENIR INFORMATIQUE ne peut être tenu responsable de la perte de données sur disque dur ou tout autre support. Aucune réclamation ne sera prise en compte après le règlement de la facture.
            </p>
            <p class="terms-text">
              Les anciens supports sont systématiquement restitués. Si le client ne souhaite pas récupérer son ancien support, celui-ci sera archivé avec le numéro de la fiche correspondant pour une durée de 3 mois avant destruction.
            </p>
            <p class="terms-text">
              Nos forfaits varient en fonction des problèmes à résoudre, hors remplacement de matériel.
            </p>
            <p class="terms-text">
              En signant ce document, vous acceptez les conditions ci-dessus.
            </p>
            <p class="terms-text">
              Responsabilité en cas de perte de données : Le client est seul responsable de ses données personnelles et/ou professionnelles et de leur sauvegarde régulière.
            </p>
            <p class="terms-text">
              En cas de perte de données lors d’une prestation et/ou d’une manipulation, qu’elle soit d’origine logicielle ou matérielle, le client (particulier ou professionnel) ne pourra prétendre à aucune indemnisation, qu'il ait ou non une sauvegarde récente ou ancienne de ses données sur un autre support.
            </p>
            <p class="terms-text">
              Toute intervention effectuée par le personnel d'AVENIR INFORMATIQUE se fait sous l’entière responsabilité du client. AVENIR INFORMATIQUE ne pourra en aucun cas être tenue responsable de la perte éventuelle d’informations. Le client reste donc seul responsable de ses données.
            </p>
          </div>
  
          <div class="section-title">Signature du Client</div>
          ${clientInfo.signature ? `<img src="${clientInfo.signature}" class="signature" alt="Signature du client"/>` : '<p>Aucune signature fournie</p>'}
        </body>
      </html>
    `;
  
    try {
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      Alert.alert('Erreur', 'Erreur lors de l\'impression : ' + error.message);
    }
  };
  

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Section de l'entête */}
      <View style={styles.header}>
        <Image source={require('../assets/logo_phone.png')} style={styles.logo} />
        <View style={styles.companyDetails}>
          <Text style={styles.companyName}>AVENIR INFORMATIQUE</Text>
          <Text style={styles.companyAddress}>16, place de l'Hôtel de Ville 93700 Drancy</Text>
          <Text style={styles.companyPhone}>01 41 60 18 18</Text>
        </View>
      </View>

      {/* Informations du client */}
      <View style={styles.clientSection}>
        <Text style={styles.ficheNumber}>Numéro de Fiche: {clientInfo.ficheNumber}</Text>
        <Text>Date de création: {new Date(clientInfo.createdAt).toLocaleDateString('fr-FR')}</Text>
        <Text style={styles.sectionTitle}>Informations du Client</Text>
        <Text>Nom: {clientInfo.name}</Text>
        <Text style={styles.phoneText}>Téléphone: {formatPhoneNumber(clientInfo.phone)}</Text>
      </View>

      {/* Informations de la dernière intervention */}
      {clientInfo.latestIntervention && (
        <View style={styles.deviceSection}>
          <Text style={styles.sectionTitle}>Détails du Matériel</Text>
          <Text>Type d'appareil: {clientInfo.latestIntervention.deviceType}</Text>
          <Text>Marque: {clientInfo.latestIntervention.brand}</Text>
          <Text>Référence: {clientInfo.latestIntervention.reference}</Text>
          <Text>Numéro de série: {clientInfo.latestIntervention.serialNumber}</Text>
          <Text>Chargeur: {clientInfo.latestIntervention.chargeur ? 'Oui' : 'Non'}</Text>
        </View>
      )}

      {/* Informations sur la réparation */}
      {clientInfo.latestIntervention && (
        <View style={styles.repairSection}>
          <Text style={styles.sectionTitle}>Réparation à effectuer</Text>
          <Text>Description: {clientInfo.latestIntervention.description}</Text>
          <Text style={styles.costText}>Coût: {clientInfo.latestIntervention.cost} €</Text>
          <Text>Mot de passe: {clientInfo.latestIntervention.password}</Text>
        </View>
      )}

      {/* Signature du client */}
      <View style={styles.signatureSection}>
        <Text>Signature du client:</Text>
        {clientInfo.signature ? (
          <>
            <Image
              source={{ uri: clientInfo.signature }}
              style={styles.signatureImage}  // Taille réduite de la signature
            />
            <TouchableOpacity style={styles.printButton} onPress={handlePrint}>
              <Text style={styles.buttonText}>Imprimer</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.signatureBox}>
              <Text>Aucune signature fournie</Text>
            </View>
            <TouchableOpacity style={styles.signButton} onPress={handleOpenSignaturePage}>
              <Text style={styles.signButtonText}>Signer</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Conditions Générales */}
{/*       <View style={styles.termsSection}>
        <Text style={styles.sectionTitle}>Conditions Générales</Text>
        <Text style={styles.termsText}>
          La société n'est pas responsable des données perdues lors de la réparation.
        </Text>
        <Text style={styles.termsText}>
          Le client doit vérifier le bon fonctionnement du matériel avant de quitter le point de réparation.
        </Text>
        <Text style={styles.termsText}>
          Les pièces remplacées sont garanties 3 mois.
        </Text>
        <Text style={styles.termsText}>
          Aucun remboursement après service rendu.
        </Text>
      </View> */}

      {/* Nouveau texte ajouté après les conditions générales */}
      <View style={styles.termsSection}>
        <Text style={styles.termsText}>
          Je soussigné(e), M. {clientInfo.name || '________________________'}, certifie avoir pris connaissance que le matériel, qu'il soit réparé ou jugé non réparable, devra être récupéré dans un délai maximum de 30 jours. Au-delà de ce délai, le matériel sera considéré comme abandonné et pourra être détruit ou jeté sans recours possible.
        </Text>
        <Text style={styles.termsText}>
          AVENIR INFORMATIQUE ne peut être tenu responsable de la perte de données sur disque dur ou tout autre support. Aucune réclamation ne sera prise en compte après le règlement de la facture.
        </Text>
        <Text style={styles.termsText}>
          Les anciens supports sont systématiquement restitués. Si le client ne souhaite pas récupérer son ancien support, celui-ci sera archivé avec le numéro de la fiche correspondant pour une durée de 3 mois avant destruction.
        </Text>
        <Text style={styles.termsText}>
          Nos forfaits varient en fonction des problèmes à résoudre, hors remplacement de matériel.
        </Text>

        <Text style={styles.termsText}>
          Responsabilité en cas de perte de données : Le client est seul responsable de ses données personnelles et/ou professionnelles et de leur sauvegarde régulière.
        </Text>
        <Text style={styles.termsText}>
          En cas de perte de données lors d’une prestation et/ou d’une manipulation, qu’elle soit d’origine logicielle ou matérielle, le client (particulier ou professionnel) ne pourra prétendre à aucune indemnisation, qu'il ait ou non une sauvegarde récente ou ancienne de ses données sur un autre support.
        </Text>
        <Text style={styles.termsText}>
          Toute intervention effectuée par le personnel d'AVENIR INFORMATIQUE se fait sous l’entière responsabilité du client. AVENIR INFORMATIQUE ne pourra en aucun cas être tenue responsable de la perte éventuelle d’informations. Le client reste donc seul responsable de ses données.
        </Text>
        <Text style={styles.termsText}>
          En signant ce document, vous acceptez les conditions ci-dessus.
        </Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  logo: {
    width: 80,
    height: 80,
    marginRight: 20,
  },
  companyDetails: {
    justifyContent: 'center',
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  companyAddress: {
    marginTop: 5,
    fontSize: 14,
    color: '#555',
  },
  companyPhone: {
    marginTop: 5,
    fontSize: 14,
    color: '#555',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 20,
  },
  clientSection: {
    marginBottom: 20,
  },
  ficheNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  phoneText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  deviceSection: {
    marginBottom: 20,
  },
  repairSection: {
    marginBottom: 20,
  },
  signatureSection: {
    marginBottom: 20,
  },
  signatureBox: {
    height: 80,  // Réduction de la hauteur
    borderColor: '#000',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  signatureImage: {
    width: 300,  // Taille réduite de la signature
    height: 100,
    marginTop: 10,
  },
  signButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  signButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  printButton: {
    backgroundColor: '#28a745',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  costText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'green',
    marginTop: 10,
  },
  termsSection: {
    marginBottom: 20,
  },
  termsText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
});
