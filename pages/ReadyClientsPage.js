import React from 'react';
import { View, Text, FlatList } from 'react-native';

export default function ReadyClientsPage() {
  const readyClients = [
    { id: '1', name: 'Client A' },
    { id: '2', name: 'Client B' },
  ];

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Clients prêts à récupérer leur matériel :</Text>
      <FlatList
        data={readyClients}
        renderItem={({ item }) => <Text>{item.name}</Text>}
        keyExtractor={item => item.id}
      />
    </View>
  );
}
