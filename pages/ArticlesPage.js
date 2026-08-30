import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';
import AlertBox from '../components/AlertBox';
import BackButton from '../components/BackButton';

export default function ArticlesPage({ navigation }) {
    const [articles, setArticles] = useState([]);
    const [articleToDelete, setArticleToDelete] = useState(null);
    const numColumns = 3; // Nombre de colonnes

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

    const handleDeleteArticle = (articleId) => {
        setArticleToDelete(articleId);
    };

    const confirmDeleteArticle = async () => {
        const articleId = articleToDelete;
        setArticleToDelete(null);
        const { error } = await supabase.from('article').delete().eq('id', articleId);
        if (error) {
            console.error('Erreur lors de la suppression de l\'article:', error.message);
        } else {
            setArticles(articles.filter(article => article.id !== articleId));
        }
    };

    const handleSelectArticle = (articleId) => {
        navigation.navigate('BrandsPage', { articleId });
    };

    const sortedArticles = [...articles].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Liste des produits</Text>
            </View>

            <FlatList
                data={sortedArticles}
                keyExtractor={(item) => item.id.toString()}
                numColumns={numColumns}
                key={numColumns} // Forcer le rafraîchissement lors du changement de colonnes
                ListEmptyComponent={
                    <Text style={styles.emptyText}>Aucun produit enregistré.</Text>
                }
                renderItem={({ item }) => (
                    <View style={styles.itemContainer}>
                        <TouchableOpacity
                            style={styles.articleButton}
                            onPress={() => handleSelectArticle(item.id)}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.itemText} numberOfLines={1}>
                                {item.nom}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() => handleDeleteArticle(item.id)}
                        >
                            <Icon name="trash" size={14} color="#dc2626" />
                        </TouchableOpacity>
                    </View>
                )}
                contentContainerStyle={styles.listContainer}
            />

            <BackButton onPress={() => navigation.goBack()} style={{ alignSelf: 'center', marginTop: 8 }} />

            <AlertBox
                visible={!!articleToDelete}
                title="Confirmation"
                message="Êtes-vous sûr de vouloir supprimer cet article ?"
                cancelText="Annuler"
                confirmText="Supprimer"
                onClose={() => setArticleToDelete(null)}
                onConfirm={confirmDeleteArticle}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f8fafc',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    title: {
        flex: 1,
        fontSize: 20,
        fontWeight: '800',
        color: '#0f172a',
    },
    listContainer: {
        justifyContent: 'space-between',
        paddingBottom: 30,
    },
    emptyText: {
        fontSize: 14,
        color: '#94a3b8',
        textAlign: 'center',
        marginTop: 30,
    },
    itemContainer: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        margin: 5,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
        overflow: 'hidden',
    },
    articleButton: {
        flex: 1,
        justifyContent: 'center',
        paddingVertical: 12,
        paddingLeft: 12,
        paddingRight: 4,
    },
    itemText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1e293b',
    },
    deleteButton: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#fef2f2',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
});
