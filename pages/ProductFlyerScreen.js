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
      h1: format === "A4" ? 26 : 20,
      price: format === "A4" ? 40 : 26,
      detail: format === "A4" ? 16 : 13,
      maxImageHeight: format === "A4" ? 300 : 180,
      padding: format === "A4" ? 30 : 15,
      width: format === "A4" ? 700 : 420,
    };

    return `
      <html>
        <head>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              padding: ${baseStyle.padding}px;
              max-width: ${baseStyle.width}px;
              margin: auto;
              color: #000;
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
              margin: 10px 0 14px;
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
              margin-top: 15px;
              margin-bottom: 6px;
              border-bottom: 1px solid #999;
              padding-bottom: 2px;
            }

            .details {
              font-size: ${baseStyle.detail}px;
              line-height: 1.4;
            }

            .price {
              text-align: center;
              font-size: ${baseStyle.price}px;
              font-weight: bold;
              color: #c40000;
              margin-top: 16px;
              margin-bottom: 10px;
            }

            .footer {
              text-align: center;
              font-size: 11px;
              color: #666;
              margin-top: 18px;
            }
          </style>
        </head>
        <body>
          <h1>${product.title}</h1>

          <div class="image">
            <img src="${product.imageUrl}" alt="Photo du produit" />
          </div>

          <div class="price">${product.price} €</div>

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
            <div class="details">${product.extra}</div>
          ` : ""}

          <div class="footer">Produit d'occasion testé et garanti</div>
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
