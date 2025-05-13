import csv
import json
import ast  # pour parser la chaîne coordinates en liste Python

# Chemins de fichiers
input_csv = "discours.csv"
output_geojson = "discours.geojson"

features = []

with open(input_csv, newline='', encoding='utf-8') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        coordinates = ast.literal_eval(row['coordinates'])  # transforme la chaîne en liste
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": coordinates
            },
            "properties": {
                "titre": row["titre"],
                "contenu": row["contenu"],
                "grande_categorie": row["grande_categorie"],
                "auteur": row["auteur"],
                "date": row["date"],
                "source": row["source"],
                "tonalite": row["tonalite"],
                "temps": row["temps"],
                "isDiscourse": True
            }
        }
        features.append(feature)

geojson = {
    "type": "FeatureCollection",
    "features": features
}

with open(output_geojson, 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False, indent=2)

print(f"{len(features)} features exportées dans {output_geojson}")
