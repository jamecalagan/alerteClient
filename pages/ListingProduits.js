import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { supabase } from '../supabaseClient';
import { MaterialIcons } from '@expo/vector-icons';
import AlertBox from '../components/AlertBox';
import CustomAlert from '../components/CustomAlert';
import BackButton from '../components/BackButton';

const PAGE_SIZE = 10;
const sortByNom = (list) =>
    [...list].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));

export default function ProductManagementPage({ navigation }) {
    const [products, setProducts] = useState([]);
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    const [showProducts, setShowProducts] = useState(false);
    const [showBrands, setShowBrands] = useState(false);
    const [showModels, setShowModels] = useState(false);
    const [productsPage, setProductsPage] = useState(1);
    const [brandsPage, setBrandsPage] = useState(1);
    const [modelsPage, setModelsPage] = useState(1);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState('');
    const [alertMessage, setAlertMessage] = useState('');

    const showAlert = (title, message) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertVisible(true);
    };

    useEffect(() => {
        loadProducts();
        loadBrands();
        loadModels();
    }, []);

    const loadProducts = async () => {
        const { data, error } = await supabase.from('article').select('*');
        if (error) {
            showAlert('Erreur', 'Erreur lors du chargement des produits');
        } else {
            setProducts(data);
        }
    };

    const loadBrands = async () => {
        const { data, error } = await supabase.from('marque').select('*');
        if (error) {
            showAlert('Erreur', 'Erreur lors du chargement des marques');
        } else {
            setBrands(data);
        }
    };

    const loadModels = async () => {
        const { data, error } = await supabase.from('modele').select('*');
        if (error) {
            showAlert('Erreur', 'Erreur lors du chargement des modèles');
        } else {
            setModels(data);
        }
    };

    const deleteItem = (table, id, loadFunction) => {
        setItemToDelete({ table, id, loadFunction });
    };

    const confirmDeleteItem = async () => {
        const { table, id, loadFunction } = itemToDelete;
        setItemToDelete(null);
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) {
            showAlert('Erreur', `Erreur lors de la suppression de l'élément dans ${table}`);
        } else {
            loadFunction(); // Recharge la liste après suppression
        }
    };

    const sortedProducts = useMemo(() => sortByNom(products), [products]);
    const productsTotalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
    const productsPageClamped = Math.min(productsPage, productsTotalPages);
    const paginatedProducts = useMemo(
        () =>
            sortedProducts.slice(
                (productsPageClamped - 1) * PAGE_SIZE,
                productsPageClamped * PAGE_SIZE
            ),
        [sortedProducts, productsPageClamped]
    );

    const sortedBrands = useMemo(() => sortByNom(brands), [brands]);
    const brandsTotalPages = Math.max(1, Math.ceil(sortedBrands.length / PAGE_SIZE));
    const brandsPageClamped = Math.min(brandsPage, brandsTotalPages);
    const paginatedBrands = useMemo(
        () =>
            sortedBrands.slice(
                (brandsPageClamped - 1) * PAGE_SIZE,
                brandsPageClamped * PAGE_SIZE
            ),
        [sortedBrands, brandsPageClamped]
    );

    const sortedModels = useMemo(() => sortByNom(models), [models]);
    const modelsTotalPages = Math.max(1, Math.ceil(sortedModels.length / PAGE_SIZE));
    const modelsPageClamped = Math.min(modelsPage, modelsTotalPages);
    const paginatedModels = useMemo(
        () =>
            sortedModels.slice(
                (modelsPageClamped - 1) * PAGE_SIZE,
                modelsPageClamped * PAGE_SIZE
            ),
        [sortedModels, modelsPageClamped]
    );

    const renderPager = (page, totalPages, setPage) => (
        <View style={styles.pager}>
            <TouchableOpacity
                style={[styles.pagerBtn, page <= 1 && styles.pagerBtnDisabled]}
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
                <Image
                    source={require('../assets/icons/chevrong.png')}
                    style={[styles.pagerIcon, { tintColor: page <= 1 ? '#cbd5e1' : '#4338ca' }]}
                />
            </TouchableOpacity>
            <Text style={styles.pagerInfo}>
                Page {page} / {totalPages}
            </Text>
            <TouchableOpacity
                style={[styles.pagerBtn, page >= totalPages && styles.pagerBtnDisabled]}
                disabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
                <Image
                    source={require('../assets/icons/chevrond.png')}
                    style={[
                        styles.pagerIcon,
                        { tintColor: page >= totalPages ? '#cbd5e1' : '#4338ca' },
                    ]}
                />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentInner}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Produits, marques &amp; modèles</Text>
                </View>

                {/* ───── Produits ───── */}
                <View style={styles.card}>
                    <TouchableOpacity
                        style={styles.sectionHeader}
                        onPress={() => setShowProducts(!showProducts)}
                        activeOpacity={0.85}
                    >
                        <View style={styles.sectionHeaderLeft}>
                            <View style={[styles.sectionIconWrap, { backgroundColor: '#eef2ff' }]}>
                                <MaterialIcons name="category" size={18} color="#4338ca" />
                            </View>
                            <Text style={styles.sectionTitle}>Produits</Text>
                            <View style={styles.countBadge}>
                                <Text style={styles.countBadgeText}>{products.length}</Text>
                            </View>
                        </View>
                        <MaterialIcons
                            name={showProducts ? 'expand-less' : 'expand-more'}
                            size={22}
                            color="#64748b"
                        />
                    </TouchableOpacity>

                    {showProducts && (
                        products.length === 0 ? (
                            <Text style={styles.emptyText}>Aucun produit enregistré.</Text>
                        ) : (
                            <>
                                {paginatedProducts.map((item) => (
                                    <View key={item.id} style={styles.itemRow}>
                                        <Text style={styles.itemText}>{item.nom}</Text>
                                        <TouchableOpacity
                                            style={styles.deleteBtn}
                                            onPress={() => deleteItem('article', item.id, loadProducts)}
                                        >
                                            <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                {renderPager(productsPageClamped, productsTotalPages, setProductsPage)}
                            </>
                        )
                    )}
                </View>

                {/* ───── Marques ───── */}
                <View style={styles.card}>
                    <TouchableOpacity
                        style={styles.sectionHeader}
                        onPress={() => setShowBrands(!showBrands)}
                        activeOpacity={0.85}
                    >
                        <View style={styles.sectionHeaderLeft}>
                            <View style={[styles.sectionIconWrap, { backgroundColor: '#ecfeff' }]}>
                                <MaterialIcons name="sell" size={18} color="#0891b2" />
                            </View>
                            <Text style={styles.sectionTitle}>Marques</Text>
                            <View style={styles.countBadge}>
                                <Text style={styles.countBadgeText}>{brands.length}</Text>
                            </View>
                        </View>
                        <MaterialIcons
                            name={showBrands ? 'expand-less' : 'expand-more'}
                            size={22}
                            color="#64748b"
                        />
                    </TouchableOpacity>

                    {showBrands && (
                        brands.length === 0 ? (
                            <Text style={styles.emptyText}>Aucune marque enregistrée.</Text>
                        ) : (
                            <>
                                {paginatedBrands.map((item) => (
                                    <View key={item.id} style={styles.itemRow}>
                                        <Text style={styles.itemText}>{item.nom}</Text>
                                        <TouchableOpacity
                                            style={styles.deleteBtn}
                                            onPress={() => deleteItem('marque', item.id, loadBrands)}
                                        >
                                            <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                {renderPager(brandsPageClamped, brandsTotalPages, setBrandsPage)}
                            </>
                        )
                    )}
                </View>

                {/* ───── Modèles ───── */}
                <View style={styles.card}>
                    <TouchableOpacity
                        style={styles.sectionHeader}
                        onPress={() => setShowModels(!showModels)}
                        activeOpacity={0.85}
                    >
                        <View style={styles.sectionHeaderLeft}>
                            <View style={[styles.sectionIconWrap, { backgroundColor: '#fdf4ff' }]}>
                                <MaterialIcons name="smartphone" size={18} color="#a21caf" />
                            </View>
                            <Text style={styles.sectionTitle}>Modèles</Text>
                            <View style={styles.countBadge}>
                                <Text style={styles.countBadgeText}>{models.length}</Text>
                            </View>
                        </View>
                        <MaterialIcons
                            name={showModels ? 'expand-less' : 'expand-more'}
                            size={22}
                            color="#64748b"
                        />
                    </TouchableOpacity>

                    {showModels && (
                        models.length === 0 ? (
                            <Text style={styles.emptyText}>Aucun modèle enregistré.</Text>
                        ) : (
                            <>
                                {paginatedModels.map((item) => (
                                    <View key={item.id} style={styles.itemRow}>
                                        <Text style={styles.itemText}>{item.nom}</Text>
                                        <TouchableOpacity
                                            style={styles.deleteBtn}
                                            onPress={() => deleteItem('modele', item.id, loadModels)}
                                        >
                                            <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                {renderPager(modelsPageClamped, modelsTotalPages, setModelsPage)}
                            </>
                        )
                    )}
                </View>

                <BackButton onPress={() => navigation.goBack()} style={{ alignSelf: 'center', marginTop: 8 }} />
            </ScrollView>

            <AlertBox
                visible={!!itemToDelete}
                title="Confirmation"
                message="Êtes-vous sûr de vouloir supprimer cet élément ?"
                cancelText="Annuler"
                confirmText="Supprimer"
                onClose={() => setItemToDelete(null)}
                onConfirm={confirmDeleteItem}
            />

            <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                onClose={() => setAlertVisible(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    content: { flex: 1 },
    contentInner: { padding: 16, paddingBottom: 40 },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    headerTitle: {
        flex: 1,
        fontSize: 20,
        fontWeight: '800',
        color: '#0f172a',
    },

    card: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        marginBottom: 14,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
        overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    sectionIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a',
    },
    countBadge: {
        backgroundColor: '#f1f5f9',
        borderRadius: 10,
        paddingVertical: 2,
        paddingHorizontal: 8,
    },
    countBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
    },

    emptyText: {
        fontSize: 13,
        color: '#94a3b8',
        paddingHorizontal: 16,
        paddingBottom: 16,
    },

    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    itemText: {
        flex: 1,
        fontSize: 15,
        color: '#1e293b',
        fontWeight: '500',
    },
    deleteBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#fef2f2',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },

    pager: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 12,
    },
    pagerBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#eef2ff',
        borderWidth: 1,
        borderColor: '#c7d2fe',
    },
    pagerBtnDisabled: {
        backgroundColor: '#f3f4f6',
        borderColor: '#e5e7eb',
    },
    pagerIcon: {
        width: 16,
        height: 16,
    },
    pagerInfo: {
        fontSize: 13,
        fontWeight: '700',
        color: '#374151',
    },
});
