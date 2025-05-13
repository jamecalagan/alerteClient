import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';

const AlertBox = ({ visible, onClose, title, message, confirmText = "OK", onConfirm, cancelText = "Annuler" }) => {
  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.alertBox}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttonContainer}>
            {/* Bouton Annuler */}
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.buttonText}>{cancelText}</Text>
            </TouchableOpacity>

            {/* Bouton Confirmer */}
            <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={onConfirm}>
              <Text style={styles.buttonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',  // Arrière-plan semi-transparent
  },
  alertBox: {
    width: 600,
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',  // Couleur de fond légèrement transparente
    borderRadius: 20,  // Bords arrondis
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    marginHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: '#007BFF',
  },
  cancelButton: {
    backgroundColor: '#CCCCCC',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AlertBox;
