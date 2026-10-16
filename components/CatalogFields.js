import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { supabase } from "../supabaseClient";

// Champs Type / Marque / Modèle avec propositions du catalogue (tables
// article / marque / modele, comme l'ajout d'intervention). La saisie libre
// reste possible ; rien n'est ajouté au catalogue.

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// Types de matériel chargés une seule fois pour toutes les lignes.
let articlesPromise = null;
const loadArticles = () => {
  if (!articlesPromise) {
    articlesPromise = supabase
      .from("article")
      .select("id, nom")
      .then(({ data, error }) => {
        if (error) {
          console.error("❌ Chargement types de matériel :", error);
          articlesPromise = null;
          return [];
        }
        return data || [];
      });
  }
  return articlesPromise;
};

function Suggestions({ visible, items, query, onSelect }) {
  if (!visible) return null;
  const q = norm(query);
  const list = items
    .filter((it) => norm(it.nom) !== q && norm(it.nom).includes(q))
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || ""))
    .slice(0, 12);
  if (list.length === 0) return null;
  return (
    <View style={styles.suggestions}>
      {list.map((it) => (
        <TouchableOpacity key={it.id} style={styles.suggestionItem} onPress={() => onSelect(it)}>
          <Text style={styles.suggestionText}>{it.nom}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// value : { device_type, brand, model } ; onChange(patch)
export default function CatalogFields({ value, onChange, inputStyle, labelStyle }) {
  const [articles, setArticles] = useState([]);
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [focused, setFocused] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadArticles().then((list) => {
      if (!cancelled) setArticles(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const matchedArticle = articles.find((a) => norm(a.nom) === norm(value.device_type));
  useEffect(() => {
    if (!matchedArticle) {
      setBrands([]);
      return;
    }
    supabase
      .from("marque")
      .select("id, nom")
      .eq("article_id", matchedArticle.id)
      .then(({ data, error }) => {
        if (error) console.error("❌ Chargement marques :", error);
        else setBrands(data || []);
      });
  }, [matchedArticle?.id]);

  const matchedBrand = brands.find((b) => norm(b.nom) === norm(value.brand));
  useEffect(() => {
    if (!matchedBrand) {
      setModels([]);
      return;
    }
    supabase
      .from("modele")
      .select("id, nom")
      .eq("marque_id", matchedBrand.id)
      .then(({ data, error }) => {
        if (error) console.error("❌ Chargement modèles :", error);
        else setModels(data || []);
      });
  }, [matchedBrand?.id]);

  // Ferme la liste du champ quitté sans fermer celle du champ qui prend le focus.
  const close = (field) =>
    setTimeout(() => setFocused((current) => (current === field ? null : current)), 200);

  return (
    <View>
      <Text style={labelStyle}>Type de matériel *</Text>
      <TextInput
        style={inputStyle}
        value={value.device_type || ""}
        onChangeText={(t) => onChange({ device_type: t })}
        onFocus={() => setFocused("type")}
        onBlur={() => close("type")}
        placeholder="ex. Smartphone, PC portable, console…"
        placeholderTextColor="#94a3b8"
      />
      <Suggestions
        visible={focused === "type"}
        items={articles}
        query={value.device_type}
        onSelect={(a) => {
          const changed = norm(a.nom) !== norm(value.device_type);
          onChange(changed ? { device_type: a.nom, brand: "", model: "" } : { device_type: a.nom });
          setFocused(null);
        }}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Marque</Text>
          <TextInput
            style={inputStyle}
            value={value.brand || ""}
            onChangeText={(t) => onChange({ brand: t })}
            onFocus={() => setFocused("brand")}
            onBlur={() => close("brand")}
            placeholder={matchedArticle ? "Choisir ou saisir…" : ""}
            placeholderTextColor="#94a3b8"
          />
          <Suggestions
            visible={focused === "brand"}
            items={brands}
            query={value.brand}
            onSelect={(b) => {
              const changed = norm(b.nom) !== norm(value.brand);
              onChange(changed ? { brand: b.nom, model: "" } : { brand: b.nom });
              setFocused(null);
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Modèle</Text>
          <TextInput
            style={inputStyle}
            value={value.model || ""}
            onChangeText={(t) => onChange({ model: t })}
            onFocus={() => setFocused("model")}
            onBlur={() => close("model")}
            placeholder={matchedBrand ? "Choisir ou saisir…" : ""}
            placeholderTextColor="#94a3b8"
          />
          <Suggestions
            visible={focused === "model"}
            items={models}
            query={value.model}
            onSelect={(m) => {
              onChange({ model: m.nom });
              setFocused(null);
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  suggestions: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: "#fff",
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  suggestionText: { color: "#334155", fontSize: 14 },
});
