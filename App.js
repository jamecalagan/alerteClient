import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { Alert, TouchableOpacity, Image, StatusBar } from 'react-native';
import { supabase } from './supabaseClient';
import PrintPage from './pages/PrintPage'; // Assurez-vous que le chemin est correct
import OrdersPage from './pages/OrdersPage';
// Import des pages
import RecoveredClientsPage from './pages/RecoveredClientsPage';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';
import AddClientPage from './pages/AddClientPage';
import EditClientPage from './pages/EditClientPage';
import EditInterventionPage from './pages/EditInterventionPage';
import AddInterventionPage from './pages/AddInterventionPage';
import RepairedInterventionsPage from './pages/RepairedInterventionsPage';
import RepairedInterventionsListPage from './pages/RepairedInterventionsListPage';
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
import OngoingAmountsPage from "./pages/OngoingAmountsPage";
import SelectInterventionPage from './pages/SelectInterventionPage';
import AddProductPage from "./pages/AddProductPage";
import CommandePreviewPage from "./pages/CommandePreviewPage";
import StoredImagesPage from "./pages/StoredImagesPage";
import MigrateOldImagesPage from './pages/MigrateOldImagesPage';
import CleanUpBucketPage from './pages/CleanUpBucketPage';
import ImageBackupPage from './pages/ImageBackupPage';
import ExpressClientPage from './pages/ExpressClientPage';
import PrintExpressPage from './pages/PrintExpressPage';
import ExpressListPage from "./pages/ExpressListPage";
import ExpressTypeSelectorPage from "./pages/ExpressTypeSelectorPage";
import BillingPage from "./pages/BillingPage";
import BillingListPage from "./pages/BillingListPage";
import BillingEditPage from "./pages/BillingEditPage";
import AllOrdersPage from "./pages/AllOrdersPage";
import QuoteEditPage from "./pages/QuoteEditPage";
import QuotePrintPage from "./pages/QuotePrintPage"; // à créer ensuite
import QuoteListPage from "./pages/QuoteListPage";
import ProductViewerScreen from "./pages/ProductViewerScreen";
import ProductFlyerScreen from "./pages/ProductFlyerScreen";
import ProductFormScreen from "./pages/ProductFormScreen";
import ImageSearchScreen from "./pages/ImageSearchScreen";
import FlyerListPage from "./pages/FlyerListPage";
import ClientNotificationsPage from './pages/ClientNotificationsPage';
import QuickLabelPrintPage from "./pages/QuickLabelPrintPage"; 
import EditExpressPage from "./pages/EditExpressPage";
import CheckupPage from "./pages/CheckupPage";
import CheckupListPage from "./pages/CheckupListPage";
import RepairPricesPage from "./pages/RepairPricesPage";
import ExpressRepairPage from "./pages/ExpressRepairPage";
import ExpressSoftwarePage from "./pages/ExpressSoftwarePage";
import ExpressVideoPage from "./pages/ExpressVideoPage";
import QuoteIntakePage from "./pages/QuoteIntakePage";
import QuoteRequestsListPage from "./pages/QuoteRequestsListPage";
import QuoteRequestEditPage from "./pages/QuoteRequestEditPage";
import QuoteRequestDetailsPage from "./pages/QuoteRequestDetailsPage";
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Onglets principaux
function MainTabs({ navigation, setUser }) {
	const handleLogout = async () => {
		try {
			console.log("Déconnexion en cours...");
	
			const { error } = await supabase.auth.signOut();
			if (error) {
				console.error("Erreur lors de la déconnexion :", error);
				Alert.alert("Erreur", "Impossible de se déconnecter. Veuillez réessayer.");
				return;
			}
	
			console.log("Déconnexion réussie ! Bascule vers AuthStack...");
	
			// ✅ Supprime toute tentative de `navigation.reset()` et utilise `setUser(null)`
			setUser(null);
	
		} catch (err) {
			console.error("Erreur inattendue lors de la déconnexion :", err);
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
    tabBarActiveTintColor: "white", // Couleur des icônes actives
    tabBarInactiveTintColor: "gray", // Couleur des icônes inactives
    tabBarStyle: { 
      backgroundColor: "#4CAF50", // Changer la couleur de la Bottom Bar
      borderTopWidth: 0, // Supprime la ligne de séparation supérieure
      height: 60, // Ajuste la hauteur
      paddingBottom: 10, // Ajuste l'espacement des icônes
    },
    tabBarIcon: ({ focused, color, size }) => {
      let iconSource;
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

      return (
        <Image
          source={iconSource}
          style={{
            width: size,
            height: size,
            tintColor: color, // Couleur dynamique
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
      tabBarStyle: { display: "none" }, // Cache la barre pour cet écran
    }}
  />
  <Tab.Screen
    name="RepairedInterventions"
    component={RepairedInterventionsPage}
    options={{
      title: "Réparé",
	  tabBarStyle: { display: "none" }, // Cache la barre pour cet écran
    }}
  />
  <Tab.Screen
    name="RecoveredClients"
    component={RecoveredClientsPage}
    options={{
      tabBarLabel: "Récupéré",
      tabBarStyle: { display: "none" }, // Cache la barre pour cet écran
    }}
  />
  <Tab.Screen
  name="Admin"
  component={AdminPage}
  options={{
    title: "Administration",
	tabBarStyle: { display: "none" }, // Cache la barre pour cet écran
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
          onPress={confirmLogout} // ✅ Correct
        />
      ),
    }}
  />
</Tab.Navigator>

    );
}

// Stack principal
function MainStack({ setUser }) {
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
			<Stack.Screen name="OngoingAmountsPage" component={OngoingAmountsPage} />
			<Stack.Screen name="PrintPage" component={PrintPage} />
			<Stack.Screen name="SelectInterventionPage" component={SelectInterventionPage} options={{ title: "Choisir une intervention" }}/>
			<Stack.Screen name="AddProductPage" component={AddProductPage} />
			<Stack.Screen name="OrdersPage" component={OrdersPage} options={{ title: "Commandes" }} />
			<Stack.Screen name="RepairedInterventionsListPage" component={RepairedInterventionsListPage} />
			<Stack.Screen name="CommandePreviewPage" component={CommandePreviewPage} />
			<Stack.Screen name="ListingProduits"  component={ListingProduits} options={{ title: 'Gestion des Produits' }} />
			<Stack.Screen name="StoredImages" component={StoredImagesPage}/>
			<Stack.Screen name="CleanUpBucketPage" component={CleanUpBucketPage}/>
			<Stack.Screen name="MigrateOldImagesPage" component={MigrateOldImagesPage} />
			<Stack.Screen name="ImageBackup" component={ImageBackupPage} />
			<Stack.Screen name="ExpressClientPage" component={ExpressClientPage} />
			<Stack.Screen name="PrintExpressPage" component={PrintExpressPage} />
		<Stack.Screen name="ArticlesPage" component={ArticlesPage} options={{ title: 'Articles' }} />
        <Stack.Screen name="BrandsPage" component={BrandsPage} options={{ title: 'Marques' }} />
        <Stack.Screen name="ModelsPage" component={ModelsPage} options={{ title: 'Modèles' }} />
		<Stack.Screen name="ExpressListPage" component={ExpressListPage} />
		<Stack.Screen name="ExpressTypeSelectorPage" component={ExpressTypeSelectorPage} />
		<Stack.Screen name="BillingPage" component={BillingPage} options={{ title: "Facture client" }} />
		<Stack.Screen name="BillingListPage" component={BillingListPage} options={{ title: "Liste des factures" }} />
		<Stack.Screen name="BillingEditPage" component={BillingEditPage} options={{ title: "Modifier facture" }} />
		<Stack.Screen name="AllOrdersPage" component={AllOrdersPage} />
		<Stack.Screen name="QuoteEditPage" component={QuoteEditPage} options={{ title: "Nouveau devis" }} />
		<Stack.Screen name="QuotePrintPage" component={QuotePrintPage} options={{ title: "Impression devis" }} />
		<Stack.Screen name="QuoteListPage" component={QuoteListPage} options={{ title: "Devis enregistrés" }} />
		<Stack.Screen name="ProductViewer" component={ProductViewerScreen} options={{ title: "Fiche produit" }} />
		<Stack.Screen name="CheckupPage" component={CheckupPage} />
		<Stack.Screen name="CheckupListPage" component={CheckupListPage} />

				<Stack.Screen name="ProductFormScreen" component={ProductFormScreen} options={{ title: "Créer une affiche" }} />
				<Stack.Screen name="ProductFlyer" component={ProductFlyerScreen} options={{ title: "Affiche produit" }} />
				<Stack.Screen  name="ImageSearch"  component={ImageSearchScreen}  options={{ title: "Recherche d'image" }} />
				<Stack.Screen  name="FlyerList" component={FlyerListPage}  options={{ title: "Mes affiches" }} />
				<Stack.Screen name="ClientNotificationsPage" component={ClientNotificationsPage} />
				<Stack.Screen name="EditExpressPage" component={EditExpressPage} />
        		<Stack.Screen  name="QuickLabelPrintPage"  component={QuickLabelPrintPage}  options={{ title: "Impression Étiquette" }} />
				<Stack.Screen name="RepairPrices" component={RepairPricesPage} />
				<Stack.Screen name="ExpressRepairPage" component={ExpressRepairPage} />
				<Stack.Screen name="ExpressSoftwarePage" component={ExpressSoftwarePage} />
  				<Stack.Screen name="ExpressVideoPage" component={ExpressVideoPage} />
				<Stack.Screen
  name="QuoteIntakePage"
  component={QuoteIntakePage}
  options={{ title: "Demande de devis" }}
/>
<Stack.Screen
  name="QuoteRequestsListPage"
  component={QuoteRequestsListPage}
  options={{ title: "Demandes de devis" }}
/>
<Stack.Screen
  name="QuoteRequestEditPage"
  component={QuoteRequestEditPage}
  options={{ title: "Modifier la demande" }}
/>
<Stack.Screen
  name="QuoteRequestDetailsPage"
  component={QuoteRequestDetailsPage}
  options={{ title: "Détails de la demande" }}
/>
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
		 <StatusBar backgroundColor="#000" barStyle="light-content" />
		 {user ? <MainStack setUser={setUser} /> : <AuthStack />}
        </NavigationContainer>
    );
}
