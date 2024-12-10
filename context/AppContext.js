import React, { createContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [clients, setClients] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [repairedNotReturnedCount, setRepairedNotReturnedCount] = useState(0);

    // Charger les clients
    const loadClients = async (sortBy = "createdAt", orderAsc = false) => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from("clients")
                .select(
                    `
                    *, 
                    updatedAt, 
                    interventions(
                        id, 
                        status, 
                        deviceType,
                        brand,
                        model, 
                        cost,
                        solderestant, 
                        createdAt, 
                        updatedAt, 
                        commande, 
                        photos, 
                        notifiedBy,
                        accept_screen_risk
                    )
                `
                )
                .order(sortBy, { ascending: orderAsc });

            if (error) throw error;

            if (data) {
                // Filtrer et trier les clients selon les interventions en cours
                const updatedData = data.map((client) => ({
                    ...client,
                    totalInterventions: client.interventions.length,
                }));
                setClients(updatedData);
            }
        } catch (error) {
            console.error("Erreur lors du chargement des clients:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Charger les fiches réparées non restituées
    const loadRepairedNotReturnedCount = async () => {
        try {
            const { data, error } = await supabase
                .from("interventions")
                .select("*")
                .eq("status", "Réparé")
                .eq("restitue", false);

            if (error) throw error;
            setRepairedNotReturnedCount(data.length);
        } catch (error) {
            console.error(
                "Erreur lors du chargement des fiches réparées non restituées:",
                error
            );
        }
    };

    useEffect(() => {
        loadClients();
        loadRepairedNotReturnedCount();
    }, []);

    return (
        <AppContext.Provider
            value={{
                clients,
                setClients,
                isLoading,
                repairedNotReturnedCount,
                loadClients,
                loadRepairedNotReturnedCount,
            }}
        >
            {children}
        </AppContext.Provider>
    );
};
