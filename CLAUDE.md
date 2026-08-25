# Projet AlerteClient

## Présentation

AlerteClient est une application React Native / Expo utilisée par Avenir Informatique pour gérer :

- les clients ;
- les interventions ;
- les commandes ;
- les devis ;
- les fiches Express ;
- les notifications ;
- les signatures ;
- les impressions ;
- les photos ;
- les paiements et soldes restants.

Le projet utilise Supabase.

## Architecture des dossiers (vérifiée)

```
c:\AlerteClient
├── App.js                  # Point d'entrée navigation : AuthStack (Login/SignUp) vs MainStack (connecté)
├── index.js                 # AppRegistry.registerComponent(appName, App)
├── LoginPage.js              # Écran de connexion (racine, hors dossier pages/)
├── SignUpPage.js              # Écran d'inscription (racine, hors dossier pages/)
├── StoredImagesPage.js         # Copie non utilisée de la logique de App.js, à la racine — non importée nulle part (code mort)
├── supabaseClient.js            # Client Supabase unique (createClient), importé via "../supabaseClient" (pages/) ou "./supabaseClient" (racine)
├── app.json / eas.json           # Config Expo / EAS Build
├── babel.config.js, tsconfig.json
├── assets/
│   ├── icon.png, splash.png, favicon.png, adaptive-icon.png, logo_phone.png...
│   └── icons/                     # ~90 icônes PNG référencées via require("../assets/icons/xxx.png")
├── components/                     # Composants réutilisables (voir section dédiée)
├── context/
│   └── AppContext.js                # Fournit clients/isLoading/repairedNotReturnedCount — AppProvider n'est monté nulle part (code mort actuellement)
├── pages/                            # ~70 écrans de l'application (voir section dédiée)
├── themes/
│   └── themes.js
├── utils/
│   ├── printInvoice.js
│   └── simpleImage.js                 # getImageUri(pathInBucket, bucket="images") : fichier local sinon URL signée Supabase (1h)
├── eslint.config.mjs                   # Config ESLint, utilisée par le script `npm run lint`
└── transfer-images.js                  # Script isolé de migration d'images vers le bucket "intervention-images" (distinct du bucket "images" utilisé partout ailleurs)
```

**Fichiers de `pages/` non importés (vérifié par grep, non atteignables via la navigation, code mort probable)** : `StartPage.js`, `ReadyClientsPage.js`, `ImagesInterventions.js`, `ClientDetailPage.js` — en plus du `StoredImagesPage.js` racine déjà signalé ci-dessus. Ne pas les considérer comme faisant partie des flux actifs, mais ne pas les supprimer sans demande explicite (pourraient être un travail en cours).

## Pages principales (dossier pages/, vérifiées dans App.js)

- **Auth** (hors pages/) : `LoginPage.js`, `SignUpPage.js`
- **Clients** : `AddClientPage`, `EditClientPage`, `ClientPreviewPage`, `ClientInterventionsPage`, `ClientNotificationsPage`, `SearchClientsPage`, `RecoveredClientsPage`
- **Interventions** : `HomePage` (écran central, fichier très volumineux), `AddInterventionPage`, `EditInterventionPage`, `RepairedInterventionsPage`, `RepairedInterventionsListPage`, `ArchivesInterventionsPage`, `SelectInterventionPage`, `SignaturePage`, `SignatureClient`
- **Commandes** : `OrdersPage`, `AllOrdersPage`, `CommandePreviewPage`, `OngoingAmountsPage`
- **Facturation / Devis** : `BillingPage`, `BillingListPage`, `BillingEditPage`, `QuoteEditPage`, `QuoteListPage`, `QuotePrintPage`, `QuoteIntakePage`, `QuoteRequestsListPage`, `QuoteRequestEditPage`, `QuoteRequestDetailsPage`
- **Express** : `ExpressClientPage`, `ExpressTypeSelectorPage`, `ExpressRepairPage`, `ExpressSoftwarePage`, `ExpressVideoPage`, `EditExpressPage`, `ExpressListPage`, `PrintExpressPage`
- **Catalogue produits** : `ArticlesPage`, `BrandsPage`, `ModelsPage`, `AddProductPage`, `ListingProduits`, `ProductViewerScreen`, `ProductFormScreen`, `ProductFlyerScreen`, `FlyerListPage`, `RepairPricesPage`, `PcComponentsTablePage`
- **Images** : `ImageGallery`, `ImageCleanupPage`, `ImageBackupPage`, `StoredImagesPage` (dans pages/, active — distincte du fichier racine mort), `MigrateOldImagesPage`, `CleanUpBucketPage`, `InterventionImagesPage`, `ImageSearchScreen`
- **Admin / Divers** : `AdminPage`, `CheckupPage`, `CheckupListPage`, `QuickLabelPrintPage`, `PrintPage`

## Routes de navigation (vérifiées dans App.js)

`Tab.Screen` (dans `MainTabs`) : `Home`, `AddClient`, `RepairedInterventions`, `RecoveredClients`, `Admin`, `Logout` (le bouton `Logout` n'est pas une vraie navigation : `tabBarButton` est surchargé pour appeler `confirmLogout()`).

`Stack.Screen` (dans `MainStack`) : `MainTabs`, `EditClient`, `EditIntervention`, `AddIntervention`, `SignaturePage`, `RecoveredClientsPage`, `RepairedInterventionsPage`, `ClientPreviewPage`, `SignatureClient`, `ImageGallery`, `ClientInterventionsPage`, `ImageCleanup`, `SearchClientsPage`, `OngoingAmountsPage`, `PrintPage`, `SelectInterventionPage`, `AddProductPage`, `OrdersPage`, `RepairedInterventionsListPage`, `CommandePreviewPage`, `ListingProduits`, `StoredImages`, `CleanUpBucketPage`, `MigrateOldImagesPage`, `ImageBackup`, `ExpressClientPage`, `PrintExpressPage`, `ArticlesPage`, `BrandsPage`, `ModelsPage`, `ExpressListPage`, `ExpressTypeSelectorPage`, `BillingPage`, `BillingListPage`, `BillingEditPage`, `AllOrdersPage`, `QuoteEditPage`, `QuotePrintPage`, `QuoteListPage`, `ProductViewer`, `CheckupPage`, `CheckupListPage`, `ProductFormScreen`, `ProductFlyer`, `ImageSearch`, `FlyerList`, `ClientNotificationsPage`, `EditExpressPage`, `QuickLabelPrintPage`, `RepairPrices`, `ExpressRepairPage`, `ExpressSoftwarePage`, `ExpressVideoPage`, `InterventionImages`, `QuoteIntakePage`, `QuoteRequestsListPage`, `QuoteRequestEditPage`, `QuoteRequestDetailsPage`, `ArchivesInterventionsPage`, `PcComponentsTablePage`.

`Stack.Screen` (dans `AuthStack`, séparé) : `Login`, `SignUp`.

## Tables et colonnes Supabase confirmées (par grep du code, usage réel observé)

- **clients** : `id`, `name`, `phone`, `email`, `ficheNumber`, `createdAt`, `updatedAt`, `banned`, `ban_reason`, `banned_at`, `banned_by` + relation imbriquée `interventions(...)`.
- **interventions** : `id`, `client_id`, `reference`, `deviceType`, `brand`, `model`, `description`, `status`, `cost`, `solderestant`, `paymentStatus`, `commande`, `commande_effectuee`, `photos`, `label_photo`, `signatureIntervention`, `signature`, `createdAt`, `updatedAt`, `restitue`, `archived`, `archived_at`, `notifiedBy`, `notifiedat`, `notify_type`, `review_requested`, `review_responded`, `is_notified`, `imprimee`, `print_etiquette`, `password`, `chargeur`, `article_id`, `serial_number`, `loaned_item`, `loaned_item_returned`, `loaned_item_date`, `repair_proposal*` (made/price/status/method/comment/date), `estimate_min`, `estimate_max`, `estimate_type`, `is_estimate`, `estimate_accepted`, `estimate_accepted_at`, `devis_cost`, `info_note`, `repair_cause`, `repair_action`, `repair_duration`, `accept_screen_risk`.
- **orders** : `id`, `client_id`, `product`, `brand`, `model`, `price`, `deposit`, `paid`, `paid_at`, `saved`, `deleted`, `notified`, `notified_method`, `signatureclient`, `printed`, `quantity`, `total`, `order_photos`, `ordered`, `received`, `recovered`, `source_quote_id`, `createdat`.
- **order_items** : `id`, `order_id`, `product`, `brand`, `quantity`, `unit_price`, `ordered`, `ordered_at`, `received`, `received_at`, `installed`, `installed_at`.
- **billing** : `id`, `order_id`, `express_id`, `invoicenumber`, `totalttc`, `acompte`, `created_at`, `deleted`.
- **express** : `id`, `client_id`, `name`, `phone`, `product`, `device`, `type`, `description`, `price`, `paid`, `notified`, `notified_at`, `created_at`, `signature`.
- **article** : `id`, `nom`.
- **marque** : `id`, `nom`, `article_id`.
- **modele** : `id`, `nom`, `marque_id`, `article_id`.
- **intervention_images** : `id`, `intervention_id`, `image_data`, `image_url`, `url`, `path`, `uri`, `key`, `created_at`, `file_path`.
- **fault_dictionary** : `id`, `device_type`, `category`, `description`, `active`.
- **repair_dictionary** : `id`, `type`, `name`, `active`.
- **flyers** : colonnes observées `created_at` (sélection `*` ailleurs).
- **quick_labels** : colonnes observées `name`, `phone`, `printed`, `created_at` (sélection `*` ailleurs).
- **repair_prices** : `id`, `product_type`, `issue`, `symptoms`, `price_min`, `price_max`.
- **quotes** : `id`, `name`, `phone`, `quote_number`, `status` (valeurs vues : `"accepte"`, `"converti"`), `converted_to_order_id`, `deja_imprime`, `deja_envoye`, `pdf_url`, `pdf_storage_path`, `created_at`.
- **quote_requests** : `id`, `created_at`, `status` (valeurs vues : `"nouvelle"`, `"préparée"`, `"convertie"`), `source`, `client_name`, `phone`, `email`, `device_type`, `brand`, `model`, `serial`, `problem`, `condition`, `accessories`, `notes`, `photos`, `photos_count`, `quote_id`, `sms_notified_at`, `sms_notify_count`, `notified_by`, `sms_last_pdf_url`.
- **checkup_reports** : colonnes observées `client_phone`, `signatureIntervention`/`signature`, `created_at`.

**RPC Supabase** : une seule fonction distante appelée dans tout le projet : `set_client_ban(p_client_id, p_banned, p_reason?)` via `components/BanToggleButton.js`.

**Buckets Storage** : `images` (bucket principal, très majoritaire), `quote-request-photos`, `quotes-pdf`, `intervention-images` (utilisé seulement par `transfer-images.js`).

⚠️ Casse des colonnes non uniforme entre tables — vérifier au cas par cas avant toute requête (ex. timestamp de création : `createdAt` sur clients/interventions, `createdat` sur orders, `created_at` sur billing/express/quotes/quote_requests/flyers/quick_labels/checkup_reports/intervention_images).

## Composants partagés (dossier components/)

- `BottomMenu.js` — barre de navigation basse enrichie (filtres, badge "commandes en cours" via requête `orders`) : utilisée uniquement par `HomePage`.
- `BottomNavigation.js` — barre de navigation basse simplifiée : utilisée par `AddClientPage`, `AdminPage`, `ClientInterventionsPage`, `ImageGallery`, `RecoveredClientsPage`, `RepairedInterventionsPage`, `RepairedInterventionsListPage`. ⚠️ Duplication fonctionnelle avec `BottomMenu.js` — les deux composants ne sont pas interchangeables sans adapter les props.
- `SlidingMenu.js` — menu latéral animé (drawer maison, pas de lib de navigation drawer).
- `AlertBox.js` et `CustomAlert.js` — deux modales de confirmation quasi identiques mais distinctes (props différentes : `AlertBox` a `cancelText`/`confirmText`, `CustomAlert` affiche "OK" seul si `onConfirm` absent). Vérifier laquelle est utilisée avant de modifier une alerte.
- `BanToggleButton.js` — bannir/débannir un client via le RPC `set_client_ban`.
- `SmartImage.js` — affichage d'image avec repli local (dossier `backup/<ficheNumber>/...` ou `Save picture alerte client/<ficheNumber>/...`) avant URL cloud, badge "Local"/"Cloud", icône de repli si erreur de chargement.
- `RoundedButton.js` — bouton stylé générique.

## Fonctions sensibles (vérifiées)

- **Session / déconnexion** : `App.js` (`supabase.auth.getSession`, `onAuthStateChange`, `signOut`) — dupliqué indépendamment dans `pages/StoredImagesPage.js`.
- **Bannissement client** : `BanToggleButton.js` → RPC `set_client_ban` (modifie `clients.banned`/`ban_reason`/`banned_at`/`banned_by`).
- **Nettoyage / suppression d'images** : `ImageCleanupPage.js`, `CleanUpBucketPage.js` — suppriment des objets du bucket Storage `images` (`.storage.from("images").remove(...)`) : action destructive et irréversible côté Storage.
- **Migration d'images** : `MigrateOldImagesPage.js`, `transfer-images.js` — écrivent/déplacent des fichiers entre buckets Storage.
- **Suppressions en base** : de nombreuses pages appellent `.delete()` sur `clients`, `interventions`, `orders`, `billing`, `express`, `quotes`, `quote_requests` — vérifier systématiquement la clause `.eq(...)` avant toute modification pour éviter une suppression trop large.
- **Signature client** : `SignaturePage.js`, `SignatureClient.js` — écrivent dans `interventions.signatureIntervention`/`signature` (valeur juridique/preuve pour le client).

## Règles impératives

- Ne jamais modifier la base Supabase sans demande explicite.
- Ne jamais créer de migration automatiquement.
- Ne jamais modifier les règles RLS sans demande explicite.
- Ne jamais inventer un nom de table ou de colonne.
- Toujours vérifier les noms exacts dans le code avant toute modification.
- Ne jamais renommer une route existante.
- Ne jamais renommer une variable existante sans nécessité absolue.
- Ne jamais supprimer une fonction sous prétexte de simplification.
- Ne jamais remplacer un fichier complet par une version raccourcie.
- Préserver toutes les fonctionnalités existantes.
- Préserver les icônes, les images et les assets existants.
- Préserver la navigation et les paramètres transmis entre les pages.
- Ne pas ajouter de dépendance sans autorisation.
- Effectuer uniquement les changements demandés.
- Éviter les refactorisations générales non demandées.
- Avant une modification, identifier les fichiers et fonctions concernés.
- Après une modification, expliquer précisément ce qui a changé.

## Méthode de travail

Avant de modifier du code :

1. Lire le fichier complet concerné.
2. Rechercher les fonctions appelées dans les autres fichiers.
3. Vérifier les routes de navigation liées.
4. Vérifier les noms de colonnes Supabase réellement utilisés.
5. Identifier les risques de régression.
6. Présenter un plan court.
7. Attendre une demande explicite avant toute modification importante.

Lors d’une correction ciblée :

- modifier le moins de lignes possible ;
- conserver le style général du fichier ;
- ne pas réorganiser tout le code ;
- ne pas changer les fonctionnalités non concernées ;
- indiquer l’emplacement exact des modifications.

## Technologies

- React Native
- Expo
- Supabase
- React Navigation
- AsyncStorage

## Dépendances importantes (versions vérifiées dans package.json)

- `expo` ~54.0.36 (New Architecture activée dans app.json), `react` 19.1.0, `react-native` 0.81.5
- `@supabase/supabase-js` ^2.50.0
- `@react-navigation/stack` ^6.4.1, `@react-navigation/bottom-tabs` ^6.6.1
- `@react-native-async-storage/async-storage` 2.2.0
- `@react-native-picker/picker` 2.11.1
- `expo-image-manipulator`, `expo-image-picker`, `expo-file-system`, `expo-document-picker` — gestion des photos/fichiers
- `expo-print`, `expo-sharing`, `expo-mail-composer` — impression et envoi (factures, devis, étiquettes)
- `react-native-signature-canvas` ^4.7.2 — capture de signature client
- `react-native-qrcode-svg` ^6.3.14 et `react-native-qrcode` ^0.2.7 (deux libs QR code coexistent)
- `react-native-webview` 13.15.0
- `react-native-reanimated` ~4.1.1 + `react-native-worklets` 0.5.1, `react-native-gesture-handler`
- `uuid` ^11.1.0
- `pg` ^8.13.1 — driver PostgreSQL direct (présent dans les dépendances de l'app RN, usage à vérifier avant d'en dépendre côté client mobile)
- `@bam.tech/react-native-image-resizer` ^3.0.11
- `react-native-vector-icons` (import direct, ex. `Icon from "react-native-vector-icons/Ionicons"`) et `@expo/vector-icons` (deux libs d'icônes coexistent, vérifié par grep — `react-native-vector-icons` dans `App.js`, `LoginPage.js`, `SignUpPage.js`, `StoredImagesPage.js`, `AddInterventionPage.js`, `RecoveredClientsPage.js`, `RepairedInterventionsPage.js`, `ModelsPage.js`, `BrandsPage.js`, `ArticlesPage.js` ; `@expo/vector-icons` dans `AddInterventionPage.js`, `RepairPricesPage.js`, `AddClientPage.js`, `AdminPage.js`, `ListingProduits.js`).
- `react-native-animatable` — animations, utilisé dans `HomePage.js`, `RecoveredClientsPage.js`, `RepairedInterventionsListPage.js`, `RepairedInterventionsPage.js`.
- `expo-clipboard` — utilisé dans `HomePage.js`, `PcComponentsTablePage.js`, `QuoteEditPage.js`, `QuoteRequestsListPage.js`.
- `react-native-safe-area-context` — utilisé dans `OrdersPage.js`, `PcComponentsTablePage.js`, `QuoteEditPage.js`, `QuoteIntakePage.js`, `RepairPricesPage.js`.
- `react-native-keyboard-aware-scroll-view` — utilisé dans `QuoteEditPage.js`, `QuoteIntakePage.js`, `QuoteRequestEditPage.js`.
- `react-native-get-random-values` — importé dans `AddInterventionPage.js` (polyfill requis par `uuid`).
- `expo-dev-client`, `expo-font`, `react-native-screens` — présents dans `package.json`/`app.json` (plugin `expo-font`) mais sans import JS direct trouvé (dépendances natives/peer de l'écosystème Expo/React Navigation).
- Version de l'app : `package.json` → `5.4.2` ; `app.json` (`expo.version`) → `4.2.0` (les deux fichiers ne sont pas synchronisés).

## Conventions importantes

- L’import habituel du client Supabase est `../supabaseClient`.
- Certains champs utilisent du camelCase.
- Ne pas convertir automatiquement les noms en snake_case.
- Toujours reprendre les noms de colonnes présents dans le projet.
- La table `orders` ne doit pas être supposée posséder un champ `status`.
- La table `express` ne doit pas être supposée posséder un champ `status`.
- La variable `ordersList` ne doit pas être renommée.
- Le champ des remarques d’intervention est `remarks`.
- Le timestamp principal des commandes est `createdat`.
- Le champ de mise à jour des interventions peut être `updatedAt`.
- Le champ de signature d’intervention est `signatureIntervention`.
- La casse du timestamp de création varie selon la table : `createdAt` (`clients`, `interventions`), `createdat` (`orders`), `created_at` (`billing`, `express`, `quotes`, `quote_requests`, `flyers`, `quick_labels`, `checkup_reports`, `intervention_images`) — ne jamais harmoniser automatiquement.
- Le bucket Storage par défaut est `"images"` (repris tel quel ou via une constante locale selon le fichier : `BUCKET`, `ORDER_PHOTOS_BUCKET`) ; les buckets `quote-request-photos`, `quotes-pdf` et `intervention-images` sont utilisés pour des besoins spécifiques et ne doivent pas être confondus avec `"images"`.
- Deux composants de barre de navigation basse coexistent (`components/BottomMenu.js` pour `HomePage`, `components/BottomNavigation.js` pour les autres écrans) : ne pas les fusionner ni en supprimer un sans demande explicite.
- Deux composants de modale d'alerte coexistent (`components/AlertBox.js`, `components/CustomAlert.js`) avec des props différentes : vérifier lequel est importé dans le fichier concerné avant modification.
- `context/AppContext.js` (`AppProvider`) n'est actuellement monté nulle part dans l'application — ne pas supposer qu'il fournit des données à un écran sans avoir vérifié l'import.

## Validation

Après chaque modification :

- vérifier les imports ;
- vérifier les parenthèses et accolades ;
- vérifier les noms de variables ;
- vérifier les routes ;
- vérifier les paramètres de navigation ;
- vérifier les requêtes Supabase ;
- vérifier qu’aucune fonctionnalité existante n’a disparu ;
- afficher un diff ou résumer précisément les lignes modifiées.