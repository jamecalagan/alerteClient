import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';

export default function ArticlesPage({ navigation }) {
    const [articles, setArticles] = useState([]);
    const numColumns = 2; // Nombre de colonnes

    useEffect(() => {
        loadArticles();
    }, []);

    const loadArticles = async () => {
        const { data, error } = await supabase.from('article').select('*');
        if (error) {
            console.error('Erreur lors du chargement des articles:', error.message);
        } else {
            setArticles(data);
        }
    };

    const handleDeleteArticle = async (articleId) => {
        Alert.alert(
            'Confirmation',
            'Êtes-vous sûr de vouloir supprimer cet article ?',
            [
                { text: 'Annuler', style: 'cancel' },
                { 
                    text: 'Supprimer', 
                    style: 'destructive', 
                    onPress: async () => {
                        const { error } = await supabase.from('article').delete().eq('id', articleId);
                        if (error) {
                            console.error('Erreur lors de la suppression de l\'article:', error.message);
                        } else {
                            setArticles(articles.filter(article => article.id !== articleId));
                        }
                    } 
                },
            ]
        );
    };

    const handleSelectArticle = (articleId) => {
        navigation.navigate('BrandsPage', { articleId });
    };

    const sortedArticles = [...articles].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

    return (
        <View style={styles.container}>
            <FlatList
                data={sortedArticles}
                keyExtractor={(item) => item.id.toString()}
                numColumns={numColumns}
                key={numColumns} // Forcer le rafraîchissement lors du changement de colonnes
                renderItem={({ item }) => (
                    <View style={styles.itemContainer}>
                        <TouchableOpacity 
                            style={styles.articleButton} 
                            onPress={() => handleSelectArticle(item.id)}
                        >
                            <Text style={styles.itemText}>{item.nom}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.deleteButton} 
                            onPress={() => handleDeleteArticle(item.id)}
                        >
                            <Icon name="trash" size={16} color="white" />
                        </TouchableOpacity>
                    </View>
                )}
                contentContainerStyle={styles.listContainer}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        padding: 10, 
        backgroundColor: '#f9f9f9' 
    },
    listContainer: {
        justifyContent: 'space-between',
    },
    itemContainer: {
        flex: 1,
        backgroundColor: '#fff',
        margin: 5,
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        elevation: 2, // Ombre pour Android
        shadowColor: '#000', // Ombre pour iOS
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    articleButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#d8d9da', // Couleur de fond du bouton
        borderRadius: 8,
        width: '100%', // Prendre toute la largeur du conteneur
    },
    itemText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#202020', // Texte en blanc pour plus de contraste
        textAlign: 'center',
    },
    deleteButton: {
        marginTop: 10,
        backgroundColor: 'red',
        padding: 8,
        borderRadius: 5,
        width: '100%',
        alignItems: 'center',
    }
});
