import React from 'react';
import { View, Text, FlatList, Image, StyleSheet, } from 'react-native';

export default function ImagesInterventions({ route }) {
  const { interventions } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Images des Interventions</Text>
      <FlatList
        data={interventions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.interventionContainer}>
            <Text style={styles.interventionTitle}>Intervention N° {item.id}</Text>
            {item.photos && item.photos.length > 0 ? (
              <FlatList
                data={item.photos}
                keyExtractor={(photo, index) => index.toString()}
                horizontal
                renderItem={({ item: photo }) => (
                  <Image
                    source={{ uri: photo }}
                    style={styles.image}
                  />
                )}
              />
            ) : (
              <Text style={styles.noImagesText}>Aucune image disponible</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  interventionContainer: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingBottom: 10,
  },
  interventionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  image: {
    width: 100,
    height: 100,
    marginRight: 10,
    borderRadius: 5,
  },
  noImagesText: {
    fontSize: 16,
    color: '#777',
  },
});
