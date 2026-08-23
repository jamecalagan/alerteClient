import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const getAlertVisual = (title = '') => {
  const t = title.toLowerCase();
  if (t.includes('erreur')) return { icon: 'close-circle', color: '#EF4444', bg: '#FEE2E2' };
  if (t.includes('succ')) return { icon: 'checkmark-circle', color: '#22C55E', bg: '#DCFCE7' };
  if (t.includes('attention') || t.includes('avert') || t.includes('alerte')) return { icon: 'warning', color: '#F59E0B', bg: '#FEF3C7' };
  if (t.includes('banni') || t.includes('interdit')) return { icon: 'ban', color: '#EF4444', bg: '#FEE2E2' };
  return { icon: 'information-circle', color: '#3B82F6', bg: '#DBEAFE' };
};

const AlertBox = ({ visible, onClose, title, message, confirmText = "OK", onConfirm, cancelText = "Annuler" }) => {
  const visual = getAlertVisual(title);

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.alertBox}>
          <View style={[styles.iconCircle, { backgroundColor: visual.bg }]}>
            <Ionicons name={visual.icon} size={32} color={visual.color} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttonContainer}>
            {/* Bouton Annuler */}
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>

            {/* Bouton Confirmer */}
            <TouchableOpacity style={[styles.button, styles.confirmButton, { backgroundColor: visual.color }]} onPress={onConfirm} activeOpacity={0.85}>
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
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  alertBox: {
    width: 600,
    maxWidth: '90%',
    padding: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    color: '#111827',
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: '#3B82F6',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default AlertBox;
