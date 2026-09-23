import React from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";

// Déduit la provenance d'une photo (prise à l'appareil photo ou choisie
// dans la galerie/web) à partir du suffixe ajouté au nom de fichier lors
// de l'upload (ex: "...._cam.jpg" / "...._web.jpg"). Les photos plus
// anciennes n'ont pas ce suffixe : provenance inconnue, aucun badge affiché.
const getPhotoProvenance = (url) => {
  if (!url || typeof url !== "string") return null;
  const withoutQuery = url.split("?")[0];
  if (/_cam\.[a-zA-Z0-9]+$/.test(withoutQuery)) return "cam";
  if (/_web\.[a-zA-Z0-9]+$/.test(withoutQuery)) return "web";
  return null;
};

const PhotoProvenanceBadge = ({ source }) => {
  if (!source) return null;
  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        paddingVertical: 2,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
      }}
    >
      <Text
        style={{
          color: "#ffffff",
          fontSize: 8,
          fontWeight: "bold",
          textAlign: "center",
        }}
      >
        {source === "cam" ? "RÉELLE" : "WEB"}
      </Text>
    </View>
  );
};

// Les deux blocs photo d'une fiche client dans la Home : "Photo du
// produit" (vert, l'appareil déposé) et "Commandés" (violet, les
// produits commandés). Extrait de HomePage.js pour alléger ce fichier
// (renderClientCard dépassait 1000 lignes) — logique et rendu inchangés.
export default function ClientPhotoBlocks({
  latestIntervention,
  activeOrders,
  uploadingInterventionId,
  uploadingOrderProductPhotoId,
  uploadingOrderPhotoId,
  deleteInterventionPhoto,
  deleteOrderProductPhoto,
  deleteOrderPhoto,
  handleAddInterventionPhoto,
  handleAddOrderProductPhoto,
  handleAddOrderPhoto,
  openImageModal,
}) {
  const hasIntervention = !!latestIntervention?.id;
  const hasActiveOrders =
    Array.isArray(activeOrders) && activeOrders.length > 0;
  const primaryOrder = hasActiveOrders ? activeOrders[0] : null;

  if (!hasIntervention && !primaryOrder) return null;

  // Bloc vert "Photo du produit" (l'appareil, ex: le PC) : cible
  // l'intervention sélectionnée via les onglets si elle existe, sinon
  // la première commande active.
  const devicePhotos = hasIntervention
    ? (Array.isArray(latestIntervention?.product_photos)
        ? latestIntervention.product_photos.filter(Boolean)
        : []
      ).map((uri) => ({
        uri,
        onDelete: () => deleteInterventionPhoto(latestIntervention.id, uri),
      }))
    : (Array.isArray(primaryOrder?.product_photos)
        ? primaryOrder.product_photos.filter(Boolean)
        : []
      ).map((uri) => ({
        uri,
        onDelete: () => deleteOrderProductPhoto(primaryOrder.id, uri),
      }));

  const isDevicePhotoUploading = hasIntervention
    ? uploadingInterventionId === latestIntervention.id
    : uploadingOrderProductPhotoId === primaryOrder?.id;

  const handleAddDevicePhoto = () => {
    if (hasIntervention) {
      handleAddInterventionPhoto(latestIntervention);
    } else if (primaryOrder) {
      handleAddOrderProductPhoto(primaryOrder);
    }
  };

  const devicePhotoBox = (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        marginTop: 8,
        marginBottom: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: "#00c853",
        borderRadius: 8,
        backgroundColor: "#eaffea",
      }}
    >
      <Text
        style={{
          color: "#0a6b2f",
          fontWeight: "bold",
          marginBottom: 6,
        }}
      >
        Photo du produit
        {devicePhotos.length > 0 &&
          getPhotoProvenance(devicePhotos[0]?.uri) && (
            <Text style={{ fontStyle: "italic", fontWeight: "bold" }}>
              {" "}
              {getPhotoProvenance(devicePhotos[0]?.uri) === "cam"
                ? "Réel"
                : "WEB"}
            </Text>
          )}
      </Text>
      {devicePhotos.length > 0 && (
        <Text
          style={{
            color: "#0a6b2f",
            fontSize: 12,
            marginBottom: 6,
          }}
        >
          Appui long sur une photo pour la supprimer
        </Text>
      )}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
        }}
      >
        {devicePhotos.map((entry, photoIndex) => (
          <Pressable
            key={`device-photo-${photoIndex}`}
            onPress={() => openImageModal(entry.uri)}
            onLongPress={entry.onDelete}
            style={{ width: 80, height: 80 }}
          >
            <Image
              source={{ uri: entry.uri }}
              style={{
                width: 80,
                height: 80,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#0a6b2f",
                resizeMode: "cover",
              }}
            />
            <PhotoProvenanceBadge source={getPhotoProvenance(entry.uri)} />
          </Pressable>
        ))}
        <TouchableOpacity
          style={{
            width: 80,
            height: 80,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#00c853",
            backgroundColor: "#eaffea",
            justifyContent: "center",
            alignItems: "center",
          }}
          activeOpacity={0.8}
          onPress={handleAddDevicePhoto}
        >
          {isDevicePhotoUploading ? (
            <ActivityIndicator size="small" color="#00c853" />
          ) : (
            <Image
              source={require("../assets/icons/upload.png")}
              style={{ width: 28, height: 28, tintColor: "#00c853" }}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!hasActiveOrders) {
    return devicePhotoBox;
  }

  // Bloc violet "Photos des produits commandés" (la pièce, ex: la
  // batterie) : une entrée + un bouton d'ajout par commande active.
  const hasOrderPhotos = activeOrders.some(
    (order) =>
      Array.isArray(order.order_photos) && order.order_photos.length > 0
  );

  const orderPhotosFournisseur = Array.from(
    new Set(
      activeOrders
        .flatMap((order) =>
          Array.isArray(order.order_items) ? order.order_items : []
        )
        .map((oi) => oi.fournisseur)
        .filter(Boolean)
    )
  ).join(", ");

  const orderPhotoBox = (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        marginTop: 8,
        marginBottom: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: "#b396f8",
        borderRadius: 8,
        backgroundColor: "#f7f3ff",
      }}
    >
      <Text
        style={{
          color: "#270381",
          fontWeight: "bold",
          marginBottom: 6,
        }}
      >
        Commandés
        {orderPhotosFournisseur ? (
          <>
            {" chez : "}
            <Text style={{ fontStyle: "italic", fontWeight: "bold" }}>
              {orderPhotosFournisseur}
            </Text>
          </>
        ) : null}
      </Text>
      {hasOrderPhotos && (
        <Text
          style={{
            color: "#270381",
            fontSize: 12,
            marginBottom: 6,
          }}
        >
          Appui long sur une photo pour la supprimer
        </Text>
      )}

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
        }}
      >
        {activeOrders.flatMap((order) => [
          ...(Array.isArray(order.order_photos)
            ? order.order_photos.map((uri, photoIndex) => (
                <Pressable
                  key={`${order.id}-order-photo-${photoIndex}`}
                  onPress={() => openImageModal(uri)}
                  onLongPress={() => deleteOrderPhoto(order.id, uri)}
                  style={{ width: 80, height: 80 }}
                >
                  <Image
                    source={{ uri }}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#270381",
                      resizeMode: "cover",
                    }}
                  />
                  <PhotoProvenanceBadge source={getPhotoProvenance(uri)} />
                </Pressable>
              ))
            : []),
          <TouchableOpacity
            key={`${order.id}-add-order-photo`}
            style={{
              width: 80,
              height: 80,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#270381",
              backgroundColor: "#efe6ff",
              justifyContent: "center",
              alignItems: "center",
            }}
            activeOpacity={0.8}
            onPress={() => handleAddOrderPhoto(order)}
          >
            {uploadingOrderPhotoId === order.id ? (
              <ActivityIndicator size="small" color="#270381" />
            ) : (
              <Image
                source={require("../assets/icons/upload.png")}
                style={{ width: 28, height: 28, tintColor: "#270381" }}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>,
        ])}
      </View>
    </View>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
      }}
    >
      <View style={{ flex: 1 }}>{orderPhotoBox}</View>
      <View style={{ flex: 1 }}>{devicePhotoBox}</View>
    </View>
  );
}
