import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Button, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';


const uploadSignatureToStorage = async (base64Data, id, type = '') => {
  try {
    const folder = type === 'signature-client'
      ? 'signatures/clients'
      : 'signatures/interventions';

    const fileName = `${Date.now()}.jpg`;
    const filePath = `${folder}/${id}/${fileName}`;

    const fileUri = FileSystem.cacheDirectory + fileName;
    await FileSystem.writeAsStringAsync(fileUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const file = {
      uri: fileUri,
      name: fileName,
      type: 'image/jpeg',
    };

    const { error } = await supabase.storage.from('images').upload(filePath, file, {
      upsert: true,
      contentType: 'image/jpeg',
    });

    if (error) {
      console.error('Erreur upload signature :', error.message);
      return null;
    }

    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.error('Erreur uploadSignatureToStorage :', err);
    return null;
  }
};

export default function MigrateOldImagesPage() {
  const [signaturesClient, setSignaturesClient] = useState([]);
  const [signaturesIntervention, setSignaturesIntervention] = useState([]);
  const [signaturesOrder, setSignaturesOrder] = useState([]);
  const [loading, setLoading] = useState(false);

  const looksLikeBase64 = (val) =>
    typeof val === 'string' && val.length > 100 && !val.startsWith('http');

  useEffect(() => {
    const fetchSignatures = async () => {
      const { data: interventions, error } = await supabase
        .from('interventions')
        .select('id, signature, signatureIntervention');

      if (error) {
        console.error('❌ Erreur récupération interventions :', error);
        return;
      }

      const clients = interventions.filter((i) => looksLikeBase64(i.signature));
      const techniciens = interventions.filter((i) => looksLikeBase64(i.signatureIntervention));

      setSignaturesClient(clients);
      setSignaturesIntervention(techniciens);

      const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('id, signatureclient');

      if (!orderError) {
        const orderSignatures = orders.filter((o) => looksLikeBase64(o.signatureclient));
        setSignaturesOrder(orderSignatures);
      }
    };

    fetchSignatures();
  }, []);

  const migrateSignatureClient = async (intervention) => {
    setLoading(true);
    const base64 = intervention.signature.replace(/^data:image\/(png|jpeg);base64,/, '');
    const url = await uploadSignatureToStorage(base64, intervention.id, 'signature-client');

    if (url) {
      const { error } = await supabase
        .from('interventions')
        .update({ signature: url })
        .eq('id', intervention.id);

      if (!error) {
        setSignaturesClient((prev) => prev.filter((c) => c.id !== intervention.id));
      }
    }
    setLoading(false);
  };

  const migrateSignatureIntervention = async (intervention) => {
    setLoading(true);
    const base64 = intervention.signatureIntervention.replace(/^data:image\/(png|jpeg);base64,/, '');
    const url = await uploadSignatureToStorage(base64, intervention.id, 'signature-intervention');

    if (url) {
      const { error } = await supabase
        .from('interventions')
        .update({ signatureIntervention: url })
        .eq('id', intervention.id);

      if (!error) {
        setSignaturesIntervention((prev) => prev.filter((i) => i.id !== intervention.id));
      }
    }
    setLoading(false);
  };

  const migrateSignatureOrder = async (order) => {
    setLoading(true);
    const base64 = order.signatureclient.replace(/^data:image\/(png|jpeg);base64,/, '');
    const url = await uploadSignatureToStorage(base64, order.id, 'signature-client');

    if (url) {
      const { error } = await supabase
        .from('orders')
        .update({ signatureclient: url })
        .eq('id', order.id);

      if (!error) {
        setSignaturesOrder((prev) => prev.filter((o) => o.id !== order.id));
      }
    }
    setLoading(false);
  };

  const migrateAll = async () => {
    for (const sig of signaturesClient) {
      await migrateSignatureClient(sig);
    }
    for (const sig of signaturesIntervention) {
      await migrateSignatureIntervention(sig);
    }
    for (const sig of signaturesOrder) {
      await migrateSignatureOrder(sig);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Migration des signatures</Text>

      {signaturesClient.length > 0 && (
        <>
          <Text style={styles.subtitle}>Signatures client à migrer</Text>
          {signaturesClient.map((intervention) => (
            <View key={intervention.id} style={styles.card}>
              <Text style={styles.idText}>ID intervention : {intervention.id}</Text>
              <Button
                title="Migrer signature client"
                onPress={() => migrateSignatureClient(intervention)}
                disabled={loading}
              />
            </View>
          ))}
        </>
      )}

      {signaturesIntervention.length > 0 && (
        <>
          <Text style={styles.subtitle}>Signatures intervention à migrer</Text>
          {signaturesIntervention.map((intervention) => (
            <View key={intervention.id} style={styles.card}>
              <Text style={styles.idText}>ID intervention : {intervention.id}</Text>
              <Button
                title="Migrer signature intervention"
                onPress={() => migrateSignatureIntervention(intervention)}
                disabled={loading}
              />
            </View>
          ))}
        </>
      )}

      {signaturesOrder.length > 0 && (
        <>
          <Text style={styles.subtitle}>Signatures commandes à migrer</Text>
          {signaturesOrder.map((order) => (
            <View key={order.id} style={styles.card}>
              <Text style={styles.idText}>Commande ID : {order.id}</Text>
              <Button
                title="Migrer signature commande"
                onPress={() => migrateSignatureOrder(order)}
                disabled={loading}
              />
            </View>
          ))}
        </>
      )}

      {(signaturesClient.length > 0 || signaturesIntervention.length > 0 || signaturesOrder.length > 0) && (
        <Button title="Tout migrer" onPress={migrateAll} disabled={loading} />
      )}

      {signaturesClient.length === 0 && signaturesIntervention.length === 0 && signaturesOrder.length === 0 && !loading && (
        <Text style={{ marginTop: 20 }}>Aucune signature à migrer.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginVertical: 12,
  },
  card: {
    marginBottom: 24,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  idText: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
});
