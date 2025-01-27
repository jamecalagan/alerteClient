import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
import LoginPage from '../LoginPage'; // Importer ta page Login existante

export default function SplashScreenWithLogin() {
  const slideAnim = useRef(new Animated.Value(0)).current; // Animation pour le déplacement horizontal

  useEffect(() => {
    // Lancer l'animation après un délai
    const timeout = setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: -1000, // Déplacement de la SplashScreen vers la gauche
        duration: 500, // Durée de l'animation en ms
        useNativeDriver: true, // Utilisation du moteur natif pour l'animation
      }).start();
    }, 3000); // Attendre 5 secondes avant de démarrer l'animation

    return () => clearTimeout(timeout); // Nettoyage du timeout
  }, [slideAnim]);

  return (
    <View style={styles.container}>
    
      <LoginPage />

    
      <Animated.View
        style={[
          styles.splashScreen,
          { transform: [{ translateX: slideAnim }] }, // Appliquer l'animation de glissement
        ]}
      >
        <Image source={require('../assets/logo_phone.png')} style={styles.image} />
        <Text style={styles.splashText}>Alerte Client</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  splashScreen: {
    ...StyleSheet.absoluteFillObject, // La SplashScreen couvre tout l'écran
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007BFF',
  },
  image: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  splashText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
	itemAlign: 'center',
  },
});
