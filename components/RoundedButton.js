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
    backgroundColor: '#ecebeb', // Couleur gris foncé pour le bouton
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderRadius: 5, // Bord arrondi
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#000000', // Couleur du texte blanc pour contraste
    fontSize: 16,
    fontWeight: 'bold',
	elevation: 10,
  },
});
