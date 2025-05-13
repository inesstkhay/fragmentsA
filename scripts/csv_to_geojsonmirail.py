import pandas as pd
import json
import ast
import re

# Charger le CSV
csv_path = "data.csv"  # Remplace si nécessaire
output_path = "datam.geojson"
df = pd.read_csv(csv_path)

def parse_coordinates(coord_str, geom_type):
    try:
        # Nettoyage et mise en forme de la chaîne
        json_like = re.search(r'\[.*\]', coord_str, re.DOTALL).group(0)
        coord_data = ast.literal_eval(json_like)

        if geom_type == "Polygon":
            # S'assurer que l'anneau est fermé
            if coord_data[0][0] != coord_data[0][-1]:
                coord_data[0].append(coord_data[0][0])
            return coord_data
        elif geom_type == "Point":
            return coord_data
        elif geom_type == "LineString":
            return coord_data
        else:
            return None
    except Exception as e:
        print(f"Erreur parsing coordonnées: {e}")
        return None

# Construction du GeoJSON
features = []
for _, row in df.iterrows():
    geometry = {
        "type": row["type_geom"],
        "coordinates": parse_coordinates(row["coordinates"], row["type_geom"])
    }

    properties = row.drop(["type_geom", "coordinates"]).to_dict()
    # Tentative de gestion des types booléens et string/liste
    if isinstance(properties.get("photos"), str) and properties["photos"].startswith("http"):
        properties["photos"] = [properties["photos"]]

    feature = {
        "type": "Feature",
        "geometry": geometry,
        "properties": properties
    }
    features.append(feature)

geojson = {
    "type": "FeatureCollection",
    "features": features
}

# Sauvegarde
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(geojson, f, ensure_ascii=False, indent=2)

print(f"GeoJSON exporté avec succès vers {output_path}")



