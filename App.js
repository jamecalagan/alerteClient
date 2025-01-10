import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { Alert, TouchableOpacity, Image } from 'react-native';
import { supabase } from './supabaseClient';

// Import des pages
import RecoveredClientsPage from './pages/RecoveredClientsPage';
import AdminPage from './pages/AdminPage';
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
import ImageGallery from './pages/ImageGallery';
import ClientInterventionsPage from './pages/ClientInterventionsPage';
import ListingProduits from './pages/ListingProduits';
import ArticlesPage from './pages/ArticlesPage';
import BrandsPage from './pages/BrandsPage';
import ModelsPage from './pages/ModelsPage';
import ImageCleanupPage from "./pages/ImageCleanupPage";
import SearchClientsPage from "./pages/SearchClientsPage";
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Onglets principaux
function MainTabs({ navigation }) {
    const handleLogout = async () => {
		try {
		  const { error } = await supabase.auth.signOut(); // Déconnecte l'utilisateur de Supabase
		  if (error) {
			console.error('Erreur lors de la déconnexion :', error);
			Alert.alert("Erreur", "Impossible de se déconnecter. Veuillez réessayer.");
		  } else {
			navigation.replace('Login'); // Redirige vers l'écran de connexion
		  }
		} catch (err) {
		  console.error('Erreur inattendue lors de la déconnexion :', err);
		  Alert.alert("Erreur", "Une erreur inattendue est survenue.");
		}
	  };
	  
	  const confirmLogout = () => {
		Alert.alert(
		  "Confirmation",
		  "Êtes-vous sûr de vouloir vous déconnecter ?", 
		  [
			{
			  text: "Annuler",
			  style: "cancel",
			},
			{
			  text: "Déconnexion",
			  onPress: () => handleLogout(), // Appelle la déconnexion
			}
		  ],
		  { cancelable: true }
		);
	  };
	  

    return (
<Tab.Navigator
  screenOptions={({ route }) => ({
    headerShown: false, // Masque les en-têtes pour tous les écrans
    tabBarActiveTintColor: "blue", // Couleur des icônes actives
    tabBarInactiveTintColor: "gray", // Couleur des icônes inactives
    tabBarIcon: ({ focused, color, size }) => {
      let iconSource;

      // Définir les icônes pour chaque onglet
      switch (route.name) {
        case "Home":
          iconSource = require("./assets/icons/home.png");
          break;
        case "AddClient":
          iconSource = require("./assets/icons/add.png");
          break;
        case "RepairedInterventions":
          iconSource = require("./assets/icons/tools1.png");
          break;
        case "RecoveredClients":
			iconSource = require("./assets/icons/ok.png");
			break;
        case "Logout":
          iconSource = require("./assets/icons/disconnects.png");
          break;
        default:
          iconSource = null;
      }

      // Retourne l'icône avec les couleurs dynamiques
      return (
        <Image
          source={iconSource}
          style={{
            width: size,
            height: size,
            tintColor: color, // Couleur dynamique basée sur "focused"
          }}
        />
      );
    },
  })}
>
  <Tab.Screen
    name="Home"
    component={HomePage}
    options={{
      title: "Accueil",
      tabBarStyle: { display: "none" }, // Cache la barre pour cet écran
    }}
  />
  <Tab.Screen
    name="AddClient"
    component={AddClientPage}
    options={{
      title: "Ajouter Client",

    }}
  />
  <Tab.Screen
    name="RepairedInterventions"
    component={RepairedInterventionsPage}
    options={{
      title: "Réparé",
    }}
  />
  <Tab.Screen
    name="RecoveredClients"
    component={RecoveredClientsPage}
    options={{
      tabBarLabel: "Récupéré",

    }}
  />
  <Tab.Screen
  name="Admin"
  component={AdminPage}
  options={{
    title: "Administration",
    tabBarIcon: ({ color, size }) => (
      <Image
        source={require("./assets/icons/Config.png")} // Icône pour l'administration
        style={{
          width: size,
          height: size,
          tintColor: color, // Couleur dynamique
        }}
      />
    ),
  }}
/>

  <Tab.Screen
    name="Logout"
    component={HomePage} // Remplacez HomePage ou utilisez un écran par défaut
    options={{
      title: "Déconnexion",
      tabBarButton: (props) => (
        <TouchableOpacity
          {...props}
          onPress={() => confirmLogout()} // Affiche l'alerte de confirmation
        />
      ),
    }}
  />
</Tab.Navigator>

    );
}

// Stack principal
function MainStack() {
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                gestureEnabled: true,
                cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            }}
        >
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="EditClient" component={EditClientPage} />
            <Stack.Screen name="EditIntervention" component={EditInterventionPage} />
            <Stack.Screen name="AddIntervention" component={AddInterventionPage} />
            <Stack.Screen name="SignaturePage" component={SignaturePage} />
            <Stack.Screen name="RecoveredClientsPage" component={RecoveredClientsPage} />
			<Stack.Screen name="RepairedInterventionsPage" component={RepairedInterventionsPage} />
            <Stack.Screen name="ClientPreviewPage" component={ClientPreviewPage} />
            <Stack.Screen name="SignatureClient" component={SignatureClient} />
            <Stack.Screen name="ImageGallery" component={ImageGallery} />
            <Stack.Screen name="ClientInterventionsPage" component={ClientInterventionsPage} />
			<Stack.Screen name="ImageCleanup" component={ImageCleanupPage} />
			<Stack.Screen name="SearchClientsPage" component={SearchClientsPage} options={{ title: "Recherche multi-critères" }}/>
			<Stack.Screen 
        name="ListingProduits" 
         component={ListingProduits} 
        options={{ title: 'Gestion des Produits' }} 
        />
		<Stack.Screen name="ArticlesPage" component={ArticlesPage} options={{ title: 'Articles' }} />
        <Stack.Screen name="BrandsPage" component={BrandsPage} options={{ title: 'Marques' }} />
        <Stack.Screen name="ModelsPage" component={ModelsPage} options={{ title: 'Modèles' }} />
        </Stack.Navigator>
    );
}

// Stack pour l'authentification
function AuthStack() {
    return (
        <Stack.Navigator>
            <Stack.Screen name="Login" component={LoginPage} options={{ headerShown: false }} />
            <Stack.Screen name="SignUp" component={SignUpPage} options={{ headerShown: false }} />
        </Stack.Navigator>
    );
}

export default function App() {
    const [user, setUser] = useState(null);

    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
        };

        checkSession();

        const { subscription } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    return (
        <NavigationContainer>
            {user ? <MainStack /> : <AuthStack />}
        </NavigationContainer>
    );
}
