import React from "react";
import { View, Button, StyleSheet, Alert } from "react-native";
import { WebView } from "react-native-webview";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";

export default function ProductFlyerScreen({ route }) {
  const { product } = route.params;

  const saveOrUpdateFlyer = async () => {
	const { contact, ...cleanedProduct } = product;
  
	if (cleanedProduct.id) {
	  // ✅ Fiche existante → on met à jour
	  const { id, ...dataToUpdate } = cleanedProduct;
  
	  const { error } = await supabase
		.from("flyers")
		.update(dataToUpdate)
		.eq("id", id);
  
	  if (error) {
		Alert.alert("❌ Erreur", "Impossible de modifier l'affiche.");
		console.error(error);
	  } else {
		Alert.alert("✅ Modifié", "Affiche mise à jour avec succès.");
	  }
  
	} else {
	  // ✅ Nouvelle fiche → on insère
	  const { error } = await supabase
		.from("flyers")
		.insert([cleanedProduct]);
  
	  if (error) {
		Alert.alert("❌ Erreur", "Impossible de sauvegarder l'affiche.");
		console.error(error);
	  } else {
		Alert.alert("✅ Créé", "Affiche enregistrée avec succès.");
	  }
	}
  };
  
  
const getHtmlContent = (product, format = "A5") => {
  const baseStyle = {
    h1: format === "A4" ? 30 : 20,
    price: format === "A4" ? 80 : 46,
    detail: format === "A4" ? 18 : 13,
    maxImageHeight: format === "A4" ? 300 : 250,
    padding: format === "A4" ? 20 : 15,
    width: format === "A4" ? 794 : 420,
    imageThumb: format === "A4" ? 80 : 60,
    footerNoteSize: format === "A4" ? 12 : 11,
    bottomMarginTop: format === "A4" ? 60 : 20,
    maxExtraHeight: format === "A4" ? 220 : 140,
  };

  return `
    <html>
      <head>
        <style>
body {
  font-family: 'Arial', sans-serif;
  ${format === "A4" ? `
    width: 210mm;
    height: 297mm;
    padding: 20mm;
    margin: 0;
  ` : `
    padding: ${baseStyle.padding}px;
    max-width: ${baseStyle.width}px;
    margin: auto;
  `}
  color: #000;
  box-sizing: border-box;
}


          h1 {
            font-size: ${baseStyle.h1}px;
            text-align: center;
            margin-bottom: 10px;
            text-transform: uppercase;
            color: #222;
          }

          .image {
            text-align: center;
            margin: 8px 0 10px;
          }

          .image img {
            max-width: 100%;
            max-height: ${baseStyle.maxImageHeight}px;
            object-fit: contain;
            border-radius: 6px;
            box-shadow: 0 0 6px rgba(0,0,0,0.1);
          }

          .section-title {
            font-weight: bold;
            font-size: 14px;
            margin-top: 12px;
            margin-bottom: 6px;
            border-bottom: 1px solid #999;
            padding-bottom: 2px;
          }

          .details {
            font-size: ${baseStyle.detail}px;
            line-height: 1.4;
          }

          .details.extra {
            max-height: ${baseStyle.maxExtraHeight}px;
            overflow: hidden;
          }

          .price {
            text-align: center;
            font-size: ${baseStyle.price}px;
            font-weight: bold;
            color: #c40000;
            margin-bottom: 8px;
          }

          .extras {
            display: flex;
            justify-content: center;
            gap: 10px;
          }

          .extras img {
            width: ${baseStyle.imageThumb}px;
            height: ${baseStyle.imageThumb}px;
            object-fit: cover;
            border-radius: 6px;
            border: 1px solid #e0e0e0;
          }

          .bottom-section {
            margin-top: ${baseStyle.bottomMarginTop}px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
          }

          .footer-note {
            text-align: center;
            font-size: ${baseStyle.footerNoteSize}px;
            color: #888;
            margin-top: 12px;
            page-break-inside: avoid;
            page-break-before: avoid;
            page-break-after: avoid;
            min-height: 20px;
          }

          .final-section {
            page-break-inside: avoid;
            page-break-before: auto;
            page-break-after: auto;
          }
        </style>
      </head>
      <body>
        <h1>${product.title}</h1>

        <div class="image">
          <img src="${product.imageUrl}" alt="Photo du produit" />
        </div>

        <div class="section-title">Caractéristiques</div>
        <div class="details">
          <strong>Marque :</strong> ${product.brand || "-"}<br>
          <strong>Modèle :</strong> ${product.model || "-"}<br>
          <strong>État :</strong> ${product.condition || "-"}<br>
          <strong>Processeur :</strong> ${product.cpu || "-"}<br>
          <strong>RAM :</strong> ${product.ram || "-"}<br>
          <strong>Stockage :</strong> ${product.storage || "-"}<br>
          <strong>Écran :</strong> ${product.screen || "-"}<br>
          <strong>Garantie :</strong> ${product.warranty || "-"}
        </div>

        ${product.extra ? `
          <div class="section-title">Infos complémentaires</div>
          <div class="details extra">${product.extra}</div>
        ` : ""}

        <div class="final-section">
          <div class="bottom-section">
            <div class="price">${product.price} €</div>

            ${(product.image1 || product.image2 || product.image3) ? `
              <div class="extras">
                ${product.image1 ? `<img src="${product.image1}" />` : ""}
                ${product.image2 ? `<img src="${product.image2}" />` : ""}
                ${product.image3 ? `<img src="${product.image3}" />` : ""}
              </div>
            ` : ""}
          </div>

          <div class="footer-note">Produit d'occasion testé et garanti</div>
        </div>
      </body>
    </html>
  `;
};



  const handlePrint = () => {
    Alert.alert("Choisir le format", "Quel format veux-tu imprimer ?", [
      {
        text: "🖨️ A5 (compact)",
        onPress: () => {
          const html = getHtmlContent(product, "A5");
          Print.printAsync({ html });
        },
      },
      {
        text: "🖨️ A4 (grande affiche)",
        onPress: () => {
          const html = getHtmlContent(product, "A4");
          Print.printAsync({ html });
        },
      },
      { text: "Annuler", style: "cancel" },
    ]);
  };

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: getHtmlContent(product, "A5") }}
        style={styles.preview}
      />
      <Button title="🖨️ Imprimer l'affiche" onPress={handlePrint} />
	  <Button title="💾 Sauvegarder dans Supabase" onPress={saveOrUpdateFlyer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  preview: {
    flex: 1,
    marginBottom: 10,
  },
  
});
