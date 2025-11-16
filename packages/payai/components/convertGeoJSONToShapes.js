// components/convertGeoJSONToShapes.js
import * as THREE from 'three';

/**
 * Converts GeoJSON features to an array of Three.js Shapes.
 * The projection function should convert [longitude, latitude] to [x, y].
 */
export function convertGeoJSONToShapes(geojson, projection) {
    const shapes = [];

    geojson.features.forEach(feature => {
        const { type, coordinates } = feature.geometry;

        if (type === 'Polygon') {
            coordinates.forEach(ring => {
                const shape = new THREE.Shape();
                ring.forEach((coord, idx) => {
                    const [x, y] = projection(coord);
                    // Flip y if needed for Three.js (here we flip it)
                    if (idx === 0) {
                        shape.moveTo(x, -y);
                    } else {
                        shape.lineTo(x, -y);
                    }
                });
                shapes.push(shape);
            });
        }

        if (type === 'MultiPolygon') {
            coordinates.forEach(polygon => {
                polygon.forEach(ring => {
                    const shape = new THREE.Shape();
                    ring.forEach((coord, idx) => {
                        const [x, y] = projection(coord);
                        if (idx === 0) {
                            shape.moveTo(x, -y);
                        } else {
                            shape.lineTo(x, -y);
                        }
                    });
                    shapes.push(shape);
                });
            });
        }
    });

    return shapes;
}
