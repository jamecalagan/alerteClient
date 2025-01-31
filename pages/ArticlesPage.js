import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';

export default function ArticlesPage({ navigation }) {
    const [articles, setArticles] = useState([]);

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
        data={sortedArticles} // Liste triée
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item, index }) => (
            <View style={styles.itemContainer}>
                <TouchableOpacity onPress={() => handleSelectArticle(item.id)}>
                    <Text style={styles.itemText}>{item.nom}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteArticle(item.id)}>
                    <Icon name="trash" size={20} color="red" />
                </TouchableOpacity>
            </View>
        )}
    />
</View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    itemContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#ddd' },
    itemText: { fontSize: 16, flex: 1 },
});
