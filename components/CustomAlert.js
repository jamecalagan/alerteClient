import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const getAlertVisual = (title = '') => {
  const t = title.toLowerCase();
  if (t.includes('erreur')) return { icon: 'close-circle', color: '#EF4444', bg: '#FEE2E2' };
  if (t.includes('succ')) return { icon: 'checkmark-circle', color: '#22C55E', bg: '#DCFCE7' };
  if (t.includes('attention') || t.includes('avert') || t.includes('alerte')) return { icon: 'warning', color: '#F59E0B', bg: '#FEF3C7' };
  if (t.includes('banni') || t.includes('interdit')) return { icon: 'ban', color: '#EF4444', bg: '#FEE2E2' };
  return { icon: 'information-circle', color: '#3B82F6', bg: '#DBEAFE' };
};

const AUTO_CLOSE_DURATION = 3500;

const CustomAlert = ({ visible, title, message, onClose, onConfirm = null }) => {
  const visual = getAlertVisual(title);
  const progress = useRef(new Animated.Value(1)).current;

  // Auto-fermeture uniquement pour les alertes simples (sans onConfirm) : la
  // barre se vide de droite à gauche, et à la fin elle ferme l'alerte.
  useEffect(() => {
    if (visible && !onConfirm) {
      progress.setValue(1);
      const animation = Animated.timing(progress, {
        toValue: 0,
        duration: AUTO_CLOSE_DURATION,
        useNativeDriver: false,
      });
      animation.start(({ finished }) => {
        if (finished) onClose();
      });
      return () => animation.stop();
    }
  }, [visible, onConfirm]);

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={onClose} // Fermer la modale avec le bouton "retour"
    >
      <View style={styles.modalOverlay}>
        <View style={styles.alertBox}>
          <View style={[styles.iconCircle, { backgroundColor: visual.bg }]}>
            <Ionicons name={visual.icon} size={28} color={visual.color} />
          </View>

          <Text style={styles.alertTitle}>{title}</Text>
          <Text style={styles.alertMessage}>{message}</Text>

          <View style={styles.alertButtons}>
            {/* Si onConfirm est passé, on affiche les boutons "Annuler" et "Confirmer" */}
            {onConfirm ? (
              <>
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose} activeOpacity={0.7}>
                  <Text style={styles.cancelButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { backgroundColor: visual.color }]} onPress={onConfirm} activeOpacity={0.85}>
                  <Text style={styles.buttonText}>Confirmer</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Si onConfirm n'est pas passé, on affiche seulement un bouton "OK"
              <TouchableOpacity style={[styles.button, { backgroundColor: visual.color }]} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.buttonText}>OK</Text>
              </TouchableOpacity>
            )}
          </View>

          {!onConfirm && (
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressBar,
                  {
                    backgroundColor: visual.color,
                    width: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
          )}
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
    width: 320,
    maxWidth: '90%',
    padding: 24,
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
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertTitle: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 8,
    color: '#111827',
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  alertButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
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
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F3F4F6',
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
});

export default CustomAlert;
