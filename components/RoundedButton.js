import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function RoundedButton({ title, onPress, style }) {
  return (
    <TouchableOpacity style={[styles.button, style]} onPress={onPress}>
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#4f4f4f', // Couleur gris foncé pour le bouton
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30, // Bord arrondi
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff', // Couleur du texte blanc pour contraste
    fontSize: 16,
    fontWeight: 'bold',
  },
});
