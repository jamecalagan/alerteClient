import { AppRegistry } from 'react-native';
import App from './App';  // Assurez-vous que le chemin vers App.js est correct
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
