
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "body_metrics": {
                  Row: {
                    "date": string,"id": string,"poids_kg": number | null,"tour_taille_cm": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date"?: string,"id"?: string,"poids_kg"?: number | null,"tour_taille_cm"?: number | null,"user_id": string
                  }
                  Update: {
                    "date"?: string,"id"?: string,"poids_kg"?: number | null,"tour_taille_cm"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"change_log": {
                  Row: {
                    "after_data": Json | null,"applied_at": string | null,"before_data": Json | null,"groupe_id": string,"id": string,"operation": string,"resume": string,"row_id": string | null,"source": string,"table_name": string,"undone_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "after_data"?: Json | null,"applied_at"?: string | null,"before_data"?: Json | null,"groupe_id"?: string,"id"?: string,"operation": string,"resume": string,"row_id"?: string | null,"source": string,"table_name": string,"undone_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "after_data"?: Json | null,"applied_at"?: string | null,"before_data"?: Json | null,"groupe_id"?: string,"id"?: string,"operation"?: string,"resume"?: string,"row_id"?: string | null,"source"?: string,"table_name"?: string,"undone_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"chat_messages": {
                  Row: {
                    "content": string,"created_at": string | null,"id": string,"role": string,"tool_calls": Json | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string | null,"id"?: string,"role": string,"tool_calls"?: Json | null,"user_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string | null,"id"?: string,"role"?: string,"tool_calls"?: Json | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"demandes_ia": {
                  Row: {
                    "created_at": string,"id": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"exercises": {
                  Row: {
                    "archived": boolean | null,"equipement": string | null,"groupe": string,"id": string,"nom": string,"note": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean | null,"equipement"?: string | null,"groupe": string,"id"?: string,"nom": string,"note"?: string | null,"user_id": string
                  }
                  Update: {
                    "archived"?: boolean | null,"equipement"?: string | null,"groupe"?: string,"id"?: string,"nom"?: string,"note"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"foot_logs": {
                  Row: {
                    "date": string,"douleur_matin": number,"id": string,"note": string | null,"protocole_fait": boolean | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date"?: string,"douleur_matin": number,"id"?: string,"note"?: string | null,"protocole_fait"?: boolean | null,"user_id": string
                  }
                  Update: {
                    "date"?: string,"douleur_matin"?: number,"id"?: string,"note"?: string | null,"protocole_fait"?: boolean | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"foot_progression": {
                  Row: {
                    "dosage": string,"id": string,"protocol_item_id": string,"semaine_debut": number,"semaine_fin": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dosage": string,"id"?: string,"protocol_item_id": string,"semaine_debut": number,"semaine_fin": number,"user_id": string
                  }
                  Update: {
                    "dosage"?: string,"id"?: string,"protocol_item_id"?: string,"semaine_debut"?: number,"semaine_fin"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "foot_progression_protocol_item_id_fkey"
      columns: ["protocol_item_id"]
isOneToOne: false
      referencedRelation: "foot_protocol_items"
      referencedColumns: ["id"]
    }
                  ]
                },"foot_protocol_items": {
                  Row: {
                    "actif": boolean | null,"dosage": string,"exercice": string,"id": string,"moment": string,"ordre": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actif"?: boolean | null,"dosage": string,"exercice": string,"id"?: string,"moment": string,"ordre": number,"user_id": string
                  }
                  Update: {
                    "actif"?: boolean | null,"dosage"?: string,"exercice"?: string,"id"?: string,"moment"?: string,"ordre"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"grocery_items": {
                  Row: {
                    "categorie": string,"id": string,"nom": string,"prix_eur": number | null,"proteines_par_euro": number | null,"quantite": string | null,"recurrent": boolean | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categorie": string,"id"?: string,"nom": string,"prix_eur"?: number | null,"proteines_par_euro"?: number | null,"quantite"?: string | null,"recurrent"?: boolean | null,"user_id": string
                  }
                  Update: {
                    "categorie"?: string,"id"?: string,"nom"?: string,"prix_eur"?: number | null,"proteines_par_euro"?: number | null,"quantite"?: string | null,"recurrent"?: boolean | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"grocery_list_items": {
                  Row: {
                    "categorie": string,"coche": boolean | null,"id": string,"nom": string,"prix_eur": number | null,"quantite": string | null,"semaine_du": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categorie": string,"coche"?: boolean | null,"id"?: string,"nom": string,"prix_eur"?: number | null,"quantite"?: string | null,"semaine_du": string,"user_id": string
                  }
                  Update: {
                    "categorie"?: string,"coche"?: boolean | null,"id"?: string,"nom"?: string,"prix_eur"?: number | null,"quantite"?: string | null,"semaine_du"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"meal_logs": {
                  Row: {
                    "date": string,"hors_plan": boolean | null,"id": string,"kcal_reel": number | null,"meal_id": string | null,"note": string | null,"proteines_reel": number | null,"slot": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date"?: string,"hors_plan"?: boolean | null,"id"?: string,"kcal_reel"?: number | null,"meal_id"?: string | null,"note"?: string | null,"proteines_reel"?: number | null,"slot": string,"user_id": string
                  }
                  Update: {
                    "date"?: string,"hors_plan"?: boolean | null,"id"?: string,"kcal_reel"?: number | null,"meal_id"?: string | null,"note"?: string | null,"proteines_reel"?: number | null,"slot"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_logs_meal_id_fkey"
      columns: ["meal_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id"]
    }
                  ]
                },"meal_plan": {
                  Row: {
                    "id": string,"jour": string,"meal_id": string | null,"semaine": number,"slot": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"jour": string,"meal_id"?: string | null,"semaine": number,"slot": string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"jour"?: string,"meal_id"?: string | null,"semaine"?: number,"slot"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_plan_meal_id_fkey"
      columns: ["meal_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id"]
    }
                  ]
                },"meals": {
                  Row: {
                    "archived": boolean | null,"glucides_g": number | null,"id": string,"ingredients": Json | null,"kcal": number,"lipides_g": number | null,"nom": string,"proteines_g": number,"recette_md": string | null,"slot": string,"tag": string | null,"temps_min": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean | null,"glucides_g"?: number | null,"id"?: string,"ingredients"?: Json | null,"kcal": number,"lipides_g"?: number | null,"nom": string,"proteines_g": number,"recette_md"?: string | null,"slot": string,"tag"?: string | null,"temps_min"?: number | null,"user_id": string
                  }
                  Update: {
                    "archived"?: boolean | null,"glucides_g"?: number | null,"id"?: string,"ingredients"?: Json | null,"kcal"?: number,"lipides_g"?: number | null,"nom"?: string,"proteines_g"?: number,"recette_md"?: string | null,"slot"?: string,"tag"?: string | null,"temps_min"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "accueil_fait_le": string | null,"age": number | null,"aliments_exclus": (string)[],"budget_courses_eur": number | null,"coach": string | null,"contrainte_medicale": string | null,"created_at": string | null,"id": string,"lieux_entrainement": (string)[],"niveau": string | null,"objectif_glucides_g": number | null,"objectif_kcal": number | null,"objectif_lipides_g": number | null,"objectif_proteines_g": number | null,"objectifs": (string)[],"poids_initial_kg": number | null,"regime": string | null,"seances_par_semaine": number | null,"sexe": string | null,"taille_cm": number | null,"zone_blessure": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accueil_fait_le"?: string | null,"age"?: number | null,"aliments_exclus"?: (string)[],"budget_courses_eur"?: number | null,"coach"?: string | null,"contrainte_medicale"?: string | null,"created_at"?: string | null,"id": string,"lieux_entrainement"?: (string)[],"niveau"?: string | null,"objectif_glucides_g"?: number | null,"objectif_kcal"?: number | null,"objectif_lipides_g"?: number | null,"objectif_proteines_g"?: number | null,"objectifs"?: (string)[],"poids_initial_kg"?: number | null,"regime"?: string | null,"seances_par_semaine"?: number | null,"sexe"?: string | null,"taille_cm"?: number | null,"zone_blessure"?: string | null
                  }
                  Update: {
                    "accueil_fait_le"?: string | null,"age"?: number | null,"aliments_exclus"?: (string)[],"budget_courses_eur"?: number | null,"coach"?: string | null,"contrainte_medicale"?: string | null,"created_at"?: string | null,"id"?: string,"lieux_entrainement"?: (string)[],"niveau"?: string | null,"objectif_glucides_g"?: number | null,"objectif_kcal"?: number | null,"objectif_lipides_g"?: number | null,"objectif_proteines_g"?: number | null,"objectifs"?: (string)[],"poids_initial_kg"?: number | null,"regime"?: string | null,"seances_par_semaine"?: number | null,"sexe"?: string | null,"taille_cm"?: number | null,"zone_blessure"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"quotas_ia": {
                  Row: {
                    "demandes_par_mois": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "demandes_par_mois"?: number | null,"user_id": string
                  }
                  Update: {
                    "demandes_par_mois"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"running_logs": {
                  Row: {
                    "date": string,"douleur_apres": number | null,"douleur_lendemain": number | null,"duree_min": number | null,"id": string,"km": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date"?: string,"douleur_apres"?: number | null,"douleur_lendemain"?: number | null,"duree_min"?: number | null,"id"?: string,"km": number,"user_id": string
                  }
                  Update: {
                    "date"?: string,"douleur_apres"?: number | null,"douleur_lendemain"?: number | null,"duree_min"?: number | null,"id"?: string,"km"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"running_plan": {
                  Row: {
                    "id": string,"protocole": string,"seances_par_semaine": number,"semaine": number,"statut": string | null,"user_id": string,"volume_km_cible": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"protocole": string,"seances_par_semaine"?: number,"semaine": number,"statut"?: string | null,"user_id": string,"volume_km_cible": number
                  }
                  Update: {
                    "id"?: string,"protocole"?: string,"seances_par_semaine"?: number,"semaine"?: number,"statut"?: string | null,"user_id"?: string,"volume_km_cible"?: number
                  }
                  Relationships: [
                    
                  ]
                },"set_logs": {
                  Row: {
                    "charge_kg": number | null,"duree_sec": number | null,"id": string,"reps": number | null,"rir": number | null,"serie_num": number,"workout_exercise_id": string,"workout_log_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "charge_kg"?: number | null,"duree_sec"?: number | null,"id"?: string,"reps"?: number | null,"rir"?: number | null,"serie_num": number,"workout_exercise_id": string,"workout_log_id": string
                  }
                  Update: {
                    "charge_kg"?: number | null,"duree_sec"?: number | null,"id"?: string,"reps"?: number | null,"rir"?: number | null,"serie_num"?: number,"workout_exercise_id"?: string,"workout_log_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "set_logs_workout_exercise_id_fkey"
      columns: ["workout_exercise_id"]
isOneToOne: false
      referencedRelation: "workout_exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "set_logs_workout_log_id_fkey"
      columns: ["workout_log_id"]
isOneToOne: false
      referencedRelation: "workout_logs"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_exercises": {
                  Row: {
                    "archived": boolean,"bloc": string,"charge_cible_kg": number | null,"charge_depart_kg": number | null,"duree_sec": number | null,"exercise_id": string,"id": string,"increment_kg": number | null,"note": string | null,"ordre": number,"repos_sec": number,"reps_max": number | null,"reps_min": number | null,"series": number,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"bloc"?: string,"charge_cible_kg"?: number | null,"charge_depart_kg"?: number | null,"duree_sec"?: number | null,"exercise_id": string,"id"?: string,"increment_kg"?: number | null,"note"?: string | null,"ordre": number,"repos_sec"?: number,"reps_max"?: number | null,"reps_min"?: number | null,"series": number,"workout_id": string
                  }
                  Update: {
                    "archived"?: boolean,"bloc"?: string,"charge_cible_kg"?: number | null,"charge_depart_kg"?: number | null,"duree_sec"?: number | null,"exercise_id"?: string,"id"?: string,"increment_kg"?: number | null,"note"?: string | null,"ordre"?: number,"repos_sec"?: number,"reps_max"?: number | null,"reps_min"?: number | null,"series"?: number,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_exercises_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_exercises_workout_id_fkey"
      columns: ["workout_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_logs": {
                  Row: {
                    "date": string,"duree_min": number | null,"id": string,"note": string | null,"ressenti": number | null,"user_id": string,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date"?: string,"duree_min"?: number | null,"id"?: string,"note"?: string | null,"ressenti"?: number | null,"user_id": string,"workout_id": string
                  }
                  Update: {
                    "date"?: string,"duree_min"?: number | null,"id"?: string,"note"?: string | null,"ressenti"?: number | null,"user_id"?: string,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_logs_workout_id_fkey"
      columns: ["workout_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id"]
    }
                  ]
                },"workouts": {
                  Row: {
                    "archived": boolean | null,"circuit_repos_tours_sec": number | null,"code": string,"duree_min": number,"id": string,"jour_suggere": string | null,"lieu": string,"nom": string,"note": string | null,"ordre": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean | null,"circuit_repos_tours_sec"?: number | null,"code": string,"duree_min": number,"id"?: string,"jour_suggere"?: string | null,"lieu": string,"nom": string,"note"?: string | null,"ordre": number,"user_id": string
                  }
                  Update: {
                    "archived"?: boolean | null,"circuit_repos_tours_sec"?: number | null,"code"?: string,"duree_min"?: number,"id"?: string,"jour_suggere"?: string | null,"lieu"?: string,"nom"?: string,"note"?: string | null,"ordre"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "annuler_changement":
{ Args: { "p_groupe": string }; Returns: number
                           },
"appliquer_changements":
{ Args: { "p_changements": Json,"p_resume": string,"p_source"?: string }; Returns: string
                           },
"enregistrer_seance":
{ Args: { "p_date": string,"p_duree_min": number,"p_id": string,"p_ressenti": number,"p_series": Json,"p_source"?: string,"p_workout_id": string }; Returns: string
                           },
"etat_demandes_ia":
{ Args: Record<PropertyKey, never>; Returns: {
              "limite": number,"utilisees": number
            }[]
                           },
"rendre_demande_ia":
{ Args: { "p_id": string }; Returns: undefined
                           },
"reserver_demande_ia":
{ Args: { "p_type": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
