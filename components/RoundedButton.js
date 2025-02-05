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
    paddingVertical: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'space-between',
	borderRadius: 2,
	borderColor: "#888787",
	backgroundColor: "#191f2f",	
	borderWidth: 1,
  },
  buttonText: {
    color: '#fff', // Couleur du texte blanc pour contraste
    fontSize: 16,
    fontWeight: 'medium',
	elevation: 10,
  },
});
