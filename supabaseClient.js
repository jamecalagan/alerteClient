import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fncgffajwabqrnhumgzd.supabase.co';  // Remplacez par l'URL de votre projet Supabase
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuY2dmZmFqd2FicXJuaHVtZ3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc0MjgwMjEsImV4cCI6MjA0MzAwNDAyMX0.5j5NmKVcAjvHjglrzThqToA52nZqgHV_U3zuWb-7Aes';  // Remplacez par votre clé anonyme Supabase

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

