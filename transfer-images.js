const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configurer Supabase
const supabaseUrl = "https://fncgffajwabqrnhumgzd.supabase.co"; // Remplacez par votre URL Supabase
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuY2dmZmFqd2FicXJuaHVtZ3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc0MjgwMjEsImV4cCI6MjA0MzAwNDAyMX0.5j5NmKVcAjvHjglrzThqToA52nZqgHV_U3zuWb-7Aes"; // Remplacez par votre clé API Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Nom du bucket
const bucketName = "intervention-images";

const transferImages = async () => {
    try {
        // Étape 1 : Récupérer les images existantes dans la table
		const { data: images, error: fetchError } = await supabase
		.from("intervention_images")
		.select("*");
	
	if (fetchError) throw fetchError;
	
	console.log("Images récupérées depuis la base :", images);
	

        for (const image of images) {
            const { id, image_data, user_id, file_path } = image;

            // Vérifier si l'image a déjà été transférée
            if (file_path) {
                console.log(`L'image ${id} a déjà été transférée.`);
                continue;
            }

            // Convertir base64 en Buffer
            if (!image_data) {
                console.log(`L'image ${id} ne contient pas de données base64.`);
                continue;
            }

            const imageBuffer = Buffer.from(image_data, "base64");

            // Générer un chemin unique pour le fichier
            const uniqueFileName = `${user_id || "unknown_user"}/${id}_${Date.now()}.jpg`;

            // Étape 2 : Uploader l'image dans le bucket Supabase
            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(uniqueFileName, imageBuffer, {
                    contentType: "image/jpeg",
                });

            if (uploadError) {
                console.error(`Erreur lors de l'upload de l'image ${id} :`, uploadError);
                continue;
            }

            console.log(`Image ${id} uploadée avec succès : ${uniqueFileName}`);

            // Étape 3 : Mettre à jour la colonne file_path dans la base de données
            const { error: updateError } = await supabase
                .from("intervention_images")
                .update({ file_path: uniqueFileName, image_data: null }) // Supprime les données base64
                .eq("id", id);

            if (updateError) {
                console.error(`Erreur lors de la mise à jour de l'image ${id} :`, updateError);
            } else {
                console.log(`Table mise à jour pour l'image ${id}.`);
            }
        }

        console.log("Transfert terminé avec succès !");
    } catch (err) {
        console.error("Erreur inattendue :", err);
    }
};

// Exécuter le script
transferImages();
