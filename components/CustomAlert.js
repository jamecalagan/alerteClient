import React from 'react';
import AlertBox from './AlertBox';

// CustomAlert est fusionné dans AlertBox (composant unique conservé pour toute
// l'appli) : ce fichier ne fait plus que déléguer, en gardant le texte de
// bouton "Confirmer" utilisé historiquement ici (AlertBox utilise "OK" par
// défaut quand aucun texte n'est précisé).
const CustomAlert = ({ visible, title, message, onClose, onConfirm = null }) => (
  <AlertBox
    visible={visible}
    title={title}
    message={message}
    onClose={onClose}
    onConfirm={onConfirm}
    confirmText={onConfirm ? "Confirmer" : "OK"}
  />
);

export default CustomAlert;
