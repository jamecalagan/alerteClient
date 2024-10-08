import React, { useEffect, useState } from 'react'; // Ajout de useEffect et useState
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { Alert,TouchableOpacity } from 'react-native';
import { supabase } from './supabaseClient';
import RecoveredClientsPage from './pages/RecoveredClientsPage';
// Import des pages
import HomePage from './pages/HomePage';
import AddClientPage from './pages/AddClientPage';
import EditClientPage from './pages/EditClientPage';
import EditInterventionPage from './pages/EditInterventionPage'; 
import AddInterventionPage from './pages/AddInterventionPage';
import RepairedInterventionsPage from './pages/RepairedInterventionsPage';
import SignaturePage from './pages/SignaturePage';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';
import ClientPreviewPage from './pages/ClientPreviewPage';
import SignatureClient from './pages/SignatureClient';
import ImageGallery from './pages/ImageGallery';  // Chemin correct pour ton fichier

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Onglets principaux
function MainTabs({ navigation }) {
  // Fonction de déconnexion
  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (!error) {
        navigation.replace('Login');  // Redirige vers la page de connexion après déconnexion
      } else {
        console.error('Erreur lors de la déconnexion :', error);
      }
    } catch (error) {
      console.error('Erreur lors de la déconnexion :', error);
    }
  };

  // Fonction pour afficher l'alerte de confirmation avant déconnexion
  const confirmLogout = () => {
    Alert.alert(
      "Confirmation",
      "Êtes-vous sûr de vouloir vous déconnecter ?", 
      [
        {
          text: "Annuler", 
          style: "cancel", 
          onPress: () => navigation.navigate('Home') // Rediriger vers "Home" après annulation
        },
        { 
          text: "Déconnexion", 
          onPress: () => handleLogout()  // Bouton de confirmation pour déconnexion
        }
      ],
      { cancelable: true }
    );
  };

  return (
    <Tab.Navigator  screenOptions={{ headerShown: false }}>
      <Tab.Screen 
        name="Home" 
        component={HomePage} 
        options={{ 
          title: 'Accueil', 
          tabBarIcon: ({ color, size }) => (<Icon name="home" color={color} size={size} />)
        }} 
      />
      <Tab.Screen 
        name="AddClient" 
        component={AddClientPage} 
        options={{ 
          title: 'Ajouter Client', 
          tabBarIcon: ({ color, size }) => (<Icon name="person-add" color={color} size={size} />)
        }} 
      />
      <Tab.Screen 
        name="RepairedInterventions" 
        component={RepairedInterventionsPage} 
        options={{ 
          title: 'Réparé', 
          tabBarIcon: ({ color, size }) => (<Icon name="construct" color={color} size={size} />)
        }} 
      />
      <Tab.Screen
        name="RecoveredClients"
        component={RecoveredClientsPage}
        options={{
          tabBarLabel: 'Récupéré',
          tabBarIcon: ({ color, size }) => (
            <Icon name="checkmark-done" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen 
        name="Logout" 
        component={HomePage}  // Remplacez HomePage ou tout autre composant par défaut
        options={{ 
          title: 'Déconnexion', 
          tabBarIcon: ({ color, size }) => (<Icon name="log-out" color={color} size={size} />),
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => {
                confirmLogout();
              }}
            />
          )
        }}
      />
    </Tab.Navigator>
  );
}

// Stack principal
function MainStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="MainTabs" 
        component={MainTabs} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="EditClient" 
        component={EditClientPage} 
        options={{ headerTitle: '', headerBackTitleVisible: false }}
      />
      <Stack.Screen 
        name="EditIntervention" 
        component={EditInterventionPage} 
        options={{ headerTitle: '', headerBackTitleVisible: false }}
      />
      <Stack.Screen 
        name="AddIntervention" 
        component={AddInterventionPage} 
        options={{ headerTitle: '', headerBackTitleVisible: false }}
      />
      <Stack.Screen 
        name="SignaturePage" 
        component={SignaturePage} 
        options={{ headerTitle: 'Restitution du Matériel' }}
      />
      <Stack.Screen 
        name="RecoveredClientsPage" 
        component={RecoveredClientsPage} 
        options={{ headerTitle: 'Fiches récupérées' }} 
      />
      <Stack.Screen 
        name="ClientPreviewPage" 
        component={ClientPreviewPage} 
        options={{ headerTitle: 'Aperçu de la fiche client' }}  // Corrigez les options si nécessaire
/>
      <Stack.Screen 
        name="SignatureClient" 
        component={SignatureClient} 
        options={{ headerTitle: 'Réception du Matériel' }}
      />
      <Stack.Screen 
      name="ImageGallery" 
      component={ImageGallery}
       />
    </Stack.Navigator>
  );
}

// Stack pour l'authentification
function AuthStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="Login" 
        component={LoginPage} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="SignUp" 
        component={SignUpPage} 
        options={{ headerShown: false }} 
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);  // Stocke l'utilisateur connecté

  // Vérifie la session utilisateur au démarrage
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };

    checkSession();

    // Écoute les changements de session (connexion/déconnexion)
    const { subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  return (
    <NavigationContainer>
      {user ? (
        <MainStack />  // Affiche l'application principale si l'utilisateur est connecté
      ) : (
        <AuthStack />  // Affiche les écrans d'authentification si l'utilisateur n'est pas connecté
      )}
    </NavigationContainer>
  );
}
