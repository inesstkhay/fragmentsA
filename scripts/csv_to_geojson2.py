import csv
import json

def parse_coordinates(coord_str, geom_type):
    try:
        if geom_type == 'Point':
            lon, lat = map(float, coord_str.strip().split(","))
            return [lon, lat]
        else:
            if coord_str.strip().startswith('[') and coord_str.strip().endswith(']'):
                return json.loads(coord_str)
            else:
                coordinates = []
                points = coord_str.split(" ; ")
                for point in points:
                    lon, lat = map(float, point.split(","))
                    coordinates.append([lon, lat])
                if geom_type == "Polygon" and coordinates[0] != coordinates[-1]:
                    coordinates.append(coordinates[0])
                return coordinates
    except Exception as e:
        print(f"Erreur dans le parsing des coordonnées : {e}")
        return None

features = []

with open('data.csv', newline='', encoding='utf-8') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        geom_type = row['type_geom']
        coord_raw = row['coordinates']
        coords = parse_coordinates(coord_raw, geom_type)
        if coords is None:
            continue

        # Champs fixes
        properties = {
            "id": row.get("id"),
            "name": row.get("name"),
            "description": row.get("description"),
            "photos": [row.get("photos")] if row.get("photos") else []
        }

        # Ajout dynamique de tous les champs booléens (tout ce qui n’est pas un champ fixe ou géométrique)
        for key, value in row.items():
            if key in ['id', 'name', 'description', 'photos', 'type_geom', 'coordinates']:
                continue
            properties[key] = value.strip().lower() == "true"

        feature = {
            "type": "Feature",
            "geometry": {
                "type": geom_type,
                "coordinates": coords
            },
            "properties": properties
        }

        features.append(feature)

geojson = {
    "type": "FeatureCollection",
    "features": features
}

with open("data.geojson", "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2, ensure_ascii=False)

print("✅ Fichier 'data.geojson' généré avec succès.")
