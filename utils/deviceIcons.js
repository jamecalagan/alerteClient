// Table statique type d'appareil -> icône, utilisée par getDeviceIcon dans
// HomePage.js. Extraite pour alléger ce fichier (aucune dépendance à l'état
// du composant, aucune fonction ici — juste des données).
const deviceIcons = {
  "PC portable": require("../assets/icons/portable.png"),
  MacBook: require("../assets/icons/macbook_air.png"),
  iMac: require("../assets/icons/iMac.png"),
  "PC Fixe": require("../assets/icons/ordinateur (1).png"),
  "PC tout en un": require("../assets/icons/allInone.png"),
  Tablette: require("../assets/icons/tablette.png"),
  Smartphone: require("../assets/icons/smartphone.png"),
  Console: require("../assets/icons/console-de-jeu.png"),
  "Disque dur": require("../assets/icons/disk.png"),
  "Disque dur externe": require("../assets/icons/disque-dur.png"),
  "Carte SD": require("../assets/icons/carte-memoire.png"),
  "Cle usb": require("../assets/icons/cle-usb.png"),
  "Casque audio": require("../assets/icons/playaudio.png"),
  "Video-projecteur": require("../assets/icons/Projector.png"),
  Clavier: require("../assets/icons/keyboard.png"),
  Ecran: require("../assets/icons/screen.png"),
  iPAD: require("../assets/icons/iPad.png"),
  Imprimante: require("../assets/icons/printer.png"),
  Joystick: require("../assets/icons/joystick.png"),
  Processeur: require("../assets/icons/cpu.png"),
  Batterie: require("../assets/icons/battery.png"),
  Commande: require("../assets/icons/shipping_box.png"),
  "Carte graphique": require("../assets/icons/Vga_card.png"),
  Manette: require("../assets/icons/controller.png"),
  Enceinte: require("../assets/icons/speaker.png"),
  PDA: require("../assets/icons/Pda.png"),
  default: require("../assets/icons/point-dinterrogation.png"),
};

export default deviceIcons;
