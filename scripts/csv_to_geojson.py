import csv
import json

def parse_coordinates(coord_str, geom_type):
    """Parse la chaîne de coordonnées selon le type de géométrie."""
    coord_pairs = coord_str.split(';')
    coords = []
    for pair in coord_pairs:
        lon, lat = map(float, pair.strip().split(','))
        coords.append([lon, lat])
    
    if geom_type == "Point":
        return coords[0]
    elif geom_type == "LineString":
        return coords
    elif geom_type == "Polygon":
        return [coords]
    else:
        raise ValueError(f"Type de géométrie non supporté : {geom_type}")

def csv_to_geojson(csv_file, output_file):
    features = []

    with open(csv_file, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            geometry = {
                "type": row["type_geom"],
                "coordinates": parse_coordinates(row["coordinates"], row["type_geom"])
            }
            
            photos_raw = [url.strip() for url in row["photos"].split(',')] if row["photos"].strip() else []
            photos = [f"{url}?text=Photo+{i+1}" for i, url in enumerate(photos_raw)]
            
            properties = {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "photos": photos,
                "grande_categorie": row["grande_categorie"],
                "sous_categorie": row["sous_categorie"]
            }
            
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

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f"Généré : {output_file}")

# Utilisation
if __name__ == "__main__":
    csv_to_geojson("data.csv", "data.geojson")
